/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * The file is written by Save, and by itself two seconds after typing stops,
 * always guarded by the ETag it was read with; when someone else changed it
 * meanwhile, saving stops until Reload takes theirs or Save as copy keeps ours
 * in a new file beside it.
 *
 * The Files bundle adds this bundle to the page the first time "Edit diagram"
 * or + New needs it, then calls the window.OCA.PlantUml.openEditor it defines.
 */
import { EditorState } from '@codemirror/state'
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { translate as t, translatePlural as n } from '@nextcloud/l10n'
import { emit } from '@nextcloud/event-bus'
import { APP_ID } from './files-helpers.js'
import { plantumlMode } from './editor/plantuml-mode.js'
import { plantumlTheme } from './editor/theme.js'
import { plantumlCompletion } from './editor/completion/index.js'
import { ConflictError, loadFile, saveCopy, saveFile } from './editor/save.js'
import { cancel as cancelRender, debouncedRender } from './editor/preview.js'
import { createAutosave } from './editor/autosave.js'
import fileIcon from '../img/icons/plantuml.svg?raw'
import closeIcon from '../img/icons/close.svg?raw'
import checkIcon from '../img/icons/check.svg?raw'

const IDLE_MS = 2000
const MAX_WAIT_MS = 30000
const MINUTE = 60000
const CLOSE_WAIT_MS = 10000

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag)
  node.className = className
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, value)
  }
  return node
}

