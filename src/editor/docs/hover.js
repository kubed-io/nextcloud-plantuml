/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The doc card on hover (I2), pinned in place (I3). Resting the pointer on a
 * known element for 500 ms shows its card below the word, with the word's lint
 * messages drawn above the card in the same tooltip: lint's own hover, which
 * waits 300 ms and opens above, leaves a carded word to this one, so the box
 * never jumps. A click in the card pins it through `activateHover`; the source
 * hands back the same memoised tooltip, so CodeMirror keeps its DOM and the
 * box neither moves nor changes size. Pinned, the pointer no longer closes it:
 * Escape, the ×, a click outside it, a moved caret or an edit does.
 */
import { Prec, StateEffect, StateField } from '@codemirror/state'
import { ViewPlugin, activateHover, closeHoverTooltips, hoverTooltip, keymap } from '@codemirror/view'
import { ensureSyntaxTree } from '@codemirror/language'
import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint'
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

/** Whether `a`…`b` and `from`…`to` share a character, or the empty one lies in the other. */
const overlap = (a, b, from, to) => (a === b ? from <= a && a <= to : a < to && b > from)

/** Per state: the carded elements a range holds. */
const carded = new WeakMap()

/**
 * The carded elements in `from`…`to`, each once, in order. Each token and
 * each word in the range is asked once.
 *
 * @param {import('@codemirror/state').EditorState} state
 */
function cardedIn(state, from, to) {
  if (!docs) {
    return []
  }
  const known = carded.get(state) ?? new Map()
  carded.set(state, known)
  const id = `${from}:${to}`
  if (!known.has(id)) {
    const starts = new Set([from])
    ensureSyntaxTree(state, to, 50)?.iterate({ from, to, enter: (node) => { starts.add(Math.max(node.from, from)) } })
    for (const word of state.sliceDoc(from, to).matchAll(/\S+/g)) {
      starts.add(from + word.index)
    }
    const found = new Map()
    for (const pos of starts) {
      for (const side of [1, -1]) {
        const element = elementAt(state, pos, side)
        if (element && overlap(from, to, element.from, element.to) && docs.get(element.key, element.type)) {
          found.set(`${element.from}:${element.to}`, element)
        }
      }
    }
    known.set(id, [...found.values()].sort((a, b) => a.from - b.from))
  }
  return known.get(id)
}

/**
 * Whether a carded element lies in `from`…`to`, the range of a lint message
 * this hover draws instead of lint's own.
 *
 * @param {import('@codemirror/state').EditorState} state
 */
export function onCard(state, from, to) {
  return cardedIn(state, from, to).length > 0
}

/** The lint messages in `from`…`to`, each with its range now. */
function diagnosticsIn(state, from, to, keep = () => true) {
  const found = []
  forEachDiagnostic(state, (diagnostic, start, end) => {
    if (overlap(start, end, from, to) && keep(start, end)) {
      found.push({ diagnostic, from: start, to: end })
    }
  })
  return found
}

