/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Whole blocks at the start of a line, their blanks as fields: Tab moves to
 * the next, Escape leaves them. `${name}` is a field with a placeholder, `${}`
 * an empty one, and a leading tab one indent.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { inStyleBody } from '../regions.js'

const SNIPPETS = [
  ['note', 'note ${right} of ${participant}\n\t${}\nend note', 'note block'],
  ['alt', 'alt ${condition}\n\t${}\nelse ${otherwise}\n\t${}\nend', 'alt / else'],
  ['loop', 'loop ${condition}\n\t${}\nend', 'loop block'],
  ['class', 'class ${Name} {\n\t${}\n}', 'class body'],
  ['if', 'if (${condition}) then (${yes})\n\t${}\nelse (${no})\n\t${}\nendif', 'if / else'],
]

const options = SNIPPETS.map(([label, template, detail]) => snippetCompletion(template, { label, detail, type: 'text' }))

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function snippets(context) {
  const typed = context.matchBefore(/^\s*\w+/)
  if (!typed || inStyleBody(context.state, context.pos)) {
    return null
  }
  return { from: typed.to - typed.text.trimStart().length, options, validFor: /^\w*$/ }
}
