/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `<` at the start of a line can open a style block or import a style
 * sheet. Both are boosted to sit above Creole's tags, which are offered there
 * too. Not inside a style block.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { inStyleBody } from '../regions.js'

const options = [
  snippetCompletion('<style>\n\t${}\n</style>', { label: '<style>', detail: 'style block', type: 'text', boost: 2 }),
  snippetCompletion('<style file=${}>', { label: '<style file=', detail: 'style sheet', type: 'text', boost: 1 }),
]

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function styleTag(context) {
  const typed = context.matchBefore(/^\s*<[a-z]*/)
  if (!typed || inStyleBody(context.state, context.pos)) {
    return null
  }
  return { from: typed.to - typed.text.trimStart().length, options, validFor: /^<[a-z]*$/ }
}
