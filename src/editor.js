/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * The file is touched only by Save, guarded by the ETag it was read with; when
 * someone else changed it meanwhile, Reload takes theirs and Save as copy keeps
 * ours in a new file beside it.
 *
 * The Files bundle adds this bundle to the page the first time "Edit diagram"
 * or + New needs it, then calls the window.OCA.PlantUml.openEditor it defines.
 */
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { translate as t } from '@nextcloud/l10n'
import { emit } from '@nextcloud/event-bus'
import { APP_ID } from './files-helpers.js'
import { plantumlMode } from './editor/plantuml-mode.js'
import { plantumlTheme } from './editor/theme.js'
import { ConflictError, loadFile, saveCopy, saveFile } from './editor/save.js'
import { cancel as cancelRender, debouncedRender } from './editor/preview.js'
import fileIcon from '../img/icons/plantuml.svg?raw'
import closeIcon from '../img/icons/close.svg?raw'

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
  const saveButton = el('button', 'plantuml-editor__save', { type: 'button', disabled: '' })
  saveButton.textContent = t(APP_ID, 'Save')
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
  let cleanStatus = ''
  let conflict = false // a save met someone else's change; lasts until resolved
  let busy = false
  let closed = false
  let imageUrl = ''

  const isDirty = () => view !== null && !view.state.doc.eq(saved)

  function showButtons() {
    saveButton.disabled = busy || !isDirty()
    reloadButton.hidden = copyButton.hidden = !conflict
    reloadButton.disabled = copyButton.disabled = busy
  }

  function showState() {
    if (conflict) {
      status.textContent = t(APP_ID, 'Someone else changed this file')
    } else {
      status.textContent = isDirty() ? t(APP_ID, 'Unsaved changes') : cleanStatus
    }
    showButtons()
  }

  /** `doc` is what the file now holds, at `etag`. */
  function markSaved(doc) {
    saved = doc
    conflict = false
    cleanStatus = t(APP_ID, 'Saved')
    showState()
  }

  /** One file operation at a time; a failure's message stays until the next change. */
  async function exclusively(task) {
    if (busy) {
      return
    }
    busy = true
    showButtons()
    try {
      await task()
    } finally {
      busy = false
      showButtons()
    }
  }

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
          showState()
          return
        }
        console.error(`[${APP_ID}] could not save ${path}`, e)
        status.textContent = t(APP_ID, 'Could not save the file')
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
        status.textContent = t(APP_ID, 'Could not open the file')
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
        status.textContent = t(APP_ID, 'Could not save a copy')
      }
    })
  }

  function close() {
    if (isDirty() && !window.confirm(t(APP_ID, 'Discard unsaved changes?'))) {
      return
    }
    closed = true
    cancelRender()
    document.removeEventListener('keydown', onKeydown)
    view?.destroy()
    URL.revokeObjectURL(imageUrl)
    overlay.remove()
    for (const sibling of inerted) {
      sibling.removeAttribute('inert')
    }
    opener?.focus?.()
  }

  // CodeMirror marks an Escape it used (dropping a multi-selection) as handled.
  function onKeydown(event) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  saveButton.addEventListener('click', save)
  reloadButton.addEventListener('click', reload)
  copyButton.addEventListener('click', saveAsCopy)
  closeButton.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)

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
          history(),
          plantumlMode,
          plantumlTheme,
          // Mod-s would otherwise be the browser's "Save page as".
          keymap.of([{ key: 'Mod-s', run: () => { save(); return true } }, ...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              showState()
              draw(update.state.doc.toString())
            }
          }),
        ],
      }),
    })
    saved = view.state.doc
    view.focus()
    draw(content)
  }, (e) => {
    console.error(`[${APP_ID}] could not open ${path}`, e)
    status.textContent = t(APP_ID, 'Could not open the file')
  })
}

window.OCA.PlantUml = { ...window.OCA.PlantUml, openEditor }
