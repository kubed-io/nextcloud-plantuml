// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSheets, sizeOf } from '../../../src/viewer/sheets.js'
import { createPageCache, sheetKey } from '../../../src/viewer/page-cache.js'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><text>login</text></svg>'
const WITH_ID = '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="f"/></defs><rect filter="url(#f)"/></svg>'
const svgAnswer = (body = SVG, headers = {}) => new Response(body, { status: 200, headers: { 'Content-Type': 'image/svg+xml', ...headers } })
const settled = (element) => new Promise((resolve) => element.addEventListener('plantuml-viewer:settled', resolve, { once: true }))
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const asked = (fetch) => fetch.mock.calls.map(([url]) => new URL(url, 'https://x').searchParams.get('index'))
const ifNoneMatch = ([, init]) => new Headers(init.headers).get('If-None-Match')

/** A sheet asked for and drawn. */
async function drawn(sheets, position) {
  const sheet = sheets.sheet(position)
  const done = settled(sheet)
  sheets.request(position)
  return { sheet, event: await done }
}

describe('a sheet', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => vi.unstubAllGlobals())

  it('draws the diagram at its position inline, asked by its 0-based index, named for a screen reader', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const { sheet } = await drawn(createSheets('/Diagrams/Screens.puml', { labelOf: () => 'login' }), 2)

    expect(fetch.mock.calls[0][0]).toBe('/index.php/apps/plantuml/render?path=%2FDiagrams%2FScreens.puml&index=1')
    expect(sheet.querySelector('svg text').textContent).toBe('login')
    expect(sheet.getAttribute('aria-label')).toBe('login')
  })

  it('gives each sheet its own id prefix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => svgAnswer(WITH_ID)))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const [first, second] = await Promise.all([drawn(sheets, 1), drawn(sheets, 2)])

    const ids = [first, second].map(({ sheet }) => sheet.querySelector('filter').id)
    expect(new Set(ids).size).toBe(2)
  })

  it('prefixes its SVG ids with the prefix it is given', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => svgAnswer(WITH_ID)))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a', idPrefix: 'view-7-' }), 2)

    expect(sheet.querySelector('filter').id).toBe('view-7-2-f')
  })

  it('swaps its spinner for the problem the route answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"not set"}', { status: 503 })))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 1)

    expect(sheet.querySelector('.plantuml-viewer__problem').textContent).toBe('not set')
    expect(sheet.textContent).toBe('not set')
    expect(sheet.querySelector('.plantuml-viewer__spinner')).toBeNull()
    expect(sheet.classList.contains('plantuml-viewer__sheet--loading')).toBe(false)
  })

  it("shows the route's words for a missing diagram as they are, never as an index", async () => {
    // GET /render counts from 1 in its problem, whatever index it was asked.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"no diagram 3"}', { status: 404 })))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 3)

    expect(sheet.textContent).toBe('no diagram 3')
  })

  it.each([
    ['an error page', () => new Response('<html>Internal Server Error</html>', { status: 500 })],
    ['an SVG that sanitises to nothing', () => new Response('<script>alert(1)</script>', { status: 200 })],
    ['no answer', () => { throw new TypeError('Failed to fetch') }],
  ])('shows one fixed line for %s', async (_what, answer) => {
    vi.stubGlobal('fetch', vi.fn(async () => answer()))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 1)

    expect(sheet.textContent).toBe('Could not draw the diagram')
  })

  it('asks once for a position, however often it is asked for', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const { sheet } = await drawn(sheets, 1)
    sheets.request(1)

    expect(sheets.sheet(1)).toBe(sheet)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops what is pending when destroyed', async () => {
    let signal
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}) }))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    sheets.request(1)

    sheets.destroy()

    expect(signal.aborted).toBe(true)
  })
})

