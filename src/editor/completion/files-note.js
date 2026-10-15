/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `<` at the start of a line inside a files diagram offers its `<note>`
 * block, above Creole's tags.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { blocksOf, scan } from '../blocks.js'

const option = snippetCompletion('<note>\n${}\n</note>', { label: '<note>', detail: 'files note', type: 'text', boost: 3 })

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function filesNote(context) {
  const typed = context.matchBefore(/^\s*<[a-z]*/)
  if (!typed) {
    return null
  }
  const line = context.state.doc.lineAt(context.pos).number
  const block = blocksOf(scan(context.state.doc.toString())).findLast((candidate) => candidate.start <= line)
  if (block?.type !== 'files' || (block.end !== null && block.end < line)) {
    return null
  }
  return { from: typed.to - typed.text.trimStart().length, options: [option], validFor: /^<[a-z]*$/ }
}
