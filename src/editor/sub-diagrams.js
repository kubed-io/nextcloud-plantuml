/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Sub-diagrams (X17): in a uml note, legend, `[ … ]` description or class body, a line `{{` or
 * `{{<type>` opens a diagram drawn in place, down to a line `}}`; a `{{` line inside counts one
 * deeper. The shapes of those lines, read by the grammar, `needed()`, folding and completion.
 */

/** A sub-diagram's first line: its indentation, `{{` and its type, empty for uml. */
export const SUB_OPEN = /^([ \t]*)(\{\{)(\w*)[ \t]*$/

/** A sub-diagram's last line. */
export const SUB_CLOSE = /^([ \t]*)(\}\})[ \t]*$/

/** The types the live server drew inside a note (2026-10-15), besides uml. */
export const SUB_TYPES = ['salt', 'json', 'yaml', 'wbs', 'mindmap', 'gantt', 'regex', 'ebnf', 'chronology']

const START = /^[ \t]*@start(\w+)/
const EDGE = /^[ \t]*@(?:start|end)\w+/

/**
 * Whether a `/' … '/` comment is open after `line`, given whether it was before: a line holding
 * `'/` closes one, and a `/'` with no `'/` after it opens one, but not on a `'` line.
 */
const commentAfter = (line, before) => {
  const opens = line.lastIndexOf("/'")
  const closes = line.lastIndexOf("'/")
  if (before && closes === -1) {
    return true
  }
  return opens > closes && (before || !/^[ \t]*'/.test(line))
}

/**
 * The sub-diagrams of `text` in its uml blocks (lines before any `@start` count as uml), by their
 * 1-based `{{` and `}}` lines; `type` is `uml` for a bare `{{`. One left open at its diagram's
 * edge, or at the end, has `end` null. A line in a `/' … '/` comment is skipped, as the server
 * drops it before reading the rest.
 *
 * @param {string} text
 * @return {{ start: number, end: number|null, type: string }[]}
 */
export function subDiagramsOf(text) {
  const found = []
  const open = []
  let uml = true
  let comment = false
  text.split('\n').forEach((line, i) => {
    if (EDGE.test(line)) {
      open.length = 0
      comment = false
      uml = START.exec(line)?.[1] === 'uml'
      return
    }
    const commented = comment
    comment = commentAfter(line, comment)
    if (!uml || commented) {
      return
    }
    const opened = SUB_OPEN.exec(line)
    if (opened) {
      const sub = { start: i + 1, end: null, type: opened[3] || 'uml' }
      found.push(sub)
      open.push(sub)
    } else if (open.length && SUB_CLOSE.test(line)) {
      open.pop().end = i + 1
    }
  })
  return found
}
