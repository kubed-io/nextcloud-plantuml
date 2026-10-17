/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The names the diagram already uses, offered wherever a word is typed:
 * each declared participant or element (its alias, when it has one) and both
 * ends of every arrow, found with the grammar's own arrow. Not in a comment,
 * a directive or preprocessor line, a string, an arrow's message, a Creole
 * tag, after a `#` or `colors`, or in a style block, where a name is not wanted.
 */
import { arrow } from '../plantuml-mode.js'
import { inStyleBody } from '../regions.js'
import { PARTICIPANTS, STRUCTURES } from './keywords.js'

const kinds = [...PARTICIPANTS, ...STRUCTURES].map((kind) => (kind === 'abstract' ? 'abstract(?:[ \\t]+class)?' : kind))
// `d` for each name's offset, so the word being typed can be told apart.
const DECLARATION = new RegExp(`^[ \\t]*(?:${kinds.join('|')})[ \\t]+(?:"[^"]*"|(\\w+))(?:[ \\t]+as[ \\t]+(\\w+))?`, 'gmd')
const ARROW = new RegExp(`^[ \\t]*(\\w+)[ \\t]*${arrow.source}[ \\t]*(\\w+)?`, 'gmd')
const MESSAGE = new RegExp(`${arrow.source}[^:]*:`)

/** Where a name is not wanted: a comment, a directive, a string, a message, a Creole tag, a colour. */
function unwanted(lineBefore) {
  return /^\s*['@!]/.test(lineBefore) || lineBefore.split('"').length % 2 === 0 || MESSAGE.test(lineBefore)
    || /<(?:\/?[a-z]*|&[\w-]*|:[\w+-]*)$/.test(lineBefore) || /<[\w&$:/][^<>]*$/.test(lineBefore) || /#\w*$/.test(lineBefore) || /^\s*colors[ \t]+\w*$/.test(lineBefore)
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function names(context) {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  if (unwanted(state.sliceDoc(line.from, pos)) || inStyleBody(state, pos)) {
    return null
  }
  const before = context.matchBefore(/\w+/)
  if (!before && !context.explicit) {
    return null
  }
  const from = before?.from ?? pos

  // The word under the cursor is skipped, or every half-typed name offers itself.
  const found = new Set()
  const add = (match, group) => {
    if (match[group] !== undefined && match.indices[group][0] !== from) {
      found.add(match[group])
    }
  }
  const text = state.doc.toString()
  for (const match of text.matchAll(DECLARATION)) {
    add(match, match[2] === undefined ? 1 : 2)
  }
  for (const match of text.matchAll(ARROW)) {
    add(match, 1)
    add(match, 2)
  }
  return { from, options: [...found].map((label) => ({ label, type: 'variable' })), validFor: /^\w*$/ }
}
