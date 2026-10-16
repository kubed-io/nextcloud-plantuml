/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `@startjson` block PlantUML's reader refuses. The server answers 200 with a "does not sound
 * like JSON" picture and no error line, so this is the only signal. The first error only: the
 * reader stops there. Made from the core the profile is given, as `yamlLint` is.
 */
import { checkJson, jsonLines } from '../profiles/json-check.js'

/** @param {{ scan: typeof import('../blocks.js').scan }} core */
export const jsonLint = ({ scan }) => (state) => {
  const { doc } = state
  const found = []
  for (const d of scan(doc.toString())) {
    if (d.type !== 'json' || d.page !== 1 || d.start === null) {
      continue
    }
    const first = d.start + 1
    const lines = []
    for (let n = first; n <= d.to; n++) {
      lines.push(doc.line(n).text)
    }
    const kept = jsonLines(lines)
    const text = kept.join('\n') + '\n'
    const error = checkJson(text)
    if (!error) {
      continue
    }
    let at
    let from
    if (error.offset < text.length) {
      // The offset counts the joined lines, which sit where the document's do.
      const before = text.slice(0, error.offset).split('\n')
      at = doc.line(first + before.length - 1)
      from = Math.min(at.from + before[before.length - 1].length, at.to)
      // A newline is the offending character: mark the line's last one, never an empty range.
      if (from === at.to && at.to > at.from) {
        from--
      }
    } else {
      // Past the data: the last line that holds any, from its last character.
      const last = kept.findLastIndex((line) => line.trim() !== '')
      if (last === -1) {
        at = doc.line(d.start)
        from = at.from
      } else {
        at = doc.line(first + last)
        from = Math.max(at.from, at.from + kept[last].trimEnd().length - 1)
      }
    }
    found.push({ from, to: at.to, severity: 'error', message: error.message })
  }
  return found
}
