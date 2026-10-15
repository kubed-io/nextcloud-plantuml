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
const SCALE = /^\s*scale\s/
const SIZE = /<size:(\d+(?:\.\d+)?)>/gi

const skinparamValue = {
  match(lineText, state, lineFrom) {
    const found = SKINPARAM.exec(lineText)
    return found ? numbers(lineText, found[1].length, lineFrom, 0) : []
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

/** @type {ValueEntry[]} */
export const coreValues = [themeValue, skinparamValue, scaleValue, sizeValue]

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
 * `text` stepped `by` units of its last decimal place, never below `min`.
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
  if (min !== undefined && next < min) {
    next = min
  }
  return next.toFixed(places)
}
