/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reads a document into its diagrams: one per `@start…` block, one per
 * `newpage` page of a uml block, in PlantUML's own order. Pure, no editor.
 */
import { startCall, startName } from './lexicon/rules.js'

const START = /^\s*@start(\w+)(.*)$/
const END = /^\s*@end\w*\s*$/
const NEWPAGE = /^\s*newpage(?:\s.*)?$/

/**
 * The `@start` line a line is, read as PlantUML reads it (the lexicon's `startName`, the same
 * pattern the highlighting uses): its type, the id of `(id=NAME)`, and the name, which is
 * the text after the arguments with its spaces, quotes and braces taken off, else the id. Null
 * when the line opens no block.
 *
 * @param {string} line
 * @returns {{ type: string, id: string|null, name: string }|null}
 */
export function startOf(line) {
  const open = START.exec(line)
  if (!open) {
    return null
  }
  let rest = open[2]
  let id = null
  const call = startCall.exec(rest)
  if (call) {
    id = /^\s*id\s*=\s*(.*?)\s*$/.exec(call[1])?.[1] || null
    rest = rest.slice(call[0].length)
  }
  const named = startName.exec(rest)
  if (rest !== '' && !named) {
    return null
  }
  return { type: open[1], id, name: named?.[2] ?? id ?? '' }
}

/**
 * @typedef {object} Diagram
 * @property {number} index 0-based across the file
 * @property {string} type the word after `@start`
 * @property {string} name what the `@start` line names, `''` when unnamed
 * @property {string|null} id the `(id=NAME)` argument, what `!include file!NAME` takes
 * @property {number} page 1-based within its block
 * @property {number} pages the block's page count
 * @property {number} from first line (the `@start` or `newpage` line)
 * @property {number} to last line, inclusive, never the `@end` line
 * @property {number|null} start the block's `@start` line, null without one
 * @property {number|null} end the block's `@end` line, null when unclosed
 * @property {number} render the image PlantUML draws for it, `/svg/<render>`:
 *   its index, unless an unclosed block makes PlantUML count otherwise
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
        id: block.id,
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
    const open = startOf(line)
    if (open) {
      close(n - 1, null)
      block = { ...open, start: n, pages: [{ from: n }] }
    } else if (block && END.test(line)) {
      close(n - 1, n)
    } else if (block?.type === 'uml' && NEWPAGE.test(line)) {
      block.pages.push({ from: n })
    }
  })
  close(lines.length, null)

  if (!diagrams.length) {
    diagrams.push({ index: 0, type: 'uml', name: '', id: null, page: 1, pages: 1, from: 1, to: lines.length, start: null, end: null })
  }
  // A diagram PlantUML dropped shows the image of the block that closed over it.
  const drawn = images(lines)
  for (const d of diagrams) {
    const at = drawn.findIndex((last) => last >= d.from)
    d.render = at === -1 ? drawn.length : at
  }
  return diagrams
}

/**
 * The last line of each image PlantUML draws, in its order. It reads a file
 * its own way, as the live server showed: a `@start` begins its block afresh,
 * dropping whatever an unclosed block before it held; an `@end` of any type
 * closes the block; and a file in which nothing closes is drawn as if wrapped
 * in `@startuml`…`@enduml`.
 *
 * @param {string[]} lines
 * @param {boolean} [wrapped]
 * @return {number[]}
 */
function images(lines, wrapped = false) {
  const lasts = []
  let open = wrapped ? { type: 'uml', pages: [] } : null // pages: the last line of each but the last
  lines.forEach((line, i) => {
    const n = i + 1
    const start = startOf(line)
    if (start) {
      open = { type: start.type, pages: [] }
    } else if (open && END.test(line)) {
      lasts.push(...open.pages, n)
      open = null
    } else if (open?.type === 'uml' && NEWPAGE.test(line)) {
      open.pages.push(n - 1)
    }
  })
  if (wrapped && open) {
    lasts.push(...open.pages, lines.length)
  }
  return lasts.length || wrapped ? lasts : images(lines, true)
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
 * @returns {{ type: string, name: string, id: string|null, start: number, end: number|null }[]}
 */
export function blocksOf(diagrams) {
  return diagrams
    .filter((d) => d.start !== null && d.page === 1)
    .map(({ type, name, id, start, end }) => ({ type, name, id, start, end }))
}
