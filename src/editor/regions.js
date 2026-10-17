/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Where a document's style blocks are, read once per version (F3): the core completion sources
 * ask `inStyleBody` to leave a block's body to the style profile, which is handed the same
 * regions as `core.styleBlocks`. A line starting `'` or `!` in a block is PlantUML's, never the
 * body (U5). A style file (R12) is one block, the whole document its body: `sheetRegions`.
 */
import { Facet } from '@codemirror/state'

// PlantUML's own style lines: a block opens on a line that is `<style>` and
// closes on one that is `</style>`, or at the next `@end`; a one-line block (its
// middle read as a block's body) and an imported sheet (`<style file=…>`) are a line each.
export const styleOpen = /^([ \t]*)(<style>)(\s*)$/
export const styleOneLine = /^([ \t]*)(<style>)(.*)<\/style>\s*$/
export const styleImport = /^([ \t]*)(<style)(\s+)([\w-]+)(\s*)(=)(\s*)([^>]*?)(\s*)(>)(\s*)$/
export const styleClose = /^([ \t]*)(<\/style>)(\s*)$/
const END = /^[ \t]*@end/
const OWN = /^[ \t]*['!]/

/**
 * @typedef {object} StyleLine a line of a block's body
 * @property {number} line its 1-based line number
 * @property {string} text what the mode reads: the line, cut before `</style>` on a one-line block
 * @property {number} from the column the body starts at
 *
 * @typedef {object} StyleBlock
 * @property {number} open the `<style>` line
 * @property {boolean} closed whether a `</style>` closes it
 * @property {StyleLine[]} body
 */

const read = new WeakMap() // Text → { blocks, body: 1 at each body line's number }

function regionsOf(doc) {
  if (!read.has(doc)) {
    const blocks = []
    const body = new Uint8Array(doc.lines + 1)
    let block = null
    let line = 0
    for (const text of doc.iterLines()) {
      line++
      if (block) {
        if (styleClose.test(text) || END.test(text)) {
          block.closed = styleClose.test(text)
          block = null
        } else if (!OWN.test(text)) {
          block.body.push({ line, text, from: 0 })
          body[line] = 1
        }
        continue
      }
      const one = styleOneLine.exec(text)
      if (one) {
        blocks.push({ open: line, closed: true, body: [{ line, text: one[1] + one[2] + one[3], from: one[1].length + one[2].length }] })
        body[line] = 1
      } else if (styleOpen.test(text)) {
        block = { open: line, closed: false, body: [] }
        blocks.push(block)
      }
    }
    read.set(doc, { blocks, body })
  }
  return read.get(doc)
}

/**
 * The style blocks of one version of a document. A `Text` never changes, so it is read once and
 * every reader of that version shares the array.
 *
 * @param {import('@codemirror/state').Text} doc
 * @returns {StyleBlock[]}
 */
export function styleRegions(doc) {
  return regionsOf(doc).blocks
}

/** A style file (R12): the whole document is one style body. */
export const styleSheet = Facet.define({ combine: (values) => values.some(Boolean) })

const sheets = new WeakMap() // Text → [StyleBlock]

/**
 * A style file's one block: every line but PlantUML's own `'` and `!` lines, read once per version.
 *
 * @param {import('@codemirror/state').Text} doc
 * @returns {StyleBlock[]}
 */
export function sheetRegions(doc) {
  if (!sheets.has(doc)) {
    const body = []
    let line = 0
    for (const text of doc.iterLines()) {
      line++
      if (!OWN.test(text)) body.push({ line, text, from: 0 })
    }
    sheets.set(doc, [{ open: 0, closed: true, body }])
  }
  return sheets.get(doc)
}

/**
 * Whether `pos` is in a style block's body: a line of one that is neither a tag line nor
 * PlantUML's `'` or `!` line, or the middle of a one-line block; in a style file, any line but
 * those. The core completion sources leave such a place to the style profile's.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 */
export function inStyleBody(state, pos) {
  if (state.facet(styleSheet)) return !OWN.test(state.doc.lineAt(pos).text)
  const line = state.doc.lineAt(pos)
  const one = styleOneLine.exec(line.text)
  if (one) {
    const column = pos - line.from
    const from = one[1].length + one[2].length
    return column >= from && column <= from + one[3].length
  }
  // A `<style>` inside a block opens none and is read as its body, but it is a tag to the sources.
  return !styleOpen.test(line.text) && regionsOf(state.doc).body[line.number] === 1
}