/** Opens the editor on a Files node; a second call while one is open does nothing. */
export function openEditor(node) {
  if (document.querySelector('.plantuml-editor')) {
    return
  }
  let path = node.path
  const name = node.basename

  const icon = el('span', 'plantuml-editor__icon', { 'aria-hidden': 'true' })
  icon.innerHTML = fileIcon
  const title = el('h2', 'plantuml-editor__name')
  title.textContent = name
  const status = el('span', 'plantuml-editor__status', { role: 'status' })
  const reloadButton = el('button', 'plantuml-editor__reload', { type: 'button', hidden: '' })
  reloadButton.textContent = t(APP_ID, 'Reload')
  const copyButton = el('button', 'plantuml-editor__copy', { type: 'button', hidden: '' })
  copyButton.textContent = t(APP_ID, 'Save as copy')
  // Text's indicator: a check when saved, a dot on it while not, a spinner while saving.
  const saveButton = el('button', 'plantuml-editor__save', { type: 'button', 'aria-label': t(APP_ID, 'Save'), hidden: '' })
  saveButton.innerHTML = checkIcon
  const closeButton = el('button', 'plantuml-editor__close', { type: 'button', 'aria-label': t(APP_ID, 'Close') })
  closeButton.innerHTML = closeIcon
  const bar = el('header', 'plantuml-editor__bar')
  bar.append(icon, title, status, reloadButton, copyButton, saveButton, closeButton)

  const source = el('div', 'plantuml-editor__source')
  const image = el('img', 'plantuml-editor__image', { alt: name, hidden: '' })
  const problem = el('p', 'plantuml-editor__problem', { role: 'status', hidden: '' })
  const diagram = el('div', 'plantuml-editor__diagram')
  diagram.append(image, problem)
  const panes = el('div', 'plantuml-editor__panes')
  panes.append(source, diagram)

  const overlay = el('div', 'plantuml-editor', { role: 'dialog', 'aria-modal': 'true', 'aria-label': name })
  overlay.append(bar, panes)

  // aria-modal only tells a screen reader; inert keeps Tab and clicks out of
  // the Files page underneath too.
  const opener = document.activeElement
  const inerted = [...document.body.children].filter((sibling) => !sibling.hasAttribute('inert'))
  for (const sibling of inerted) {
    sibling.setAttribute('inert', '')
  }
  document.body.append(overlay)

  let view = null
  let etag = ''
  let saved = null // the Text last read or written
  let savedAt = 0 // when this editor last wrote it
  let conflict = false // a save met someone else's change; lasts until resolved
  let failure = '' // what went wrong last; lasts until the next change
  let running = null // the file operation in flight
  let closing = false
  let closed = false
  let imageUrl = ''

  const isDirty = () => view !== null && !view.state.doc.eq(saved)

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

  function showButtons() {
    const state = running ? 'saving' : isDirty() ? 'unsaved' : 'saved'
    saveButton.dataset.state = state
    saveButton.classList.toggle('icon-loading-small', state === 'saving')
    saveButton.title = state === 'saved' ? savedTitle() : t(APP_ID, 'Unsaved changes')
    reloadButton.hidden = copyButton.hidden = !conflict
    reloadButton.disabled = copyButton.disabled = running !== null
  }

  function showState() {
    status.textContent = failure || (conflict ? t(APP_ID, 'Someone else changed this file') : '')
    showButtons()
  }

  function fail(message) {
    failure = message
    showState()
  }

  /** `doc` is what the file now holds, at `etag`. */
  function markSaved(doc) {
    saved = doc
    savedAt = Date.now()
    conflict = false
    failure = ''
    showState()
  }

  /**
   * One file operation at a time. A change that lands meanwhile, or an
   * autosave that found one running, is saved once it is done.
   */
  async function exclusively(task) {
    if (running) {
      return
    }
    running = task()
    showButtons()
    try {
      await running
    } finally {
      running = null
      showButtons()
      if (!closed && !conflict && !failure && isDirty()) {
        autosave.schedule()
      }
    }
  }

  // A conflict stops it until resolved; a failure until the next change.
  const autosave = createAutosave({ idleMs: IDLE_MS, maxWaitMs: MAX_WAIT_MS, save: () => (conflict ? Promise.resolve() : save()) })
  const ticker = setInterval(showButtons, MINUTE / 2)

  function draw(text) {
    // The route answers a blank source with 400; there is nothing to draw.
    if (!text.trim()) {
      image.hidden = problem.hidden = true
      return
    }
    debouncedRender(text, (error, blob) => {
      if (closed || !view.state.doc.toString().trim()) {
        return
      }
      if (error) {
        problem.textContent = error.message
        problem.hidden = false
        image.hidden = true
        return
      }
      URL.revokeObjectURL(imageUrl)
      imageUrl = URL.createObjectURL(blob)
      image.src = imageUrl
      image.hidden = false
      problem.hidden = true
    })
  }

  async function save() {
    if (!isDirty()) {
      return
    }
    await exclusively(async () => {
      const doc = view.state.doc
      try {
        etag = await saveFile(path, doc.toString(), etag)
        markSaved(doc)
      } catch (e) {
        if (e instanceof ConflictError) {
          conflict = true
          autosave.cancel()
          showState()
          return
        }
        console.error(`[${APP_ID}] could not save ${path}`, e)
        fail(t(APP_ID, 'Could not save the file'))
      }
    })
  }

  /** Theirs replaces ours: the file as saved, at its new ETag. */
  async function reload() {
    if (isDirty() && !window.confirm(t(APP_ID, 'Replace your changes with the saved file?'))) {
      return
    }
    await exclusively(async () => {
      try {
        const file = await loadFile(path)
        if (closed) {
          return
        }
        etag = file.etag
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: file.content } })
        markSaved(view.state.doc)
      } catch (e) {
        console.error(`[${APP_ID}] could not open ${path}`, e)
        fail(t(APP_ID, 'Could not open the file'))
      }
    })
  }

  /** Ours goes to a new file beside theirs, and the editor carries on there. */
  async function saveAsCopy() {
    await exclusively(async () => {
      const doc = view.state.doc
      try {
        const copy = await saveCopy(path, doc.toString())
        emit('files:node:created', copy.node)
        path = copy.node.path
        title.textContent = image.alt = copy.node.basename
        overlay.setAttribute('aria-label', copy.node.basename)
        etag = copy.etag
        markSaved(doc)
      } catch (e) {
        console.error(`[${APP_ID}] could not save a copy of ${path}`, e)
        fail(t(APP_ID, 'Could not save a copy'))
      }
    })
  }

  /**
   * Saves until the file holds the source, including a change typed meanwhile,
   * or until a save does not land, or CLOSE_WAIT_MS pass with one hanging.
   */
  function saveBeforeClose() {
    let timer
    let gaveUp = false
    const saving = (async () => {
      while (!gaveUp && isDirty() && !conflict && !failure) {
        while (running) {
          await running
        }
        await autosave.flush()
      }
    })()
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { gaveUp = true; resolve() }, CLOSE_WAIT_MS)
    })
    return Promise.race([saving, timeout]).finally(() => clearTimeout(timer))
  }

  /**
   * Saves first. A refused save stays open on the conflict line, whose buttons
   * are the way out; a save that cannot land (a read-only share, a full quota,
   * an outage) asks before discarding instead of trapping the user.
   */
  async function close() {
    if (closing) {
      return
    }
    if (isDirty() && !conflict && !failure) {
      closing = true
      await saveBeforeClose()
      closing = false
      if (conflict) {
        return
      }
    }
    if (isDirty() && !window.confirm(t(APP_ID, 'Discard unsaved changes?'))) {
      return
    }
    closed = true
    autosave.cancel()
    clearInterval(ticker)
    cancelRender()
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('beforeunload', onBeforeUnload)
    view?.destroy()
    URL.revokeObjectURL(imageUrl)
    overlay.remove()
    for (const sibling of inerted) {
      sibling.removeAttribute('inert')
    }
    opener?.focus?.()
  }

  // CodeMirror marks an Escape it used (closing the completion popup or the
  // search panel, dropping a multi-selection) as handled.
  function onKeydown(event) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  function onBeforeUnload(event) {
    if (isDirty()) {
      event.preventDefault()
    }
  }

  saveButton.addEventListener('click', save)
  reloadButton.addEventListener('click', reload)
  copyButton.addEventListener('click', saveAsCopy)
  closeButton.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)

  loadFile(path).then(({ content, etag: loadedEtag }) => {
    if (closed) {
      return
    }
    etag = loadedEtag
    view = new EditorView({
      parent: source,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          highlightSelectionMatches(),
          search({ top: true }),
          history(),
          plantumlMode,
          plantumlCompletion,
          plantumlTheme,
          // Mod-s would otherwise be the browser's "Save page as". defaultKeymap
          // carries Mod-/ for comments; Ctrl-M (Shift-Alt-M on macOS) makes Tab
          // move focus again instead of indenting.
          keymap.of([
            { key: 'Mod-s', run: () => { save(); return true } },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              failure = ''
              showState()
              draw(update.state.doc.toString())
              if (!conflict) {
                autosave.schedule()
              }
            }
          }),
        ],
      }),
    })
    saved = view.state.doc
    saveButton.hidden = false
    showButtons()
    view.focus()
    draw(content)
  }, (e) => {
    console.error(`[${APP_ID}] could not open ${path}`, e)
    fail(t(APP_ID, 'Could not open the file'))
  })
}

window.OCA.PlantUml = { ...window.OCA.PlantUml, openEditor }
