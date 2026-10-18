/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Add diagram modal (editor spec A3): the types on the left, the selected
 * type's templates on the right, the text a row adds in a card beside it.
 * NcModal's look and ways built by hand, since the editor has no Vue: a click
 * on the backdrop closes it too. Every key it handles stops here, so the
 * editor's Escape never closes the editor; the backdrop and the dialog take the
 * focus a click on them would send to the page, for the same reason. In the
 * add chunk, so what it needs of the editor's comes in `core` (index.js).
 */
import { iconSvg } from '../data/template-icons.js'
import { matching } from './catalog.js'
import { TYPES } from './types.js'

const BY_TYPE = new Map(TYPES.map((x) => [x.type, x]))

/**
 * @param {{ container: HTMLElement, arranged: Map<string, import('./catalog.js').Template[]>, onPick: (template: import('./catalog.js').Template) => void, onClose: () => void, core: import('./index.js').Core, opener?: HTMLElement|null }} options
 *   `opener` takes the focus back on Escape, the close button or a pick
 * @returns {{ update: (arranged: Map<string, import('./catalog.js').Template[]>) => void, close: () => void }}
 *   `close` leaves the focus to whatever closed it (the editor, a linked file)
 */
export function openAddModal({ container, arranged, onPick, onClose, core: { crelt, t, MOVES, DOC_HOVER, closeIcon }, opener = document.activeElement }) {
  // Up and down in a column, as the type menu reads them.
  const KEYS = { ArrowUp: MOVES.ArrowLeft, ArrowDown: MOVES.ArrowRight, Home: MOVES.Home, End: MOVES.End }
  let all = arranged
  let selected = TYPES[0].type
  let timer = 0
  let shown = null // the row whose text the card shows
  let open = true
  let downOnMask = false // a press that began on the backdrop, so a drag ending there does not close it

  const title = crelt('h2', { class: 'plantuml-add__title', id: 'plantuml-add-title' }, t('plantuml', 'Add diagram'))
  const closeButton = crelt('button', { class: 'plantuml-add__close', type: 'button', 'aria-label': t('plantuml', 'Close') })
  closeButton.innerHTML = closeIcon
  const search = crelt('input', { class: 'plantuml-add__search', type: 'search', placeholder: t('plantuml', 'Search'), 'aria-label': t('plantuml', 'Search') })
  const typeList = crelt('div', { class: 'plantuml-add__types', role: 'listbox', 'aria-label': t('plantuml', 'Types') })
  const templateList = crelt('div', { class: 'plantuml-add__templates', role: 'listbox', 'aria-label': t('plantuml', 'Templates') })
  const right = crelt('div', { class: 'plantuml-add__right' }, templateList)
  const dialog = crelt('div', { class: 'plantuml-add__dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title.id, tabindex: '-1' },
    crelt('header', { class: 'plantuml-add__header' }, title, closeButton),
    crelt('div', { class: 'plantuml-add__body' },
      crelt('div', { class: 'plantuml-add__left' }, search, typeList),
      crelt('div', { class: 'plantuml-add__divider', 'aria-hidden': 'true' }),
      right))
  const preview = crelt('pre', { class: 'plantuml-add__preview', hidden: '' })
  const mask = crelt('div', { class: 'plantuml-add', tabindex: '-1' }, dialog, preview)

  function renderTypes() {
    const types = matching(all, search.value)
    if (!types.includes(selected)) {
      selected = types[0] ?? null
    }
    typeList.replaceChildren(...types.map((type) => {
      const { name, icon } = BY_TYPE.get(type)
      const row = crelt('button', { class: 'plantuml-add__type', type: 'button', role: 'option', 'data-type': type, 'aria-selected': String(type === selected), tabindex: type === selected ? '0' : '-1' })
      row.innerHTML = iconSvg(icon, 24)
      row.append(crelt('span', { class: 'plantuml-add__type-name' }, name), crelt('span', { class: 'plantuml-add__count' }, String(all.get(type).length)))
      row.addEventListener('click', () => select(type))
      return row
    }))
    renderTemplates()
  }

  function renderTemplates() {
    hidePreview()
    templateList.replaceChildren(...(selected ? all.get(selected) : []).map((template, i) => {
      const tile = crelt('span', { class: 'plantuml-add__tile', 'aria-hidden': 'true' })
      tile.innerHTML = iconSvg(template.icon, 24)
      const row = crelt('button', { class: 'plantuml-add__template', type: 'button', role: 'option', tabindex: i === 0 ? '0' : '-1' },
        tile,
        crelt('span', { class: 'plantuml-add__text' },
          crelt('span', { class: 'plantuml-add__template-title' }, template.title),
          crelt('span', { class: 'plantuml-add__description' }, template.description)))
      row.addEventListener('click', () => pick(template))
      row.addEventListener('pointerenter', () => {
        clearTimeout(timer)
        timer = setTimeout(() => showPreview(row, template), DOC_HOVER.hoverTime)
      })
      row.addEventListener('pointerleave', () => {
        clearTimeout(timer)
        if (document.activeElement !== row) {
          hidePreview()
        }
      })
      // A mousedown focuses a row too: Tab comes back to it either way.
      row.addEventListener('focus', () => {
        rove(templateList, row)
        showPreview(row, template)
      })
      row.addEventListener('blur', hidePreview)
      return row
    }))
  }

  function select(type) {
    selected = type
    renderTypes()
    typeList.querySelector('[aria-selected="true"]')?.focus()
  }

  /** The row the Tab stop of its list is (roving tabindex). */
  function rove(list, row) {
    for (const each of list.children) each.tabIndex = each === row ? 0 : -1
  }

  function showPreview(row, template) {
    preview.textContent = template.text
    preview.hidden = false
    shown = row
    place()
  }

  /**
   * 16 px right of the dialog, level with its row, kept on screen and within the dialog's height;
   * gone with a row scrolled out of view. A card that must lie over the dialog keeps to the
   * templates' pane, so it never covers the types (stacked above the templates on a phone).
   */
  function place() {
    if (!shown) {
      return
    }
    const box = dialog.getBoundingClientRect()
    const row = shown.getBoundingClientRect()
    const view = right.getBoundingClientRect()
    if (row.bottom < view.top || row.top > view.bottom) {
      hidePreview()
      return
    }
    const room = window.innerWidth - box.right - 16 - 8
    const top = room >= 220 ? box.top : view.top
    preview.style.maxHeight = `${box.bottom - top}px`
    preview.style.maxWidth = room >= 220 ? `${Math.min(room, 360)}px` : ''
    preview.style.left = `${Math.max(0, Math.min(box.right + 16, window.innerWidth - preview.offsetWidth - 8))}px`
    preview.style.top = `${Math.max(top, Math.min(row.top, box.bottom - preview.offsetHeight))}px`
  }

  function hidePreview() {
    clearTimeout(timer)
    preview.hidden = true
    shown = null
  }

  function pick(template) {
    close(true)
    onPick(template)
  }

  /** Round the four stops: close, search, the selected type, the template last reached (F21: the close button is one). */
  function trap(event) {
    const stops = [closeButton, search, typeList.querySelector('[tabindex="0"]'), templateList.querySelector('[tabindex="0"]')].filter(Boolean)
    const i = stops.indexOf(document.activeElement)
    const next = event.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length
    stops[next].focus()
  }

  function move(list, by) {
    const rows = [...list.children]
    const next = rows[by(rows.indexOf(document.activeElement), rows.length)]
    if (list === typeList) {
      select(next.dataset.type)
      return
    }
    next.focus()
  }

  function onKey(event) {
    const list = typeList.contains(event.target) ? typeList : templateList.contains(event.target) ? templateList : null
    const by = event.altKey || event.ctrlKey || event.metaKey ? undefined : KEYS[event.key]
    if (event.key === 'Escape') {
      close(true)
    } else if (event.key === 'Tab') {
      trap(event)
    } else if (list && by) {
      move(list, by)
    } else if (list === templateList && event.key === 'Enter') {
      event.target.click()
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  /** The route's templates join: the selection, the search and the focused row stay. */
  function update(next) {
    const row = [...templateList.children].indexOf(document.activeElement)
    const onType = typeList.contains(document.activeElement)
    all = next
    renderTypes()
    if (row >= 0) {
      const again = templateList.children[Math.min(row, templateList.children.length - 1)]
      again?.focus()
    } else if (onType) {
      typeList.querySelector('[aria-selected="true"]')?.focus()
    }
  }

  function close(refocus) {
    if (!open) {
      return
    }
    open = false
    hidePreview()
    right.removeEventListener('scroll', place)
    window.removeEventListener('resize', place)
    mask.remove()
    if (refocus) {
      opener?.focus?.()
    }
    onClose()
  }

  search.addEventListener('input', renderTypes)
  closeButton.addEventListener('click', () => close(true))
  mask.addEventListener('mousedown', (event) => { downOnMask = event.target === mask })
  mask.addEventListener('click', (event) => {
    if (downOnMask && event.target === mask) {
      close(true)
    }
    downOnMask = false
  })
  mask.addEventListener('keydown', onKey)
  // The card follows its row as the list scrolls and the dialog as the window resizes.
  right.addEventListener('scroll', place)
  window.addEventListener('resize', place)
  container.append(mask)
  renderTypes()
  search.focus()
  return { update, close: () => close(false) }
}
