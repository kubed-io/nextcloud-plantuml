/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Inside a style block: selectors outside braces, the enclosing diagram's
 * first, then the elements, then the other diagrams'; properties inside them
 * (with selectors after, for a nested one); and after a property with a list
 * of values, those values. Made from the core the style profile is given, so
 * it imports no core module.
 */
import vocabulary from '../data/vocabulary.json'
import { readStyle, styleBlocks } from '../profiles/style-grammar.js'

const { selectors, properties, fontStyles } = vocabulary.style

/** Each diagram type's own selector; uml has many, so it puts the general ones first. */
const DIAGRAM_SELECTORS = {
  mindmap: 'mindmapDiagram',
  wbs: 'wbsDiagram',
  json: 'jsonDiagram',
  yaml: 'yamlDiagram',
  salt: 'saltDiagram',
  gantt: 'ganttDiagram',
  nwdiag: 'nwdiagDiagram',
  files: 'filesDiagram',
  chart: 'chartDiagram',
  regex: 'regex',
  ebnf: 'ebnf',
  chen: 'chenEerDiagram',
  git: 'gitDiagram',
  packetdiag: 'packetdiagDiagram',
}
const GENERAL = ['root', 'element', 'document']
const DIAGRAMS = new Set([...Object.values(DIAGRAM_SELECTORS), ...selectors.filter((name) => name.endsWith('Diagram'))])

const VALUES = {
  fontstyle: fontStyles,
  horizontalalignment: ['left', 'center', 'right'],
  showstereotype: ['true', 'false'],
}

const propertyOptions = properties.map((label) => ({ label, type: 'property', boost: 10 }))

/** The selectors, the enclosing diagram's first, then the elements, then the other diagrams. */
function selectorOptions(type) {
  const first = DIAGRAM_SELECTORS[type] ? [DIAGRAM_SELECTORS[type]] : GENERAL
  return selectors.map((label) => ({
    label,
    type: 'type',
    boost: first.includes(label) ? 3 : DIAGRAMS.has(label) ? 1 : 2,
  }))
}

/**
 * The body of the style block the cursor is in, up to `to` on its line, or
 * null outside every block (and on its tag and PlantUML lines).
 */
function bodyBefore(lines, line, column) {
  for (const block of styleBlocks(lines)) {
    const at = block.body.findIndex((candidate) => candidate.line === line)
    const here = block.body[at]
    if (here && column >= here.from && column <= here.text.length) {
      return [...block.body.slice(0, at), { ...here, text: here.text.slice(0, column) }]
    }
  }
  return null
}

/** @param {{ scan: typeof import('../blocks.js').scan }} core */
export const styleCompletion = ({ scan }) => (context) => {
  const { state, pos } = context
  const typed = context.matchBefore(/[\w-]*/)
  const line = state.doc.lineAt(pos)
  const column = typed.from - line.from
  const text = state.doc.toString()
  const body = bodyBefore(text.split('\n'), line.number, column)
  // A word after `.` or `:` is a stereotype class or a depth, free-form.
  if (!body || (column > body.at(-1).from && /[^\s{};,]/.test(line.text[column - 1]))) {
    return null
  }
  const { depth, at, property } = readStyle(body)
  const result = (options) => ({ from: typed.from, options, validFor: /^[\w-]*$/ })
  if (at === 'value') {
    const values = VALUES[property.toLowerCase()]
    return values ? result(values.map((label) => ({ label, type: 'constant' }))) : null
  }
  const type = scan(text).find((d) => line.number >= d.from && line.number <= d.to)?.type
  if (depth > 0) {
    return result([...propertyOptions, ...selectorOptions(type)])
  }
  return typed.text || context.explicit ? result(selectorOptions(type)) : null
}
