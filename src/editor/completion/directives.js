/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lines that start with a sigil: the @start/@end lines that open and close
 * a diagram after an `@`, the preprocessor's after a `!`, at the start of a line.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { blocksOf, scan } from '../blocks.js'

const DIRECTIVES = [
  '@startuml', '@enduml',
  '@startmindmap', '@endmindmap',
  '@startgantt', '@endgantt',
  '@startjson', '@endjson',
  '@startyaml', '@endyaml',
  '@startwbs', '@endwbs',
  '@startsalt', '@endsalt',
  '@startregex', '@endregex',
  '@startebnf', '@endebnf',
]

/** The lines that open a diagram; `lint/unnamed-start.js` reads these too. */
export const STARTS = DIRECTIVES.filter((label) => label.startsWith('@start'))

/** Each takes an argument, so a space follows. */
const PREPROCESSOR = ['!theme', '!include', '!define', '!pragma']

/** Salt and JSON bodies are braces; every other type's is a blank line. */
const BRACED = ['salt', 'json']

/** Picking a start inserts the whole block: the name a field, then the body. */
function startOption(label) {
  const type = label.slice('@start'.length)
  const body = BRACED.includes(type) ? '{\n\t${}\n}' : '${}'
  return snippetCompletion(`${label} \${name}\n${body}\n@end${type}`, { label, type: 'keyword' })
}

const starts = STARTS.map(startOption)
const ends = DIRECTIVES.filter((label) => label.startsWith('@end')).map((label) => ({ label, type: 'keyword' }))

const options = {
  '@': [...starts, ...ends],
  '!': PREPROCESSOR.map((label) => ({ label, type: 'keyword', apply: `${label} ` })),
}

/** The type of the block the line is in when nothing has closed it yet; the line itself is still being typed. */
function openType(state, line) {
  const lines = state.doc.toString().split('\n')
  lines[line - 1] = ''
  const block = blocksOf(scan(lines.join('\n'))).findLast((candidate) => candidate.start <= line)
  return block && block.end === null ? block.type : null
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function directives(context) {
  const typed = context.matchBefore(/^\s*[@!][\w]*/)
  if (!typed) {
    return null
  }
  const at = typed.text.search(/[@!]/)
  let list = options[typed.text[at]]
  const type = typed.text[at] === '@' ? openType(context.state, context.state.doc.lineAt(context.pos).number) : null
  if (type) {
    list = [...starts, { label: `@end${type}`, type: 'keyword' }]
  }
  return { from: typed.from + at, options: list, validFor: /^[@!]\w*$/ }
}
