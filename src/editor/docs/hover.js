/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The doc card on hover (I2), pinned in place (I3). Resting the pointer on a
 * known element for 500 ms shows its card below the word; a click in the card
 * pins it through `activateHover`, which locks every hover at that spot, so a
 * lint message sharing the box stays in it. The source hands back the same
 * memoised tooltip, so CodeMirror keeps the card's DOM and the box neither
 * moves nor changes size. Pinned, the pointer no longer closes it: Escape, the
 * ×, a click outside it, a moved caret or an edit does.
 */
import { StateEffect, StateField } from '@codemirror/state'
import { ViewPlugin, activateHover, closeHoverTooltips, hoverTooltip, keymap } from '@codemirror/view'
import { elementAt } from './element.js'
import { loadDocs } from './index.js'
import { renderDoc } from './card.js'

/** JetBrains' wait, longer than CodeMirror's 300 ms, so cards do not flash up while the pointer crosses the text. */
export const DOC_HOVER = { hoverTime: 500, hideOnChange: true }

/** The index once it has arrived; until then no card shows. */
let docs = null

/** Asks for the index; a failed load is asked for again by the next hover. */
function load() {
  loadDocs().then((index) => {
    docs = index
  }, () => {})
}

/** Per view: the last tooltip with its element and the spot it was asked for; the mounted card. */
const last = new WeakMap()
const cards = new WeakMap()

const pin = StateEffect.define()

/**
 * The card for the element at `pos`, or null: for a word with no entry, while
 * a card is pinned, and until the index has arrived. The same element gives
 * the same tooltip object.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @param {-1|1} side
 * @returns {import('@codemirror/view').Tooltip|null}
 */
export function docSource(view, pos, side) {
  if (!docs) {
    load()
    return null
  }
  if (view.state.field(docPinned, false)) {
    return null
  }
  const element = elementAt(view.state, pos, side)
  const entry = element && docs.get(element.key, element.type)
  if (!entry) {
    return null
  }
  let memo = last.get(view)
  if (!memo || ['key', 'type', 'from', 'to'].some((field) => memo.element[field] !== element[field])) {
    memo = { element }
    memo.tooltip = { pos: element.from, end: element.to, above: false, create: (view) => cardView(view, entry, memo) }
    last.set(view, memo)
  }
  // A click pins where the hover was asked for, so every hover there comes back as it was.
  memo.at = { pos, side }
  return memo.tooltip
}

/** The hover's own field, which holds its tooltips. */
const docHover = hoverTooltip(docSource, DOC_HOVER)

/** Where the pinned card was asked for, while one is; it goes with the card. */
export const docPinned = StateField.define({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(pin)) {
        value = effect.value
      }
    }
    return value && tr.state.field(docHover.active).length ? value : null
  },
})

/** A pinned hover goes as an unpinned card does: on an edit or a moved caret. */
const until = (tr) => tr.docChanged || !!tr.selection

/**
 * Pins the card of the element at `pos`, and every hover there with it, and
 * gives it focus unless `focus` is false. False when there is no card to pin,
 * or one is pinned already.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @param {{ side?: -1|1, focus?: boolean }} [options]
 */
export function pinDocAt(view, pos, { side = 1, focus = true } = {}) {
  if (!docSource(view, pos, side)) {
    return false
  }
  activateHover(view, pos, side, { until })
  view.dispatch({ effects: pin.of({ pos }) })
  if (focus) {
    cards.get(view)?.focus({ preventScroll: true })
  }
  return true
}

/** Closes the card, pinned or not, and what shares its box; focus goes back to the source. */
export function closeDoc(view) {
  if (!view.state.field(docPinned, false) && !view.state.field(docHover.active, false)?.length) {
    return false
  }
  view.dispatch({ effects: closeHoverTooltips })
  view.focus()
  return true
}

/** Ctrl/Cmd+K Ctrl/Cmd+I: the caret's card, pinned; again, focus into it. */
function docAtCaret(view) {
  const card = view.state.field(docPinned, false) && cards.get(view)
  if (card) {
    card.focus({ preventScroll: true })
    return true
  }
  const { head } = view.state.selection.main
  return pinDocAt(view, head, { focus: false }) || pinDocAt(view, head, { side: -1, focus: false })
}

/**
 * The hover's view of a card. The box is the hover host every source shares;
 * pinned, it is a dialog named after the element, and the card, which
 * scrolls, takes focus.
 */
function cardView(view, entry, memo) {
  const card = renderDoc(entry)
  const { dom } = card
  let box = null
  let pinned = false

  const outside = (event) => {
    if (!box.contains(event.target)) {
      view.dispatch({ effects: closeHoverTooltips })
    }
  }
  const show = (on) => {
    if (on === pinned) {
      return
    }
    pinned = on
    box.classList.toggle('cm-doc-pinned', on)
    box.setAttribute('role', on ? 'dialog' : 'tooltip')
    if (on) {
      box.setAttribute('aria-label', entry.name)
      dom.tabIndex = -1
      dom.ownerDocument.addEventListener('mousedown', outside, true)
    } else {
      box.removeAttribute('aria-label')
      dom.removeAttribute('tabindex')
      dom.ownerDocument.removeEventListener('mousedown', outside, true)
    }
  }

  dom.addEventListener('click', (event) => {
    if (event.target.closest('.cm-doc-close')) {
      closeDoc(view)
    } else if (!event.target.closest('a') && !pinned) {
      pinDocAt(view, memo.at.pos, { side: memo.at.side })
    }
  })
  // Keys in the card never reach CodeMirror's keymaps, and the editor closes on an Escape nothing used.
  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      closeDoc(view)
    }
  })

  return {
    dom,
    mount() {
      box = dom.closest('.cm-tooltip-hover') ?? dom
      box.setAttribute('role', 'tooltip')
      cards.set(view, dom)
      show(!!view.state.field(docPinned, false))
    },
    update(update) {
      if (box) {
        show(!!update.state.field(docPinned, false))
      }
    },
    destroy() {
      if (box) {
        show(false)
        box.removeAttribute('role')
      }
      if (cards.get(view) === dom) {
        cards.delete(view)
      }
      card.destroy()
    },
  }
}

/** The hover, the pin and the keys; Escape after completionKeymap's, which is Prec.highest. */
export const plantumlDocs = [
  // The docs chunk loads as the view opens, so the first hover finds it.
  ViewPlugin.define(() => {
    if (!docs) {
      load()
    }
    return {}
  }),
  docHover,
  docPinned,
  keymap.of([
    { key: 'Escape', run: closeDoc },
    { key: 'Mod-k Mod-i', run: docAtCaret },
  ]),
]
