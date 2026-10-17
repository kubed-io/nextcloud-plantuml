/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's diagrams (VW1–VW8), on a root the Vue component hands over. The
 * file is read once and split as the editor's tabs split it; every open starts
 * in Tabs on the first diagram (VW8). The head (toolbar, tab bar) sits outside
 * the scrolling stage, so neither moves when a diagram changes size (VW3).
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import { loadFile } from '../editor/save.js'
import { label, scan } from '../editor/blocks.js'
import { createTabs } from '../editor/tabs.js'
import { createSheets } from './sheets.js'

const STAGE_ID = 'plantuml-viewer-stage'

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
  const state = { active: 0 }
  let diagrams = []
  let sheets = null
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
  stage.id = STAGE_ID
  stage.setAttribute('aria-label', basename)
  const tabs = createTabs({
    onActivate: (index) => {
      state.active = index
      show()
    },
    controls: STAGE_ID,
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

  function show() {
    tabs.update(diagrams, state.active)
    tabBar.hidden = diagrams.length < 2
    stage.replaceChildren(sheets.sheet(state.active + 1))
  }

  loadFile(path).then(({ content }) => {
    if (destroyed) {
      return
    }
    // CodeMirror reads any line ending for the editor; scan() splits on \n alone.
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { labelOf: (position) => label(diagrams[position - 1]) })
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
