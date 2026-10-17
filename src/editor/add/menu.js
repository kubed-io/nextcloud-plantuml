/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The type menu under ▾ (editor spec A2): every type, its icon and name;
 * picking one adds its Empty. Fixed under its button, right edges aligned, and
 * moved and closed as B2's "All diagrams" menu is (tabs.js). Every key it
 * handles stops here, so the editor's Escape never closes the editor. In the
 * add chunk, so what it needs of the editor's comes in `core` (index.js).
 */
import { iconSvg } from '../data/template-icons.js'

/** 12 rows of 44 px and the menu's 4 px top and bottom (board `overlay / type-menu`). */
const MAX_HEIGHT = 12 * 44 + 8

/**
 * @param {{ container: HTMLElement, anchor: HTMLElement, types: { type: string, name: string, icon: string }[], onPick: (type: string) => void, onClose: () => void, core: import('./index.js').Core }} options
 * @returns {{ close: () => void }}
 */
export function openTypeMenu({ container, anchor, types, onPick, onClose, core: { crelt, t, MOVES } }) {
  // Up and down in a column, as the tabs' menu reads them.
  const KEYS = { ...MOVES, ArrowUp: MOVES.ArrowLeft, ArrowDown: MOVES.ArrowRight }
  const menu = crelt('div', { class: 'plantuml-editor__menu plantuml-add__menu', role: 'menu', 'aria-label': t('plantuml', 'Add a diagram of a type') })
  const items = types.map(({ type, name, icon }) => {
    const item = crelt('button', { class: 'plantuml-editor__menu-item plantuml-add__menu-item', type: 'button', role: 'menuitem', tabindex: '-1' })
    item.innerHTML = `<span class="plantuml-add__menu-icon">${iconSvg(icon, 24)}</span>`
    item.append(crelt('span', name))
    item.addEventListener('click', () => {
      close(false)
      onPick(type)
    })
    return item
  })
  menu.append(...items)
  container.append(menu)
  place()
  items[0]?.focus()

  function place() {
    const rect = anchor.getBoundingClientRect()
    menu.style.top = `${rect.bottom + 4}px`
    menu.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`
    menu.style.maxHeight = `${Math.min(MAX_HEIGHT, Math.max(160, window.innerHeight - rect.bottom - 12))}px`
  }

  function onKey(event) {
    const i = items.indexOf(document.activeElement)
    const move = event.altKey || event.ctrlKey || event.metaKey ? undefined : KEYS[event.key]
    if (move && i >= 0) {
      items[move(i, items.length)].focus()
    } else if (event.key === 'Enter' || event.key === ' ') {
      items[i]?.click()
    } else if (event.key === 'Escape') {
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
      return
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function outside(event) {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) {
      close(false)
    }
  }

  /** Scrolling the page under it would leave the menu behind (B2). */
  function scrolled(event) {
    if (!menu.contains(event.target)) {
      close(false)
    }
  }

  let open = true
  function close(refocus) {
    if (!open) {
      return
    }
    open = false
    document.removeEventListener('click', outside, true)
    document.removeEventListener('scroll', scrolled, true)
    window.removeEventListener('resize', place)
    menu.remove()
    if (refocus) {
      anchor.focus()
    }
    onClose()
  }

  menu.addEventListener('keydown', onKey)
  document.addEventListener('click', outside, true)
  document.addEventListener('scroll', scrolled, true)
  window.addEventListener('resize', place)
  return { close: () => close(false) }
}
