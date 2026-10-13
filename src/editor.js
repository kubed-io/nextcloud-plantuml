/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The side-by-side diagram editor, a full-page overlay over the Files app: the
 * source in CodeMirror on the left, the diagram redrawn from it on the right.
 * The file is touched only by Save, guarded by the ETag it was read with.
 *
 * The Files bundle's "Edit diagram" and + New call window.OCA.PlantUml.openEditor
 * once this bundle has defined it.
 */
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from './files-helpers.js'
import { plantumlMode } from './editor/plantuml-mode.js'
import { ConflictError, loadFile, saveFile } from './editor/save.js'
import { debouncedRender } from './editor/preview.js'
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
  const name = node.basename

  const icon = el('span', 'plantuml-editor__icon', { 'aria-hidden': 'true' })
  icon.innerHTML = fileIcon
  const title = el('h2', 'plantuml-editor__name')
  title.textContent = name
  const status = el('span', 'plantuml-editor__status', { role: 'status' })
  const saveButton = el('button', 'plantuml-editor__save', { type: 'button', disabled: '' })
  saveButton.textContent = t(APP_ID, 'Save')
  const closeButton = el('button', 'plantuml-editor__close', { type: 'button', 'aria-label': t(APP_ID, 'Close') })
  closeButton.innerHTML = closeIcon
  const bar = el('header', 'plantuml-editor__bar')
  bar.append(icon, title, status, saveButton, closeButton)

  const source = el('div', 'plantuml-editor__source')
  const image = el('img', 'plantuml-editor__image', { alt: name, hidden: '' })
  const problem = el('p', 'plantuml-editor__problem', { hidden: '' })
  const diagram = el('div', 'plantuml-editor__diagram')
  diagram.append(image, problem)
  const panes = el('div', 'plantuml-editor__panes')
  panes.append(source, diagram)

  const overlay = el('div', 'plantuml-editor', { role: 'dialog', 'aria-modal': 'true', 'aria-label': name })
  overlay.append(bar, panes)
  document.body.append(overlay)

  let view = null
  let etag = ''
  let saved = null // the Text last read or written
  let cleanStatus = ''
  let saving = false
  let closed = false
  let imageUrl = ''

  const isDirty = () => view !== null && !view.state.doc.eq(saved)

  function showState() {
    status.textContent = isDirty() ? t(APP_ID, 'Unsaved changes') : cleanStatus
    saveButton.disabled = saving || !isDirty()
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
    if (saving || !isDirty()) {
      return
    }
    saving = true
    showState()
    const doc = view.state.doc
    try {
      etag = await saveFile(node.path, doc.toString(), etag)
      saved = doc
      cleanStatus = t(APP_ID, 'Saved')
      showState()
    } catch (e) {
      if (!(e instanceof ConflictError)) {
        console.error(`[${APP_ID}] could not save ${node.path}`, e)
      }
      status.textContent = e instanceof ConflictError
        ? t(APP_ID, 'Someone else changed this file')
        : t(APP_ID, 'Could not save the file')
    } finally {
      saving = false
      saveButton.disabled = !isDirty()
    }
  }

  function close() {
    if (isDirty() && !window.confirm(t(APP_ID, 'Discard unsaved changes?'))) {
      return
    }
    closed = true
    document.removeEventListener('keydown', onKeydown)
    view?.destroy()
    URL.revokeObjectURL(imageUrl)
    overlay.remove()
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
  closeButton.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)

  loadFile(node.path).then(({ content, etag: loadedEtag }) => {
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
          syntaxHighlighting(defaultHighlightStyle),
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
    console.error(`[${APP_ID}] could not open ${node.path}`, e)
    status.textContent = t(APP_ID, 'Could not open the file')
  })
}

window.OCA.PlantUml = { ...window.OCA.PlantUml, openEditor }
