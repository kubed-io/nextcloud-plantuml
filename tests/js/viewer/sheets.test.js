// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSheets } from '../../../src/viewer/sheets.js'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><text>login</text></svg>'
const svgAnswer = () => new Response(SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
const settled = (element) => new Promise((resolve) => element.addEventListener('plantuml-viewer:settled', resolve, { once: true }))

describe('a sheet', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => vi.unstubAllGlobals())

  it('draws the diagram at its position inline, asked by its 0-based index, named for a screen reader', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheet = createSheets('/Diagrams/Screens.puml', { labelOf: () => 'login' }).sheet(2)
    await settled(sheet)

    expect(fetch.mock.calls[0][0]).toBe('/index.php/apps/plantuml/render?path=%2FDiagrams%2FScreens.puml&index=1')
    expect(sheet.querySelector('svg text').textContent).toBe('login')
    expect(sheet.getAttribute('aria-label')).toBe('login')
  })

  it('gives each sheet its own id prefix', async () => {
    const withId = '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="f"/></defs><rect filter="url(#f)"/></svg>'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(withId, { status: 200 })))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const [first, second] = [sheets.sheet(1), sheets.sheet(2)]
    await Promise.all([settled(first), settled(second)])

    const ids = [first, second].map((sheet) => sheet.querySelector('filter').id)
    expect(new Set(ids).size).toBe(2)
  })

  it('shows the problem the route answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"not set"}', { status: 503 })))
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)
    await settled(sheet)

    expect(sheet.textContent).toBe('not set')
  })

  it("shows the route's words for a missing diagram as they are, never as an index", async () => {
    // GET /render counts from 1 in its problem, whatever index it was asked.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"no diagram 3"}', { status: 404 })))
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(3)
    await settled(sheet)

    expect(sheet.textContent).toBe('no diagram 3')
  })

  it.each([
    ['an error page', () => new Response('<html>Internal Server Error</html>', { status: 500 })],
    ['an SVG that sanitises to nothing', () => new Response('<script>alert(1)</script>', { status: 200 })],
    ['no answer', () => { throw new TypeError('Failed to fetch') }],
  ])('shows one fixed line for %s', async (_what, answer) => {
    vi.stubGlobal('fetch', vi.fn(async () => answer()))
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)
    await settled(sheet)

    expect(sheet.textContent).toBe('Could not draw the diagram')
  })

  it('asks once for a position, however often it is shown', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const first = sheets.sheet(1)
    await settled(first)

    expect(sheets.sheet(1)).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops what is pending when destroyed', async () => {
    let signal
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}) }))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    sheets.sheet(1)

    sheets.destroy()

    expect(signal.aborted).toBe(true)
  })
})