/** The element `tag` with `className` and, if given, `text`. */
function el(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

/** Lint messages as `@codemirror/lint` draws them in its tooltip, each action applied where its message is now. */
function lintSection(view, found) {
  const list = el('ul', 'cm-tooltip-lint')
  for (const { diagnostic } of found) {
    const item = el('li', `cm-diagnostic cm-diagnostic-${diagnostic.severity}`)
    const text = el('span', 'cm-diagnosticText')
    text.append(diagnostic.renderMessage ? diagnostic.renderMessage(view) : diagnostic.message)
    item.append(text)
    for (const action of diagnostic.actions ?? []) {
      const button = el('button', `cm-diagnosticAction${action.markClass ? ` ${action.markClass}` : ''}`, action.name)
      button.type = 'button'
      button.setAttribute('aria-label', ` Action: ${action.name}.`)
      let fired = false
      const run = (event) => {
        event.preventDefault()
        if (fired) {
          return
        }
        fired = true
        const now = diagnosticsIn(view.state, 0, view.state.doc.length).find((one) => one.diagnostic === diagnostic)
        if (now) {
          action.apply(view, now.from, now.to)
        }
      }
      button.addEventListener('mousedown', run)
      button.addEventListener('click', run)
      item.append(button)
    }
    if (diagnostic.source) {
      item.append(el('div', 'cm-diagnosticSource', diagnostic.source))
    }
    list.append(item)
  }
  return list
}

/**
 * Lint's messages at `pos` that lint's own hover leaves to this one, alone:
 * a message on a carded word, where the pointer is off the word. The tooltip
 * spans the messages' range up to the nearest carded word on each side, so it
 * stays while the pointer crosses the words between, and the pointer moving
 * onto a carded word leaves it and that word's card comes up.
 */
function lintAlone(view, pos, side) {
  const found = diagnosticsIn(view.state, pos, pos, (from, to) => (from === to || (side < 0 ? pos > from : pos < to)) && onCard(view.state, from, to))
  if (!found.length) {
    return null
  }
  let from = Math.min(...found.map((one) => one.from))
  let to = Math.max(...found.map((one) => one.to))
  for (const element of cardedIn(view.state, from, to)) {
    if (element.to <= pos) {
      from = Math.max(from, element.to)
    } else if (element.from >= pos) {
      to = Math.min(to, element.from)
    }
  }
  return {
    pos: from,
    end: to,
    above: true,
    create: (view) => ({ dom: lintSection(view, found) }),
  }
}

/** The memoised card tooltip for the element at `pos`, or null. */
function cardAt(view, pos, side) {
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
  // A click pins where the hover was asked for.
  memo.at = { pos, side }
  return memo.tooltip
}

/**
 * The card for the element at `pos`, its lint messages above it, or a carded
 * word's messages alone beside the word; null for anything else, while a card
 * is pinned, and until the index has arrived. The same element gives the same
 * tooltip object.
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
  return cardAt(view, pos, side) ?? lintAlone(view, pos, side)
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
 * Pins the card of the element at `pos`, with its lint messages, and gives it
 * focus unless `focus` is false. False when there is no card to pin, or one
 * is pinned already.
 *
 * @param {import('@codemirror/view').EditorView} view
 * @param {number} pos
 * @param {{ side?: -1|1, focus?: boolean }} [options]
 */
export function pinDocAt(view, pos, { side = 1, focus = true } = {}) {
  if (!docs || view.state.field(docPinned, false) || !cardAt(view, pos, side)) {
    return false
  }
  activateHover(view, pos, side, { tooltip: docHover, until })
  view.dispatch({ effects: pin.of({ pos }) })
  if (focus) {
    cards.get(view)?.focus({ preventScroll: true })
  }
  return true
}

/** Closes the card, pinned or not, and whatever shares its box; focus goes back to the source. */
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
 * The hover's view of a card: the element's lint messages, then the card. The
 * box is the hover host every source shares; pinned, it is a dialog named
 * after the element, and the card, which scrolls, takes focus.
 */
function cardView(view, entry, memo) {
  const card = renderDoc(entry)
  const dom = el('div', 'cm-doc-box')
  const { from, to } = memo.element
  let lint = null
  const drawLint = (state) => {
    const found = diagnosticsIn(state, from, to)
    const next = found.length ? lintSection(view, found) : null
    if (lint) {
      lint.replaceWith(...(next ? [next] : []))
    } else if (next) {
      dom.prepend(next)
    }
    lint = next
  }
  dom.append(card.dom)
  drawLint(view.state)
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
      card.dom.tabIndex = -1
      dom.ownerDocument.addEventListener('mousedown', outside, true)
    } else {
      box.removeAttribute('aria-label')
      card.dom.removeAttribute('tabindex')
      dom.ownerDocument.removeEventListener('mousedown', outside, true)
    }
  }
  // Keys in the box (the card, a lint action) never reach CodeMirror's keymaps,
  // and the editor closes on an Escape nothing used.
  const escape = (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      closeDoc(view)
    }
  }

  // Whether focus is in the box, which `destroy` cannot ask: the DOM, and focus with it, is gone
  // by then. Focus moved to another element leaves it; a removal, which moves it nowhere, does not.
  let focused = false
  dom.addEventListener('focusin', () => {
    focused = true
  })
  dom.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !dom.contains(event.relatedTarget)) {
      focused = false
    }
  })

  dom.addEventListener('click', (event) => {
    if (event.target.closest('.cm-doc-close')) {
      closeDoc(view)
    } else if (!event.target.closest('a, button') && !pinned) {
      pinDocAt(view, memo.at.pos, { side: memo.at.side })
    }
  })

  return {
    dom,
    mount() {
      box = dom.closest('.cm-tooltip-hover') ?? dom
      box.setAttribute('role', 'tooltip')
      box.addEventListener('keydown', escape)
      cards.set(view, card.dom)
      show(!!view.state.field(docPinned, false))
    },
    update(update) {
      if (update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setDiagnosticsEffect)))) {
        drawLint(update.state)
      }
      if (box) {
        show(!!update.state.field(docPinned, false))
      }
    },
    destroy() {
      if (box) {
        show(false)
        box.removeAttribute('role')
        box.removeEventListener('keydown', escape)
      }
      if (cards.get(view) === card.dom) {
        cards.delete(view)
      }
      card.destroy()
      // A box that held focus and went otherwise than by closeDoc (an action's edit, a reload)
      // leaves it on the page, where the next Escape would close the editor: it goes back to
      // the source, after the update, unless it has gone somewhere or the view with it.
      if (focused) {
        queueMicrotask(() => {
          const active = dom.ownerDocument.activeElement
          if (view.dom.isConnected && (!active || active === dom.ownerDocument.body)) {
            view.focus()
          }
        })
      }
    },
  }
}

/**
 * The hover, the pin and the keys. Escape is Prec.highest, after
 * completionKeymap's (plantumlCompletion comes first), so an open list closes
 * first and a pinned card before a snippet's fields.
 */
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
  Prec.highest(keymap.of([{ key: 'Escape', run: closeDoc }])),
  keymap.of([{ key: 'Mod-k Mod-i', run: docAtCaret }]),
]
