/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The draggable line between source and diagram: a WAI-ARIA window splitter
 * (role="separator", focusable, arrow keys) that writes the source pane's share
 * of the width to `--plantuml-split` on the panes grid. The share is remembered
 * per browser; storage that throws (private mode) just means 50/50 next time.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'

export const STORAGE_KEY = 'plantuml.editor.split'
const MIN = 20
const MAX = 80
const STEP = 5
const DEFAULT = 50

const clamp = (value) => Math.min(MAX, Math.max(MIN, Math.round(value)))

function remembered() {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY))
    return value >= MIN && value <= MAX ? value : DEFAULT
  } catch {
    return DEFAULT
  }
}

function remember(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Not remembered; the split still applies for this editor.
  }
}

/**
 * @param {HTMLElement} panes the grid holding source, splitter and diagram
 * @param {HTMLElement} source the pane the separator sizes (aria-controls)
 * @return {HTMLElement} the separator, to place between the two panes
 */
export function createSplitter(panes, source) {
  const handle = document.createElement('div')
  handle.className = 'plantuml-editor__splitter'
  handle.setAttribute('role', 'separator')
  handle.setAttribute('tabindex', '0')
  handle.setAttribute('aria-orientation', 'vertical')
  handle.setAttribute('aria-label', t(APP_ID, 'Resize the source and the diagram'))
  handle.setAttribute('aria-valuemin', String(MIN))
  handle.setAttribute('aria-valuemax', String(MAX))
  if (source.id) {
    handle.setAttribute('aria-controls', source.id)
  }

  function set(value, keep = true) {
    const share = clamp(value)
    panes.style.setProperty('--plantuml-split', `${share}%`)
    handle.setAttribute('aria-valuenow', String(share))
    if (keep) {
      remember(share)
    }
  }
  set(remembered(), false)

  const shareAt = (clientX) => {
    const box = panes.getBoundingClientRect()
    return box.width > 0 ? ((clientX - box.left) / box.width) * 100 : DEFAULT
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    handle.setPointerCapture?.(event.pointerId)
    handle.classList.add('plantuml-editor__splitter--dragging')
    const move = (e) => set(shareAt(e.clientX), false)
    const stop = (e) => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      handle.releasePointerCapture?.(e.pointerId)
      handle.classList.remove('plantuml-editor__splitter--dragging')
      remember(Number(handle.getAttribute('aria-valuenow')))
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  })

  handle.addEventListener('dblclick', () => set(DEFAULT))

  handle.addEventListener('keydown', (event) => {
    const now = Number(handle.getAttribute('aria-valuenow'))
    const next = {
      ArrowLeft: now - STEP,
      ArrowRight: now + STEP,
      Home: MIN,
      End: MAX,
      Enter: DEFAULT,
    }[event.key]
    if (next !== undefined) {
      event.preventDefault()
      set(next)
    }
  })

  return handle
}
