/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Wall's packing (VW12), with no DOM: every card on a grid of columns about
 * COLUMN px wide and rows ROW_UNIT px tall. A diagram spans the fewest columns
 * that hold it at its own size, or one fewer when it shrinks no further than
 * PREFER; never above its own size, never below FLOOR, and still too wide at
 * FLOOR it spans the wall and scrolls sideways. Cards go tallest first, each in
 * the first free spot (the highest row, then the leftmost column), where a span
 * one narrower may land higher at ACCEPT or more. Cards of no known size follow
 * in file order, one column each, at the waiting sheet's height.
 */
export const COLUMN = 260
export const GAP = 16
export const ROW_UNIT = 8
// The card around its sheet (viewer.css): a 1 px border and 4 px padding a side, a 34 px caption and its 4 px gap.
const CARD = { width: 10, height: 48 }
// The Wall's sheet padding, a side; the waiting sheet's height; room for a sideways scrollbar.
const PADDING = 16
const WAITING = 240
const SCROLLBAR = 16
const PREFER = 0.8
const ACCEPT = 0.7
const FLOOR = 0.5

/**
 * How many columns a wall of this width has.
 *
 * @param {number} width the stage's inner width, px
 * @param {{ column?: number, gap?: number }} [options]
 * @return {number} at least 1
 */
export function columnsFor(width, { column = COLUMN, gap = GAP } = {}) {
  return Math.max(1, Math.round((width + gap) / (column + gap)))
}

/**
 * @typedef {object} Placement
 * @property {number} column 0-based
 * @property {number} span columns
 * @property {number} row 0-based, in rows of rowUnit px
 * @property {number} rows the card's height and the gap under it, in rows
 * @property {number|null} scale the drawing's, null when its size is not known
 * @property {boolean} scroll too wide at FLOOR: it spans the wall and its sheet scrolls sideways
 * @property {number|null} width the drawing's width at its scale, px; null when not known
 * @property {number} height the sheet's height, its padding included, px
 */

/**
 * @param {Array<{ width: number, height: number }|null>} items each diagram's drawn size, in file order; null when not known
 * @param {{ width: number, column?: number, gap?: number, rowUnit?: number }} options the stage's inner width, px
 * @return {{ columns: number, used: number, columnWidth: number, placements: Placement[] }} a placement per item, in file order; used is the columns the cards reach, columnWidth one column's px
 */
export function pack(items, { width, column = COLUMN, gap = GAP, rowUnit = ROW_UNIT }) {
  const columns = columnsFor(width, { column, gap })
  const columnWidth = (width - (columns - 1) * gap) / columns
  // What a span of k columns leaves for the drawing.
  const room = (k) => k * columnWidth + (k - 1) * gap - CARD.width - 2 * PADDING
  const rowsOf = (sheet) => Math.ceil((CARD.height + sheet + gap) / rowUnit)
  // Occupied rows per column, as [from, to) pairs.
  const taken = Array.from({ length: columns }, () => [])

  function fit(size, span) {
    const wanted = Math.min(1, room(span) / size.width)
    const scroll = wanted < FLOOR
    const scale = scroll ? FLOOR : wanted
    const height = Math.ceil(scale * size.height) + 2 * PADDING + (scroll ? SCROLLBAR : 0)
    return { span, scale, scroll, width: Math.floor(scale * size.width), height, rows: rowsOf(height) }
  }

  /** The preferred fit first, then a span one narrower that keeps ACCEPT. */
  function fits(size) {
    let span = 1
    while (span < columns && room(span) < size.width) {
      span++
    }
    if (span > 1 && room(span - 1) / size.width >= PREFER) {
      span--
    }
    const options = [fit(size, span)]
    if (span > 1 && room(span - 1) / size.width >= ACCEPT) {
      options.push(fit(size, span - 1))
    }
    return options
  }

  const free = (column, span, row, rows) => {
    for (let j = column; j < column + span; j++) {
      if (taken[j].some(([from, to]) => from < row + rows && row < to)) {
        return false
      }
    }
    return true
  }

  /** The highest free row, then the leftmost column; a free row starts at 0 or where a card ends. */
  function spot(span, rows) {
    let best = null
    for (let column = 0; column + span <= columns; column++) {
      const starts = [0]
      for (let j = column; j < column + span; j++) {
        starts.push(...taken[j].map(([, to]) => to))
      }
      const row = starts.sort((a, b) => a - b).find((start) => free(column, span, start, rows))
      if (!best || row < best.row) {
        best = { column, row }
      }
    }
    return best
  }

  const placements = new Array(items.length)
  function put(index, option) {
    const at = spot(option.span, option.rows)
    for (let j = at.column; j < at.column + option.span; j++) {
      taken[j].push([at.row, at.row + option.rows])
    }
    placements[index] = { column: at.column, row: at.row, span: option.span, rows: option.rows, scale: option.scale, scroll: option.scroll, width: option.width, height: option.height }
  }

  const known = items.flatMap((size, index) => (size ? [{ index, options: fits(size) }] : []))
  known.sort((a, b) => b.options[0].rows - a.options[0].rows || a.index - b.index)
  for (const { index, options } of known) {
    // The option that lands highest; on a tie the first, at the larger scale.
    const landing = options.map((option) => spot(option.span, option.rows).row)
    put(index, options[landing.indexOf(Math.min(...landing))])
  }
  const waiting = { span: 1, scale: null, scroll: false, width: null, height: WAITING, rows: rowsOf(WAITING) }
  items.forEach((size, index) => {
    if (!size) {
      put(index, waiting)
    }
  })
  const used = Math.max(1, ...placements.map((placed) => placed.column + placed.span))
  return { columns, used, columnWidth, placements }
}

/**
 * The order the cards are read in: by row, then column.
 *
 * @param {Placement[]} placements
 * @return {number[]} indexes into placements
 */
export function visualOrder(placements) {
  return placements.map((_placement, index) => index)
    .sort((a, b) => placements[a].row - placements[b].row || placements[a].column - placements[b].column)
}
