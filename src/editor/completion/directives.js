/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lines that start with a sigil: the @start/@end lines that open and close
 * a diagram after an `@`, the preprocessor's after a `!`, at the start of a line.
 */

const DIRECTIVES = [
  '@startuml', '@enduml',
  '@startmindmap', '@endmindmap',
  '@startgantt', '@endgantt',
  '@startjson', '@endjson',
  '@startyaml', '@endyaml',
  '@startwbs', '@endwbs',
]

/** The lines that open a diagram; `lint/unnamed-start.js` reads these too. */
export const STARTS = DIRECTIVES.filter((label) => label.startsWith('@start'))

/** Each takes an argument, so a space follows. */
const PREPROCESSOR = ['!theme', '!include', '!define', '!pragma']

const options = {
  '@': DIRECTIVES.map((label) => ({ label, type: 'keyword' })),
  '!': PREPROCESSOR.map((label) => ({ label, type: 'keyword', apply: `${label} ` })),
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function directives(context) {
  const typed = context.matchBefore(/^\s*[@!][\w]*/)
  if (!typed) {
    return null
  }
  const at = typed.text.search(/[@!]/)
  return { from: typed.from + at, options: options[typed.text[at]], validFor: /^[@!]\w*$/ }
}
