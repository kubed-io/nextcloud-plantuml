/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The arrows and lines between two elements, offered where one is due: after
 * the first element of a line and a space, or over a connector half typed.
 * An element is a word, a "quoted name", a [component], a (use case) or an
 * :actor:, and a keyword such as `node` or `loop` starts a line of its own kind.
 * Picking one adds a space and offers the names to connect to.
 */
import { insertCompletionText, startCompletion } from '@codemirror/autocomplete'
import { KEYWORDS } from './keywords.js'

/** [connector, detail], the commonest first. */
const CONNECTORS = [
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
const keywords = new Set(KEYWORDS)

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function connectors(context) {
  const line = context.state.doc.lineAt(context.pos)
  const match = LINE.exec(context.state.sliceDoc(line.from, context.pos))
  if (!match || keywords.has(match[1].toLowerCase())) {
    return null
  }
  return { from: context.pos - match[2].length, options, validFor: /^\S*$/ }
}
