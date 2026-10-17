// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { columnsFor, pack, visualOrder } from '../../../src/viewer/wall-layout.js'

// 1232 px inside the stage (a 1280 px stage less 24 px a side): 5 columns of 233.6 px.
const WIDE = 1232
const room = (span) => span * 233.6 + (span - 1) * 16 - 42
const one = (size, width = WIDE) => pack([size], { width }).placements[0]

// A mix of sequences, activities, classes, tiny ones and states, a few not yet drawn.
function sample(count, seed) {
  let s = seed >>> 0
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const kinds = [[0.25, [800, 1500], [250, 600]], [0.15, [250, 500], [900, 1600]], [0.3, [400, 900], [300, 700]], [0.2, [120, 260], [60, 180]], [0.1, [300, 600], [300, 600]]]
  return Array.from({ length: count }, () => {
    let x = random()
    const [, w, h] = kinds.find(([weight]) => (x -= weight) <= 0) ?? kinds[0]
    const pick = ([a, b]) => Math.round(a + random() * (b - a))
    const size = { width: pick(w), height: pick(h) }
    return random() < 0.15 ? null : size
  })
}

describe('the column grid', () => {
  it('counts columns of about 260 px and a 16 px gap from the inner width', () => {
    expect(columnsFor(WIDE)).toBe(5)
    expect(columnsFor(1752)).toBe(6)
    expect(columnsFor(536)).toBe(2)
    expect(columnsFor(327)).toBe(1)
  })

  it('has one column however narrow the stage, a hidden one included', () => {
    expect(columnsFor(0)).toBe(1)
    expect(columnsFor(-48)).toBe(1)
    expect(pack([{ width: 100, height: 50 }], { width: 0 }).columns).toBe(1)
  })
})

describe('a card', () => {
  it('takes one column at its own size when it fits, never larger', () => {
    // 50 px drawn, 32 px of sheet padding; 48 px of card and 16 px of gap: 146 px, 19 rows of 8 px.
    expect(one({ width: 100, height: 50 })).toEqual({ column: 0, row: 0, span: 1, rows: 19, scale: 1, scroll: false, width: 100, height: 82 })
  })

  it('spans the fewest columns that hold it at its own size', () => {
    // 600 px wants 642 px of card: three columns; two would shrink it to 0.74.
    expect(one({ width: 600, height: 300 })).toMatchObject({ span: 3, scale: 1, width: 600 })
  })

  it('takes a column fewer when that shrinks it no further than 0.8', () => {
    const placed = one({ width: 520, height: 260 })

    expect(placed).toMatchObject({ span: 2, scroll: false })
    expect(placed.scale).toBeCloseTo(room(2) / 520)
    expect(placed.scale).toBeGreaterThanOrEqual(0.8)
    expect(placed.width).toBe(Math.floor(placed.scale * 520))
  })

  it('takes a column fewer at 0.7 or more when that lands it higher', () => {
    // The tall one fills columns 1–3 from the top; at three columns the next would wait under it.
    const { placements } = pack([{ width: 600, height: 2000 }, { width: 600, height: 300 }], { width: WIDE })

    expect(placements[0]).toMatchObject({ column: 0, row: 0, span: 3, scale: 1 })
    expect(placements[1]).toMatchObject({ column: 3, row: 0, span: 2 })
    expect(placements[1].scale).toBeCloseTo(room(2) / 600)
    expect(placements[1].scale).toBeGreaterThanOrEqual(0.7)
  })

  it('keeps the larger scale when both spans land as high', () => {
    // 560 px: two columns would keep 0.79, short of 0.8, so three is preferred; both land at row 0.
    expect(one({ width: 560, height: 260 })).toMatchObject({ column: 0, row: 0, span: 3, scale: 1, width: 560 })
  })

  it('spans the whole wall when nothing narrower holds it at half its size', () => {
    const placed = one({ width: 2000, height: 400 })

    expect(placed).toMatchObject({ column: 0, span: 5, scroll: false })
    expect(placed.scale).toBeCloseTo(room(5) / 2000)
  })

  it('stops at half its size and scrolls sideways when still too wide, across the wall', () => {
    // 2000 px drawn, 32 px of padding and 16 px for the scrollbar.
    expect(one({ width: 4000, height: 4000 })).toEqual({ column: 0, row: 0, span: 5, rows: 264, scale: 0.5, scroll: true, width: 2000, height: 2048 })
  })

  it('waits in one column at the waiting sheet\'s 240 px while its size is not known', () => {
    expect(one(null)).toEqual({ column: 0, row: 0, span: 1, rows: 38, scale: null, scroll: false, width: null, height: 240 })
  })
})

