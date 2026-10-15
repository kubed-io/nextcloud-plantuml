/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The chooser (W1) after each value with a list and the stepper (W2) after
 * each number, on the main cursor's line only, redrawn as it moves. Neither
 * takes the focus: a press keeps it, and the selection, in the editor. Each
 * finds its value from where it sits, so a widget kept across an edit still
 * acts on the value beside it.
 */
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { startCompletion } from '@codemirror/autocomplete'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { stepNumber, valueAt, valuesFacet, valuesOn } from './index.js'
import pencilIcon from '../../../img/icons/pencil.svg?raw'

const REPEAT_AFTER_MS = 400
const REPEAT_EVERY_MS = 80

function button(className, label) {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = className
  node.setAttribute('tabindex', '-1')
  node.setAttribute('aria-label', label)
  node.addEventListener('mousedown', (event) => event.preventDefault())
  return node
}

/** Selects the value and opens its list, which a pick then replaces it from. */
function choose(view, pos) {
  const value = valueAt(view.state, pos)
  if (value?.kind !== 'list') {
    return
  }
  view.focus()
  view.dispatch({ selection: { anchor: value.from, head: value.to } })
  startCompletion(view)
}

/**
 * Steps the number at `pos` once, then again at REPEAT_AFTER_MS and every
 * REPEAT_EVERY_MS after, until the button is let go. Each step is an ordinary
 * edit; history joins a burst of them into one undo step. A cursor after the
 * number stays after it. The view going stops it too.
 */
function hold(view, pos, by) {
  const from = valueAt(view.state, pos)?.from
  const holds = view.plugin(valueWidgets)?.holds
  if (from === undefined || !holds) {
    return
  }
  const step = () => {
    const value = valueAt(view.state, from)
    if (value?.kind !== 'number' || value.from !== from) {
      stop()
      return
    }
    const text = view.state.sliceDoc(from, value.to)
    const next = stepNumber(text, by, value.min)
    if (next === text) {
      return
    }
    const { head, empty } = view.state.selection.main
    const end = from + next.length
    view.dispatch({
      changes: { from, to: value.to, insert: next },
      selection: empty && head >= from && head <= value.to ? { anchor: head === value.to ? end : Math.min(head, end) } : undefined,
    })
  }
  let repeat = null
  const delay = setTimeout(() => {
    step()
    repeat = setInterval(step, REPEAT_EVERY_MS)
  }, REPEAT_AFTER_MS)
  const stop = () => {
    clearTimeout(delay)
    clearInterval(repeat)
    document.removeEventListener('mouseup', stop)
    window.removeEventListener('blur', stop)
    holds.delete(stop)
  }
  holds.add(stop)
  document.addEventListener('mouseup', stop)
  window.addEventListener('blur', stop)
  step()
}

class Chooser extends WidgetType {
  eq() {
    return true
  }

  toDOM(view) {
    const label = t(APP_ID, 'Choose a value')
    const node = button('cm-plantuml-chooser', label)
    node.title = label
    node.innerHTML = pencilIcon
    node.addEventListener('click', () => choose(view, view.posAtDOM(node)))
    return node
  }
}

class Stepper extends WidgetType {
  eq() {
    return true
  }

  toDOM(view) {
    const node = document.createElement('span')
    node.className = 'cm-plantuml-stepper'
    for (const [label, text, sign] of [[t(APP_ID, 'Increase'), '▲', 1], [t(APP_ID, 'Decrease'), '▼', -1]]) {
      const half = button('', label)
      half.textContent = text
      half.addEventListener('mousedown', (event) => {
        if (event.button === 0) {
          hold(view, view.posAtDOM(node), sign * (event.shiftKey ? 10 : 1))
        }
      })
      node.append(half)
    }
    return node
  }
}

const chooser = Decoration.widget({ widget: new Chooser(), side: 1 })
const stepper = Decoration.widget({ widget: new Stepper(), side: 1 })

function widgets(state) {
  const line = state.doc.lineAt(state.selection.main.head).number
  return Decoration.set(valuesOn(state, line)
    .filter((value) => value.from < value.to)
    .map((value) => (value.kind === 'list' ? chooser : stepper).range(value.to)), true)
}

export const valueWidgets = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = widgets(view.state)
    this.holds = new Set() // a held stepper's stop, run when the view goes
  }

  destroy() {
    for (const stop of this.holds) stop()
  }

  update(update) {
    if (update.docChanged || update.selectionSet || update.startState.facet(valuesFacet) !== update.state.facet(valuesFacet)) {
      this.decorations = widgets(update.state)
    }
  }
}, { decorations: (plugin) => plugin.decorations })
