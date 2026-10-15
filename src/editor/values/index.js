/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where values sit and what they are (W3): one registry that completion, the
 * chooser (W1) and the stepper (W2) all read, so a list added once shows in
 * all of them. Each entry reads one line; the core ones are here, a profile's
 * come through `valuesFacet` as plain objects, so it imports nothing of this.
 *
 * @typedef {object} Value
 * @property {number} from
 * @property {number} to
 * @property {'list'|'number'} kind
 * @property {() => string[] | Promise<string[]>} [options] a list's values
 * @property {number} [min] the least a number steps to
 * @property {string} [close] what a pick adds after the label, a tag's `>` still to come
 * @property {boolean} [colours] the list is the server's named colours, each shown with its swatch (W5)
 *
 * @typedef {object} ValueEntry
 * @property {(lineText: string, state: import('@codemirror/state').EditorState, lineFrom: number) => Value[]} match
 *   the values on a line, at document positions
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { Facet, StateEffect } from '@codemirror/state'
import { themeValue } from '../completion/themes.js'
import { serverColors, serverColorsNow, serverList, serverListNow } from '../completion/server-list.js'
import { inStyleBody } from '../plantuml-mode.js'

/** The loaded profiles' entries, read beside `coreValues`. */
export const valuesFacet = Facet.define({ combine: (values) => values.flat() })

const NUMBER = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g

/** Every number in `text`, from column `offset` on, as values at `lineFrom`. */
function numbers(text, offset, lineFrom, min) {
  return [...text.slice(offset).matchAll(NUMBER)].map((found) => {
    const from = lineFrom + offset + found.index
    return { from, to: from + found[0].length, kind: 'number', min }
  })
}

// None of these is ever below 0: a skinparam's sizes, thicknesses and
// paddings, a scale, a Creole font size.
const SKINPARAM = /^(\s*skinparam\s+[\w.<>:]+\s+)-?\d+(?:\.\d+)?\s*$/
// The block form, `skinparam class {` … `}`, one `Name value` a line.
const SKINPARAM_OPEN = /^\s*skinparam(?:\s+[\w.<>:]+)?\s*\{\s*$/
const SKINPARAM_LINE = /^(\s*[\w.<>:]+\s+)-?\d+(?:\.\d+)?\s*$/
const BLOCK_END = /^\s*(?:\}|@end|@start)/
const SCALE = /^\s*scale\s/
const SIZE = /<size:(\d+(?:\.\d+)?)>/gi

/** Whether line `number` is inside a `skinparam … {` block: its opening line comes first going up. */
export function inSkinparamBlock(state, number) {
  for (let at = number - 1; at >= 1; at--) {
    const text = state.doc.line(at).text
    if (SKINPARAM_OPEN.test(text)) return true
    if (BLOCK_END.test(text)) return false
  }
  return false
}

const skinparamValue = {
  match(lineText, state, lineFrom) {
    const one = SKINPARAM.exec(lineText)
    if (one) {
      return numbers(lineText, one[1].length, lineFrom, 0)
    }
    const inner = SKINPARAM_LINE.exec(lineText)
    return inner && inSkinparamBlock(state, state.doc.lineAt(lineFrom).number) ? numbers(lineText, inner[1].length, lineFrom, 0) : []
  },
}

const scaleValue = {
  match(lineText, state, lineFrom) {
    return SCALE.test(lineText) ? numbers(lineText, 0, lineFrom, 0) : []
  },
}

const sizeValue = {
  match(lineText, state, lineFrom) {
    return [...lineText.matchAll(SIZE)].map((found) => {
      const from = lineFrom + found.index + '<size:'.length
      return { from, to: from + found[1].length, kind: 'number', min: 0 }
    })
  },
}

const VALIGNS = ['top', 'middle', 'bottom']
const TAG_NUMBER = '["\']?(-?\\d+(?:\\.\\d+)?)'

/**
 * A Creole tag's attribute: every `attr` (its last group the value) inside a
 * `tag`, as a value over that group at document positions, with `make()`'s
 * kind and options. `tag` is the tag's opening through its `>` or `}`.
 */
function attributes(lineText, lineFrom, tag, attr, make) {
  return [...lineText.matchAll(tag)].flatMap((tagFound) => [...tagFound[0].matchAll(attr)].map((found) => {
    const from = lineFrom + tagFound.index + found.index + found[0].length - found[1].length
    return { from, to: from + found[1].length, ...make() }
  }))
}

const IMG = /<img\b[^>]*>?/gi
const FONT = /<font\b[^>]*>?/gi
// The `{…}` that follows an icon, an emoji, a sprite, an image or a QR code, not any brace.
const BRACES = /<(?:&[\w-]+|:[^:>]*:|\$[\w-]+|(?:img|qrcode):[^>]*)>?\{[^}]*\}?/gi

