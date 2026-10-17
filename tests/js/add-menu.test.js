// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { openTypeMenu } from '../../src/editor/add/menu.js'
import { fetchTemplates } from '../../src/editor/add/route.js'
import { TYPES } from '../../src/editor/add/types.js'
import { blocksOf, scan } from '../../src/editor/blocks.js'
import { BRACED } from '../../src/editor/completion/directives.js'
import { MOVES } from '../../src/editor/tabs.js'

// What the editor hands the add chunk (add/index.js's Core), the real modules.
const CORE = { crelt, t, MOVES, blocksOf, scan, BRACED }

const key = (target, k) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('the type menu', () => {
  let anchor
  let onPick
  let onClose
  let menu
  const items = () => [...document.querySelectorAll('.plantuml-add__menu [role="menuitem"]')]

  beforeEach(() => {
    document.body.innerHTML = '<div class="plantuml-editor"><button id="anchor">▾</button><div id="pane"></div></div>'
    anchor = document.getElementById('anchor')
    onPick = vi.fn()
    onClose = vi.fn()
    menu = openTypeMenu({ container: document.querySelector('.plantuml-editor'), anchor, types: TYPES, onPick, onClose, core: CORE })
  })

  afterEach(() => menu.close())

  it('lists the 27 types by name, the first focused', () => {
    expect(items().map((i) => i.textContent)).toEqual(TYPES.map((t) => t.name))
    expect(document.activeElement).toBe(items()[0])
    expect(document.querySelector('.plantuml-add__menu').getAttribute('role')).toBe('menu')
  })

  it('moves with the arrows, wrapping, and jumps with Home and End', () => {
    key(document.activeElement, 'ArrowUp')
    expect(document.activeElement.textContent).toBe('packetdiag')
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement.textContent).toBe('UML')
    key(document.activeElement, 'End')
    expect(document.activeElement.textContent).toBe('packetdiag')
    key(document.activeElement, 'Home')
    expect(document.activeElement.textContent).toBe('UML')
  })

  it('picks the focused type on Enter and closes', () => {
    items().find((i) => i.textContent === 'Gantt').focus()
    key(document.activeElement, 'Enter')
    expect(onPick).toHaveBeenCalledWith('gantt')
    expect(items()).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape, back on its button, and the editor never sees the key', () => {
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    const event = key(document.activeElement, 'Escape')
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(anchor)
  })

  it('closes on a click outside it', () => {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(items()).toHaveLength(0)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('closes on a scroll outside it, as the tabs\' menu does, and stays open on its own', () => {
    document.querySelector('.plantuml-add__menu').dispatchEvent(new Event('scroll'))
    expect(items()).toHaveLength(27)
    document.getElementById('pane').dispatchEvent(new Event('scroll'))
    expect(items()).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('fetchTemplates', () => {
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => vi.unstubAllGlobals())

  it('asks the route and answers its files', async () => {
    const files = [{ source: 'shared', path: 'Templates/a.puml', text: '@startuml\n@enduml' }]
    const fetch = vi.fn(async () => new Response(JSON.stringify({ files }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchTemplates()).toEqual(files)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/templates', { credentials: 'same-origin' })
  })

  it('answers nothing for a failure or a body without files', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await fetchTemplates()).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"x":1}', { status: 200 })))
    expect(await fetchTemplates()).toEqual([])
  })
})

describe('the add chunk', () => {
  // Reached only through import(): an editor module or library imported here
  // would become a chunk the editor entry imports statically (add/index.js).
  const sources = import.meta.glob(['../../src/editor/add/*.js', '../../src/editor/data/template-icons.js', '!**/button.js', '!**/insert.js'], { query: '?raw', import: 'default', eager: true })

  it.each(Object.keys(sources))('%s imports only add/ files and data', (path) => {
    const specifiers = [...sources[path].matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    const own = path.includes('/data/') ? /^\.\/[^/]+$/ : /^(\.\/(?!button\.js$|insert\.js$)[^/]+|\.\.\/data\/.+)$/
    expect(specifiers.filter((s) => !own.test(s))).toEqual([])
  })
})
