/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * A file the source links (a style sheet, an include) takes over the source
 * pane until the breadcrumb or Escape goes back to it, as `editor/linked/mode.js`
 * does it.
 * How the file is saved, and kept in step with changes made elsewhere, is its
 * session's business (file-session.js); the bar shows that session's state.
 *
 * The Files bundle adds this bundle, an ES module, to the page the first time
 * "Edit diagram" or + New needs it, then calls the window.OCA.PlantUml.openEditor
 * it defines. Each diagram type's profile is imported only when a file holds it.
 */
import crelt from 'crelt'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from './files-helpers.js'
import { blocksOf, diagramAt, diagramsOf, scan } from './editor/blocks.js'
import { BRACED } from './editor/completion/directives.js'
import { DOC_HOVER } from './editor/docs/hover.js'
import { resetProfiles } from './editor/profiles/index.js'
import { sourceExtensions } from './editor/extensions.js'
import { createBreadcrumb } from './editor/breadcrumb.js'
import { forgetLinkedFiles, linkedChips } from './editor/linked/chips.js'
import { createLinkedMode } from './editor/linked/mode.js'
import { fileName, filePath, setServerError } from './editor/lint/state.js'
import { loadFile } from './editor/save.js'
import { createFileSession, replaceWith } from './editor/file-session.js'
import { cancel as cancelRender, debouncedRender } from './editor/preview.js'
import { toInlineSvg } from './editor/inline-svg.js'
import { createSplitter } from './editor/splitter.js'
import { MOVES, createTabs } from './editor/tabs.js'
import { createAddButton } from './editor/add/button.js'
import { appendBlock, named, takenNames, uniqueName } from './editor/add/insert.js'
import fileIcon from '../img/icons/plantuml.svg?raw'
import closeIcon from '../img/icons/close.svg?raw'
import checkIcon from '../img/icons/check.svg?raw'
import refreshIcon from '../img/icons/refresh.svg?raw'
import sourceIcon from '../img/icons/code-tags.svg?raw'

// "Saved n min ago" counts minutes: the bar redraws twice a minute.
const TICK_MS = 30000

