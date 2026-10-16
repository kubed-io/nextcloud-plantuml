/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * The file is written by Save, and by itself two seconds after typing stops,
 * always guarded by the ETag it was read with; when someone else changed it
 * meanwhile, saving stops until Reload takes theirs or Save as copy keeps ours
 * in a new file beside it. A change made elsewhere is taken in while the source
 * is all saved, and is that same conflict while it is not.
 *
 * The Files bundle adds this bundle, an ES module, to the page the first time
 * "Edit diagram" or + New needs it, then calls the window.OCA.PlantUml.openEditor
 * it defines. Each diagram type's profile is imported only when a file holds it.
 */
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { closeLintPanel } from '@codemirror/lint'
import { translate as t, translatePlural as n } from '@nextcloud/l10n'
import { emit } from '@nextcloud/event-bus'
import { APP_ID } from './files-helpers.js'
import { diagramAt, scan } from './editor/blocks.js'
import { profileExtension, profileLoader, resetProfiles } from './editor/profiles/index.js'
import { plantumlTheme } from './editor/theme.js'
import { plantumlCompletion } from './editor/completion/index.js'
import { valueWidgets } from './editor/values/widgets.js'
import { colorSwatches } from './editor/swatches.js'
import { plantumlLint, plantumlLintKeymap } from './editor/lint/index.js'
import { plantumlDocs } from './editor/docs/hover.js'
import { plantumlFolding } from './editor/folding.js'
import { fileName, filePath, setServerError } from './editor/lint/state.js'
import { ConflictError, currentEtag, loadFile, saveCopy, saveFile } from './editor/save.js'
import { cancel as cancelRender, debouncedRender } from './editor/preview.js'
import { toInlineSvg } from './editor/inline-svg.js'
import { createAutosave } from './editor/autosave.js'
import { createSplitter } from './editor/splitter.js'
import { createTabs } from './editor/tabs.js'
import { watchFile } from './editor/watch.js'
import fileIcon from '../img/icons/plantuml.svg?raw'
import closeIcon from '../img/icons/close.svg?raw'
import checkIcon from '../img/icons/check.svg?raw'
import refreshIcon from '../img/icons/refresh.svg?raw'
import sourceIcon from '../img/icons/code-tags.svg?raw'

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
  resetProfiles()
  // The file being edited, the copy's once Save as copy carries on there (S8):
  // what is read and written, and what the diagram's relative files resolve against (R4).
  let currentPath = node.path
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
  const refreshButton = el('button', 'plantuml-editor__refresh', {
    type: 'button', 'aria-label': t(APP_ID, 'Reload from the file'), title: t(APP_ID, 'Reload from the file'), hidden: '',
  })
  refreshButton.innerHTML = refreshIcon
  const sourceToggle = el('button', 'plantuml-editor__source-toggle', {
    type: 'button', 'aria-label': t(APP_ID, 'Source'), title: t(APP_ID, 'Source'), 'aria-pressed': 'true', 'aria-controls': 'plantuml-editor-source', hidden: '',
  })
  sourceToggle.innerHTML = sourceIcon
  // Text's indicator: a check when saved, a dot on it while not, a spinner while saving.
  const saveButton = el('button', 'plantuml-editor__save', { type: 'button', 'aria-label': t(APP_ID, 'Save'), hidden: '' })
  saveButton.innerHTML = checkIcon
  const closeButton = el('button', 'plantuml-editor__close', { type: 'button', 'aria-label': t(APP_ID, 'Close') })
  closeButton.innerHTML = closeIcon
  const bar = el('header', 'plantuml-editor__bar')
  bar.append(icon, title, status, reloadButton, copyButton, sourceToggle, refreshButton, saveButton, closeButton)

  const source = el('div', 'plantuml-editor__source', { id: 'plantuml-editor-source' })
  // The diagram is drawn inline, so its links work; to a screen reader it is one picture.
  const image = el('div', 'plantuml-editor__image', { id: 'plantuml-editor-image', role: 'img', 'aria-label': name, hidden: '' })
  const problem = el('p', 'plantuml-editor__problem', { role: 'status', hidden: '' })
  const tabs = createTabs({ onActivate: showDiagram, controls: image.id })
  const diagram = el('div', 'plantuml-editor__diagram')
  diagram.append(tabs.element, image, problem)
  const panes = el('div', 'plantuml-editor__panes')
  panes.append(source, createSplitter(panes, source), diagram)

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
  let notice = '' // their version was taken in; lasts until the next change
  let running = null // the file operation in flight
  let quiet = false // that operation is a check, which the buttons do not show
  let watcher = null
  let closing = false
  let closed = false
  let diagrams = [] // the file's, from blocks.js; the one drawn is diagrams[active]
  let active = 0
  const nameConfig = new Compartment()
  const profilesConfig = new Compartment()
  const wantProfiles = profileLoader((extension) => {
    if (!closed) {
      view.dispatch({ effects: profilesConfig.reconfigure(extension) })
    }
  })

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
    const busy = running !== null && !quiet
    const state = busy ? 'saving' : isDirty() ? 'unsaved' : 'saved'
    saveButton.dataset.state = state
    saveButton.classList.toggle('icon-loading-small', state === 'saving')
    saveButton.title = state === 'saved' ? savedTitle() : t(APP_ID, 'Unsaved changes')
    reloadButton.hidden = copyButton.hidden = !conflict
    reloadButton.disabled = copyButton.disabled = refreshButton.disabled = busy
  }

  function showState() {
    status.textContent = failure || (conflict ? t(APP_ID, 'Someone else changed this file') : notice)
    showButtons()
  }

  function fail(message) {
    failure = message
    showState()
  }

  /** `doc` is what the file now holds, at `etag`. */
  /** `wrote` is false when the file came to us, so "Saved …" keeps our last save. */
  function markSaved(doc, { wrote = true } = {}) {
    saved = doc
    if (wrote) {
      savedAt = Date.now()
    }
    conflict = false
    failure = notice = ''
    showState()
  }

  /** Saving stops until Reload or Save as copy resolves it: a Save in conflict writes nothing. */
  function enterConflict() {
    conflict = true
    failure = ''
    autosave.cancel()
    showState()
  }

  /**
   * The file's text in place of the source, changing only the stretch that
   * differs: CodeMirror maps the cursor, and the line at the top of the view,
   * through a change that small, so both stay where they were.
   */
  function replaceWith(content, { history = true } = {}) {
    const old = view.state.doc.toString()
    const max = Math.min(old.length, content.length)
    let from = 0
    while (from < max && old[from] === content[from]) {
      from++
    }
    let end = 0
    while (end < max - from && old[old.length - 1 - end] === content[content.length - 1 - end]) {
      end++
    }
    view.dispatch({
      changes: { from, to: old.length - end, insert: content.slice(from, content.length - end) },
      // Their version is not an edit of ours to undo (and autosave back).
      annotations: history ? [] : [Transaction.addToHistory.of(false)],
    })
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
    showButtons()
    try {
      await running
    } finally {
      running = null
      quiet = false
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
    // The route answers a blank source with 400; there is nothing to draw, and
    // no mistake left. draw() runs inside an update, which a dispatch must wait out.
    if (!text.trim()) {
      image.hidden = problem.hidden = true
      queueMicrotask(() => { if (!closed) view.dispatch({ effects: setServerError.of(null) }) })
      return
    }
    const index = active
    // PlantUML's own count, which an unclosed block can make differ from the tab's.
    debouncedRender(text, diagrams[index].render, currentPath, (error, svgText, mistake) => {
      if (closed || !view.state.doc.toString().trim()) {
        return
      }
      // An answer for another tab is drawn by no tab: a change of tab sent a
      // render of its own. One for an older source still is, while the newer
      // one is on its way, and leaves the mapped mark alone.
      if (index !== active) {
        return
      }
      // A server problem is no mistake in the source: the pane says what it is.
      if (text === view.state.doc.toString()) {
        view.dispatch({ effects: setServerError.of(error ? null : mistake) })
      }
      // Built before the old one goes, so the pane never flashes empty.
      const svg = error ? null : toInlineSvg(svgText, { idPrefix: 'plantuml-diagram-' })
      if (!svg) {
        problem.textContent = error ? error.message : t(APP_ID, 'Could not draw the diagram')
        problem.hidden = false
        image.hidden = true
        return
      }
      image.replaceChildren(svg)
      image.hidden = false
      problem.hidden = true
    })
  }

  /**
   * The tab follows the cursor (B3), staying put on a line outside every block;
   * the diagram is drawn again when the source or the tab changed. A deleted
   * block can leave `active` past the end, which falls back to the last.
   */
  function follow(state, docChanged) {
    const at = diagramAt(diagrams, state.doc.lineAt(state.selection.main.head).number)
    const next = at ? at.index : Math.min(active, diagrams.length - 1)
    if (!docChanged && next === active) {
      return
    }
    active = next
    tabs.update(diagrams, active)
    draw(state.doc.toString())
  }

  /** R6: a file the diagram includes may have changed while the page was away. */
  function drawAgain() {
    if (!closed && document.visibilityState === 'visible') {
      draw(view.state.doc.toString())
    }
  }

  /** The cursor follows the tab (B4): to the end of its `@start` or `newpage` line. */
  function showDiagram(index) {
    const target = diagrams[index]
    if (!view || !target) {
      return
    }
    const pos = view.state.doc.line(target.from).to
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 20 }) })
    focusAfterTab()
  }

  /** Where the focus goes from an activated tab: the one place to keep it on the tab instead. */
  function focusAfterTab() {
    if (!overlay.classList.contains('plantuml-editor--diagram-only')) {
      view.focus()
    }
  }

  /** L8: hide or show the source; the splitter's share stays in --plantuml-split. */
  function toggleSource() {
    const hide = sourceToggle.getAttribute('aria-pressed') === 'true'
    const inSource = source.contains(document.activeElement)
    overlay.classList.toggle('plantuml-editor--diagram-only', hide)
    sourceToggle.setAttribute('aria-pressed', String(!hide))
    if (hide && inSource) {
      sourceToggle.focus()
    } else if (!hide) {
      view?.focus()
    }
  }

  async function save() {
    // Once closed, a discard was chosen: a hanging save that settles late writes nothing more.
    if (closed || !isDirty()) {
      return
    }
    await exclusively(async () => {
      // A check found theirs while this save waited: its PUT could only be refused.
      if (conflict || closed) {
        return
      }
      const doc = view.state.doc
      try {
        etag = await saveFile(currentPath, doc.toString(), etag)
        markSaved(doc)
      } catch (e) {
        if (e instanceof ConflictError) {
          enterConflict()
          return
        }
        console.error(`[${APP_ID}] could not save ${currentPath}`, e)
        fail(t(APP_ID, 'Could not save the file'))
      }
    })
  }

  /** Theirs replaces ours: the file as saved, at its new ETag. */
  async function reload() {
    await exclusively(async () => {
      // Asked here, once any check has run: the source may have changed meanwhile.
      if (isDirty() && !window.confirm(t(APP_ID, 'Replace your changes with the saved file?'))) {
        return
      }
      try {
        const file = await loadFile(currentPath)
        if (closed) {
          return
        }
        etag = file.etag
        replaceWith(file.content)
        markSaved(view.state.doc, { wrote: false })
      } catch (e) {
        console.error(`[${APP_ID}] could not open ${currentPath}`, e)
        fail(t(APP_ID, 'Could not open the file'))
      }
    })
  }

  /**
   * Whether the file changed elsewhere, by its ETag; a save of ours holds the
   * ETag it was answered with, so it is no change. A clean source takes the new
   * version in, an unsaved one is a conflict. A failed check is the watcher's to log.
   */
  async function check() {
    if (closing || closed || conflict) {
      return
    }
    await exclusively(async () => {
      if ((await currentEtag(currentPath)) === etag || closing || closed) {
        return
      }
      if (isDirty()) {
        enterConflict()
        return
      }
      const file = await loadFile(currentPath)
      if (closing || closed) {
        return
      }
      // A change typed while it loaded is ours, unsaved, against theirs.
      if (isDirty()) {
        enterConflict()
        return
      }
      const changed = file.content !== view.state.doc.toString()
      etag = file.etag
      replaceWith(file.content, { history: false })
      markSaved(view.state.doc, { wrote: false })
      if (changed) {
        notice = t(APP_ID, 'Updated from the file')
        showState()
      }
    }, { check: true })
  }

  /** Ours goes to a new file beside theirs, and the editor carries on there. */
  async function saveAsCopy() {
    await exclusively(async () => {
      const doc = view.state.doc
      try {
        const copy = await saveCopy(currentPath, doc.toString())
        emit('files:node:created', copy.node)
        currentPath = copy.node.path
        title.textContent = copy.node.basename
        overlay.setAttribute('aria-label', copy.node.basename)
        image.setAttribute('aria-label', copy.node.basename)
        view.dispatch({ effects: nameConfig.reconfigure([fileName.of(copy.node.basename), filePath.of(currentPath)]) })
        etag = copy.etag
        markSaved(doc)
      } catch (e) {
        console.error(`[${APP_ID}] could not save a copy of ${currentPath}`, e)
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
          // A check leaves its own failures to the watcher; one must not stop a close.
          await running.catch(() => {})
        }
        if (gaveUp || conflict || failure) {
          break
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
    watcher?.stop()
    autosave.cancel()
    clearInterval(ticker)
    cancelRender()
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('visibilitychange', drawAgain)
    window.removeEventListener('focus', drawAgain)
    window.removeEventListener('beforeunload', onBeforeUnload)
    tabs.destroy()
    view?.destroy()
    overlay.remove()
    for (const sibling of inerted) {
      sibling.removeAttribute('inert')
    }
    opener?.focus?.()
  }

  // CodeMirror marks an Escape it used (closing the completion popup, the
  // search or diagnostics panel, dropping a multi-selection) as handled.
  function onKeydown(event) {
    // The editor's own Mod-s has handled it already when the focus is in the
    // source. 'S' is Caps Lock's; Shift is another shortcut's.
    if ((event.key === 's' || event.key === 'S') && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.defaultPrevented) {
      event.preventDefault()
      save()
      return
    }
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
  refreshButton.addEventListener('click', reload)
  sourceToggle.addEventListener('click', toggleSource)
  copyButton.addEventListener('click', saveAsCopy)
  closeButton.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)

  loadFile(currentPath).then(({ content, etag: loadedEtag }) => {
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
          // The PlantUML language, and what the loaded profiles add to it.
          profilesConfig.of(profileExtension([])),
          plantumlCompletion,
          // After the completion, whose Escape closes its list first; it draws a carded word's lint messages.
          plantumlDocs,
          plantumlLint,
          plantumlFolding,
          nameConfig.of([fileName.of(name), filePath.of(currentPath)]),
          plantumlTheme,
          // A swatch before each ColorLiteral, named ones too; picking a colour writes it back as #rrggbb.
          colorSwatches,
          // A chooser after each value with a list, a stepper after each number, on the cursor's line.
          valueWidgets,
          // Long lines wrap, so the source pane never scrolls sideways.
          EditorView.lineWrapping,
          // Mod-s would otherwise be the browser's "Save page as". defaultKeymap
          // carries Mod-/ for comments; Ctrl-M (Shift-Alt-M on macOS) makes Tab
          // move focus again instead of indenting. lintKeymap opens the
          // diagnostics panel on Mod-Shift-m and steps through them on F8.
          keymap.of([
            { key: 'Mod-s', run: () => { save(); return true } },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...plantumlLintKeymap,
            // An open diagnostics panel takes Escape before the editor does.
            { key: 'Escape', run: closeLintPanel },
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              failure = notice = ''
              showState()
              const text = update.state.doc.toString()
              diagrams = scan(text)
              wantProfiles(diagrams, text)
              if (!conflict) {
                autosave.schedule()
              }
            }
            if (update.docChanged || update.selectionSet) {
              follow(update.state, update.docChanged)
            }
          }),
        ],
      }),
    })
    saved = view.state.doc
    saveButton.hidden = refreshButton.hidden = sourceToggle.hidden = false
    showButtons()
    watcher = watchFile({ check })
    document.addEventListener('visibilitychange', drawAgain)
    window.addEventListener('focus', drawAgain)
    view.focus()
    diagrams = scan(content)
    follow(view.state, true)
    wantProfiles(diagrams, content)
  }, (e) => {
    console.error(`[${APP_ID}] could not open ${currentPath}`, e)
    fail(t(APP_ID, 'Could not open the file'))
  })
}

window.OCA.PlantUml = { ...window.OCA.PlantUml, openEditor }
