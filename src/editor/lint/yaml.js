/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `@startyaml` block that is not YAML. The server draws a picture for it
 * anyway, with no error line, so this is the only signal. Errors only: the
 * parser's warnings are style. Made from the core the profile is given,
 * since importing blocks.js here would share it between the editor and this
 * chunk.
 */
import { parseDocument } from 'yaml'
import { dataLines } from '../profiles/plantuml-lines.js'

/** @param {{ diagrams: typeof import('../blocks.js').diagramsOf }} core */
export const yamlLint = ({ diagrams }) => (state) => {
  const { doc } = state
  const found = []
  for (const d of diagrams(doc)) {
    if (d.type !== 'yaml' || d.page !== 1 || d.start === null) {
      continue
    }
    const first = d.start + 1
    const lines = []
    for (let n = first; n <= d.to; n++) {
      lines.push(doc.line(n).text)
    }
    // A blanked line keeps every later line where it was.
    for (const error of parseDocument(dataLines(lines).join('\n')).errors) {
      const [start, end = start] = error.linePos
      const from = position(doc, first, start)
      found.push({
        from,
        to: Math.max(doc.lineAt(from).to, position(doc, first, end)),
        severity: 'error',
        message: error.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '').replace(/; please use .*$/, ''),
      })
    }
  }
  return found
}

/** The parser's 1-based line and column in the body, as a document position on that line. */
function position(doc, first, { line, col }) {
  const at = doc.line(first + line - 1)
  return Math.min(at.from + col - 1, at.to)
}
