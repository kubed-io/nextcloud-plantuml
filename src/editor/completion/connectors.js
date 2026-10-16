/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The arrows and lines between two elements, offered where one is due: after
 * the first element of a line and a space, or over a connector half typed.
 * An element is a word, a "quoted name", a [component], a (use case) or an
 * :actor:, and a keyword such as `node` or `loop` starts a line of its own kind.
 * Picking one adds a space and offers the names to connect to. Where the value
 * registry has a value, in a style block, or after `colors` or `help`, no
 * connector is due.
 */
import { insertCompletionText, startCompletion } from '@codemirror/autocomplete'
import { HELPER_HEADS, KEYWORDS } from './keywords.js'
import { valueAt } from '../values/index.js'
import { inStyleBody } from '../plantuml-mode.js'

/** [connector, detail], the commonest first. */
export const CONNECTORS = [
  ['-->', 'dashed arrow'],
  ['->', 'arrow'],
  ['--', 'solid line'],
  ['..', 'dotted'],
  ['~~', 'wavy'],
  ['==', 'bold'],
  ['<-', 'arrow, backwards'],
  ['<--', 'dashed arrow, backwards'],
  ['<->', 'arrow both ways'],
  ['->>', 'async'],
  ['--|>', 'extends'],
  ['..|>', 'implements'],
  ['*--', 'composition'],
  ['o--', 'aggregation'],
  ['-up->', 'arrow, placed up'],
  ['-down->', 'arrow, placed down'],
  ['-left->', 'arrow, placed left'],
  ['-right->', 'arrow, placed right'],
  ['-[hidden]-', 'invisible, for layout'],
]

function apply(view, completion, from, to) {
  view.dispatch(insertCompletionText(view.state, `${completion.label} `, from, to))
  startCompletion(view)
}

const options = CONNECTORS.map(([label, detail], i) => ({ label, detail, type: 'operator', boost: -i, apply }))

const ELEMENT = /(?:\w+|"[^"]*"|\[[^\]]*\]|\([^)]*\)|:[^:]+:)/.source
// A connector starts with one of these; the rest of it is anything but a space.
const LINE = new RegExp(`^\\s*(${ELEMENT})\\s+((?:[-.~=<*o][^\\s]*)?)$`)
const keywords = new Set([...KEYWORDS, ...HELPER_HEADS])

/**
 * The connector typed so far where one is due in `lineBefore`, `''` when none
 * is typed yet, and null where none is due; `creole.js` reads this too.
 */
export function connectorTyped(lineBefore) {
  const match = LINE.exec(lineBefore)
  return match && !keywords.has(match[1].toLowerCase()) ? match[2] : null
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function connectors(context) {
  const line = context.state.doc.lineAt(context.pos)
  const typed = connectorTyped(context.state.sliceDoc(line.from, context.pos))
  if (typed === null || valueAt(context.state, context.pos) || inStyleBody(context.state, context.pos)) {
    return null
  }
  return { from: context.pos - typed.length, options, validFor: /^\S*$/ }
}