describe('a failed sheet (VW10, VW1)', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks again, when next asked, for a sheet that got no answer or a 5xx (VW10)', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('{"problem":"unreachable"}', { status: 503 }))
      .mockResolvedValue(svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const sheet = sheets.sheet(1)

    await drawn(sheets, 1)
    expect(sheet.textContent).toBe('Could not draw the diagram')
    let again = settled(sheet)
    sheets.request(1)
    await again
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sheet.textContent).toBe('unreachable')
    again = settled(sheet)
    sheets.request(1)
    await again
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sheet.querySelector('svg')).not.toBeNull()
  })

  it.each([
    ['a missing image', () => new Response('{"problem":"no image for three"}', { status: 404 })],
    ['a file too large', () => new Response('{"problem":"too large"}', { status: 413 })],
  ])('never asks again for the route\'s own refusal, %s (VW10)', async (_what, answer) => {
    const fetch = vi.fn(async () => answer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    await drawn(sheets, 1)
    sheets.request(1)
    await tick()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks nothing again by itself after a failure (VW10)', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => new Response('{"problem":"unreachable"}', { status: 502 }))
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const { sheet } = await drawn(sheets, 1)

    await vi.advanceTimersByTimeAsync(5000)
    sheet.dispatchEvent(new CustomEvent('plantuml-viewer:settled', { detail: { size: null } }))
    await vi.advanceTimersByTimeAsync(5000)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reads a problem as text, not as an image (VW1)', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"problem":"no image for three"}', { status: 500 }))
      .mockResolvedValue(svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'login' })
    const { sheet } = await drawn(sheets, 1)

    expect(sheet.hasAttribute('role')).toBe(false)
    expect(sheet.hasAttribute('aria-label')).toBe(false)
    expect(sheet.textContent).toBe('no image for three')
    const again = settled(sheet)
    sheets.request(1)
    await again
    expect(sheet.getAttribute('role')).toBe('img')
    expect(sheet.getAttribute('aria-label')).toBe('login')
  })
})

describe('a sheet still loading (VW9)', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => vi.unstubAllGlobals())

  it('shows the loading spinner, busy for a screen reader, until its diagram lands', async () => {
    let answer
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { answer = resolve })))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const sheet = sheets.sheet(1)
    const done = settled(sheet)
    sheets.request(1)

    expect(sheet.classList.contains('plantuml-viewer__sheet--loading')).toBe(true)
    expect(sheet.querySelector('.plantuml-viewer__spinner')).not.toBeNull()
    expect(sheet.getAttribute('aria-busy')).toBe('true')

    answer(svgAnswer())
    await done

    expect(sheet.classList.contains('plantuml-viewer__sheet--loading')).toBe(false)
    expect(sheet.querySelector('.plantuml-viewer__spinner')).toBeNull()
    expect(sheet.hasAttribute('aria-busy')).toBe(false)
    expect(sheet.querySelector('svg')).not.toBeNull()
  })

  it('shows the spinner before it is asked for, so a card waiting its turn has its height', () => {
    vi.stubGlobal('fetch', vi.fn())
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)

    expect(sheet.querySelector('.plantuml-viewer__spinner')).not.toBeNull()
  })
})

