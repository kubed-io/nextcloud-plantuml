// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// L10: the editor bar at phone width. Comments out; media blocks are read apart from the base rules.
const css = readFileSync('css/editor.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
// The media block is cut out by balanced braces, so a rule or a second @media after it is not read as part of it.
const OPEN = '@media (max-width: 600px) {'
const at = css.indexOf(OPEN)
let depth = 1
let end = at + OPEN.length
while (at >= 0 && depth && end < css.length) {
  const c = css[end++]
  depth += c === '{' ? 1 : c === '}' ? -1 : 0
}
const media = at < 0 ? '' : css.slice(at + OPEN.length, end - 1)
const base = at < 0 ? css : css.slice(0, at) + css.slice(end)

const rulesOf = (text) => [...text.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
  selectors: selector.split(',').map((s) => s.trim()),
  body,
}))
const declared = (text, selector) => rulesOf(text)
  .filter((rule) => rule.selectors.includes(selector))
  .map((rule) => rule.body)
  .join(';')
const has = (body, property, value) => new RegExp(`(^|[;\\s])${property}:\\s*${value}\\s*(;|$)`).test(body)

describe('the editor bar at phone width (L10)', () => {
  it('lets the status give way with an ellipsis', () => {
    const body = declared(base, '.plantuml-editor__status')
    expect(has(body, 'min-width', '0')).toBe(true)
    expect(has(body, 'overflow', 'hidden')).toBe(true)
    expect(has(body, 'text-overflow', 'ellipsis')).toBe(true)
    expect(has(body, 'white-space', 'nowrap')).toBe(true)
  })

  it('lets the name shrink to its ellipsis', () => {
    expect(has(declared(base, '.plantuml-editor__name'), 'min-width', '0')).toBe(true)
  })

  it.each(['source-toggle', 'refresh', 'save', 'close', 'reload', 'copy'])('never shrinks the %s button', (name) => {
    const body = rulesOf(base)
      .filter((rule) => rule.selectors.some((s) => s.endsWith(`.plantuml-editor__${name}`)))
      .map((rule) => rule.body)
      .join(';')
    expect(has(body, 'flex-shrink', '0')).toBe(true)
  })

  it('wraps the bar under 600px, the status sharing the second row', () => {
    expect(media).not.toBe('')
    const bar = declared(media, '.plantuml-editor__bar')
    expect(has(bar, 'flex-wrap', 'wrap')).toBe(true)
    expect(has(bar, 'height', 'auto')).toBe(true)
    expect(has(bar, 'min-height', '50px')).toBe(true)
    expect(has(bar, 'row-gap', '0')).toBe(true)
    const after = declared(media, '.plantuml-editor__bar::after')
    expect(has(after, 'content', "''")).toBe(true)
    expect(has(after, 'order', '1')).toBe(true)
    expect(has(after, 'flex-basis', '100%')).toBe(true)
    for (const name of ['status', 'reload', 'copy']) {
      expect(has(declared(media, `.plantuml-editor__${name}`), 'order', '2')).toBe(true)
      expect(has(declared(media, `.plantuml-editor__${name}`), 'margin-top', '8px')).toBe(true)
    }
    expect(has(declared(media, '.plantuml-editor__status'), 'flex', '1 1 0')).toBe(true)
    expect(has(declared(base, '.plantuml-editor__bar'), 'flex-wrap', 'wrap')).toBe(false)
  })

  it('hides an empty status, so a saved bar stays one row', () => {
    expect(has(declared(media, '.plantuml-editor__status:empty'), 'display', 'none')).toBe(true)
  })
})

describe('the panes at phone width (L11)', () => {
  it('shows the source alone when Source is pressed, inside the phone block only', () => {
    for (const pane of ['diagram', 'splitter']) {
      expect(has(declared(media, `.plantuml-editor--source-only .plantuml-editor__${pane}`), 'display', 'none')).toBe(true)
      expect(declared(base, `.plantuml-editor--source-only .plantuml-editor__${pane}`)).toBe('')
    }
    expect(has(declared(media, '.plantuml-editor--source-only .plantuml-editor__panes'), 'grid-template-columns', 'minmax\\(0, 1fr\\)')).toBe(true)
    expect(declared(base, '.plantuml-editor--source-only .plantuml-editor__panes')).toBe('')
  })
})

