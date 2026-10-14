/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `@startyaml` block that is not YAML. The server draws a picture for it
 * anyway, with no error line, so this is the only signal. Errors only: the
 * parser's warnings are style.
 */
import { parseDocument } from 'yaml'
import { scan } from '../blocks.js'

const HIGHLIGHT = /^\s*#highlight\b/

/** @param {import('@codemirror/state').EditorState} state */
export function yamlLint(state) {
  const { doc } = state
  const found = []
  for (const d of scan(doc.toString())) {
    if (d.type !== 'yaml' || d.page !== 1 || d.start === null) {
      continue
    }
    const first = d.start + 1
    const body = []
    for (let n = first; n <= d.to; n++) {
      const text = doc.line(n).text
      // A blanked line keeps every later line where it was.
      body.push(HIGHLIGHT.test(text) ? '' : text)
    }
    for (const error of parseDocument(body.join('\n')).errors) {
      const { line, col } = error.linePos[0]
      const at = doc.line(first + line - 1)
      const from = Math.min(at.from + col - 1, at.to)
      found.push({
        from,
        to: Math.min(Math.max(from + (error.pos[1] - error.pos[0]), from + 1), at.to),
        severity: 'error',
        message: error.message.split('\n')[0],
      })
    }
  }
  return found
}