/** Opens the editor on a Files node, at the diagram index asked for; a second call while one is open does nothing. */
export function openEditor(node, { diagram: openAt } = {}) {
  if (document.querySelector('.plantuml-editor')) {
    return
  }
  resetProfiles()
  forgetLinkedFiles()
  const name = node.basename

  const icon = crelt('span', { class: 'plantuml-editor__icon', 'aria-hidden': 'true' })
  icon.innerHTML = fileIcon
  const crumbs = createBreadcrumb({ onBack: () => { linkedMode.goBack() } })
  crumbs.show(name, null)
  const status = crelt('span', { class: 'plantuml-editor__status', role: 'status' })
  const reloadButton = crelt('button', { class: 'plantuml-editor__reload', type: 'button', hidden: '' })
  reloadButton.textContent = t(APP_ID, 'Reload')
  const copyButton = crelt('button', { class: 'plantuml-editor__copy', type: 'button', hidden: '' })
  copyButton.textContent = t(APP_ID, 'Save as copy')
  const refreshButton = crelt('button', {
    class: 'plantuml-editor__refresh',
    type: 'button', 'aria-label': t(APP_ID, 'Reload from the file'), title: t(APP_ID, 'Reload from the file'), hidden: '',
  })
  refreshButton.innerHTML = refreshIcon
  const sourceToggle = crelt('button', {
    class: 'plantuml-editor__source-toggle',
    type: 'button', 'aria-label': t(APP_ID, 'Source'), title: t(APP_ID, 'Source'), 'aria-pressed': 'true', 'aria-controls': 'plantuml-editor-source', hidden: '',
  })
  sourceToggle.innerHTML = sourceIcon
  // A1: the add chunk (menu, modal, template data) is loaded on the first click.
  let adding = null
  const addButton = createAddButton({
    onAdd: (anchor) => withAdd((add) => add.openModal(anchor)),
    onMenu: (anchor) => withAdd((add) => {
      addButton.setMenuOpen(true)
      add.openMenu(anchor, () => addButton.setMenuOpen(false))
    }),
  })
  // Text's indicator: a check when saved, a dot on it while not, a spinner while saving.
  const saveButton = crelt('button', { class: 'plantuml-editor__save', type: 'button', 'aria-label': t(APP_ID, 'Save'), hidden: '' })
  saveButton.innerHTML = checkIcon
  const closeButton = crelt('button', { class: 'plantuml-editor__close', type: 'button', 'aria-label': t(APP_ID, 'Close') })
  closeButton.innerHTML = closeIcon
  const bar = crelt('header', { class: 'plantuml-editor__bar' })
  bar.append(icon, crumbs.element, status, reloadButton, copyButton, addButton.element, sourceToggle, refreshButton, saveButton, closeButton)

  const source = crelt('div', { class: 'plantuml-editor__source', id: 'plantuml-editor-source' })
  // The diagram is drawn inline, so its links work; to a screen reader it is one picture.
  const image = crelt('div', { class: 'plantuml-editor__image', id: 'plantuml-editor-image', role: 'img', 'aria-label': name, hidden: '' })
  const problem = crelt('p', { class: 'plantuml-editor__problem', role: 'status', hidden: '' })
  const tabs = createTabs({ onActivate: showDiagram, controls: image.id })
  const diagram = crelt('div', { class: 'plantuml-editor__diagram' })
  diagram.append(tabs.element, image, problem)
  const panes = crelt('div', { class: 'plantuml-editor__panes' })
  panes.append(source, createSplitter(panes, source), diagram)

  const overlay = crelt('div', { class: 'plantuml-editor', role: 'dialog', 'aria-modal': 'true', 'aria-label': name })
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
  // The main file, once read: its name and its session. Its state is parked,
  // with its scroll, while a linked file is shown in the view (R11).
  let main = null
  let closing = false
  let closed = false
  let diagrams = [] // the main file's, from blocks.js; the one drawn is diagrams[active]
  let active = 0
  let nameConfig = null // the main file's name facets, once its state is built
  let wantProfiles = null

  const linkedMode = createLinkedMode({
    view: () => view,
    main: () => main,
    isClosing: () => closing,
    isClosed: () => closed,
    savedOrDiscarded,
    showState,
    redraw: () => draw(mainState().doc.toString()),
    mainChanged: (state) => {
      const text = state.doc.toString()
      diagrams = diagramsOf(state.doc, text)
      follow(state, true)
      wantProfiles(diagrams, text)
    },
    onChange: (open) => {
      showCrumbs()
      // Dr K: Add diagram adds to the main file, so it is hidden while another file is open.
      addButton.element.hidden = open
      if (open) {
        adding?.then((add) => add.destroy(), () => {})
      }
    },
  })

  /** A failed load is forgotten, so the next click tries again. */
  function withAdd(use) {
    adding ??= import('./editor/add/index.js').then(
      // add/index.js's Core: the chunk imports none of the editor's modules.
      ({ createAdd }) => createAdd({ crelt, t, MOVES, blocksOf, scan, BRACED, DOC_HOVER, closeIcon }, { container: overlay, onAdd: addTemplate }),
      (e) => {
        adding = null
        throw e
      },
    )
    // The chunk can arrive after the editor closed, or a linked file opened.
    adding.then((add) => { if (!closed && !linkedMode.isOpen()) use(add) }, (e) => console.error(`[${APP_ID}] could not load Add diagram`, e))
  }

  /** The main file's state, in the view or parked. */
  const mainState = () => linkedMode.mainState()

  /** A change to the main file's state, wherever it is. */
  const toMain = (spec) => linkedMode.toMain(spec)

  /** The open file's session, which the bar shows and its buttons act on (R15); none before the file is read. */
  const openSession = () => (linkedMode.current() ?? main)?.session

  /** The bar shows the open file's session's state; before the file is read there is none, and the bar stays as it is. */
  function showButtons() {
    const shown = openSession()?.status()
    if (!shown) {
      return
    }
    // R17: a file that may only be read is never saved, so there is no state to show.
    saveButton.hidden = Boolean(linkedMode.current()?.readOnly)
    saveButton.dataset.state = shown.state
    saveButton.classList.toggle('icon-loading-small', shown.state === 'saving')
    saveButton.title = shown.title
    reloadButton.hidden = copyButton.hidden = !shown.conflict
    reloadButton.disabled = copyButton.disabled = refreshButton.disabled = shown.busy
  }

  let lastSaid = { session: null, said: 0 } // the line last written, by whom and at which saying

  function showState() {
    const session = openSession()
    const shown = session?.status()
    if (!shown) {
      return
    }
    // The session redraws on every file operation too: a live region rewritten with the same line
    // is read out again, so only a new line, or the same one said again, is written.
    const again = lastSaid.session === session && lastSaid.said !== shown.said
    if (status.textContent !== shown.line || again) {
      status.textContent = shown.line
    }
    lastSaid = { session, said: shown.said }
    showButtons()
  }

  /** Save as copy carried the main file on in the copy (S8): the editor takes its name. */
  function renamedMain(copy) {
    main.name = copy.basename
    showCrumbs()
    overlay.setAttribute('aria-label', copy.basename)
    image.setAttribute('aria-label', copy.basename)
    toMain({ effects: nameConfig.reconfigure([fileName.of(copy.basename), filePath.of(copy.path)]) })
  }

  function showCrumbs() {
    const open = linkedMode.current()
    crumbs.show(main.name, open && { name: open.name, readOnly: open.readOnly })
  }

  const ticker = setInterval(showButtons, TICK_MS)

  /** Draws the main file's diagram from `text`, its own text: the diagram is the main file's while a linked file is open too (R13). */
  function draw(text) {
    // The route answers a blank source with 400; there is nothing to draw, and
    // no mistake left. draw() runs inside an update, which a dispatch must wait out.
    if (!text.trim()) {
      image.hidden = problem.hidden = true
      queueMicrotask(() => { if (!closed) toMain({ effects: setServerError.of(null) }) })
      return
    }
    const index = active
    // PlantUML's own count, which an unclosed block can make differ from the tab's.
    debouncedRender(text, diagrams[index].render, main.session.path, (error, svgText, mistake) => {
      if (closed || !mainState().doc.toString().trim()) {
        return
      }
      // An answer for another tab is drawn by no tab: a change of tab sent a
      // render of its own. One for an older source still is, while the newer
      // one is on its way, and leaves the mapped mark alone.
      if (index !== active) {
        return
      }
      // A server problem is no mistake in the source: the pane says what it is.
      // The line is the main file's, so the mark is too, parked or not.
      if (text === mainState().doc.toString()) {
        toMain({ effects: setServerError.of(error ? null : mistake) })
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
    }, linkedMode.overrides())
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
    draw(mainState().doc.toString())
  }

  /** R6: a file the diagram includes may have changed while the page was away. */
  function drawAgain() {
    if (!closed && document.visibilityState === 'visible') {
      draw(mainState().doc.toString())
    }
  }

  /**
   * The cursor follows the tab (B4): to the end of its `@start` or `newpage`
   * line. While a linked file is open the tab only changes the drawing (R13).
   */
  function showDiagram(index) {
    const target = diagrams[index]
    if (!view || !target) {
      return
    }
    if (linkedMode.isOpen()) {
      active = index
      tabs.update(diagrams, active)
      draw(mainState().doc.toString())
      return
    }
    const pos = view.state.doc.line(target.from).to
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 20 }) })
    focusAfterTab()
  }

  /** A4: the template's block at the end, under a name of its own; its tab follows the cursor (B3). */
  function addTemplate(template) {
    if (!view || closed || linkedMode.isOpen()) {
      return
    }
    const name = uniqueName(template.name, takenNames(diagrams))
    const change = appendBlock(view.state.doc.toString(), named(template.text, name))
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: { anchor: change.cursor },
      effects: EditorView.scrollIntoView(change.start, { y: 'start', yMargin: 20 }),
      // One undo step, never merged with typing before or after it.
      annotations: isolateHistory.of('full'),
      userEvent: 'input.add',
    })
    // As B4: with the source hidden (L8) the focus goes to the new diagram's tab, not the hidden view.
    if (overlay.classList.contains('plantuml-editor--diagram-only')) {
      ;(tabs.list.querySelector('[aria-selected="true"]') ?? addButton.menuButton).focus()
    } else {
      view.focus()
    }
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

  /**
   * S4: saves first; true once the file may be left. A refused save stays on
   * the conflict line, whose buttons are the way out; a save that cannot land
   * (a read-only share, a full quota, an outage) asks before discarding instead
   * of trapping the user.
   */
  async function savedOrDiscarded(session) {
    if (session.isDirty() && !session.blocked()) {
      await session.saveBeforeLeaving()
      if (session.status().conflict) {
        return false
      }
    }
    return !session.isDirty() || window.confirm(t(APP_ID, 'Discard unsaved changes?'))
  }

  async function close() {
    // A second Escape or click while the first close saves does nothing.
    if (closing || closed) {
      return
    }
    closing = true
    let leave
    try {
      // R15: from a linked file, back to the main file first, which is then closed as ever.
      // A clean file closes at once, in the same task as the key or click.
      leave = (!linkedMode.isOpen() || await linkedMode.goBack()) && !closed && (!main?.session.isDirty() || await savedOrDiscarded(main.session))
    } finally {
      closing = false
    }
    if (!leave) {
      return
    }
    closed = true
    main?.session.stop()
    linkedMode.stop()
    clearInterval(ticker)
    cancelRender()
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('visibilitychange', drawAgain)
    window.removeEventListener('focus', drawAgain)
    window.removeEventListener('beforeunload', onBeforeUnload)
    tabs.destroy()
    adding?.then((add) => add.destroy(), () => {})
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
      openSession()?.save()
      return
    }
    // K1: Escape closes the editor from the main file; from a linked file it goes back (R11).
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      event.stopPropagation()
      if (linkedMode.isOpen()) {
        linkedMode.goBack()
      } else {
        close()
      }
    }
  }

  /** The main file's state only: a linked file's carries linkedUpdate instead. */
  function mainUpdate(update) {
    if (update.docChanged) {
      main.session.edited()
      const text = update.state.doc.toString()
      diagrams = diagramsOf(update.state.doc, text)
      wantProfiles(diagrams, text)
    }
    if (update.docChanged || update.selectionSet) {
      follow(update.state, update.docChanged)
    }
  }

  // S5, R15: the main file's session reads its parked text while a linked file is open.
  function onBeforeUnload(event) {
    if (main?.session.isDirty() || linkedMode.current()?.session.isDirty()) {
      event.preventDefault()
    }
  }

  saveButton.addEventListener('click', () => openSession()?.save())
  reloadButton.addEventListener('click', () => openSession()?.reload())
  refreshButton.addEventListener('click', () => openSession()?.reload())
  sourceToggle.addEventListener('click', toggleSource)
  copyButton.addEventListener('click', () => openSession()?.saveAsCopy())
  closeButton.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)

  loadFile(node.path).then(({ content, etag: loadedEtag }) => {
    if (closed) {
      return
    }
    const built = sourceExtensions({
      name,
      path: node.path,
      save: () => main.session.save(),
      onUpdate: mainUpdate,
      chips: linkedChips(linkedMode.open),
      apply: (effects) => {
        if (!closed) {
          toMain({ effects })
        }
      },
    })
    nameConfig = built.nameConfig
    wantProfiles = built.wantProfiles
    view = new EditorView({ parent: source, state: EditorState.create({ doc: content, extensions: built.extensions }) })
    main = {
      name,
      session: createFileSession({
        path: node.path,
        etag: loadedEtag,
        doc: () => mainState().doc,
        replace: (text, opts) => replaceWith(mainState(), toMain, text, opts),
        onChange: showState,
        onCopied: renamedMain,
      }),
    }
    saveButton.hidden = refreshButton.hidden = sourceToggle.hidden = false
    addButton.element.hidden = false
    showButtons()
    main.session.start()
    document.addEventListener('visibilitychange', drawAgain)
    window.addEventListener('focus', drawAgain)
    view.focus()
    const text = view.state.doc.toString()
    diagrams = diagramsOf(view.state.doc, text)
    follow(view.state, true)
    // Opened from the Viewer at one of its diagrams (VW7): the cursor goes where its tab would put it.
    if (Number.isInteger(openAt) && openAt >= 0 && openAt < diagrams.length) {
      showDiagram(openAt)
    }
    wantProfiles(diagrams, text)
  }, (e) => {
    // No session yet to hold the failure: the line says it directly.
    console.error(`[${APP_ID}] could not open ${node.path}`, e)
    status.textContent = t(APP_ID, 'Could not open the file')
  })
}

window.OCA.PlantUml = { ...window.OCA.PlantUml, openEditor }