// F2: a length as the browser takes it here: Nextcloud's clickable area falls back to 34px.
const valueOf = (body, property) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+?)\\s*(?:;|$)`).exec(body)?.[1]
const px = (value) => Number(/^(?:var\(--default-clickable-area, )?(\d+(?:\.\d+)?)px\)?$/.exec(value ?? '')?.[1] ?? Number.NaN)
const NEW = '.plantuml-editor__add button.plantuml-editor__add-new'
const TYPE = '.plantuml-editor__add button.plantuml-editor__add-type'
const CRUMB = '.plantuml-editor__bar button.plantuml-editor__crumb'

describe('the bar\'s small targets, as big as its 34 px buttons (A1, R11)', () => {
  it.each([NEW, TYPE])('makes %s at least 34 px wide', (selector) => {
    const body = declared(base, selector)
    expect(Math.max(px(valueOf(body, 'width')), px(valueOf(body, 'min-width')) || 0)).toBeGreaterThanOrEqual(34)
  })

  it('gives the halves the pill\'s whole 34 px height: its outline is drawn over them, not round them', () => {
    const pill = declared(base, '.plantuml-editor__add')
    expect(px(valueOf(pill, 'height'))).toBe(34)
    // A border would take 2 px of the halves' height.
    expect(valueOf(pill, 'border')).toBeUndefined()
    expect(has(pill, 'position', 'relative')).toBe(true)
    expect(has(pill, 'align-items', 'stretch')).toBe(true)
    for (const selector of [NEW, TYPE]) {
      expect(has(declared(base, selector), 'height', 'auto')).toBe(true)
    }
    const ring = declared(base, '.plantuml-editor__add::after')
    expect(has(ring, 'content', "''")).toBe(true)
    expect(has(ring, 'position', 'absolute')).toBe(true)
    expect(has(ring, 'inset', '0')).toBe(true)
    expect(has(ring, 'border', '1px solid var\\(--color-border-dark\\)')).toBe(true)
    expect(has(ring, 'border-radius', 'inherit')).toBe(true)
    expect(has(ring, 'pointer-events', 'none')).toBe(true)
    // The keyboard ring is the same outline in the primary colour, 2 px.
    const focus = declared(base, '.plantuml-editor__add:has(:focus-visible)::after')
    expect(has(focus, 'border-color', 'var\\(--color-primary-element\\)')).toBe(true)
    expect(has(focus, 'box-shadow', 'inset 0 0 0 1px var\\(--color-primary-element\\)')).toBe(true)
  })

  it('makes the main file\'s crumb at least 34 × 34 px, still giving way with an ellipsis', () => {
    const body = declared(base, CRUMB)
    expect(px(valueOf(body, 'min-width'))).toBeGreaterThanOrEqual(34)
    expect(px(valueOf(body, 'min-height'))).toBeGreaterThanOrEqual(34)
    expect(px(valueOf(body, 'line-height'))).toBeGreaterThanOrEqual(34)
    expect(has(body, 'text-overflow', 'ellipsis')).toBe(true)
  })

  it('keeps them so at phone width', () => {
    for (const selector of [NEW, TYPE, CRUMB, '.plantuml-editor__add']) {
      expect(declared(media, selector)).toBe('')
    }
  })
})

describe('the Add diagram modal at phone width (A3)', () => {
  it('stacks the types above the templates, inside the phone block only', () => {
    expect(has(declared(media, '.plantuml-add__body'), 'flex-direction', 'column')).toBe(true)
    expect(has(declared(base, '.plantuml-add__body'), 'flex-direction', 'column')).toBe(false)
    // The divider turns to lie between them.
    const divider = declared(media, '.plantuml-add__divider')
    expect(has(divider, 'width', 'auto')).toBe(true)
    expect(has(divider, 'height', '1px')).toBe(true)
  })

  it('gives the types the full width, never the 40 % column a type name does not fit at 360', () => {
    const left = declared(media, '.plantuml-add__left')
    expect(has(left, 'width', 'auto')).toBe(true)
    // A share of the body's height, so the templates keep the rest; the types scroll inside it.
    expect(has(left, 'max-height', '45%')).toBe(true)
    expect(has(left, 'flex', 'none')).toBe(true)
  })

  it('scrolls the types up and down only, sized to their rows and shrinking under the cap', () => {
    const types = declared(media, '.plantuml-add__types')
    expect(has(types, 'flex', '0 1 auto')).toBe(true)
    expect(has(types, 'overflow-x', 'hidden')).toBe(true)
    expect(has(declared(base, '.plantuml-add__types'), 'overflow-y', 'auto')).toBe(true)
  })

  it('never lets a type\'s count give way to its name', () => {
    expect(has(declared(base, '.plantuml-add__count') + ';' + declared(media, '.plantuml-add__count'), 'flex', 'none')).toBe(true)
  })

  it('leaves the templates the rest, scrolling as before', () => {
    expect(has(declared(base, '.plantuml-add__right'), 'overflow-y', 'auto')).toBe(true)
    expect(has(declared(base, '.plantuml-add__right'), 'flex', '1')).toBe(true)
    expect(declared(media, '.plantuml-add__right')).not.toMatch(/overflow|flex:/)
  })
})
