/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Export menu (VW6): a heading saying what is exported, then the formats.
 * A WAI-ARIA menu under its button, left edges aligned: ↑/↓, Home/End, Escape
 * back to the button; Tab or a click elsewhere closes it. The view's key guard
 * (diagram-view.js) keeps its keys from the Viewer.
 */
import downloadIcon from '../../img/icons/download.svg?raw'

/**
 * @param {object} options
 * @param {HTMLButtonElement} options.anchor the button it opens under; the menu is put after it
 * @param {() => string} options.heading read each time it opens
 * @param {{ label: string, value: string }[]} options.items
 * @param {(value: string) => void} options.onPick
 * @param {string} [options.idPrefix] the view's own, for the heading's id
 * @return {{ open: () => void, close: () => void, destroy: () => void }}
 */
export function createMenu({ anchor, heading, items, onPick, idPrefix = 'plantuml-viewer-' }) {
  const element = document.createElement('div')
  element.className = 'plantuml-viewer__menu'
  element.setAttribute('role', 'menu')
  element.hidden = true
  // The heading names the menu and is no item of it; not focusable, or `none` would be ignored.
  const title = document.createElement('div')
  title.className = 'plantuml-viewer__menu-heading'
  title.id = `${idPrefix}export-heading`
  title.setAttribute('role', 'none')
  element.setAttribute('aria-labelledby', title.id)
  const buttons = items.map(({ label, value }) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'plantuml-viewer__menu-item'
    item.setAttribute('role', 'menuitem')
    item.tabIndex = -1
    item.dataset.value = value
    item.innerHTML = `<span class="plantuml-viewer__menu-icon" aria-hidden="true">${downloadIcon.trim()}</span>`
      + '<span class="plantuml-viewer__menu-label"></span>'
    item.lastElementChild.textContent = label
    item.addEventListener('click', () => {
      close()
      onPick(value)
    })
    return item
  })
  element.append(title, ...buttons)
  anchor.after(element)

  // The button is left to its own click, which opens or closes the menu.
  const outside = (event) => {
    if (!element.contains(event.target) && !anchor.contains(event.target)) {
      close(false)
    }
  }

  function open() {
    title.textContent = heading()
    element.style.left = `${anchor.offsetLeft}px`
    element.hidden = false
    anchor.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outside, true)
    buttons[0]?.focus()
  }

  /** @param {boolean} [refocus] return the focus to the button, as a pick or Escape does */
  function close(refocus = true) {
    const wasOpen = !element.hidden
    element.hidden = true
    anchor.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (wasOpen && refocus) {
      anchor.focus()
    }
  }

  // A press on the heading or the padding would take the focus out of the menu, to the Viewer,
  // whose Escape then closes the Viewer itself; on an item it goes on to the click.
  element.addEventListener('pointerdown', (event) => {
    if (!event.target.closest?.('[role="menuitem"]')) {
      event.preventDefault()
    }
  })

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Tab') {
      close(false)
      return
    }
    const at = buttons.indexOf(document.activeElement)
    const count = buttons.length
    const next = { ArrowDown: (at + 1) % count, ArrowUp: (at - 1 + count) % count, Home: 0, End: count - 1 }[event.key]
    if (next !== undefined) {
      event.preventDefault()
      buttons[next].focus()
    }
  })

  return {
    open,
    close,
    destroy() {
      close(false)
      element.remove()
    },
  }
}
