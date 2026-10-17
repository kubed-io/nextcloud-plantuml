/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's diagrams (VW1–VW8), on a root the Vue component hands over. The
 * file is read once and split as the editor's tabs split it; every open starts
 * in Tabs on the first diagram (VW8). The head (toolbar, tab bar) sits outside
 * the scrolling stage, so neither moves when a diagram changes size (VW3).
 * Stack and Wall (VW4, VW5) show every diagram as a card with a checkbox; what
 * is checked lasts while the view does, across modes.
 */
import { translate as t } from '@nextcloud/l10n'
import { loadState } from '@nextcloud/initial-state'
import { APP_ID } from '../files-helpers.js'
import { loadFile } from '../editor/save.js'
import { label, scan } from '../editor/blocks.js'
import { createTabs } from '../editor/tabs.js'
import { createSheets } from './sheets.js'
import { createToolbar } from './toolbar.js'

// The Viewer keeps the file before mounted, hidden, beside the one shown: each
// view numbers its ids, so a tab's aria-controls and a diagram's url(#…) find
// their own view.
let views = 0

// The Viewer (NcModal) takes ←/→ for the previous and next file and Escape for
// closing. Keys a tab strip or an open menu of ours uses stop at the root: the
// arrows, Home and End in a tablist or menu, and Escape in a menu.
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

function element(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}

/**
 * @param {HTMLElement} root
 * @param {{ path: string, basename: string, onReady: () => void }} options
 * @return {{ destroy: () => void }}
 */
export function createDiagramView(root, { path, basename, onReady }) {
  const prefix = `plantuml-viewer-${++views}-`
  const stageId = `${prefix}stage`
  const state = { mode: 'tabs', active: 0, checked: new Set() }
  let diagrams = []
  let sheets = null
  let toolbar = null
  let destroyed = false
  let ready = false
  const settle = () => {
    if (!ready && !destroyed) {
      ready = true
      onReady()
    }
  }

  const head = element('div', 'plantuml-viewer__head')
  const tabBar = element('div', 'plantuml-viewer__tabbar')
  tabBar.hidden = true
  const stage = element('div', 'plantuml-viewer__stage')
  stage.id = stageId
  stage.setAttribute('aria-label', basename)
  const tabs = createTabs({
    onActivate: (index) => {
      state.active = index
      show()
    },
    controls: stageId,
  })
  tabBar.append(tabs.element)
  head.append(tabBar)
  root.replaceChildren(head, stage)

  root.addEventListener('keydown', (event) => {
    const inMenu = event.target.closest?.('[role="menu"]')
    const inTabs = event.target.closest?.('[role="tablist"]')
    if ((MOVES.has(event.key) && (inMenu || inTabs)) || (event.key === 'Escape' && inMenu)) {
      event.stopPropagation()
    }
  })

  /** Task 9: the Export label follows what is checked. */
  function afterCheck() {}
  /** Task 9: Export's menu. */
  function exportMenu() {}
  /** Task 9: the editor at the diagram in view. */
  function edit() {}

  function card(index) {
    const node = element('div', 'plantuml-viewer__card')
    const caption = element('label', 'plantuml-viewer__caption')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = state.checked.has(index)
    box.addEventListener('change', () => {
      if (box.checked) {
        state.checked.add(index)
      } else {
        state.checked.delete(index)
      }
      node.classList.toggle('plantuml-viewer__card--checked', box.checked)
      afterCheck()
    })
    caption.append(box, label(diagrams[index]))
    node.classList.toggle('plantuml-viewer__card--checked', box.checked)
    node.append(caption, sheets.sheet(index + 1))
    // The caption is a <label>: a click on its text toggles the box, so it counts as the checkbox.
    node.addEventListener('click', (event) => {
      if (state.mode === 'wall' && !caption.contains(event.target)) {
        state.mode = 'tabs'
        state.active = index
        show()
      }
    })
    return node
  }

  function show() {
    toolbar?.setMode(state.mode)
    tabBar.hidden = state.mode !== 'tabs' || diagrams.length < 2
    stage.className = `plantuml-viewer__stage plantuml-viewer__stage--${state.mode}`
    if (state.mode === 'tabs') {
      tabs.update(diagrams, state.active)
      stage.replaceChildren(sheets.sheet(state.active + 1))
    } else {
      stage.replaceChildren(...diagrams.map((_diagram, index) => card(index)))
    }
    afterCheck()
  }

  function build({ exportable }) {
    toolbar = createToolbar({
      single: diagrams.length < 2,
      editable: loadState(APP_ID, 'server_configured', false),
      exportable,
      onMode: (mode) => {
        state.mode = mode
        show()
      },
      onExport: () => exportMenu(),
      onEdit: () => edit(),
    })
    head.prepend(toolbar.element)
  }

  loadFile(path).then(({ content }) => {
    if (destroyed) {
      return
    }
    // CodeMirror reads any line ending for the editor; scan() splits on \n alone.
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { labelOf: (position) => label(diagrams[position - 1]), idPrefix: prefix })
    build({ exportable: true })
    sheets.sheet(1).addEventListener('plantuml-viewer:settled', settle, { once: true })
    show()
  }, () => {
    if (destroyed) {
      return
    }
    const line = element('p', 'plantuml-viewer__problem')
    line.textContent = t(APP_ID, 'Could not draw the diagram')
    root.replaceChildren(line)
    settle()
  })

  return {
    destroy() {
      destroyed = true
      sheets?.destroy()
      tabs.destroy()
      root.replaceChildren()
    },
  }
}
