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
 *
 * @typedef {object} ValueEntry
 * @property {(lineText: string, state: import('@codemirror/state').EditorState, lineFrom: number) => Value[]} match
 *   the values on a line, at document positions
 */
import { Facet } from '@codemirror/state'
import { themeValue } from '../completion/themes.js'
import { serverList, serverListNow } from '../completion/server-list.js'

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

// The family may hold spaces (`DejaVu Sans`), so it runs to the `>`; while the
// tag is unclosed (`<font:Dej`) it reads to the line's end. None once the
// server is known to list no fonts, so the chooser draws no pencil for nothing.
const fontFamilyValue = {
  match: (lineText, state, lineFrom) => (serverListNow('fonts')?.length === 0
    ? []
    : attributes(lineText, lineFrom, /<font:[^>]*/gi, /<font:([^>]*)/gi, () => ({ kind: 'list', options: () => serverList('fonts') }))),
}

/** @type {ValueEntry[]} */
export const coreValues = [themeValue, skinparamValue, scaleValue, sizeValue, valignValue, tagNumberValue, spaceValue, fontFamilyValue]

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
