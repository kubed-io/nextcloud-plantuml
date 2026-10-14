/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The tab strip over the diagram, one tab per diagram of the file: a WAI-ARIA
 * tablist with manual activation. The arrow keys, Home and End move the focus,
 * Enter, Space or a click activates; only the active tab is in the Tab order.
 * With one diagram it is hidden.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import { label } from './blocks.js'

const MOVES = {
  ArrowLeft: (i, count) => (i - 1 + count) % count,
  ArrowRight: (i, count) => (i + 1) % count,
  Home: () => 0,
  End: (_i, count) => count - 1,
}

/**
 * @param {object} options
 * @param {(index: number) => void} options.onActivate called with the index of the tab activated
 * @param {string} [options.controls] the id of the element showing the diagram
 * @return {{ element: HTMLElement, update: (diagrams: import('./blocks.js').Diagram[], active: number) => void }}
 */
export function createTabs({ onActivate, controls }) {
  const element = document.createElement('div')
  element.className = 'plantuml-editor__tabs'
  element.setAttribute('role', 'tablist')
  element.setAttribute('aria-label', t(APP_ID, 'Diagrams'))
  element.hidden = true
  const tabs = []
  let shown = -1

  function add(index) {
    const tab = document.createElement('button')
    tab.className = 'plantuml-editor__tab'
    tab.type = 'button'
    tab.setAttribute('role', 'tab')
    if (controls) {
      tab.setAttribute('aria-controls', controls)
    }
    tab.addEventListener('click', () => onActivate(index))
    element.append(tab)
    tabs.push(tab)
  }

  element.addEventListener('keydown', (event) => {
    const i = tabs.indexOf(event.target)
    if (i < 0 || event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onActivate(i)
    } else if (MOVES[event.key]) {
      event.preventDefault()
      tabs[MOVES[event.key](i, tabs.length)].focus()
    }
  })

  /** Tabs are kept and relabelled rather than rebuilt, so a focused one stays focused. */
  function update(diagrams, active) {
    while (tabs.length < diagrams.length) {
      add(tabs.length)
    }
    while (tabs.length > diagrams.length) {
      tabs.pop().remove()
    }
    const current = Math.max(0, Math.min(active, diagrams.length - 1))
    tabs.forEach((tab, i) => {
      const text = label(diagrams[i])
      if (tab.textContent !== text) {
        tab.textContent = text
      }
      tab.setAttribute('aria-selected', String(i === current))
      tab.tabIndex = i === current ? 0 : -1
    })
    element.hidden = diagrams.length < 2
    if (element.hidden) {
      shown = -1
    } else if (current !== shown) {
      tabs[current].scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      shown = current
    }
  }

  return { element, update }
}
