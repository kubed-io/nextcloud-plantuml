/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A swatch before each ColorLiteral, a colour picker in it (C6, X14, X15): a
 * hex as it is written, a name as the configured server draws it (GET
 * /apps/plantuml/colors, asked the first time a name is shown); a name it
 * does not draw gets none. A pick writes `#rrggbb`, or `rrggbb` for a
 * gradient's second part, which PlantUML reads only without its `#`.
 *
 * The swatch and its look are @uiw/codemirror-extensions-color's, whose own
 * view reads every ColorLiteral as hex, a name included, and takes no other
 * reading: this view replaces it, and keeps its theme.
 */
import { syntaxTree } from '@codemirror/language'
import { StateEffect } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { colorTheme } from '@uiw/codemirror-extensions-color'
import { serverColors } from './completion/server-list.js'

const HEX = /^#?([\dA-Fa-f]{8}|[\dA-Fa-f]{6}|[\dA-Fa-f]{3,4})$/

/** The server's colours by lower-case name, once it has answered; PlantUML reads names in any case. */
let names = null
const namesArrived = StateEffect.define()

/** Where each picker's colour sits, as the library keeps it. */
const placed = new WeakMap()

/**
 * `text`'s colour as `#rrggbb`, or null: a hex after `#` as itself, a word as
 * the name it is, else as a hex written without its `#`.
 *
 * @param {string} text
 * @param {Map<string, string|null>|null} known
 */
export function colourOf(text, known) {
  const hex = HEX.exec(text)
  const name = known?.get(text.replace(/^#/, '').toLowerCase())
  if (hex && (text.startsWith('#') || !name)) {
    const digits = hex[1].length < 6 ? [...hex[1].slice(0, 3)].map((digit) => digit + digit).join('') : hex[1].slice(0, 6)
    return `#${digits.toLowerCase()}`
  }
  return name ? name.toLowerCase() : null
}

class Swatch extends WidgetType {
  constructor(color, raw, from, to) {
    super()
    this.color = color
    this.raw = raw
    this.from = from
    this.to = to
  }

  eq(other) {
    return other.color === this.color && other.raw === this.raw && other.from === this.from && other.to === this.to
  }

  toDOM() {
    const picker = document.createElement('input')
    placed.set(picker, { from: this.from, to: this.to })
    picker.type = 'color'
    picker.value = this.color
    picker.dataset.color = this.color
    picker.dataset.colorraw = this.raw
    const wrapper = document.createElement('span')
    wrapper.appendChild(picker)
    wrapper.dataset.color = this.color
    // A hex keeps its alpha in the swatch, as the library shows it.
    wrapper.style.backgroundColor = this.raw.startsWith('#') && HEX.test(this.raw) ? this.raw : this.color
    return wrapper
  }

  ignoreEvent() {
    return false
  }
}

/** The swatches in view, and whether a name is waiting for the server's colours. */
function swatches(view) {
  const widgets = []
  let waiting = false
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'ColorLiteral') return
        const raw = view.state.doc.sliceString(node.from, node.to)
        const color = colourOf(raw, names)
        if (color) {
          widgets.push(Decoration.widget({ widget: new Swatch(color, raw, node.from, node.to), side: 0 }).range(node.from))
        } else if (!names) {
          waiting = true
        }
      },
    })
  }
  return { decorations: Decoration.set(widgets, true), waiting }
}

const swatchView = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view
    this.decorations = this.build(view)
  }

  build(view) {
    const { decorations, waiting } = swatches(view)
    if (waiting && !this.asked) {
      this.asked = true
      serverColors().then((colors) => {
        names ??= new Map(Object.entries(colors).map(([name, hex]) => [name.toLowerCase(), hex]))
        if (this.view) this.view.dispatch({ effects: namesArrived.of(null) })
      })
    }
    return decorations
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)
      || update.transactions.some((tr) => tr.effects.some((effect) => effect.is(namesArrived)))) {
      this.decorations = this.build(update.view)
    }
    const editable = update.state.facet(EditorView.editable) && !update.state.readOnly
    for (const picker of update.view.contentDOM.querySelectorAll('span[data-color] input[type=color]')) {
      picker.disabled = !editable
    }
  }

  destroy() {
    this.view = null
  }
}, {
  decorations: (plugin) => plugin.decorations,
  eventHandlers: {
    change(event, view) {
      const at = placed.get(event.target)
      if (!at) return false
      const raw = view.state.sliceDoc(at.from, at.to)
      const bare = !raw.startsWith('#') && /[/|\\-]/.test(view.state.sliceDoc(at.from - 1, at.from))
      const value = event.target.value
      view.dispatch({ changes: { from: at.from, to: at.to, insert: bare ? value.slice(1) : value } })
      return true
    },
  },
})

export const colorSwatches = [swatchView, colorTheme]
