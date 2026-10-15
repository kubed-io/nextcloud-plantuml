// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The tab strip over the diagram: one tab per diagram, a WAI-ARIA tablist.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scan } from '../../src/editor/blocks.js'

vi.mock('@nextcloud/l10n', () => ({ translate: (_app, text) => text }))

const { createTabs } = await import('../../src/editor/tabs.js')

const THREE = '@startuml order\nA -> B\nnewpage\nB -> C\n@enduml\n@startsalt\n{\n}\n@endsalt\n'

let onActivate, tabs
const all = () => [...tabs.element.querySelectorAll('[role="tab"]')]
const key = (target, k) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

beforeEach(() => {
  onActivate = vi.fn()
  tabs = createTabs({ onActivate, controls: 'the-diagram' })
  document.body.replaceChildren(tabs.element)
})

describe('the tab strip', () => {
  it('is not drawn for one diagram', () => {
    tabs.update(scan('@startuml\nA -> B\n@enduml\n'), 0)

    expect(tabs.element.hidden).toBe(true)
  })

  it('is a tablist with one tab per diagram, labelled after it, the active one selected', () => {
    tabs.update(scan(THREE), 1)

    expect(tabs.element.hidden).toBe(false)
    expect(tabs.list.getAttribute('role')).toBe('tablist')
    expect(tabs.list.getAttribute('aria-label')).toBe('Diagrams')
    expect(all().map((tab) => tab.textContent)).toEqual(['order 1', 'order 2', 'salt'])
    expect(all().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(all().every((tab) => tab.getAttribute('aria-controls') === 'the-diagram')).toBe(true)
  })

  it('keeps only the active tab in the Tab order', () => {
    tabs.update(scan(THREE), 1)

    expect(all().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('moves the focus with the arrow keys, Home and End, without activating', () => {
    tabs.update(scan(THREE), 0)
    all()[0].focus()

    key(document.activeElement, 'ArrowRight')
    expect(document.activeElement).toBe(all()[1])
    key(document.activeElement, 'End')
    expect(document.activeElement).toBe(all()[2])
    key(document.activeElement, 'ArrowRight')
    expect(document.activeElement).toBe(all()[0])
    key(document.activeElement, 'ArrowLeft')
    expect(document.activeElement).toBe(all()[2])
    key(document.activeElement, 'Home')
    expect(document.activeElement).toBe(all()[0])
    expect(onActivate).not.toHaveBeenCalled()
  })

  it.each(['Enter', ' '])('leaves %j to the button, so a press activates once', (k) => {
    tabs.update(scan(THREE), 0)
    all()[2].focus()

    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
    all()[2].dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('activates a tab on a click', () => {
    tabs.update(scan(THREE), 0)

    all()[1].click()

    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it('selects the last tab when the active one is gone', () => {
    tabs.update(scan(THREE), 2)
    tabs.update(scan('@startuml a\n@enduml\n@startuml b\n@enduml\n'), 2)

    expect(all().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(all().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0'])
  })

  it('keeps a focused tab focused when the labels change', () => {
    tabs.update(scan(THREE), 0)
    all()[1].focus()
    const focused = document.activeElement

    tabs.update(scan(THREE.replace('order', 'orders')), 0)

    expect(all()[1].textContent).toBe('orders 2')
    expect(document.activeElement).toBe(focused)
  })

  it('scrolls the active tab into view, sideways', () => {
    const scrolled = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrolled
    try {
      tabs.update(scan(THREE), 0)
      tabs.update(scan(THREE), 2)

      expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ inline: 'nearest' }))
      expect(scrolled.mock.contexts.at(-1)).toBe(all()[2])
    } finally {
      delete window.HTMLElement.prototype.scrollIntoView
    }
  })
})

const MANY = Array.from({ length: 40 }, (_, i) => `@startuml d${i + 1}\nA -> B\n@enduml\n`).join('')
const button = () => tabs.element.querySelector('button[aria-haspopup="menu"]')
const menu = () => tabs.element.querySelector('[role="menu"]')
const items = () => [...tabs.element.querySelectorAll('[role="menuitemradio"]')]

function size(scrollWidth, clientWidth) {
  Object.defineProperty(tabs.list, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(tabs.list, 'clientWidth', { configurable: true, value: clientWidth })
}

describe('the all diagrams menu', () => {
  it('has no button while the tabs fit', () => {
    size(300, 600)
    tabs.update(scan(THREE), 0)

    expect(button().hidden).toBe(true)
  })

  it('shows a button outside the tablist when the tabs overflow', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)

    expect(button().hidden).toBe(false)
    expect(button().getAttribute('aria-label')).toBe('All diagrams')
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(tabs.list.contains(button())).toBe(false)
    expect(tabs.list.querySelectorAll('[role="tab"]')).toHaveLength(40)
  })

  it('lists every diagram in file order, the active one checked', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 11)

    expect(menu().hidden).toBe(true)
    button().click()

    expect(menu().hidden).toBe(false)
    expect(button().getAttribute('aria-expanded')).toBe('true')
    expect(items()).toHaveLength(40)
    expect(items()[0].textContent).toContain('d1')
    expect(items()[0].textContent).toContain('uml')
    expect(items()[39].textContent).toContain('d40')
    expect(items().map((item) => item.getAttribute('aria-checked')).indexOf('true')).toBe(11)
    expect(items().filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(document.activeElement).toBe(items()[11])
  })

  it('names each item "label, type" and shows the type only when it differs from the label', () => {
    size(4000, 600)
    tabs.update(scan(THREE), 0)

    expect(items().map((item) => item.getAttribute('aria-label'))).toEqual(['order 1, uml', 'order 2, uml', 'salt, salt'])
    expect(items().map((item) => item.lastChild.textContent)).toEqual(['uml', 'uml', ''])
  })

  it('disconnects its observer and drops its window listeners when destroyed', () => {
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
    const removed = vi.spyOn(window, 'removeEventListener')
    try {
      const own = createTabs({ onActivate })
      own.destroy()

      expect(disconnect).toHaveBeenCalledOnce()
      expect(removed).toHaveBeenCalledWith('resize', expect.any(Function))
    } finally {
      removed.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('activates the pick and closes', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    button().click()

    items()[12].click()

    expect(onActivate).toHaveBeenCalledWith(12)
    expect(menu().hidden).toBe(true)
    expect(document.activeElement).toBe(button())
  })

  it('closes on Escape and returns the focus to the button', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    button().click()

    key(document.activeElement, 'Escape')

    expect(menu().hidden).toBe(true)
    expect(document.activeElement).toBe(button())
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('closes on a click outside', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    button().click()

    document.body.click()

    expect(menu().hidden).toBe(true)
  })

  it('toggles from the button', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)

    button().click()
    button().click()

    expect(menu().hidden).toBe(true)
  })

  it('moves the focus with the arrow keys, Home and End', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    button().click()

    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement).toBe(items()[1])
    key(document.activeElement, 'ArrowRight')
    expect(document.activeElement).toBe(items()[2])
    key(document.activeElement, 'End')
    expect(document.activeElement).toBe(items()[39])
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement).toBe(items()[0])
    key(document.activeElement, 'ArrowLeft')
    expect(document.activeElement).toBe(items()[39])
    key(document.activeElement, 'Home')
    expect(document.activeElement).toBe(items()[0])
  })

  it('does not leak the tablist key handling into the menu', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    button().click()
    const tab = all()[0]

    key(document.activeElement, 'End')

    expect(document.activeElement).not.toBe(tab)
  })

  it('hides the button and the menu when the tabs stop overflowing', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    button().click()

    size(300, 600)
    tabs.update(scan(THREE), 0)

    expect(button().hidden).toBe(true)
    expect(menu().hidden).toBe(true)
  })

  it('is not drawn at all for one diagram', () => {
    size(4000, 600)
    tabs.update(scan('@startuml\nA -> B\n@enduml\n'), 0)

    expect(tabs.element.hidden).toBe(true)
  })

  it('scrolls the strip sideways under a vertical wheel', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })

    tabs.list.dispatchEvent(wheel)

    expect(tabs.list.scrollLeft).toBe(100)
    expect(wheel.defaultPrevented).toBe(true)
  })

  it('leaves a sideways wheel and a strip that fits alone', () => {
    size(4000, 600)
    tabs.update(scan(MANY), 0)
    const sideways = new WheelEvent('wheel', { deltaX: 50, deltaY: 0, bubbles: true, cancelable: true })
    tabs.list.dispatchEvent(sideways)
    expect(sideways.defaultPrevented).toBe(false)

    size(300, 600)
    const fits = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    tabs.list.dispatchEvent(fits)
    expect(fits.defaultPrevented).toBe(false)
    expect(tabs.list.scrollLeft).toBe(0)
  })
})

