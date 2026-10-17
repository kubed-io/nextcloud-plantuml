/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * One file's save machine. The file is written by Save, and by itself two
 * seconds after typing stops, always guarded by the ETag it was read with; when
 * someone else changed it meanwhile, saving stops until Reload takes theirs or
 * Save as copy keeps ours in a new file beside it. A change made elsewhere is
 * taken in while the text is all saved, and is that same conflict while it is not.
 *
 * The text itself lives in the editor, shown or parked: the session reads it
 * through `doc`, writes the file's into it through `replace`, and says through
 * `onChange` when what the bar shows of it changed.
 */
import { Annotation, Transaction } from '@codemirror/state'
import { translate as t, translatePlural as n } from '@nextcloud/l10n'
import { emit } from '@nextcloud/event-bus'
import { APP_ID } from '../files-helpers.js'
import { ConflictError, currentEtag, loadFile, saveCopy, saveFile } from './save.js'
import { createAutosave } from './autosave.js'
import { watchFile } from './watch.js'

const IDLE_MS = 2000
const MAX_WAIT_MS = 30000
const MINUTE = 60000
const CLOSE_WAIT_MS = 10000

/** A change that came from the file (Reload, a change taken in), not the keyboard. */
export const fromFile = Annotation.define()

/**
 * The file's text in place of `state`'s, changing only the stretch that
 * differs: CodeMirror maps the cursor, and the line at the top of the view,
 * through a change that small, so both stay where they were.
 */
export function replaceWith(state, dispatch, content, { history = true } = {}) {
  const old = state.doc.toString()
  const max = Math.min(old.length, content.length)
  let from = 0
  while (from < max && old[from] === content[from]) {
    from++
  }
  let end = 0
  while (end < max - from && old[old.length - 1 - end] === content[content.length - 1 - end]) {
    end++
  }
  dispatch({
    changes: { from, to: old.length - end, insert: content.slice(from, content.length - end) },
    // Their version is not an edit of ours to undo (and autosave back).
    annotations: history ? [fromFile.of(true)] : [fromFile.of(true), Transaction.addToHistory.of(false)],
  })
}

/**
 * @param {object} options
 * @param {string} options.path the file, in the user's folder
 * @param {string} options.etag what it was read at
 * @param {() => import('@codemirror/state').Text} options.doc the file's live text, shown or parked
 * @param {(content: string, opts: {history: boolean}) => void} options.replace writes the file's text into that live text
 * @param {() => void} options.onChange its state changed; the bar redraws if it shows this file
 * @param {(node: import('@nextcloud/files').Node) => void} [options.onCopied] after Save as copy (S8)
 * @param {boolean} [options.readOnly] never written (R17)
 */