describe('what is asked for (VW10)', () => {
  let pending
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    pending = []
    vi.stubGlobal('fetch', vi.fn((url) => new Promise((resolve) => pending.push({ url, resolve }))))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('draws nothing until a sheet is asked for', async () => {
    createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)
    await tick()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('has at most three under way, the lowest position waiting going next', async () => {
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    for (const position of [1, 2, 3, 7, 5, 6, 4]) {
      sheets.request(position)
    }
    expect(asked(fetch)).toEqual(['0', '1', '2'])

    pending.shift().resolve(svgAnswer())
    await tick()
    expect(asked(fetch)).toEqual(['0', '1', '2', '3'])
  })

  it('lets a sheet go that is no longer wanted before its turn', async () => {
    const sheets = createSheets('/D/S.puml', { parallel: 1, labelOf: () => 'a' })
    sheets.request(1)
    sheets.request(2)
    sheets.release(2)
    sheets.release(1)

    pending.shift().resolve(svgAnswer())
    await tick()

    expect(asked(fetch)).toEqual(['0'])
  })

  it('clears what waits, never what is under way', async () => {
    const sheets = createSheets('/D/S.puml', { parallel: 1, labelOf: () => 'a' })
    sheets.request(1)
    sheets.request(2)
    sheets.clear()
    pending.shift().resolve(svgAnswer())
    await tick()

    expect(asked(fetch)).toEqual(['0'])
    sheets.request(2)
    expect(asked(fetch)).toEqual(['0', '1'])
  })
})

describe('the page cache (VW11)', () => {
  const NEW = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"><text>new</text></svg>'
  const key = sheetKey('/D/S.puml', '"e"', 0)
  let fetch
  let cache
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = vi.fn(async () => svgAnswer(WITH_ID, { ETag: '"srv1"' }))
    vi.stubGlobal('fetch', fetch)
    cache = createPageCache()
  })
  afterEach(() => vi.unstubAllGlobals())

  const sheetsOf = (etag, idPrefix = 'view-1-') => createSheets('/D/S.puml', { etag, cache, idPrefix, labelOf: () => 'a' })

  it('draws a kept sheet at once, through its own view prefix, then checks it by the ETag the server drew it with', async () => {
    await drawn(sheetsOf('"e"'), 2)
    // The check never answers: the drawing does not wait for it.
    fetch.mockImplementation(() => new Promise(() => {}))
    const sheets = sheetsOf('"e"', 'view-2-')
    const sheet = sheets.sheet(2)
    const done = vi.fn()
    sheet.addEventListener('plantuml-viewer:settled', done)
    sheets.request(2)

    expect(done).toHaveBeenCalledOnce()
    expect(sheet.querySelector('filter').id).toBe('view-2-2-f')
    expect(sheet.querySelector('.plantuml-viewer__spinner')).toBeNull()
    expect(asked(fetch)).toEqual(['1', '1'])
    expect(ifNoneMatch(fetch.mock.calls[1])).toBe('"srv1"')
  })

  it('checks a kept sheet by the ETag the route gave, without the web server\'s -gzip', async () => {
    fetch.mockImplementation(async () => svgAnswer(WITH_ID, { ETag: '"srv1-gzip"' }))
    await drawn(sheetsOf('"e"'), 1)
    fetch.mockImplementation(() => new Promise(() => {}))
    sheetsOf('"e"', 'view-2-').request(1)

    expect(ifNoneMatch(fetch.mock.calls[1])).toBe('"srv1"')
  })

  it('draws anew a kept sheet the server has drawn anew, its size and what is kept with it', async () => {
    await drawn(sheetsOf('"e"'), 1)
    fetch.mockImplementation(async () => svgAnswer(NEW, { ETag: '"srv2"' }))
    const sheets = sheetsOf('"e"', 'view-2-')
    const sheet = sheets.sheet(1)
    sheets.request(1)
    const { detail } = await settled(sheet)

    expect(sheet.querySelector('svg text').textContent).toBe('new')
    expect(detail.size).toEqual({ width: 80, height: 30 })
    expect(sheets.sizeOf(1)).toEqual({ width: 80, height: 30 })
    expect(cache.get(key)).toEqual({ svg: NEW, size: { width: 80, height: 30 }, serverEtag: '"srv2"' })
  })

  it('gives a drawing that replaces a kept one, after a 200 check, its own view prefix', async () => {
    await drawn(sheetsOf('"e"'), 1)
    fetch.mockImplementation(async () => svgAnswer(WITH_ID, { ETag: '"srv2"' }))
    const sheets = sheetsOf('"e"', 'view-2-')
    const sheet = sheets.sheet(1)
    // Drawn from memory at once; the check answers 200 on a later task and replaces the drawing.
    const replaced = new Promise((resolve) => sheet.addEventListener('plantuml-viewer:settled', resolve, { once: true }))
    sheets.request(1)
    await replaced
    const fromMemory = sheet.querySelector('svg')
    await tick()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sheet.querySelector('svg')).not.toBe(fromMemory)
    expect(sheet.querySelector('filter').id).toBe('view-2-1-f')
    expect(sheet.querySelector('rect').getAttribute('filter')).toBe('url(#view-2-1-f)')
    expect(cache.get(key).serverEtag).toBe('"srv2"')
  })

  it.each([
    ['the server has it unchanged', () => new Response(null, { status: 304, headers: { ETag: '"srv1"' } })],
    ['the server refuses', () => new Response('{"problem":"not set"}', { status: 503 })],
    ['the server cannot be reached', () => { throw new TypeError('Failed to fetch') }],
  ])('keeps a kept drawing as it is when %s', async (_what, answer) => {
    await drawn(sheetsOf('"e"'), 1)
    const kept = cache.get(key)
    fetch.mockImplementation(async () => answer())
    const sheets = sheetsOf('"e"', 'view-2-')
    const sheet = sheets.sheet(1)
    sheets.request(1)
    await tick()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sheet.querySelector('filter').id).toBe('view-2-1-f')
    expect(sheet.querySelector('.plantuml-viewer__problem')).toBeNull()
    expect(cache.get(key)).toBe(kept)
    expect(kept).toEqual({ svg: WITH_ID, size: null, serverEtag: '"srv1"' })
  })

  it('draws a sheet never drawn before it checks those drawn from memory, each in file order', async () => {
    for (const position of [1, 2, 3, 4]) {
      await drawn(sheetsOf('"e"'), position)
    }
    fetch.mockImplementation(() => new Promise(() => {}))
    const sheets = sheetsOf('"e"', 'view-2-')
    sheets.request(1, 2, 3, 4, 5)

    expect([1, 2, 3, 4].map((position) => sheets.sheet(position).querySelector('svg') !== null)).toEqual([true, true, true, true])
    expect(asked(fetch).slice(4)).toEqual(['4', '0', '1'])
  })

  it('asks again once the file has a new ETag', async () => {
    await drawn(sheetsOf('"e"'), 1)
    await drawn(sheetsOf('"f"'), 1)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(ifNoneMatch(fetch.mock.calls[1])).toBeNull()
  })

  it('keeps no failure', async () => {
    fetch.mockImplementationOnce(async () => new Response('{"problem":"not set"}', { status: 503 }))
    await drawn(sheetsOf('"e"'), 1)
    expect(cache.size).toBe(0)

    const { sheet } = await drawn(sheetsOf('"e"'), 1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(ifNoneMatch(fetch.mock.calls[1])).toBeNull()
    expect(sheet.querySelector('svg')).not.toBeNull()
  })

  it('keeps nothing for a file read without an ETag', async () => {
    await drawn(sheetsOf(undefined), 1)
    await drawn(sheetsOf(undefined), 1)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(0)
  })

  it.each([
    ['the ETag it sent', { ETag: '"srv1"' }, '"srv1"'],
    ['null, when it sent none', {}, null],
  ])("keeps the server's text with the size it was drawn at and, for the server's ETag, %s", async (_what, headers, serverEtag) => {
    fetch.mockImplementation(async () => svgAnswer(SVG, headers))
    await drawn(sheetsOf('"e"'), 1)

    expect(cache.get(key)).toEqual({ svg: SVG, size: { width: 40, height: 20 }, serverEtag })
  })
})

