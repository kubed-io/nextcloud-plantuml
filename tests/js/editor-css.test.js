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
