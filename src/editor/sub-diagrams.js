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
 * The sub-diagrams of `text` in its uml blocks (lines before any `@start` count as uml), by their
 * 1-based `{{` and `}}` lines; `type` is `uml` for a bare `{{`. One left open at its diagram's
 * edge, or at the end, has `end` null.
 *
 * @param {string} text
 * @return {{ start: number, end: number|null, type: string }[]}
 */
export function subDiagramsOf(text) {
  const found = []
  const open = []
  let uml = true
  text.split('\n').forEach((line, i) => {
    if (EDGE.test(line)) {
      open.length = 0
      uml = START.exec(line)?.[1] === 'uml'
      return
    }
    if (!uml) {
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
