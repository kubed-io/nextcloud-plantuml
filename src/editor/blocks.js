/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reads a document into its diagrams: one per `@start…` block, one per
 * `newpage` page of a uml block, in PlantUML's own order. Pure, no editor.
 */
const START = /^\s*@start(\w+)(?:\(id=([^)]*)\)|\s+(.*?))?\s*$/
const END = /^\s*@end\w*\s*$/
const NEWPAGE = /^\s*newpage(?:\s.*)?$/

/**
 * @typedef {object} Diagram
 * @property {number} index 0-based across the file
 * @property {string} type the word after `@start`
 * @property {string} name `''` when unnamed
 * @property {number} page 1-based within its block
 * @property {number} pages the block's page count
 * @property {number} from first line (the `@start` or `newpage` line)
 * @property {number} to last line, inclusive, never the `@end` line
 * @property {number|null} start the block's `@start` line, null without one
 * @property {number|null} end the block's `@end` line, null when unclosed
 */

/**
 * @param {string} text
 * @returns {Diagram[]}
 */
export function scan(text) {
  const lines = text.split('\n')
  const diagrams = []
  let block = null // { type, name, start, pages: [{ from }] }

  const close = (last, end) => {
    if (!block) {
      return
    }
    block.pages.forEach((p, i) => {
      diagrams.push({
        index: diagrams.length,
        type: block.type,
        name: block.name,
        page: i + 1,
        pages: block.pages.length,
        from: p.from,
        to: i + 1 < block.pages.length ? block.pages[i + 1].from - 1 : last,
        start: block.start,
        end,
      })
    })
    block = null
  }

  lines.forEach((line, i) => {
    const n = i + 1
    const open = START.exec(line)
    if (open) {
      close(n - 1, null)
      block = { type: open[1], name: (open[2] ?? open[3] ?? '').trim(), start: n, pages: [{ from: n }] }
    } else if (block && END.test(line)) {
      close(n - 1, n)
    } else if (block?.type === 'uml' && NEWPAGE.test(line)) {
      block.pages.push({ from: n })
    }
  })
  close(lines.length, null)

  if (!diagrams.length) {
    return [{ index: 0, type: 'uml', name: '', page: 1, pages: 1, from: 1, to: lines.length, start: null, end: null }]
  }
  return diagrams
}

/**
 * The diagram whose block holds the line; the `@end` line belongs to the
 * block's last page.
 * @param {Diagram[]} diagrams
 * @param {number} line 1-based
 * @returns {Diagram|null}
 */
export function diagramAt(diagrams, line) {
  if (diagrams.length === 1 && diagrams[0].start === null) {
    return diagrams[0]
  }
  let last = null
  for (const d of diagrams) {
    if (line < d.start || line > (d.end ?? d.to)) {
      continue
    }
    if (line >= d.from && line <= d.to) {
      return d
    }
    last = d
  }
  return last
}

/** @param {Diagram} d */
export function label(d) {
  const base = d.name || d.type
  return d.pages > 1 ? `${base} ${d.page}` : base
}

/**
 * One block per `@start`, its pages merged. A file with no `@start` has none.
 * @param {Diagram[]} diagrams
 * @returns {{ type: string, name: string, start: number, end: number|null }[]}
 */
export function blocksOf(diagrams) {
  return diagrams
    .filter((d) => d.start !== null && d.page === 1)
    .map(({ type, name, start, end }) => ({ type, name, start, end }))
}