describe('the all diagrams menu, as a menu button', () => {
  beforeEach(() => {
    size(4000, 600)
    tabs.update(scan(MANY), 3)
  })

  it('closes on Tab and lets the focus move on', () => {
    button().click()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })

    document.activeElement.dispatchEvent(event)

    expect(menu().hidden).toBe(true)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).not.toBe(button())
  })

  it('closes when the focus leaves for somewhere outside, not for the button', () => {
    const elsewhere = document.body.appendChild(document.createElement('input'))
    button().click()
    items()[3].dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: items()[4] }))
    expect(menu().hidden).toBe(false)
    items()[3].dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button() }))
    expect(menu().hidden).toBe(false)

    items()[3].dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }))

    expect(menu().hidden).toBe(true)
  })

  it('opens on ArrowDown from the button, on the active item', () => {
    button().focus()

    key(button(), 'ArrowDown')

    expect(menu().hidden).toBe(false)
    expect(document.activeElement).toBe(items()[3])
  })

  it('is fixed under the button, right-aligned, its height bounded by the room below', () => {
    button().getBoundingClientRect = () => ({ top: 10, bottom: 44, left: 900, right: 934 })
    window.innerWidth = 1000
    window.innerHeight = 500

    button().click()

    expect(menu().style.top).toBe('44px')
    expect(menu().style.right).toBe('66px')
    expect(menu().style.maxHeight).toBe('448px')
  })

  it('keeps a minimum height and stays inside the viewport', () => {
    button().getBoundingClientRect = () => ({ top: 10, bottom: 480, left: 0, right: 20 })
    window.innerWidth = 1000
    window.innerHeight = 500
    Object.defineProperty(menu(), 'offsetWidth', { configurable: true, value: 300 })

    button().click()

    expect(menu().style.maxHeight).toBe('160px')
    expect(menu().style.right).toBe('700px')
  })

  it('follows a window resize and closes when the pane scrolls', () => {
    button().getBoundingClientRect = () => ({ top: 10, bottom: 44, left: 900, right: 934 })
    window.innerWidth = 1000
    button().click()

    window.innerWidth = 800
    window.dispatchEvent(new Event('resize'))
    expect(menu().style.right).toBe('0px')

    menu().dispatchEvent(new Event('scroll'))
    expect(menu().hidden).toBe(false)
    document.body.dispatchEvent(new Event('scroll'))
    expect(menu().hidden).toBe(true)
  })
})
