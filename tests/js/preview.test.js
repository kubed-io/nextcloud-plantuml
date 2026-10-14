// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancel, debouncedRender, render } from '../../src/editor/preview.js'

const svg = () => new Response('<svg/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })

// RenderController::problem(): JSONResponse(['problem' => …], 503).
const problem = (name) => new Response(JSON.stringify({ problem: name }), {
  status: 503,
  headers: { 'Content-Type': 'application/json' },
})

beforeEach(() => {
  vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}`, requestToken: 'tok' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('render', () => {
  it('posts the source as JSON with the request token', async () => {
    const fetch = vi.fn(async () => svg())
    vi.stubGlobal('fetch', fetch)

    await render('@startuml\n@enduml\n')

    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/render', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', requesttoken: 'tok' },
      body: JSON.stringify({ source: '@startuml\n@enduml\n' }),
    })
  })

  it('resolves with the SVG\'s text, for the editor to draw inline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => svg()))

    expect(await render('@startuml\n@enduml\n')).toBe('<svg/>')
  })

  it('rejects with the problem the render route names', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => problem('unreachable')))

    await expect(render('@startuml\n@enduml\n')).rejects.toThrow('unreachable')
  })

  it('rejects with one fixed line when a proxy answers with an error page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>\n<h1>500 Internal Server Error</h1>\n</html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })))

    await expect(render('@startuml\n@enduml\n')).rejects.toThrow(/^Could not draw the diagram$/)
  })

  it('rejects with the same line for JSON that names no problem, as an expired session\'s does', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"CSRF check failed"}', {
      status: 412,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(render('@startuml\n@enduml\n')).rejects.toThrow(/^Could not draw the diagram$/)
  })

  it('rejects with the same line when a success is not an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Log in</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))

    await expect(render('@startuml\n@enduml\n')).rejects.toThrow(/^Could not draw the diagram$/)
  })
})

describe('a mistake in the diagram', () => {
  // Header values read off plantuml/plantuml-server 1.2026.8 for each source:
  // it counts lines from 0 at the top of the source, blank lines and comments too.
  const BAD = 'this is (( bad'
  const mistaken = (line) => new Response('<svg/>', {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'X-PlantUML-Diagram-Error': 'Syntax Error? (Assumed diagram type: sequence)',
      'X-PlantUML-Diagram-Error-Line': line,
    },
  })

  beforeEach(() => vi.useFakeTimers())

  it.each([
    ['@startuml on the first line', `@startuml\nA -> B\n${BAD}\n@enduml\n`, '2'],
    ['blank lines before @startuml', `\n\n@startuml\nA -> B\n${BAD}\n@enduml\n`, '4'],
    ['a comment before @startuml', `' comment\n\n@startuml\nA -> B\n${BAD}\n@enduml\n`, '4'],
    ['a block comment inside', `@startuml\n/' a\nb\n'/\nA -> B\n${BAD}\n@enduml\n`, '5'],
  ])('is handed over with the document line it is on, with %s', async (_what, source, header) => {
    vi.stubGlobal('fetch', vi.fn(async () => mistaken(header)))
    const cb = vi.fn()

    debouncedRender(source, cb)
    await vi.advanceTimersByTimeAsync(300)

    const [error, svgText, mistake] = cb.mock.calls[0]
    expect(error).toBeNull()
    expect(svgText).toBe('<svg/>')
    expect(mistake.message).toBe('Syntax Error? (Assumed diagram type: sequence)')
    expect(source.split('\n')[mistake.line - 1]).toBe(BAD)
  })

  it('is no mistake when the server names none, or no line for it', async () => {
    const cb = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => svg()))
    debouncedRender('a', cb)
    await vi.advanceTimersByTimeAsync(300)
    vi.stubGlobal('fetch', vi.fn(async () => mistaken('')))
    debouncedRender('b', cb)
    await vi.advanceTimersByTimeAsync(300)

    expect(cb.mock.calls.map((call) => call[2])).toEqual([null, null])
  })

  it('still resolves render() with the image alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mistaken('2')))

    expect(await render('@startuml\n@enduml\n')).toBe('<svg/>')
  })
})

describe('debouncedRender', () => {
  beforeEach(() => vi.useFakeTimers())

  it('collapses three changes inside 100 ms into one render of the last source', async () => {
    const fetch = vi.fn(async () => svg())
    vi.stubGlobal('fetch', fetch)
    const cb = vi.fn()

    debouncedRender('a', cb)
    await vi.advanceTimersByTimeAsync(50)
    debouncedRender('ab', cb)
    await vi.advanceTimersByTimeAsync(50)
    debouncedRender('abc', cb)
    await vi.advanceTimersByTimeAsync(299)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ source: 'abc' })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0]).toBeNull()
    expect(cb.mock.calls[0][1]).toBe('<svg/>')
  })

  it('hands the problem to the callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => problem('not set')))
    const cb = vi.fn()

    debouncedRender('a', cb)
    await vi.advanceTimersByTimeAsync(300)

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb.mock.calls[0][0].message).toBe('not set')
  })

  it('drops a slow answer to a source that has since changed', async () => {
    let answerFirst
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
      .mockImplementationOnce(async () => svg())
    vi.stubGlobal('fetch', fetch)
    const cb = vi.fn()

    debouncedRender('old', cb)
    await vi.advanceTimersByTimeAsync(300)
    debouncedRender('new', cb)
    await vi.advanceTimersByTimeAsync(300)
    answerFirst(svg())
    await vi.advanceTimersByTimeAsync(0)

    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('keeps one render in flight and sends only the newest source after it', async () => {
    let answerFirst
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
      .mockImplementation(async () => svg())
    vi.stubGlobal('fetch', fetch)
    const cb = vi.fn()

    debouncedRender('first', cb)
    await vi.advanceTimersByTimeAsync(300)
    for (const source of ['second', 'third', 'fourth']) {
      debouncedRender(source, cb)
      await vi.advanceTimersByTimeAsync(300)
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    answerFirst(svg())
    await vi.advanceTimersByTimeAsync(0)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ source: 'fourth' })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('sends nothing once cancelled', async () => {
    const fetch = vi.fn(async () => svg())
    vi.stubGlobal('fetch', fetch)

    debouncedRender('a', vi.fn())
    cancel()
    await vi.advanceTimersByTimeAsync(300)

    expect(fetch).not.toHaveBeenCalled()
  })
})
