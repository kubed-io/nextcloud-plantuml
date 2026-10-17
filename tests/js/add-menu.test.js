// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { posix } from 'node:path'
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
    document.body.innerHTML = '<div class="plantuml-editor"><button id="anchor">▾</button><button id="next">Source</button><div id="pane"></div></div>'
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

  it('closes when the focus moves on out of it, not between its rows', () => {
    items()[1].focus()
    expect(items()).toHaveLength(27)
    document.getElementById('next').focus()
    expect(items()).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps a click on its padding inside it, where Escape still closes only the menu', () => {
    const own = document.querySelector('.plantuml-add__menu')
    own.focus() // what a click on the padding does: the menu is focusable, so the focus is not sent to the page
    expect(document.activeElement).toBe(own)
    expect(items()).toHaveLength(27)
    key(own, 'ArrowDown')
    expect(document.activeElement).toBe(items()[0])
    own.focus()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    key(own, 'Escape')
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(anchor)
  })

  it('closes on Tab back on its button, leaving the key to move on from there', () => {
    const event = key(document.activeElement, 'Tab')
    expect(event.defaultPrevented).toBe(false)
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(anchor)
  })

  it('closes on a scroll outside it, as the tabs\' menu does, and stays open on its own', () => {
    document.querySelector('.plantuml-add__menu').dispatchEvent(new Event('scroll'))
    expect(items()).toHaveLength(27)
    document.getElementById('pane').dispatchEvent(new Event('scroll'))
    expect(items()).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('the type menu\'s place', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sits under its button, kept inside the left edge, 12 rows and its padding and border high at most', () => {
    document.body.innerHTML = '<div class="plantuml-editor"><button id="anchor">▾</button></div>'
    const anchor = document.getElementById('anchor')
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ top: 8, bottom: 40, left: 172, right: 200, width: 28, height: 32 })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () { return this.classList.contains('plantuml-add__menu') ? 260 : 0 })
    const menu = openTypeMenu({ container: document.querySelector('.plantuml-editor'), anchor, types: TYPES, onPick: () => {}, onClose: () => {}, core: CORE })
    const style = document.querySelector('.plantuml-add__menu').style
    expect(style.top).toBe('44px')
    // jsdom's window is 1024 × 768: the right edge would put a 260 px menu 60 px past the left one.
    expect(style.right).toBe(`${1024 - 260}px`)
    expect(style.maxHeight).toBe(`${12 * 44 + 8 + 2}px`)
    menu.close()
  })

  it('is border-box, so its height cap is 12 rows exactly, and the split button\'s focus beats core\'s', () => {
    // Read from disk: vitest hands a stylesheet import back empty, ?raw too.
    const css = readFileSync('css/editor.css', 'utf8')
    const rule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''
    expect(rule('.plantuml-editor__menu.plantuml-add__menu')).toMatch(/box-sizing: border-box;/)
    // Core's button:not(…):not(…):focus-visible ring is !important at (0,4,1); this is (0,5,1).
    const focus = rule('.plantuml-editor .plantuml-editor__add button.plantuml-editor__add-new:not(:disabled):focus-visible,\n.plantuml-editor .plantuml-editor__add button.plantuml-editor__add-type:not(:disabled):focus-visible')
    expect(focus).toMatch(/outline: none !important;/)
    expect(focus).toMatch(/box-shadow: none !important;/)
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
  const sources = import.meta.glob(['../../src/editor/add/**/*.js', '../../src/editor/data/**/*.js', '!**/add/button.js', '!**/add/insert.js'], { query: '?raw', import: 'default', eager: true })
  const ALLOWED = ['../../src/editor/add/', '../../src/editor/data/']
  const STATIC = ['../../src/editor/add/button.js', '../../src/editor/add/insert.js']

  /** Every module a source names: import and export … from, a bare import, and import(); comments left out. */
  const specifiers = (text) => {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    return [...code.matchAll(/(?:^|[;\s}])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[;\s])import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"`]([^'"`]+)['"`]/gm)]
      .map((m) => m[1] ?? m[2] ?? m[3])
  }
  const outside = (path, spec) => {
    const to = posix.join(posix.dirname(path), spec)
    return !spec.startsWith('.') || STATIC.includes(to) || !ALLOWED.some((dir) => to.startsWith(dir))
  }

  it('reads every way a module names another', () => {
    const text = "import a from './a.js'\nimport {\n  b,\n} from '../b.js'\nexport { c } from '../c.js'\nexport * from 'd'\nimport './e.css'\nconst f = () => import('../f.js')\n// import('../g.js')\n/** @type {import('../h.js').H} */"
    expect(specifiers(text)).toEqual(['./a.js', '../b.js', '../c.js', 'd', './e.css', '../f.js'])
  })

  it.each(Object.keys(sources))('%s imports only add/ files and data', (path) => {
    expect(specifiers(sources[path]).filter((spec) => outside(path, spec))).toEqual([])
  })
})