describe('the packing', () => {
  it('places the tallest first, each in the first free spot', () => {
    const { placements } = pack([{ width: 100, height: 100 }, { width: 100, height: 300 }, { width: 100, height: 200 }], { width: 536 })

    expect(placements.map(({ column, row }) => [column, row])).toEqual([[1, 37], [0, 0], [1, 0]])
  })

  it('puts the cards of no known size after the packed ones, in file order, into the spots left', () => {
    const { placements } = pack([null, { width: 100, height: 50 }, null], { width: 536 })

    expect(placements.map(({ column, row, span }) => [column, row, span])).toEqual([[1, 0, 1], [0, 0, 1], [0, 19, 1]])
  })

  it('places equal cards in file order', () => {
    const { placements } = pack(Array.from({ length: 4 }, () => ({ width: 100, height: 100 })), { width: 536 })

    expect(placements.map(({ column, row }) => [column, row])).toEqual([[0, 0], [1, 0], [0, 25], [1, 25]])
  })

  it('places the same diagrams the same way every time', () => {
    const items = sample(40, 11)

    expect(pack(items, { width: WIDE })).toEqual(pack(structuredClone(items), { width: WIDE }))
  })

  for (const width of [327, 800, WIDE, 1752]) {
    it(`never overlaps two cards, nor leaves the ${columnsFor(width)} columns of a ${width} px wall`, () => {
      const items = sample(40, width)
      const { columns, placements } = pack(items, { width })
      const cells = new Set()

      for (const { column, row, span, rows } of placements) {
        expect(column).toBeGreaterThanOrEqual(0)
        expect(column + span).toBeLessThanOrEqual(columns)
        for (let c = column; c < column + span; c++) {
          for (let r = row; r < row + rows; r++) {
            expect(cells.has(`${c},${r}`)).toBe(false)
            cells.add(`${c},${r}`)
          }
        }
      }
    })

    it(`keeps every drawing within its span and the scale rules on a ${width} px wall`, () => {
      const items = sample(40, width + 1)
      const { columns, placements } = pack(items, { width })
      const columnWidth = (width - (columns - 1) * 16) / columns

      placements.forEach((placed, index) => {
        if (!items[index]) {
          return
        }
        const inner = placed.span * columnWidth + (placed.span - 1) * 16 - 42
        expect(placed.scale).toBeLessThanOrEqual(1)
        expect(placed.scale).toBeGreaterThanOrEqual(0.5)
        // Below 0.7 only across the whole wall; scrolling only there, at 0.5.
        if (placed.scale < 0.7) {
          expect(placed.span).toBe(columns)
        }
        if (placed.scroll) {
          expect(placed).toMatchObject({ scale: 0.5, span: columns })
        } else {
          expect(placed.width).toBeLessThanOrEqual(inner)
        }
        // The card and the gap under it fit its rows.
        expect(48 + placed.height + 16).toBeLessThanOrEqual(placed.rows * 8)
      })
    })
  }

  it('packs 200 diagrams in well under 250 ms, the best of three runs', () => {
    const items = sample(200, 3)
    const runs = [0, 1, 2].map(() => {
      const began = performance.now()
      pack(items, { width: 1752 })
      return performance.now() - began
    })

    expect(Math.min(...runs)).toBeLessThan(250)
  })
})

describe('the reading order', () => {
  it('is by row, then column', () => {
    const placements = [{ row: 10, column: 0 }, { row: 0, column: 2 }, { row: 0, column: 0 }, { row: 10, column: 1 }]

    expect(visualOrder(placements)).toEqual([2, 1, 0, 3])
  })
})

describe('the Wall\'s CSS', () => {
  // wall-layout.js counts the card's chrome; viewer.css draws it. A mismatch would overlap cards.
  const css = readFileSync(new URL('../../../css/viewer.css', import.meta.url), 'utf8')
  const rule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''

  it('draws the chrome the packing counts', () => {
    expect(rule('.plantuml-viewer__card')).toMatch(/padding: 4px;[\s\S]*border: 1px solid/)
    expect(rule('.plantuml-viewer__card')).toMatch(/gap: 4px;/)
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__caption')).toMatch(/height: 34px;/)
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__sheet')).toMatch(/padding: 16px;/)
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__sheet')).toMatch(/height: var\(--plantuml-wall-height, 240px\);/)
    expect(rule('.plantuml-viewer__stage--wall')).toMatch(/grid-auto-rows: 8px;[\s\S]*column-gap: 16px;/)
  })

  it('cuts a long name short in the caption with an ellipsis', () => {
    const name = rule('.plantuml-viewer__stage--wall .plantuml-viewer__caption-name')
    expect(name).toMatch(/min-width: 0;/)
    expect(name).toMatch(/overflow: hidden;/)
    expect(name).toMatch(/text-overflow: ellipsis;/)
    expect(name).toMatch(/white-space: nowrap;/)
  })

  it('keeps a card within the columns it spans', () => {
    // A grid item is at least as wide as its content by default: a sideways-scrolling card would widen past its span.
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__card')).toMatch(/min-width: 0;/)
  })
})
