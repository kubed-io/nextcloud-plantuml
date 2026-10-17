// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({ loadFile: vi.fn() }))
vi.mock('../../../src/editor/save.js', () => ({ loadFile: seams.loadFile }))
const { createDiagramView } = await import('../../../src/viewer/diagram-view.js')

const SCREENS = '@startuml nodes\nA -> B\n@enduml\n@startuml login\nC -> D\n@enduml\n'
const THREE = SCREENS + '@startuml p3\nE -> F\n@enduml\n'
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text>${label}</text></svg>`
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const tabs = (root) => [...root.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)
const shown = (root) => [...root.querySelectorAll('.plantuml-viewer__stage svg text')].map((text) => text.textContent)
const asked = (fetch) => fetch.mock.calls.map(([url]) => new URL(url, 'https://x').searchParams.get('index'))

let root
let fetch
beforeEach(() => {
  vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
  // Each index answers the drawing of its own name, as the route would.
  fetch = vi.fn(async (url) => {
    const index = Number(new URL(url, 'https://x').searchParams.get('index'))
    return new Response(svg(['nodes', 'login', 'p3'][index]), { status: 200 })
  })
  vi.stubGlobal('fetch', fetch)
  root = document.createElement('div')
  document.body.append(root)
})
afterEach(() => {
  root.remove()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('the Viewer, in Tabs', () => {
  it('reads the file once and gives each diagram a tab', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(seams.loadFile).toHaveBeenCalledOnce()
    expect(seams.loadFile).toHaveBeenCalledWith('/D/Screens.puml')
    expect(tabs(root)).toEqual(['nodes', 'login'])
  })

  it('holds the tab bar in a head over the scrolling stage', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    // The stage also carries the mode shown, as plantuml-viewer__stage--tabs.
    expect([...root.children].map((child) => child.classList[0])).toEqual(['plantuml-viewer__head', 'plantuml-viewer__stage'])
    expect(root.querySelector('.plantuml-viewer__head [role="tablist"]')).not.toBeNull()
  })

  it('gives two views on one page their own stage ids and SVG ids', async () => {
    // The Viewer keeps the file before hidden, its view built, beside the one shown.
    const withId = '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="f"/></defs><rect filter="url(#f)"/></svg>'
    fetch.mockImplementation(async () => new Response(withId, { status: 200 }))
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    const other = document.createElement('div')
    document.body.append(other)
    try {
      createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
      createDiagramView(other, { path: '/D/Other.puml', basename: 'Other.puml', onReady: vi.fn() })
      await settle()

      const stages = [root, other].map((view) => view.querySelector('.plantuml-viewer__stage').id)
      expect(new Set(stages).size).toBe(2)
      expect([root, other].map((view) => view.querySelector('[role="tab"]').getAttribute('aria-controls'))).toEqual(stages)
      const filters = [root, other].map((view) => view.querySelector('.plantuml-viewer__stage filter').id)
      expect(new Set(filters).size).toBe(2)
      expect(document.querySelectorAll(`[id="${filters[0]}"]`)).toHaveLength(1)
    } finally {
      other.remove()
    }
  })

  it('opens on the first diagram and draws only it', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(asked(fetch)).toEqual(['0'])
    expect(shown(root)).toEqual(['nodes'])
  })

  it('shows the diagram of the tab activated', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    root.querySelectorAll('[role="tab"]')[1].click()
    await settle()

    expect(asked(fetch)).toEqual(['0', '1'])
    expect(shown(root)).toEqual(['login'])
    expect(root.querySelectorAll('[role="tab"]')[1].getAttribute('aria-selected')).toBe('true')
  })

  it('asks by index, so a diagram named with digits is drawn where it sits', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml 2\nA -> B\n@enduml\n@startuml login\nC -> D\n@enduml\n', etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    root.querySelectorAll('[role="tab"]')[1].click()
    await settle()

    expect(fetch.mock.calls.map(([url]) => new URL(url, 'https://x').searchParams.has('diagram'))).toEqual([false, false])
    expect(asked(fetch)).toEqual(['0', '1'])
  })

  it('shows no tabs for a file of one diagram', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"e"' })
    createDiagramView(root, { path: '/D/One.puml', basename: 'One.puml', onReady: vi.fn() })
    await settle()

    expect(root.querySelector('.plantuml-viewer__tabbar').hidden).toBe(true)
  })

  it.each([
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ])('reads a %s file as its LF twin', async (_what, eol) => {
    seams.loadFile.mockResolvedValue({ content: SCREENS.replaceAll('\n', eol), etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(tabs(root)).toEqual(['nodes', 'login'])
  })

  it('reads a file that starts with a BOM as its twin without one', async () => {
    seams.loadFile.mockResolvedValue({ content: `\uFEFF${SCREENS}`, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(tabs(root)).toEqual(['nodes', 'login'])
  })

  it('is ready once, when the first sheet is drawn', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    const onReady = vi.fn()
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady })
    await settle()
    root.querySelectorAll('[role="tab"]')[1].click()
    await settle()

    expect(onReady).toHaveBeenCalledOnce()
  })

  it('says it could not draw when the file cannot be read, and is ready', async () => {
    seams.loadFile.mockRejectedValue(new Error('404'))
    const onReady = vi.fn()
    createDiagramView(root, { path: '/D/Gone.puml', basename: 'Gone.puml', onReady })
    await settle()

    expect(root.textContent).toBe('Could not draw the diagram')
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('does nothing more once destroyed mid-load', async () => {
    let signal
    fetch.mockImplementation((_url, init) => { signal = init.signal; return new Promise(() => {}) })
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    const onReady = vi.fn()
    const view = createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady })
    await settle()

    view.destroy()
    await settle()

    expect(signal.aborted).toBe(true)
    expect(root.childElementCount).toBe(0)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('asks for nothing once destroyed before the file is read', async () => {
    let read
    seams.loadFile.mockReturnValue(new Promise((resolve) => { read = resolve }))
    const onReady = vi.fn()
    const view = createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady })

    view.destroy()
    read({ content: SCREENS, etag: '"e"' })
    await settle()

    expect(fetch).not.toHaveBeenCalled()
    expect(root.childElementCount).toBe(0)
    expect(onReady).not.toHaveBeenCalled()
  })

  it("keeps the tab strip's arrow keys from the Viewer, which would go to the next file", async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    try {
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        root.querySelector('[role="tab"]').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      }
      expect(seen).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', seen)
    }
  })

  it('lets other keys through to the Viewer', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    try {
      root.querySelector('[role="tab"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(seen).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', seen)
    }
  })
})

describe('Stack and Wall', () => {
  const open = async (content) => {
    seams.loadFile.mockResolvedValue({ content, etag: '"e"' })
    createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady: vi.fn() })
    await settle()
  }
  const mode = (name) => root.querySelector(`.plantuml-viewer__toolbar [aria-label="${name}"]`).click()
  const cards = () => [...root.querySelectorAll('.plantuml-viewer__card')]
  const caption = (card) => card.querySelector('label').textContent
  // The 1-based place of each drawing still asked for; the route is asked by 0-based index.
  const waiting = (pending) => pending.map(({ url }) => String(Number(new URL(url, 'https://x').searchParams.get('index')) + 1))

  it('puts the toolbar in the head, above the tab bar', async () => {
    await open(THREE)

    expect([...root.querySelector('.plantuml-viewer__head').children].map((child) => child.className))
      .toEqual(['plantuml-viewer__toolbar', 'plantuml-viewer__tabbar'])
  })

  it('stacks every diagram as a card, captioned with a checkbox', async () => {
    await open(THREE)
    mode('Stack')
    await settle()

    expect(cards().map(caption)).toEqual(['nodes', 'login', 'p3'])
    expect(shown(root)).toEqual(['nodes', 'login', 'p3'])
    expect(root.querySelector('.plantuml-viewer__tabbar').hidden).toBe(true)
  })

  it('opens a Wall card in Tabs on a click outside its checkbox', async () => {
    await open(THREE)
    mode('Wall')
    await settle()
    cards()[1].querySelector('.plantuml-viewer__sheet').click()
    await settle()

    expect(root.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('login')
    expect(shown(root)).toEqual(['login'])
    expect(root.querySelector('.plantuml-viewer__tabbar').hidden).toBe(false)
    expect(root.querySelector('.plantuml-viewer__toolbar [aria-pressed="true"]').getAttribute('aria-label')).toBe('Tabs')
  })

  it('stays in the Wall when a checkbox is clicked', async () => {
    await open(THREE)
    mode('Wall')
    cards()[1].querySelector('input[type="checkbox"]').click()

    expect(cards()).toHaveLength(3)
    expect(cards()[1].classList.contains('plantuml-viewer__card--checked')).toBe(true)
  })

  it('stays in the Wall when a caption is clicked', async () => {
    await open(THREE)
    mode('Wall')
    cards()[2].querySelector('label').click()

    expect(cards()).toHaveLength(3)
    expect(cards()[2].querySelector('input').checked).toBe(true)
  })

  it('keeps what is checked across modes', async () => {
    await open(THREE)
    mode('Stack')
    cards()[2].querySelector('input[type="checkbox"]').click()
    mode('Tabs')
    mode('Wall')

    expect(cards().map((card) => card.querySelector('input').checked)).toEqual([false, false, true])
  })

  it('has no switch for a file of one diagram', async () => {
    await open('@startuml\nA -> B\n@enduml\n')

    expect(root.querySelector('.plantuml-viewer__toolbar')).not.toBeNull()
    expect(root.querySelector('.plantuml-viewer__toolbar [aria-pressed]')).toBeNull()
  })

  it('has no more than three drawings asked for at once, in file order', async () => {
    const pending = []
    fetch.mockImplementation((url) => new Promise((resolve) => pending.push({ url, resolve })))
    await open(Array.from({ length: 40 }, (_, i) => `@startuml d${i + 1}\n@enduml\n`).join(''))
    pending.shift().resolve(new Response(svg('d1')))
    await settle()
    mode('Stack')
    await settle()

    expect(waiting(pending)).toEqual(['2', '3', '4'])
    pending.shift().resolve(new Response(svg('d2')))
    await settle()
    expect(waiting(pending)).toEqual(['3', '4', '5'])
  })
})