describe('the size a diagram was drawn at', () => {
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.stubGlobal('fetch', vi.fn(async () => svgAnswer()))
  })
  afterEach(() => vi.unstubAllGlobals())

  const svgWith = (attributes) => new DOMParser()
    .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}/>`, 'image/svg+xml').documentElement

  it('is said with the settled event, and kept by the sheets', async () => {
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const { event } = await drawn(sheets, 1)

    expect(event.detail.size).toEqual({ width: 40, height: 20 })
    expect(sheets.sizeOf(1)).toEqual({ width: 40, height: 20 })
    expect(sheets.sizeOf(2)).toBeNull()
  })

  it.each([
    ['its width and height in px', 'width="123px" height="45px" viewBox="0 0 10 10"', { width: 123, height: 45 }],
    ['its bare width and height', 'width="12.5" height="8"', { width: 12.5, height: 8 }],
    ['its viewBox, for a width in %', 'width="100%" height="100%" viewBox="0 0 300 150"', { width: 300, height: 150 }],
    ['its viewBox, with commas', 'viewBox="0,0,30,15"', { width: 30, height: 15 }],
    ['nothing, without either', '', null],
  ])('reads %s', (_what, attributes, size) => {
    expect(sizeOf(svgWith(attributes))).toEqual(size)
  })
})