const valignValue = {
  match: (lineText, state, lineFrom) => attributes(lineText, lineFrom, IMG, /\bvalign=["']?(\w*)/gi, () => ({ kind: 'list', options: () => VALIGNS })),
}

// `size=` is a font's, `vspace=` an image's; neither is ever below 0.
const tagNumberValue = {
  match: (lineText, state, lineFrom) => [
    ...attributes(lineText, lineFrom, FONT, new RegExp(`\\bsize=${TAG_NUMBER}`, 'gi'), () => ({ kind: 'number', min: 0 })),
    ...attributes(lineText, lineFrom, IMG, new RegExp(`\\bvspace=${TAG_NUMBER}`, 'gi'), () => ({ kind: 'number', min: 0 })),
    ...attributes(lineText, lineFrom, BRACES, new RegExp(`\\bscale=${TAG_NUMBER}`, 'gi'), () => ({ kind: 'number', min: 0 })),
  ],
}

const spaceValue = {
  match: (lineText, state, lineFrom) => attributes(lineText, lineFrom, /<space:[^>]*>?/gi, /<space:(\d+(?:\.\d+)?)/gi, () => ({ kind: 'number', min: 0 })),
}

// The family may hold spaces (`DejaVu Sans`), so it runs to the `>`. While the
// tag is unclosed (`<font:Dej`) the value is what is typed so far: from the
// colon to the cursor when the cursor is at its end, to the end of the word the
// cursor is in, at the cursor when it sits before a word; with the cursor
// elsewhere, the first word. So a pick keeps the text after it. An unclosed value carries `close: '>'`, which a
// pick adds. None once the server is known to list no fonts, so the chooser
// draws no pencil for nothing.
const FONT_FAMILY = /<font:([^<>]*)(>?)/gi

const fontFamilyValue = {
  match(lineText, state, lineFrom) {
    if (serverListNow('fonts')?.length === 0) {
      return []
    }
    const head = state.selection.main.head - lineFrom
    return [...lineText.matchAll(FONT_FAMILY)].map((found) => {
      const from = found.index + '<font:'.length
      let to = from + found[1].length
      const value = { kind: 'list', options: () => serverList('fonts') }
      if (!found[2]) {
        if (head >= from && head <= to) {
          const before = lineText[head - 1]
          const inWord = head > from && before !== undefined && !/\s/.test(before)
          to = inWord ? head + /^\S*/.exec(lineText.slice(head, to))[0].length : head
        } else {
          to = from + /^\S*/.exec(found[1])[0].length
        }
        value.close = '>'
      }
      return { ...value, from: lineFrom + from, to: lineFrom + to }
    })
  },
}

// A colour is the mode's `ColorLiteral` (so the swatch's, C6): a hex or a name, each part of a
// gradient its own. The `#` stays outside the range where the place needs it (`#gold` after an
// element); where the name is written bare (a style block, after `color=`) it is inside, so a
// pick replaces it. None once the server is known to name no colours.
const BARE_AFTER = /\bcolor\s*=\s*["']?$/i

/** Sent when the server's colours have arrived, so the chooser's pencils are drawn (or not). */
export const coloursKnown = StateEffect.define()

/** The server's colours being asked for because a colour was found, or null. */
let asking = null

/** @return {Promise<unknown>|null} what a chooser waits on to draw a colour's pencil */
export const coloursPending = () => asking

const colourValue = {
  match(lineText, state, lineFrom) {
    // No pencil until the server has named some colours; asking is once (cached).
    const known = serverColorsNow()
    if (known && Object.keys(known).length === 0) {
      return []
    }
    const line = state.doc.lineAt(lineFrom)
    // A multi-line block's answer is one for the whole line; a one-line block's depends on the column.
    const oneLine = /<style>.*<\/style>/.test(line.text)
    let whole
    const inStyle = (pos) => (oneLine ? inStyleBody(state, pos) : (whole ??= inStyleBody(state, line.from)))
    const tree = ensureSyntaxTree(state, line.to, 25) ?? syntaxTree(state)
    const found = []
    tree.iterate({
      from: line.from,
      to: line.to,
      enter(node) {
        if (node.name !== 'ColorLiteral' || node.from < line.from || node.to > line.to) return
        if (!known) {
          asking ??= serverColors().then(() => { asking = null })
          return
        }
        const hash = state.sliceDoc(node.from, node.from + 1) === '#'
        const bare = inStyle(node.from) || BARE_AFTER.test(state.sliceDoc(line.from, node.from))
        found.push({
          from: hash && !bare ? node.from + 1 : node.from,
          to: node.to,
          kind: 'list',
          colours: true,
          options: async () => Object.keys(await serverColors()),
        })
      },
    })
    return found
  },
}

/** @type {ValueEntry[]} */
export const coreValues = [themeValue, skinparamValue, scaleValue, sizeValue, valignValue, tagNumberValue, spaceValue, fontFamilyValue, colourValue]

/**
 * The values on line `number`, in the order they sit.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} number 1-based
 * @return {Value[]}
 */
export function valuesOn(state, number) {
  const line = state.doc.line(number)
  return [...coreValues, ...state.facet(valuesFacet)]
    .flatMap((entry) => entry.match(line.text, state, line.from))
    .sort((a, b) => a.from - b.from)
}

/**
 * The value at `pos`, its ends included, or null.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @return {Value|null}
 */
export function valueAt(state, pos) {
  return valuesOn(state, state.doc.lineAt(pos).number).find((value) => value.from <= pos && pos <= value.to) ?? null
}

/**
 * `text` stepped `by` units of its last decimal place, never below `min`
 * from at or above it; one already below steps as any other.
 *
 * @param {string} text a number, as written
 * @param {number} by
 * @param {number} [min]
 * @return {string}
 */
export function stepNumber(text, by, min) {
  const places = text.split('.')[1]?.length ?? 0
  const scale = 10 ** places
  let next = (Math.round(Number(text) * scale) + by) / scale
  if (min !== undefined && next < min && Number(text) >= min) {
    next = min
  }
  return next.toFixed(places)
}
