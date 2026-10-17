/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Adding a template (editor spec A4): its block goes at the end of the file,
 * one blank line below the last text, under a name the file does not have yet.
 * Pure: the editor dispatches the change this gives.
 */
import { tabName } from '../blocks.js'
import { startCall } from '../lexicon/start.js'

const START = /^(\s*@start\w+)([^\n]*)$/
// PlantUML ends a line at \n and \r only; the editor's document holds \n lines.
const BLANK = /^[ \t]*$/
const eol = (text) => text.replace(/\r\n?/g, '\n')
const ID = /^\(\s*id\s*=/

/** The names a new block may not take: each block's, or its type's word when unnamed, as its tab reads (B2). */
export function takenNames(diagrams) {
  return new Set(diagrams.map(tabName))
}

/** `base`, else `base-2`, `base-3`, … */
export function uniqueName(base, taken) {
  if (!taken.has(base)) {
    return base
  }
  let n = 2
  while (taken.has(`${base}-${n}`)) {
    n++
  }
  return `${base}-${n}`
}

/**
 * The block with `name` on its `@start` line. An `(id=…)` is dropped: a second
 * copy of the template would give the file two blocks of one id. Other
 * arguments stay. What B1 cannot read as a name is dropped from `name`.
 */
export function named(block, name) {
  const [first, ...rest] = eol(block).split('\n')
  const open = START.exec(first)
  if (!open) {
    return eol(block)
  }
  const [, lead, after] = open
  const call = startCall.exec(after)?.[0] ?? ''
  const kept = ID.test(call) ? '' : call
  const clean = name.replace(/["“”{}\r\n]/g, '').trim()
  return [`${lead}${kept}${clean ? ` ${clean}` : ''}`, ...rest].join('\n')
}

/**
 * The change that ends `doc` with one blank line, then `block`, then the final
 * newline `doc` had, if it had one; an empty file gets the block alone.
 */
export function appendBlock(doc, text) {
  const block = eol(text)
  const lines = doc.split('\n')
  let last = lines.length
  while (last > 0 && BLANK.test(lines[last - 1])) {
    last--
  }
  const from = last === 0 ? 0 : lines.slice(0, last).join('\n').length
  const final = last > 0 && doc.endsWith('\n') ? '\n' : ''
  const insert = last === 0 ? block : `\n\n${block}${final}`
  const start = last === 0 ? 0 : from + 2
  const newline = block.indexOf('\n')
  const cursor = newline === -1 ? start + block.length : start + newline + 1
  return { from, to: doc.length, insert, start, cursor }
}
