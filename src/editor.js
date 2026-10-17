/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * How the file is saved, and kept in step with changes made elsewhere, is its
 * session's business (file-session.js); the bar shows that session's state.
 *
 * The Files bundle adds this bundle, an ES module, to the page the first time
 * "Edit diagram" or + New needs it, then calls the window.OCA.PlantUml.openEditor
 * it defines. Each diagram type's profile is imported only when a file holds it.
 */
import crelt from 'crelt'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { closeLintPanel } from '@codemirror/lint'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from './files-helpers.js'
import { diagramAt, diagramsOf } from './editor/blocks.js'
import { profileExtension, profileLoader, resetProfiles } from './editor/profiles/index.js'
import { plantumlTheme } from './editor/theme.js'
import { plantumlCompletion } from './editor/completion/index.js'
import { valueWidgets } from './editor/values/widgets.js'
import { colorSwatches } from './editor/swatches.js'
import { plantumlLint, plantumlLintKeymap } from './editor/lint/index.js'
import { plantumlDocs } from './editor/docs/hover.js'
import { plantumlFolding } from './editor/folding.js'
import { forgetLinkedFiles } from './editor/linked/chips.js'
import { fileName, filePath, setServerError } from './editor/lint/state.js'
import { loadFile } from './editor/save.js'
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
  const title = crelt('h2', { class: 'plantuml-editor__name' })
  title.textContent = name
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
  bar.append(icon, title, status, reloadButton, copyButton, sourceToggle, refreshButton, saveButton, closeButton)

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
  // The main file, once read: its name and its session. Its state is parked
  // while another file is shown in the view; nothing parks it yet.
  let main = null
  let parked = null
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

  /** The bar shows the session's state; before the file is read there is none, and the bar stays as it is. */
  function showButtons() {
    const shown = main?.session.status()
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
    const shown = main?.session.status()
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
    title.textContent = copy.basename
    overlay.setAttribute('aria-label', copy.basename)
    image.setAttribute('aria-label', copy.basename)
    toMain({ effects: nameConfig.reconfigure([fileName.of(copy.basename), filePath.of(copy.path)]) })
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

  /**
   * Saves first. A refused save stays open on the conflict line, whose buttons
   * are the way out; a save that cannot land (a read-only share, a full quota,
   * an outage) asks before discarding instead of trapping the user.
   */
  async function close() {
    // A second Escape or click while the first close saves does nothing.
    if (closing) {
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
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
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
          nameConfig.of([fileName.of(name), filePath.of(node.path)]),
          plantumlTheme,
          // A swatch before each ColorLiteral, named ones too; picking a colour writes it back as #rrggbb.
          colorSwatches,
          // A chooser after each value with a list, a stepper after each number, on the cursor's line.
          valueWidgets,
          // Long lines wrap, so the source pane never scrolls sideways.
          EditorView.lineWrapping,
          // Mod-s would otherwise be the browser's "Save page as". defaultKeymap
          // carries Mod-/ for comments; Ctrl-M (Shift-Alt-M on macOS) makes Tab
          // move focus again instead of indenting. plantumlLintKeymap (lint's own)
          // opens the diagnostics panel on Mod-Shift-m and steps through them on F8.
          keymap.of([
            { key: 'Mod-s', run: () => { main.session.save(); return true } },
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
              main.session.edited()
              const text = update.state.doc.toString()
              diagrams = diagramsOf(update.state.doc, text)
              wantProfiles(diagrams, text)
            }
            if (update.docChanged || update.selectionSet) {
              follow(update.state, update.docChanged)
            }
          }),
        ],
      }),
    })
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
