/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * A file the source links (a style sheet, an include) takes over the source
 * pane until the breadcrumb or Escape goes back to it.
 * How the file is saved, and kept in step with changes made elsewhere, is its
 * session's business (file-session.js); the bar shows that session's state.
 *
 * The Files bundle adds this bundle, an ES module, to the page the first time
 * "Edit diagram" or + New needs it, then calls the window.OCA.PlantUml.openEditor
 * it defines. Each diagram type's profile is imported only when a file holds it.
 */
import crelt from 'crelt'
import { EditorState, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from './files-helpers.js'
import { blocksOf, diagramAt, diagramsOf, scan } from './editor/blocks.js'
import { loadSheetProfile, resetProfiles } from './editor/profiles/index.js'
import { SECTION } from './editor/completion/local-files.js'
import { editorChrome, readOnlyFile, sourceExtensions } from './editor/extensions.js'
import { createBreadcrumb } from './editor/breadcrumb.js'
import { forgetLinkedFiles, linkedChips } from './editor/linked/chips.js'
import { sheetExtension } from './editor/linked/sheet.js'
import { fileName, filePath, setServerError } from './editor/lint/state.js'
import { fileAccess, loadFile } from './editor/save.js'
import { createFileSession, fromFile } from './editor/file-session.js'
import { cancel as cancelRender, debouncedRender } from './editor/preview.js'
import { toInlineSvg } from './editor/inline-svg.js'
import { createSplitter } from './editor/splitter.js'
import { createTabs } from './editor/tabs.js'
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
  const crumbs = createBreadcrumb({ onBack: () => { goBack() } })
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
  // Text's indicator: a check when saved, a dot on it while not, a spinner while saving.
  const saveButton = crelt('button', { class: 'plantuml-editor__save', type: 'button', 'aria-label': t(APP_ID, 'Save'), hidden: '' })
  saveButton.innerHTML = checkIcon
  const closeButton = crelt('button', { class: 'plantuml-editor__close', type: 'button', 'aria-label': t(APP_ID, 'Close') })
  closeButton.innerHTML = closeIcon
  const bar = crelt('header', { class: 'plantuml-editor__bar' })
  bar.append(icon, crumbs.element, status, reloadButton, copyButton, sourceToggle, refreshButton, saveButton, closeButton)

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
  let parked = null // { state, doc, scrollTop }: doc is the text it was parked with
  let linked = null // { link, name, readOnly, session, wantProfiles } while a linked file is open
  let opening = false // a linked file is being read
  let closing = false
  let closed = false
  let diagrams = [] // the main file's, from blocks.js; the one drawn is diagrams[active]
  let active = 0
  let nameConfig = null // the main file's name facets, once its state is built
  let wantProfiles = null

  /** The main file's state, in the view or parked. */
  const mainState = () => parked?.state ?? view.state

  /** A change to the main file's state, wherever it is. */
  function toMain(spec) {
    if (parked) {
      parked.state = parked.state.update(spec).state
    } else {
      view.dispatch(spec)
    }
  }

  /** The bar shows the open file's session's state; before the file is read there is none, and the bar stays as it is. */
  function showButtons() {
    const shown = (linked ?? main)?.session.status()
    if (!shown) {
      return
    }
    saveButton.dataset.state = shown.state
    saveButton.classList.toggle('icon-loading-small', shown.state === 'saving')
    saveButton.title = shown.title
    reloadButton.hidden = copyButton.hidden = !shown.conflict
    reloadButton.disabled = copyButton.disabled = refreshButton.disabled = shown.busy
  }

  function showState() {
    const shown = (linked ?? main)?.session.status()
    if (!shown) {
      return
    }
    // The session redraws on every file operation too: a live region rewritten with the same line may be read out again.
    if (status.textContent !== shown.line) {
      status.textContent = shown.line
    }
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

  /** A linked file's Save as copy carried it on in the copy (S8): the breadcrumb takes its name. */
  function renamedLinked(record, copy) {
    record.name = copy.basename
    if (linked === record) {
      showCrumbs()
    }
  }

  function showCrumbs() {
    crumbs.show(main.name, linked && { name: linked.name, readOnly: linked.readOnly })
  }

  const ticker = setInterval(showButtons, TICK_MS)

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
    debouncedRender(text, diagrams[index].render, main.session.path, (error, svgText, mistake) => {
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
      draw(mainState().doc.toString())
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

  /**
   * Saves first. A refused save stays open on the conflict line, whose buttons
   * are the way out; a save that cannot land (a read-only share, a full quota,
   * an outage) asks before discarding instead of trapping the user.
   */
  async function close() {
    // A second Escape or click while the first close saves does nothing.
    if (closing || closed) {
      return
    }
    // From a linked file, back to the main file first, which is then closed as ever.
    if (linked && !(await goBack())) {
      return
    }
    if (closed) {
      return
    }
    const session = main?.session
    if (session?.isDirty() && !session.blocked()) {
      closing = true
      await session.saveBeforeLeaving()
      closing = false
      if (session.status().conflict) {
        return
      }
    }
    if (session?.isDirty() && !window.confirm(t(APP_ID, 'Discard unsaved changes?'))) {
      return
    }
    closed = true
    session?.stop()
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
      main?.session.save()
      return
    }
    // K1: Escape closes the editor from the main file; from a linked file it goes back (R11).
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      event.stopPropagation()
      if (linked) {
        goBack()
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

  /**
   * R11, R12, R16: the linked file takes over the source pane, read with the
   * profile its link names and opened where the line points. The main file's
   * state is parked whole, its session saving on and no longer watching. A
   * file that cannot be read leaves the main file shown, saying so.
   */
  async function openLinked(link) {
    if (linked || opening) {
      return
    }
    opening = true
    let file
    let access
    let sheet
    try {
      ;[file, access, sheet] = await Promise.all([
        loadFile(link.path),
        fileAccess(link.path),
        link.kind === 'style' ? loadSheetProfile() : null,
      ])
      if (!access) {
        throw new Error(`${link.path} is not readable`)
      }
    } catch (e) {
      console.error(`[${APP_ID}] could not open ${link.path}`, e)
      // Said, not failed: the main file's own saving goes on as before.
      if (!closed) {
        main.session.say(t(APP_ID, 'Could not open the file'))
      }
      return
    } finally {
      opening = false
    }
    if (closed) {
      return
    }
    const name = link.path.slice(link.path.lastIndexOf('/') + 1)
    const readOnly = !access.writable
    const record = { link, name, readOnly, session: null, wantProfiles: null }
    const save = () => record.session.save()
    let extensions
    if (link.kind === 'style') {
      extensions = [...editorChrome({ save, onUpdate: linkedUpdate }), ...sheetExtension(sheet)]
    } else {
      // R14: a linked .puml has no chips of its own.
      const built = sourceExtensions({
        name,
        path: link.path,
        save,
        onUpdate: linkedUpdate,
        chips: [],
        // Its state is the view's only while it is open.
        apply: (effects) => {
          if (linked === record && !closed) {
            view.dispatch({ effects })
          }
        },
      })
      extensions = built.extensions
      record.wantProfiles = built.wantProfiles
    }
    // As CodeMirror reads the file's line breaks, so an offset in it is one in the editor's text.
    const text = file.content.replace(/\r\n?/g, '\n')
    const state = EditorState.create({
      doc: text,
      selection: { anchor: landing(text, link) },
      extensions: readOnly ? [...extensions, readOnlyFile] : extensions,
    })
    parked = { state: view.state, doc: view.state.doc, scrollTop: view.scrollDOM.scrollTop }
    main.session.pause()
    view.setState(state)
    // Made once the view shows the file: a session reads its text as saved when it starts.
    record.session = createFileSession({
      path: link.path,
      etag: file.etag,
      doc: () => view.state.doc,
      replace: (content, opts) => replaceWith(view.state, (spec) => view.dispatch(spec), content, opts),
      onChange: showState,
      onCopied: (copy) => renamedLinked(record, copy),
      readOnly,
    })
    linked = record
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'start', yMargin: 20 }) })
    record.wantProfiles?.(diagramsOf(view.state.doc, text), text)
    record.session.start()
    showCrumbs()
    showState()
    view.focus()
  }

  function linkedUpdate(update) {
    if (!update.docChanged || !linked) {
      return
    }
    linked.session.edited()
    const text = update.state.doc.toString()
    linked.wantProfiles?.(diagramsOf(update.state.doc, text), text)
  }

  /** R11: back to the main file as it was left, its text, selection, folds, undo and scroll; true once there. */
  async function goBack() {
    if (!linked) {
      return true
    }
    // Task 8 puts the save-before-leaving checks here.
    linked.session.stop()
    linked = null
    const { state, doc, scrollTop } = parked
    parked = null
    view.setState(state)
    view.requestMeasure({ read: () => null, write: () => { view.scrollDOM.scrollTop = scrollTop } })
    // A change landed while parked (a check that was under way) ran no update listener: the tabs and drawing catch up.
    if (!state.doc.eq(doc)) {
      const text = state.doc.toString()
      diagrams = diagramsOf(state.doc, text)
      follow(state, true)
      wantProfiles(diagrams, text)
    }
    showCrumbs()
    showState()
    view.focus()
    // It looks at once for a change made elsewhere while it was parked.
    await main.session.resume()
    return true
  }

  function onBeforeUnload(event) {
    if (main?.session.isDirty()) {
      event.preventDefault()
    }
  }

  saveButton.addEventListener('click', () => main?.session.save())
  reloadButton.addEventListener('click', () => main?.session.reload())
  refreshButton.addEventListener('click', () => main?.session.reload())
  sourceToggle.addEventListener('click', toggleSource)
  copyButton.addEventListener('click', () => main?.session.saveAsCopy())
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
      chips: linkedChips(openLinked),
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

/**
 * R16: where a linked file opens, as an offset in its text (`\n` lines): the
 * `!startsub` line the link's section names, or the `@start` line of its block
 * by index or id (B1), else the top.
 */
function landing(text, { section, block }) {
  if (section !== null) {
    const found = [...text.matchAll(SECTION)].find((m) => m[1] === section)
    return found ? text.lastIndexOf('\n', found.index + found[0].indexOf('!startsub')) + 1 : 0
  }
  if (block === null) {
    return 0
  }
  const blocks = blocksOf(scan(text))
  const found = /^\d+$/.test(block) ? blocks[Number(block)] : blocks.find((b) => b.id === block)
  return found ? text.split('\n', found.start - 1).reduce((offset, line) => offset + line.length + 1, 0) : 0
}

/**
 * The file's text in place of `state`'s, changing only the stretch that
 * differs: CodeMirror maps the cursor, and the line at the top of the view,
 * through a change that small, so both stay where they were.
 */
function replaceWith(state, dispatch, content, { history = true } = {}) {
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

window.OCA.PlantUml = { ...window.OCA.PlantUml, openEditor }
