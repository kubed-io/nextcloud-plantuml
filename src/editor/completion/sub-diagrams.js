/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The sub-diagram types after a line's `{{` in a uml block (X17), where the grammar opens one:
 * the line as typed is a `{{` line, so its `{{` is a `brace` of its own only in a body. A pick
 * inserts the whole region, as B8 does for a block: the type, a body line with the cursor, and
 * the `}}` line.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { SUB_TYPES } from '../sub-diagrams.js'
import { inUml } from './keywords.js'

const options = SUB_TYPES.map((type) => snippetCompletion(`${type}\n\t\${}\n}}`, { label: type, detail: 'sub-diagram', type: 'keyword' }))

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function subDiagrams(context) {
  const typed = context.matchBefore(/^[ \t]*\{\{\w*/)
  if (!typed) {
    return null
  }
  // A json block's `{` `{` is a brace too, so the block is looked for as well.
  const at = typed.from + typed.text.indexOf('{{')
  const node = ensureSyntaxTree(context.state, context.pos, 50)?.resolveInner(at, 1)
  if (node?.name !== 'brace' || node.from !== at || node.to !== at + 2 || !inUml(context.state, context.state.doc.lineAt(context.pos).number)) {
    return null
  }
  const word = /\w*$/.exec(typed.text)[0]
  return { from: context.pos - word.length, options, validFor: /^\w*$/ }
}
