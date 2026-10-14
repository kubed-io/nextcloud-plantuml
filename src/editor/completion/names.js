/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The names the diagram already uses, offered wherever a word is typed:
 * each declared participant or element (its alias, when it has one) and both
 * ends of every arrow, found with the grammar's own arrow.
 */
import { arrow } from '../plantuml-mode.js'
import { PARTICIPANTS, STRUCTURES } from './keywords.js'

const kinds = [...PARTICIPANTS, ...STRUCTURES].map((kind) => (kind === 'abstract' ? 'abstract(?:[ \\t]+class)?' : kind))
const DECLARATION = new RegExp(`^[ \\t]*(?:${kinds.join('|')})[ \\t]+(?:"[^"]*"|(\\w+))(?:[ \\t]+as[ \\t]+(\\w+))?`, 'gm')
const ARROW = new RegExp(`^[ \\t]*(\\w+)[ \\t]*${arrow.source}[ \\t]*(\\w+)?`, 'gm')

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function names(context) {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  if (/^\s*'/.test(line.text)) {
    return null
  }
  const before = context.matchBefore(/\w+/)
  if (!before && !context.explicit) {
    return null
  }
  const from = before?.from ?? pos
  // The word under the cursor is left out, or every half-typed name offers itself.
  const to = pos + /^\w*/.exec(state.sliceDoc(pos, line.to))[0].length
  const text = state.sliceDoc(0, from) + state.sliceDoc(to)

  const found = new Set()
  for (const [, name, alias] of text.matchAll(DECLARATION)) {
    found.add(alias ?? name)
  }
  for (const [, left, right] of text.matchAll(ARROW)) {
    found.add(left).add(right)
  }
  found.delete(undefined)
  return { from, options: [...found].map((label) => ({ label, type: 'variable' })), validFor: /^\w*$/ }
}
