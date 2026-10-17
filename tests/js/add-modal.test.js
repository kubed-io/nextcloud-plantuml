// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { openAddModal } from '../../src/editor/add/modal.js'
import { createAdd } from '../../src/editor/add/index.js'
import { arrange, builtins, fromFiles } from '../../src/editor/add/catalog.js'
import own from '../../src/editor/data/docs/own.json'
import { blocksOf, scan } from '../../src/editor/blocks.js'
import { BRACED } from '../../src/editor/completion/directives.js'
import { DOC_HOVER } from '../../src/editor/docs/hover.js'
import { MOVES } from '../../src/editor/tabs.js'
import closeIcon from '../../img/icons/close.svg?raw'

// What the editor hands the add chunk (add/index.js's Core), the real modules.
const CORE = { crelt, t, MOVES, blocksOf, scan, BRACED, DOC_HOVER, closeIcon }

const OWN = { 'diagram:uml': { example: '@startuml\nAlice -> Bob : hi\n@enduml' } }
const SHARED = { source: 'shared', path: 'Templates/a.puml', text: "@startuml Login\n' Sign in\n@enduml" }
const q = (s) => document.querySelector(s)
const all = (s) => [...document.querySelectorAll(s)]
const rows = () => all('.plantuml-add__template')
const typeRows = () => all('.plantuml-add__type')
const titles = () => rows().map((r) => r.querySelector('.plantuml-add__template-title').textContent)
const key = (target, k, init = {}) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
const search = (text) => {
  q('.plantuml-add__search').value = text
  q('.plantuml-add__search').dispatchEvent(new Event('input'))
}

