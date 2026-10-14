/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The @start/@end lines that open and close a diagram, after an `@` at the
 * start of a line.
 */

const DIRECTIVES = [
  '@startuml', '@enduml',
  '@startmindmap', '@endmindmap',
  '@startgantt', '@endgantt',
  '@startjson', '@endjson',
  '@startyaml', '@endyaml',
  '@startwbs', '@endwbs',
]

const options = DIRECTIVES.map((label) => ({ label, type: 'keyword' }))

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function directives(context) {
  const typed = context.matchBefore(/^\s*@\w*/)
  if (!typed) {
    return null
  }
  return { from: typed.from + typed.text.indexOf('@'), options, validFor: /^@\w*$/ }
}
