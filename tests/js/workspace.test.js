// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The fixture is the DOM Text stable34 draws for a README: CodeBlockView.vue for
// a fence, ImageView.vue for an image. A .puml image is in ImageView's failed
// state (its preload of the WebDAV URL errors), so it holds the broken-image
// icon, never an <img>.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attach } from '../../src/readme/workspace.js'

const ORDER = '@startuml\nCustomer -> Shop: place order\n@enduml'
const CHARGE = '@startuml\nShop -> Payment: charge\n@enduml'

const fences = [
  { lang: 'plantuml', source: ORDER, index: 0 },
  { lang: 'mermaid', source: 'graph TD; A-->B', index: 1 },
  { lang: 'plantuml', source: CHARGE, index: 2 },
]
const images = [
  { alt: 'Order flow', src: 'Order flow.puml' },
  { alt: 'photo', src: 'photo.png' },
]

function codeBlock(mode, code) {
  return `<div class="code-block" data-mode="${mode}" data-node-view-wrapper="">
    <div class="code-block-header"><div class="view-switch"><button>Copy code</button></div></div>
    <div><pre class="split-view__code"><code data-node-view-content="">${code}</code></pre>
      <div class="split-view__preview" style="display: none;"></div></div>
  </div>`
}

const brokenImage = `<div data-node-view-wrapper="" contenteditable="false">
  <figure class="image image-view image-view--failed" data-component="image-view" data-attachment-type="image" data-src="Order%20flow.puml">
    <div class="image__view"><div class="media media__image"><a class="media-wrapper">
      <span class="material-design-icon image__main image__main--broken-icon"></span></a></div>
      <div class="image__caption"><figcaption>Order flow</figcaption></div></div>
    <small class="image__error-message">Failed to load Order%20flow.puml</small>
  </figure></div>`

const photo = `<div data-node-view-wrapper="" contenteditable="false">
  <figure class="image image-view" data-component="image-view" data-attachment-type="image" data-src="photo.png">
    <div class="image__view"><div class="media media__image"><a class="media-wrapper">
      <img class="image__main" src="/remote.php/dav/files/drk/Diagrams/photo.png" alt="photo"></a></div>
      <div class="image__caption"><figcaption>photo</figcaption></div></div>
  </figure></div>`

function workspace({ first = ORDER } = {}) {
  const root = document.createElement('div')
  root.className = 'ProseMirror'
  root.innerHTML = `<h1>Diagrams</h1>${codeBlock('code', first)}${codeBlock('preview', 'graph TD; A--&gt;B')}`
    + `${codeBlock('code', CHARGE)}<p>The same flow:</p>${brokenImage}${photo}`
  document.body.replaceChildren(root)
  return root
}

const blocks = (root) => [...root.querySelectorAll('.code-block')]
const figures = (root) => [...root.querySelectorAll('figure[data-component="image-view"]')]
/** What a reader sees: the elements no inline display:none hides. */
const shown = (el) => [...el.children].filter((c) => c.style.display !== 'none')

function svg() {
  return new Response('<svg/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
}

describe('attach', () => {
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.stubGlobal('fetch', vi.fn(async () => svg()))
    URL.createObjectURL = vi.fn(() => 'blob:diagram')
    URL.revokeObjectURL = vi.fn()
    document.head.dataset.requesttoken = 'token'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete URL.createObjectURL
    delete URL.revokeObjectURL
  })

  it('draws each plantuml fence and leaves the mermaid one alone', async () => {
    const root = workspace()
    const mermaid = blocks(root)[1].outerHTML

    await attach(root, { dir: '/Diagrams', fences, images })

    for (const block of [blocks(root)[0], blocks(root)[2]]) {
      const [img, ...rest] = shown(block)
      expect(img.tagName).toBe('IMG')
      expect(img.getAttribute('src')).toBe('blob:diagram')
      expect(rest).toEqual([])
      expect(block.dataset.plantuml).toBe('done')
    }
    expect(blocks(root)[1].outerHTML).toBe(mermaid)
  })

  it('asks the render route for each fence by its source', async () => {
    const root = workspace()
    await attach(root, { dir: '/Diagrams', fences, images })

    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/index.php/apps/plantuml/render')
    expect(init.method).toBe('POST')
    expect(init.headers.requesttoken).toBe('token')
    expect(JSON.parse(init.body)).toEqual({ source: ORDER })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ source: CHARGE })
  })

  it('draws a .puml image from the file beside the README and leaves other images alone', async () => {
    const root = workspace()
    const png = figures(root)[1].parentElement.outerHTML

    await attach(root, { dir: '/Diagrams', fences, images })

    const wrapper = figures(root)[0].parentElement
    const [drawn, ...rest] = shown(wrapper)
    expect(rest).toEqual([])
    expect(drawn.querySelector('img').getAttribute('src'))
      .toBe('/index.php/apps/plantuml/render?path=%2FDiagrams%2FOrder%20flow.puml')
    expect(drawn.querySelector('figcaption').textContent).toBe('Order flow')
    expect(figures(root)[0].dataset.plantuml).toBe('done')
    expect(figures(root)[1].parentElement.outerHTML).toBe(png)
  })

  it('resolves a .puml image relative to the README folder', async () => {
    const root = workspace()
    figures(root)[0].dataset.src = '../Shared/./Order%20flow.puml'

    await attach(root, { dir: '/Diagrams', fences, images: [] })

    expect(root.querySelector('img[src*="render?path"]').getAttribute('src'))
      .toBe('/index.php/apps/plantuml/render?path=%2FShared%2FOrder%20flow.puml')
  })

  it('keeps a click on a drawn diagram from reaching Text', async () => {
    const root = workspace()
    await attach(root, { dir: '/Diagrams', fences, images })
    const clicked = vi.fn()
    root.addEventListener('click', clicked)

    const drawn = root.querySelectorAll('img.plantuml-diagram')
    for (const img of drawn) {
      img.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }

    expect(drawn).toHaveLength(3)
    expect(clicked).not.toHaveBeenCalled()
  })

  it('draws each element once when Text re-renders around it', async () => {
    const root = workspace()
    await attach(root, { dir: '/Diagrams', fences, images })
    await attach(root, { dir: '/Diagrams', fences, images })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(root.querySelectorAll('img.plantuml-diagram')).toHaveLength(3)
  })

  it('leaves Text\'s rendering in place when the server cannot draw', async () => {
    fetch.mockImplementation(async () => new Response('{"problem":"unreachable"}', { status: 503 }))
    const root = workspace()
    const before = blocks(root).map((b) => b.outerHTML)

    await attach(root, { dir: '/Diagrams', fences, images })

    expect(blocks(root).map((b) => b.outerHTML)).toEqual(before)
  })

  it('leaves a code block alone when its text is not the fence at its position', async () => {
    // An indented code block is a .code-block too, and shifts the numbering.
    const root = workspace({ first: 'indented code' })
    const before = blocks(root)[0].outerHTML

    await attach(root, { dir: '/Diagrams', fences, images })

    expect(blocks(root)[0].outerHTML).toBe(before)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
