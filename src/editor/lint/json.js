/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `@startjson` block PlantUML's reader refuses. The server answers 200 with a "does not sound
 * like JSON" picture and no error line, so this is the only signal. The first error only: the
 * reader stops there. Made from the core the profile is given, as `yamlLint` is.
 */
import { checkJson, jsonLines } from '../profiles/json-check.js'

/**
 * The first error of the lines `first`.. `last` of `doc`, as a mark. A sub-diagram's lines lose
 * their indentation on the server, so `indented` reads them so and adds it back to the column.
 * The server cuts spaces and tabs only: a no-break space stays, as data.
 */
const check = (doc, first, last, indented, fallback) => {
  const raw = []
  for (let n = first; n <= last; n++) {
    raw.push(doc.line(n).text)
  }
  const cut = raw.map((line) => (indented ? /^[ \t]*/.exec(line)[0].length : 0))
  const kept = jsonLines(raw.map((line, row) => line.slice(cut[row])))
  const text = kept.join('\n') + '\n'
  const error = checkJson(text)
  if (!error) {
    return null
  }
  let at
  let from
  if (error.offset < text.length) {
    // The offset counts the joined lines, which sit where the document's do.
    const before = text.slice(0, error.offset).split('\n')
    const row = before.length - 1
    at = doc.line(first + row)
    from = Math.min(at.from + cut[row] + before[row].length, at.to)
    // A newline is the offending character: mark the line's last one, never an empty range.
    if (from === at.to && at.to > at.from) {
      from--
    }
  } else {
    // Past the data: the last line that holds any, from its last character.
    const last = kept.findLastIndex((line) => line.trim() !== '')
    if (last === -1) {
      at = doc.line(fallback)
      from = at.from
    } else {
      at = doc.line(first + last)
      from = Math.max(at.from, at.from + cut[last] + kept[last].trimEnd().length - 1)
    }
  }
  return { from, to: at.to, severity: 'error', message: error.message }
}

/** @param {{ scan: typeof import('../blocks.js').scan, subDiagrams: typeof import('../sub-diagrams.js').subDiagramsOf }} core */
export const jsonLint = ({ scan, subDiagrams }) => (state) => {
  const { doc } = state
  const text = doc.toString()
  const found = []
  const diagrams = scan(text)
  for (const d of diagrams) {
    if (d.type !== 'json' || d.page !== 1 || d.start === null) {
      continue
    }
    const mark = check(doc, d.start + 1, d.to, false, d.start)
    if (mark) {
      found.push(mark)
    }
  }
  // A `{{json` inside a uml diagram, closed: its lines between the `{{json` and `}}` lines.
  for (const s of subDiagrams(text)) {
    if (s.type !== 'json' || s.end === null) {
      continue
    }
    if (!diagrams.some((d) => d.type === 'uml' && d.start !== null && d.start < s.start && s.end <= d.to)) {
      continue
    }
    const mark = check(doc, s.start + 1, s.end - 1, true, s.start)
    if (mark) {
      found.push(mark)
    }
  }
  return found
}
