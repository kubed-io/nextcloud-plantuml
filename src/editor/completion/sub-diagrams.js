/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The sub-diagram types after a line's `{{` in a uml block (X17). A pick inserts the whole
 * region, as B8 does for a block: the type, a body line with the cursor, and the `}}` line.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { SUB_TYPES } from '../sub-diagrams.js'
import { inUml } from './keywords.js'

const options = SUB_TYPES.map((type) => snippetCompletion(`${type}\n\t\${}\n}}`, { label: type, detail: 'sub-diagram', type: 'keyword' }))

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function subDiagrams(context) {
  const typed = context.matchBefore(/^[ \t]*\{\{\w*/)
  if (!typed || ensureSyntaxTree(context.state, context.pos, 50)?.resolveInner(context.pos, -1).name === 'comment') {
    return null
  }
  if (!inUml(context.state, context.state.doc.lineAt(context.pos).number)) {
    return null
  }
  const word = /\w*$/.exec(typed.text)[0]
  return { from: context.pos - word.length, options, validFor: /^\w*$/ }
}