export function createFileSession({ path, etag, doc, replace, onChange, onCopied = () => {}, readOnly = false }) {
  // `path` is the copy's once Save as copy carries on there (S8): what is read
  // and written, and what the diagram's relative files resolve against (R4).
  let copied = false
  let saved = doc() // the Text last read or written
  let savedAt = 0 // when this session last wrote it
  let conflict = false // a save met someone else's change; lasts until resolved
  let failure = '' // what went wrong last; lasts until the next change
  let notice = '' // their version was taken in; lasts until the next change
  let said = 0 // how often the line was set, so the same line said again is read out again
  let running = null // the file operation in flight
  let quiet = false // that operation is a check, which the buttons do not show
  let watcher = null
  let leaving = false
  let stopped = false

  const isDirty = () => !readOnly && !doc().eq(saved)
  const blocked = () => conflict || failure !== ''

  function savedTitle() {
    if (!savedAt) {
      return t(APP_ID, 'Saved')
    }
    const minutes = Math.floor((Date.now() - savedAt) / MINUTE)
    if (minutes < 1) {
      return t(APP_ID, 'Saved just now')
    }
    return minutes < 60
      ? n(APP_ID, 'Saved %n min ago', 'Saved %n min ago', minutes)
      : n(APP_ID, 'Saved %n h ago', 'Saved %n h ago', Math.floor(minutes / 60))
  }

  function status() {
    const busy = running !== null && !quiet
    const state = busy ? 'saving' : isDirty() ? 'unsaved' : 'saved'
    return {
      state,
      busy,
      conflict,
      title: state === 'saved' ? savedTitle() : t(APP_ID, 'Unsaved changes'),
      line: failure || (conflict ? t(APP_ID, 'Someone else changed this file') : notice),
      said,
    }
  }

  function fail(message) {
    failure = message
    said++
    onChange()
  }

  /** A line about something else than this file (a linked file that would not open): it blocks nothing, and lasts until the next change. */
  function say(line) {
    notice = line
    said++
    onChange()
  }

  /** `text` is what the file now holds, at `etag`. */
  /** `wrote` is false when the file came to us, so "Saved …" keeps our last save. */
  function markSaved(text, { wrote = true } = {}) {
    saved = text
    if (wrote) {
      savedAt = Date.now()
    }
    conflict = false
    failure = notice = ''
    onChange()
  }

  /** Saving stops until Reload or Save as copy resolves it: a Save in conflict writes nothing. */
  function enterConflict() {
    conflict = true
    failure = ''
    said++
    autosave.cancel()
    onChange()
  }

  /**
   * One file operation at a time. A change that lands meanwhile, or an
   * autosave that found one running, is saved once it is done. A check gives
   * way: it is skipped while anything runs, and anything else waits it out.
   */
  async function exclusively(task, { check = false } = {}) {
    while (running && quiet && !check) {
      await running.catch(() => {})
    }
    if (running) {
      return
    }
    quiet = check
    running = task()
    onChange()
    try {
      await running
    } finally {
      running = null
      quiet = false
      onChange()
      if (!stopped && !conflict && !failure && isDirty()) {
        autosave.schedule()
      }
    }
  }

  // A conflict stops it until resolved; a failure until the next change.
  const autosave = createAutosave({ idleMs: IDLE_MS, maxWaitMs: MAX_WAIT_MS, save: () => (conflict ? Promise.resolve() : save()) })

  /** The text changed under the keyboard, or from the file. */
  function edited() {
    // Once stopped, the file was left: what its text does then is no change to save or show.
    if (stopped) {
      return
    }
    failure = notice = ''
    if (!conflict && !readOnly) {
      autosave.schedule()
    }
    onChange()
  }

  async function save() {
    // Once stopped, a discard was chosen: a hanging save that settles late writes nothing more.
    if (readOnly || stopped || !isDirty()) {
      return
    }
    await exclusively(async () => {
      // A check found theirs while this save waited: its PUT could only be refused.
      if (conflict || stopped) {
        return
      }
      const text = doc()
      try {
        etag = await saveFile(path, text.toString(), etag)
        markSaved(text)
      } catch (e) {
        if (e instanceof ConflictError) {
          enterConflict()
          return
        }
        console.error(`[${APP_ID}] could not save ${path}`, e)
        fail(t(APP_ID, 'Could not save the file'))
      }
    })
  }

  /** Theirs replaces ours: the file as saved, at its new ETag. */
  async function reload() {
    await exclusively(async () => {
      // Asked here, once any check has run: the text may have changed meanwhile.
      if (isDirty() && !window.confirm(t(APP_ID, 'Replace your changes with the saved file?'))) {
        return
      }
      try {
        const file = await loadFile(path)
        if (stopped) {
          return
        }
        etag = file.etag
        replace(file.content, { history: true })
        markSaved(doc(), { wrote: false })
      } catch (e) {
        console.error(`[${APP_ID}] could not open ${path}`, e)
        fail(t(APP_ID, 'Could not open the file'))
      }
    })
  }

  /**
   * Whether the file changed elsewhere, by its ETag; a save of ours holds the
   * ETag it was answered with, so it is no change. A clean text takes the new
   * version in, an unsaved one is a conflict. A failed check is the watcher's to log.
   */
  async function check() {
    if (leaving || stopped || conflict) {
      return
    }
    await exclusively(async () => {
      if ((await currentEtag(path)) === etag || leaving || stopped) {
        return
      }
      if (isDirty()) {
        enterConflict()
        return
      }
      const file = await loadFile(path)
      if (leaving || stopped) {
        return
      }
      // A change typed while it loaded is ours, unsaved, against theirs.
      if (isDirty()) {
        enterConflict()
        return
      }
      const changed = file.content !== doc().toString()
      etag = file.etag
      replace(file.content, { history: false })
      markSaved(doc(), { wrote: false })
      if (changed) {
        notice = t(APP_ID, 'Updated from the file')
        said++
        onChange()
      }
    }, { check: true })
  }

  /** Ours goes to a new file beside theirs, and the session carries on there. */
  async function saveAsCopy() {
    await exclusively(async () => {
      const text = doc()
      try {
        const copy = await saveCopy(path, text.toString())
        emit('files:node:created', copy.node)
        path = copy.node.path
        copied = true
        onCopied(copy.node)
        etag = copy.etag
        markSaved(text)
      } catch (e) {
        console.error(`[${APP_ID}] could not save a copy of ${path}`, e)
        fail(t(APP_ID, 'Could not save a copy'))
      }
    })
  }

  /**
   * Saves until the file holds the text, including a change typed meanwhile,
   * or until a save does not land, or CLOSE_WAIT_MS pass with one hanging.
   * Checks stay away meanwhile.
   */
  function saveBeforeLeaving() {
    let timer
    let gaveUp = false
    leaving = true
    const saving = (async () => {
      while (!gaveUp && isDirty() && !blocked()) {
        while (running) {
          // A check leaves its own failures to the watcher; one must not stop leaving.
          await running.catch(() => {})
        }
        if (gaveUp || blocked()) {
          break
        }
        await autosave.flush()
      }
    })()
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { gaveUp = true; resolve() }, CLOSE_WAIT_MS)
    })
    return Promise.race([saving, timeout]).finally(() => {
      clearTimeout(timer)
      leaving = false
    })
  }

  const pause = () => {
    watcher?.stop()
    watcher = null
  }
  // One watcher, however often it is started: resume() starts it again.
  const start = () => {
    pause()
    watcher = watchFile({ check })
  }
  // A failed look is logged as the watcher logs it: going back must not fail on a blip.
  const resume = () => {
    start()
    return check().catch((e) => console.debug(`[${APP_ID}] could not check the file`, e))
  }
  function stop() {
    stopped = true
    pause()
    autosave.cancel()
  }

  return {
    get path() { return path },
    get copied() { return copied },
    readOnly,
    isDirty,
    blocked,
    fail,
    say,
    status,
    edited,
    save,
    reload,
    check,
    saveAsCopy,
    saveBeforeLeaving,
    start,
    pause,
    resume,
    stop,
  }
}
