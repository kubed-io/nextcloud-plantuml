// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The component is a plain options object, so it is driven without a Vue
// runtime: its data and methods are called on a bare instance, and render()
// is handed an `h` that records what it was asked to draw.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import component from '../../src/viewer-component.js'

const h = (tag, data, children) => ({ tag, data, children })

function instance() {
  return { ...component.data(), filename: '/Diagrams/Order flow.puml', basename: 'Order flow.puml', doneLoading: vi.fn() }
}

/** What render() draws inside its wrapper. */
function drawn(vm) {
  return component.render.call(vm, h).children[0]
}

describe('viewer component', () => {
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('draws the diagram from the render route', () => {
    const img = drawn(instance())
    expect(img.tag).toBe('img')
    expect(img.data.attrs.src).toBe('/index.php/apps/plantuml/render?path=%2FDiagrams%2FOrder%20flow.puml')
  })

  it('shows the problem the render route answered with', async () => {
    // RenderController::problem(): JSONResponse(['problem' => …], 503).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"unreachable"}', {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })))
    const vm = instance()

    await component.methods.showProblem.call(vm)

    expect(vm.problem).toBe('unreachable')
    expect(drawn(vm)).toMatchObject({ tag: 'p', children: 'unreachable' })
    expect(vm.doneLoading).toHaveBeenCalled()
  })

  it.each([
    ['a plain-text failure', () => new Response('Bad gateway\nupstream detail', { status: 502 })],
    ['an HTML error page', () => new Response('<html><body>Internal Server Error</body></html>', { status: 500 })],
    ['JSON that is not a problem', () => new Response('{"message":"CSRF check failed"}', { status: 412 })],
    ['a 404 with no body', () => new Response('', { status: 404 })],
  ])('shows one fixed line, as the editor does, for %s', async (_what, answer) => {
    vi.stubGlobal('fetch', vi.fn(async () => answer()))
    const vm = instance()

    await component.methods.showProblem.call(vm)

    expect(vm.problem).toBe('Could not draw the diagram')
  })

  it('shows the fixed line when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const vm = instance()

    await component.methods.showProblem.call(vm)

    expect(vm.problem).toBe('Could not draw the diagram')
  })

  it('keeps the image when the render answers 2xx after all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { status: 200 })))
    const vm = instance()

    await component.methods.showProblem.call(vm)

    expect(vm.problem).toBe('')
    expect(drawn(vm).tag).toBe('img')
  })
})
