/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lines that start with a sigil: the @start/@end lines that open and close
 * a diagram after an `@`, the preprocessor's after a `!`, at the start of a line.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { blocksOf, scan } from '../blocks.js'
import preprocessor from '../data/directives.json'

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
  '@startfiles', '@endfiles',
]

/** The lines that open a diagram; `lint/unnamed-start.js` reads these too. */
export const STARTS = DIRECTIVES.filter((label) => label.startsWith('@start'))

/** The blocks and the assignment, as snippets: the fields come in order (the name or condition, then any arguments), the body last; `!$` ends on its value. */
const SNIPPETS = {
  '!if': '!if ${condition}\n${}\n!endif',
  '!while': '!while ${condition}\n${}\n!endwhile',
  '!foreach': '!foreach $${item} in ${list}\n${}\n!endfor',
  '!procedure': '!procedure $${name}(${})\n${}\n!endprocedure',
  '!function': '!function $${name}(${})\n!return ${}\n!endfunction',
  '!startsub': '!startsub ${NAME}\n${}\n!endsub',
  '!$': '!$${name} = ${value}',
}

/** `!$` is a variable assignment, not in the generated list. Every other word takes an argument, so a space follows. */
const PREPROCESSOR = [...preprocessor.directives, '!$'].sort().map((label) => (
  SNIPPETS[label] ? snippetCompletion(SNIPPETS[label], { label, type: 'keyword' }) : { label, type: 'keyword', apply: `${label} ` }
))

/** The words that continue or close a conditional, offered first while one is open. */
const CONTINUES = ['!else', '!elseif', '!endif']

/** Salt and JSON bodies are braces; every other type's is a blank line. */
const BRACED = ['salt', 'json']

/** Picking a start inserts the whole block: the name a field, then the body. */
function startOption(label) {
  const type = label.slice('@start'.length)
  const body = BRACED.includes(type) ? '{\n\t${}\n}' : type === 'files' ? '/${}' : '${}'
  return snippetCompletion(`${label} \${name}\n${body}\n@end${type}`, { label, type: 'keyword' })
}

const starts = STARTS.map(startOption)
const ends = DIRECTIVES.filter((label) => label.startsWith('@end')).map((label) => ({ label, type: 'keyword' }))

const options = {
  '@': [...starts, ...ends],
  '!': PREPROCESSOR,
}

/** Whether an `!if`, `!ifdef` or `!ifndef` above the cursor's line has no `!endif` yet; block comments do not count. */
function conditionalOpen(state, line) {
  const above = state.doc.sliceString(0, state.doc.line(line).from).replace(/\/'[\s\S]*?(?:'\/|$)/g, '')
  let depth = 0
  for (const [, word] of above.matchAll(/^\s*!(if|ifdef|ifndef|endif)\b/gm)) {
    depth = word === 'endif' ? Math.max(0, depth - 1) : depth + 1
  }
  return depth > 0
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
  const typed = context.matchBefore(/^\s*[@!][\w$]*/)
  if (!typed) {
    return null
  }
  const at = typed.text.search(/[@!]/)
  let list = options[typed.text[at]]
  const line = context.state.doc.lineAt(context.pos).number
  const type = typed.text[at] === '@' ? openType(context.state, line) : null
  if (type) {
    list = [...starts, { label: `@end${type}`, type: 'keyword' }]
  } else if (typed.text[at] === '!' && conditionalOpen(context.state, line)) {
    list = [...list.filter((option) => CONTINUES.includes(option.label)).map((option) => ({ ...option, boost: 2 })), ...list.filter((option) => !CONTINUES.includes(option.label))]
  }
  return { from: typed.from + at, options: list, validFor: /^[@!][\w$]*$/ }
}
