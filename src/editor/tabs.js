/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The tab strip over the diagram, one tab per diagram of the file: a WAI-ARIA
 * tablist with manual activation. The arrow keys, Home and End move the focus,
 * a click (which Enter and Space on a button are) activates; only the active
 * tab is in the Tab order. With one diagram it is hidden. When the tabs
 * overflow, an "All diagrams" menu button at the strip's end lists every
 * diagram, and the mouse wheel scrolls the strip sideways.
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
 * @return {{ element: HTMLElement, list: HTMLElement, update: (diagrams: import('./blocks.js').Diagram[], active: number) => void, destroy: () => void }}
 */
export function createTabs({ onActivate, controls }) {
  const element = document.createElement('div')
  element.className = 'plantuml-editor__tabbar'
  element.hidden = true
  // The tablist holds only tabs; the menu button is its sibling.
  const list = document.createElement('div')
  list.className = 'plantuml-editor__tabs'
  list.setAttribute('role', 'tablist')
  list.setAttribute('aria-label', t(APP_ID, 'Diagrams'))
  const more = document.createElement('div')
  more.className = 'plantuml-editor__more'
  more.hidden = true
  const button = document.createElement('button')
  button.className = 'plantuml-editor__more-button'
  button.type = 'button'
  button.setAttribute('aria-haspopup', 'menu')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-label', t(APP_ID, 'All diagrams'))
  button.title = t(APP_ID, 'All diagrams')
  button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z"/></svg>'
  const menu = document.createElement('div')
  menu.className = 'plantuml-editor__menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', t(APP_ID, 'All diagrams'))
  menu.hidden = true
  more.append(button, menu)
  element.append(list, more)
  const tabs = []
  const items = []
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
    list.append(tab)
    tabs.push(tab)
    const item = document.createElement('button')
    item.className = 'plantuml-editor__menu-item'
    item.type = 'button'
    item.tabIndex = -1
    item.setAttribute('role', 'menuitemradio')
    item.append(document.createElement('span'), document.createElement('span'))
    item.lastChild.className = 'plantuml-editor__menu-type'
    item.addEventListener('click', () => {
      close()
      onActivate(index)
    })
    menu.append(item)
    items.push(item)
  }

  /** The menu is fixed, so the pane's overflow cannot clip it: under the button, right-aligned, inside the viewport. */
  function place() {
    const rect = button.getBoundingClientRect()
    const right = Math.max(0, window.innerWidth - rect.right)
    menu.style.top = `${rect.bottom}px`
    menu.style.right = `${Math.min(right, Math.max(0, window.innerWidth - menu.offsetWidth))}px`
    menu.style.maxHeight = `${Math.max(160, window.innerHeight - rect.bottom - 8)}px`
  }

  function open() {
    menu.hidden = false
    place()
    button.setAttribute('aria-expanded', 'true')
    document.addEventListener('click', outside, true)
    document.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', place)
    ;(items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus()
  }

  /** @param {boolean} [refocus] return the focus to the button, as a pick or Escape does */
  function close(refocus = true) {
    document.removeEventListener('click', outside, true)
    document.removeEventListener('scroll', scrolled, true)
    window.removeEventListener('resize', place)
    const wasOpen = !menu.hidden
    menu.hidden = true
    button.setAttribute('aria-expanded', 'false')
    if (wasOpen && refocus) {
      button.focus()
    }
  }

  function outside(event) {
    if (!more.contains(event.target)) {
      close(false)
    }
  }

  /** Scrolling the pane (or the strip) would leave the menu behind. */
  function scrolled(event) {
    if (!menu.contains(event.target)) {
      close(false)
    }
  }

  button.addEventListener('click', () => (menu.hidden ? open() : close()))
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && menu.hidden) {
      event.preventDefault()
      open()
    }
  })

  // Focus moving on to somewhere else closes it; a null target (a click on nothing) is left to `outside`.
  more.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !more.contains(event.relatedTarget)) {
      close(false)
    }
  })

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Tab') {
      close(false)
      return
    }
    const i = items.indexOf(document.activeElement)
    if (i < 0 || event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    const move = { ...MOVES, ArrowUp: MOVES.ArrowLeft, ArrowDown: MOVES.ArrowRight }[event.key]
    if (move) {
      event.preventDefault()
      items[move(i, items.length)].focus()
    }
  })

  list.addEventListener('keydown', (event) => {
    const i = tabs.indexOf(event.target)
    if (i < 0 || event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    if (MOVES[event.key]) {
      event.preventDefault()
      tabs[MOVES[event.key](i, tabs.length)].focus()
    }
  })

  // A vertical wheel has nothing to scroll in a strip, so it scrolls sideways.
  list.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || list.scrollWidth <= list.clientWidth) {
      return
    }
    event.preventDefault()
    list.scrollLeft += event.deltaY
  }, { passive: false })

  function checkOverflow() {
    const overflows = !element.hidden && list.scrollWidth > list.clientWidth
    more.hidden = !overflows
    button.hidden = !overflows
    if (!overflows) {
      close(false)
    }
  }
  let observer = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(checkOverflow)
    observer.observe(list)
  }

  /** The editor closing: stop observing and drop the listeners an open menu holds on the document and window. */
  function destroy() {
    observer?.disconnect()
    close(false)
    window.removeEventListener('resize', place)
  }

  /** Tabs are kept and relabelled rather than rebuilt, so a focused one stays focused. */
  function update(diagrams, active) {
    while (tabs.length < diagrams.length) {
      add(tabs.length)
    }
    while (tabs.length > diagrams.length) {
      tabs.pop().remove()
      items.pop().remove()
    }
    const current = Math.max(0, Math.min(active, diagrams.length - 1))
    tabs.forEach((tab, i) => {
      const text = label(diagrams[i])
      if (tab.textContent !== text) {
        tab.textContent = text
      }
      tab.setAttribute('aria-selected', String(i === current))
      tab.tabIndex = i === current ? 0 : -1
      items[i].firstChild.textContent = text
      items[i].lastChild.textContent = diagrams[i].type === text ? '' : diagrams[i].type
      items[i].setAttribute('aria-label', `${text}, ${diagrams[i].type}`)
      items[i].setAttribute('aria-checked', String(i === current))
    })
    element.hidden = diagrams.length < 2
    if (element.hidden) {
      shown = -1
    } else if (current !== shown) {
      tabs[current].scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      shown = current
    }
    checkOverflow()
  }

  return { element, list, update, destroy }
}
