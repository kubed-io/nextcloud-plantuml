/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "Open with text editor": Text's own editor on the diagram file, in a full-size
 * overlay. Text claims a fixed mimetype list that does not include ours, so it is
 * hosted through its public `OCA.Text.createEditor()`. With a file id Text runs
 * its usual session and saves the file itself, so the overlay has no Save button.
 * The overlay mechanics are nextcloud-grafana's (src/files.js).
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from './files-helpers.js'

let stylesInjected = false
function injectStyles() {
  if (stylesInjected) return
  stylesInjected = true
  const el = document.createElement('style')
  el.textContent = `
.plantuml-text-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}
.plantuml-text-dialog{display:flex;flex-direction:column;width:min(92vw,1000px);height:min(92vh,820px);background:var(--color-main-background);border-radius:var(--border-radius-large,12px);box-shadow:0 0 30px rgba(0,0,0,.4);overflow:hidden}
.plantuml-text-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--color-border)}
.plantuml-text-title{flex:1;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.plantuml-text-editor{flex:1;min-height:0;overflow:auto}`
  document.head.appendChild(el)
}

/**
 * Opens Text's editor on `node`. False when Text is not installed, which the
 * Files app turns into an error toast.
 *
 * @param {import('@nextcloud/files').INode} node
 * @return {Promise<boolean>}
 */
export async function openTextEditor(node) {
  if (!window.OCA?.Text?.createEditor) return false
  injectStyles()

  // Static markup only; the file name and the button label are set through
  // textContent, so neither can inject markup.
  const overlay = document.createElement('div')
  overlay.className = 'plantuml-text-overlay'
  overlay.innerHTML =
    '<div class="plantuml-text-dialog">'
    + '<div class="plantuml-text-bar">'
    +   '<span class="plantuml-text-title"></span>'
    +   '<button type="button" class="button js-close"></button>'
    + '</div>'
    + '<div class="plantuml-text-editor"></div>'
    + '</div>'
  document.body.appendChild(overlay)

  const sel = (s) => overlay.querySelector(s)
  sel('.plantuml-text-title').textContent = node.basename
  sel('.js-close').textContent = t(APP_ID, 'Close')

  let editor = null
  const close = () => {
    document.removeEventListener('keydown', onKey)
    editor?.destroy()
    overlay.remove()
  }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  sel('.js-close').addEventListener('click', close)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  document.addEventListener('keydown', onKey)

  try {
    editor = await window.OCA.Text.createEditor({
      el: sel('.plantuml-text-editor'),
      fileId: node.fileid,
      filePath: node.path,
    })
  } catch (e) {
    console.error(`[${APP_ID}] could not open the text editor`, e)
    close()
    return false
  }
  return true
}