describe('the Add diagram modal', () => {
  let onPick
  let onClose
  let modal

  beforeEach(() => {
    document.body.innerHTML = '<div class="plantuml-editor"><button id="plus">+</button></div>'
    document.getElementById('plus').focus()
    onPick = vi.fn()
    onClose = vi.fn()
    modal = openAddModal({ container: q('.plantuml-editor'), arranged: arrange(builtins(OWN, CORE), []), onPick, onClose, core: CORE })
  })

  afterEach(() => {
    modal.close()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens titled, on UML, its templates in order, the search focused', () => {
    expect(q('.plantuml-add__dialog').getAttribute('role')).toBe('dialog')
    expect(q('.plantuml-add__dialog').getAttribute('aria-modal')).toBe('true')
    expect(q('.plantuml-add__title').textContent).toBe('Add diagram')
    expect(q('.plantuml-add__close').getAttribute('aria-label')).toBe('Close')
    expect(q('.plantuml-add__close svg')).not.toBeNull()
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('UML')
    expect(titles().slice(0, 3)).toEqual(['Empty', 'Example', 'Sequence'])
    expect(document.activeElement).toBe(q('.plantuml-add__search'))
    expect(q('.plantuml-add__search').placeholder).toBe('Search')
  })

  it('names its two lists', () => {
    expect(q('.plantuml-add__types').getAttribute('role')).toBe('listbox')
    expect(q('.plantuml-add__types').getAttribute('aria-label')).toBe('Types')
    expect(q('.plantuml-add__templates').getAttribute('role')).toBe('listbox')
    expect(q('.plantuml-add__templates').getAttribute('aria-label')).toBe('Templates')
  })

  it('shows each type\'s template count', () => {
    expect(typeRows()[0].querySelector('.plantuml-add__count').textContent).toBe('11')
    expect(typeRows().find((r) => r.textContent.startsWith('Git')).querySelector('.plantuml-add__count').textContent).toBe('1')
  })

  it('narrows the types as the search is typed, selecting the first left', () => {
    search('mind')
    expect(typeRows().map((r) => r.querySelector('.plantuml-add__type-name').textContent)).toEqual(['MindMap'])
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('MindMap')
    expect(titles()[0]).toBe('Empty')
  })

  it('shows no type and no template when nothing matches, and still closes on Escape', () => {
    search('zzzz')
    expect(typeRows()).toHaveLength(0)
    expect(rows()).toHaveLength(0)
    expect(q('.plantuml-add__preview').hidden).toBe(true)
    // Tab rounds the two stops left; the arrows have no list to move in.
    key(document.activeElement, 'Tab')
    expect(document.activeElement).toBe(q('.plantuml-add__close'))
    key(document.activeElement, 'Tab')
    expect(document.activeElement).toBe(q('.plantuml-add__search'))
    key(document.activeElement, 'ArrowDown')
    key(document.activeElement, 'Enter')
    expect(onPick).not.toHaveBeenCalled()
    search('')
    expect(typeRows()).toHaveLength(27)
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('UML')
    key(document.activeElement, 'Escape')
    expect(q('.plantuml-add')).toBeNull()
  })

  it('shows a template\'s text once the pointer has rested on it 500 ms, and hides it when it leaves', () => {
    vi.useFakeTimers()
    const klass = rows().find((r) => r.textContent.startsWith('Class'))
    klass.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(499)
    expect(q('.plantuml-add__preview').hidden).toBe(true)
    vi.advanceTimersByTime(1)
    expect(q('.plantuml-add__preview').hidden).toBe(false)
    expect(q('.plantuml-add__preview').textContent).toBe('@startuml\nclass Customer\nclass Order {\n  id : int\n  total()\n}\nCustomer "1" -- "*" Order\n@enduml')
    klass.dispatchEvent(new Event('pointerleave'))
    expect(q('.plantuml-add__preview').hidden).toBe(true)
  })

  it('shows nothing for a row the pointer left before 500 ms', () => {
    vi.useFakeTimers()
    rows()[2].dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(300)
    rows()[2].dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(500)
    expect(q('.plantuml-add__preview').hidden).toBe(true)
  })

  it('shows it at once for a row reached with the keyboard, 16 px right of the dialog and level with the row', () => {
    vi.spyOn(q('.plantuml-add__dialog'), 'getBoundingClientRect').mockReturnValue({ top: 84, bottom: 684, left: 72, right: 952, width: 880, height: 600 })
    vi.spyOn(q('.plantuml-add__right'), 'getBoundingClientRect').mockReturnValue({ top: 142, bottom: 684, left: 361, right: 952, width: 591, height: 542 })
    vi.spyOn(rows()[1], 'getBoundingClientRect').mockReturnValue({ top: 210, bottom: 274, left: 400, right: 936, width: 536, height: 64 })
    rows()[1].focus()
    expect(q('.plantuml-add__preview').hidden).toBe(false)
    expect(q('.plantuml-add__preview').textContent).toBe(OWN['diagram:uml'].example)
    expect(q('.plantuml-add__preview').style.left).toBe('968px')
    expect(q('.plantuml-add__preview').style.top).toBe('210px')
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement).toBe(rows()[2])
    expect(q('.plantuml-add__preview').textContent).toContain('@startuml\n')
    expect(q('.plantuml-add__preview').textContent).not.toBe(OWN['diagram:uml'].example)
  })

  it('narrows the card to the room right of the dialog rather than lie over it (A3)', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1432)
    const dialog = vi.spyOn(q('.plantuml-add__dialog'), 'getBoundingClientRect').mockReturnValue({ top: 84, bottom: 684, left: 276, right: 1156, width: 880, height: 600 })
    vi.spyOn(q('.plantuml-add__right'), 'getBoundingClientRect').mockReturnValue({ top: 142, bottom: 684, left: 565, right: 1156, width: 591, height: 542 })
    vi.spyOn(rows()[1], 'getBoundingClientRect').mockReturnValue({ top: 210, bottom: 274, left: 600, right: 1140, width: 540, height: 64 })
    rows()[1].focus()
    expect(q('.plantuml-add__preview').style.maxWidth).toBe('252px')
    expect(q('.plantuml-add__preview').style.left).toBe('1172px')
    dialog.mockReturnValue({ top: 84, bottom: 684, left: 420, right: 1300, width: 880, height: 600 })
    window.dispatchEvent(new Event('resize'))
    expect(q('.plantuml-add__preview').style.maxWidth).toBe('')
    expect(q('.plantuml-add__preview').style.left).toBe('1316px')
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1920)
    dialog.mockReturnValue({ top: 84, bottom: 684, left: 276, right: 1156, width: 880, height: 600 })
    window.dispatchEvent(new Event('resize'))
    expect(q('.plantuml-add__preview').style.maxWidth).toBe('360px')
  })

  it('keeps the card within the dialog\'s height, level with its row where it fits', () => {
    vi.spyOn(q('.plantuml-add__dialog'), 'getBoundingClientRect').mockReturnValue({ top: 84, bottom: 684, left: 72, right: 952, width: 880, height: 600 })
    vi.spyOn(q('.plantuml-add__right'), 'getBoundingClientRect').mockReturnValue({ top: 142, bottom: 684, left: 361, right: 952, width: 591, height: 542 })
    vi.spyOn(rows()[3], 'getBoundingClientRect').mockReturnValue({ top: 610, bottom: 674, left: 377, right: 936, width: 559, height: 64 })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () { return this.classList.contains('plantuml-add__preview') ? 200 : 0 })
    rows()[3].focus()
    expect(q('.plantuml-add__preview').style.top).toBe(`${684 - 200}px`)
    expect(q('.plantuml-add__preview').style.maxHeight).toBe('600px')
  })

  it('hides the card when its row scrolls out of view, and moves it with a row still in view', () => {
    const rect = (top) => ({ top, bottom: top + 64, left: 377, right: 936, width: 559, height: 64 })
    vi.spyOn(q('.plantuml-add__dialog'), 'getBoundingClientRect').mockReturnValue({ top: 84, bottom: 684, left: 72, right: 952, width: 880, height: 600 })
    vi.spyOn(q('.plantuml-add__right'), 'getBoundingClientRect').mockReturnValue({ top: 142, bottom: 684, left: 361, right: 952, width: 591, height: 542 })
    const at = vi.spyOn(rows()[1], 'getBoundingClientRect').mockReturnValue(rect(210))
    rows()[1].focus()
    at.mockReturnValue(rect(150))
    q('.plantuml-add__right').dispatchEvent(new Event('scroll'))
    expect(q('.plantuml-add__preview').hidden).toBe(false)
    expect(q('.plantuml-add__preview').style.top).toBe('150px')
    at.mockReturnValue(rect(40))
    q('.plantuml-add__right').dispatchEvent(new Event('scroll'))
    expect(q('.plantuml-add__preview').hidden).toBe(true)
  })

  it('picks a clicked row and closes', () => {
    rows()[2].click()
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sequence' }))
    expect(q('.plantuml-add')).toBeNull()
    expect(onClose).toHaveBeenCalled()
    expect(document.activeElement).toBe(document.getElementById('plus'))
  })

  it('picks a row on Enter', () => {
    rows()[0].focus()
    const event = key(rows()[0], 'Enter')
    expect(event.defaultPrevented).toBe(true)
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Empty', type: 'uml' }))
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape without picking, and the editor never sees the key', () => {
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    const event = key(document.activeElement, 'Escape')
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(q('.plantuml-add')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(document.getElementById('plus'))
  })

  it('keeps a click on the backdrop or the dialog\'s padding inside it, where Escape still closes only the modal', () => {
    for (const where of ['.plantuml-add', '.plantuml-add__dialog']) {
      // What a click on a part that is no control does: the nearest focusable ancestor takes the focus, not the page.
      q(where).focus()
      expect(document.activeElement).toBe(q(where))
    }
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    key(document.activeElement, 'Escape')
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(q('.plantuml-add')).toBeNull()
  })

  it('closes on a click on the backdrop, the focus back on its opener', () => {
    const mask = q('.plantuml-add')
    mask.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(q('.plantuml-add')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.getElementById('plus'))
  })

  it.each([
    ['a drag from the search ending on the backdrop', '.plantuml-add__search', '.plantuml-add'],
    ['a press on the backdrop let go in the dialog', '.plantuml-add', '.plantuml-add__dialog'],
    ['a click in the dialog', '.plantuml-add__dialog', '.plantuml-add__dialog'],
  ])('stays open after %s', (_how, down, up) => {
    q(down).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    // The browser sends a click to the two targets' nearest common ancestor.
    q(up).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(q('.plantuml-add')).not.toBeNull()
  })

  it('closes from its close button without picking', () => {
    q('.plantuml-add__close').click()
    expect(q('.plantuml-add')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.getElementById('plus'))
  })

  it('keeps Tab inside: search, the type, the template, the close button, round again', () => {
    const order = []
    for (let i = 0; i < 5; i++) {
      key(document.activeElement, 'Tab')
      order.push(document.activeElement.className)
    }
    expect(order).toEqual(['plantuml-add__type', 'plantuml-add__template', 'plantuml-add__close', 'plantuml-add__search', 'plantuml-add__type'])
  })

  it('goes round the other way on Shift+Tab, the editor never seeing either', () => {
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    key(document.activeElement, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(q('.plantuml-add__close'))
    key(document.activeElement, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(rows()[0])
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
  })

  it('moves within a list with the arrows; on the types, that selects', () => {
    typeRows()[0].focus()
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement.textContent).toContain('BPM')
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('BPM')
    key(document.activeElement, 'ArrowUp')
    key(document.activeElement, 'ArrowUp')
    expect(document.activeElement.textContent).toContain('packetdiag')
    key(document.activeElement, 'Home')
    expect(document.activeElement.textContent).toContain('UML')
  })

  it('tabs to the template the arrows reached, not the first', () => {
    rows()[0].focus()
    key(document.activeElement, 'ArrowDown')
    key(document.activeElement, 'ArrowDown')
    key(document.activeElement, 'Tab', { shiftKey: true })
    key(document.activeElement, 'Tab')
    expect(document.activeElement).toBe(rows()[2])
  })

  it('tabs back to a template a mousedown focused', () => {
    // A mousedown with no click (the pointer let go elsewhere) leaves the row focused.
    rows()[3].focus()
    key(document.activeElement, 'Tab')
    expect(document.activeElement).toBe(q('.plantuml-add__close'))
    key(document.activeElement, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(rows()[3])
  })

  it('selects a clicked type and lists its templates', () => {
    typeRows().find((r) => r.textContent.startsWith('Gantt')).click()
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('Gantt')
    expect(titles()).toEqual(['Empty'])
  })

  it('takes in the route\'s templates after the built-ins, keeping the selection', () => {
    rows()[1].focus()
    modal.update(arrange(builtins(OWN, CORE), fromFiles([SHARED], CORE)))
    const last = rows().at(-1)
    expect(last.querySelector('.plantuml-add__template-title').textContent).toBe('Login')
    expect(last.querySelector('.plantuml-add__description').textContent).toBe('Shared · Sign in')
    expect(typeRows()[0].querySelector('.plantuml-add__count').textContent).toBe('12')
    expect(document.activeElement).toBe(rows()[1])
    expect(rows()[1].tabIndex).toBe(0)
  })

  it('closes once, however often it is asked', () => {
    modal.close()
    modal.close()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(q('.plantuml-add')).toBeNull()
  })
})

describe('Add diagram\'s modal, opened from the chunk', () => {
  let container
  let plus
  let onAdd
  let add

  beforeEach(() => {
    document.body.innerHTML = '<div class="plantuml-editor"><button id="plus">+</button></div>'
    container = q('.plantuml-editor')
    plus = document.getElementById('plus')
    onAdd = vi.fn()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    add = createAdd(CORE, { container, onAdd })
  })

  afterEach(() => {
    add.destroy()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const uml = () => builtins(own, CORE).filter((x) => x.type === 'uml').map((x) => x.title)
  const fromAnyFile = () => rows().filter((r) => /^(Shared|Yours) · /.test(r.querySelector('.plantuml-add__description').textContent))

  it('opens at once on the built-ins, and takes in the route\'s templates when they land', async () => {
    let answer
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { answer = resolve })))
    add.openModal(plus)
    expect(titles()).toEqual(uml())
    answer(new Response(JSON.stringify({ files: [SHARED, { source: 'yours', path: 'Templates/b.puml', text: '@startuml Mine\n@enduml' }] }), { status: 200 }))
    await vi.waitFor(() => expect(titles()).toEqual([...uml(), 'Login', 'Mine']))
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/templates', { credentials: 'same-origin' })
  })

  it.each([
    ['an error', () => Promise.resolve(new Response('{}', { status: 500 }))],
    ['no answer at all', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('keeps the built-ins alone when the route answers %s', async (_how, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer))
    add.openModal(plus)
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(titles()).toEqual(uml())
    expect(fromAnyFile()).toHaveLength(0)
    expect(q('.plantuml-add__dialog')).not.toBeNull()
  })

  it('keeps the built-ins alone when the route answers a file of the wrong shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ files: [SHARED, null] }), { status: 200 })))
    add.openModal(plus)
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('[plantuml] could not read the templates', expect.any(TypeError)))
    expect(titles()).toEqual(uml())
    expect(fromAnyFile()).toHaveLength(0)
    rows()[0].click()
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'uml', title: 'Empty' }))
  })

  it('leaves a modal closed before a slow route answers closed, and asks again on reopening', async () => {
    let answer
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { answer = resolve })))
    add.openModal(plus)
    key(document.activeElement, 'Escape')
    expect(q('.plantuml-add')).toBeNull()
    expect(document.activeElement).toBe(plus)

    answer(new Response(JSON.stringify({ files: [SHARED] }), { status: 200 }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(q('.plantuml-add')).toBeNull()

    add.openModal(plus)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(all('.plantuml-add')).toHaveLength(1)
    expect(titles()).toEqual(uml())
  })

  it('opens afresh after a close: on UML, the search empty and focused', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    add.openModal(plus)
    search('gantt')
    q('.plantuml-add__close').click()
    add.openModal(plus)
    expect(all('.plantuml-add')).toHaveLength(1)
    expect(q('.plantuml-add__search').value).toBe('')
    expect(document.activeElement).toBe(q('.plantuml-add__search'))
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('UML')
  })

  it('opens one modal however often it is asked, and adds what is picked', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    add.openModal(plus)
    add.openModal(plus)
    expect(all('.plantuml-add')).toHaveLength(1)
    rows()[0].click()
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'uml', title: 'Empty' }))
  })

  it('is closed by destroy, the focus left where it is', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    add.openModal(plus)
    add.destroy()
    expect(q('.plantuml-add')).toBeNull()
    expect(document.activeElement).not.toBe(plus)
  })
})

describe('the Add diagram modal\'s styles', () => {
  // Read from disk: vitest hands a stylesheet import back empty, ?raw too.
  const css = readFileSync('css/editor.css', 'utf8')
  const rule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''

  it('is the board\'s: 880 × 600 on a black backdrop at 50 %, smaller on a small screen', () => {
    expect(rule('.plantuml-add')).toMatch(/background: rgba\(0, 0, 0, 0\.5\);/)
    expect(rule('.plantuml-add__dialog')).toMatch(/width: min\(880px, calc\(100vw - 32px\)\);/)
    expect(rule('.plantuml-add__dialog')).toMatch(/height: min\(600px, calc\(100vh - 32px\)\);/)
    expect(rule('.plantuml-add__left')).toMatch(/width: min\(288px, 40%\);/)
  })

  it('scrolls the types under the search, which stays in view', () => {
    expect(rule('.plantuml-add__left,\n.plantuml-add__right')).not.toMatch(/overflow/)
    expect(rule('.plantuml-add__left')).not.toMatch(/overflow/)
    expect(rule('.plantuml-add__types')).toMatch(/overflow-y: auto;/)
    expect(rule('.plantuml-add__types')).toMatch(/min-height: 0;/)
    // Its own rule, not the second line of the shared one.
    expect(css).toMatch(/(?<!,\n)^\.plantuml-add__right \{[^}]*overflow-y: auto;/m)
  })

  it('keeps a pressed row\'s own background over core\'s (0,4,1) :active one', () => {
    expect(rule('.plantuml-add .plantuml-add__dialog button.plantuml-add__type[aria-selected="true"]')).toMatch(/background: var\(--color-primary-element-light\);/)
    expect(rule('.plantuml-add .plantuml-add__dialog button.plantuml-add__type:hover:not([aria-selected="true"]),\n.plantuml-add .plantuml-add__dialog button.plantuml-add__template:hover')).toMatch(/background: var\(--color-background-hover\);/)
    // Core's comes first in the page: the later of two (0,4,1) rules wins, and nothing weaker sets them.
    expect(css).not.toMatch(/^\.plantuml-add button\.plantuml-add__type\[aria-selected="true"\] \{/m)
    expect(css).not.toMatch(/^\.plantuml-add button\.plantuml-add__template:hover/m)
  })

  it('draws its own focus ring over core\'s !important one', () => {
    // Core's button:not(…):not(…):focus-visible ring is !important at (0,3,1); these are (0,5,1).
    const focus = rule([
      '.plantuml-add .plantuml-add__dialog button.plantuml-add__close:not(:disabled):focus-visible',
      '.plantuml-add .plantuml-add__dialog button.plantuml-add__type:not(:disabled):focus-visible',
      '.plantuml-add .plantuml-add__dialog button.plantuml-add__template:not(:disabled):focus-visible',
      '.plantuml-add .plantuml-add__dialog input.plantuml-add__search:not(:disabled):focus-visible',
    ].join(',\n'))
    expect(focus).toMatch(/outline: 2px solid var\(--color-primary-element\) !important;/)
    expect(focus).toMatch(/box-shadow: none !important;/)
  })

  it('lets the pointer through the text card, so a card clamped over its own row never makes the row lose the pointer', () => {
    // In a small window place() puts the card over the rows: one that took the
    // pointer would fire the row's pointerleave, hide, and show again 500 ms on.
    expect(rule('.plantuml-add__preview')).toMatch(/pointer-events: none;/)
  })

  it('shows no ring on the backdrop or the dialog, which take the focus only to keep it', () => {
    expect(rule('.plantuml-add:focus,\n.plantuml-add__dialog:focus')).toMatch(/outline: none;/)
  })
})
