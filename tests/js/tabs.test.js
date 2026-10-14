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
    expect(tabs.element.getAttribute('role')).toBe('tablist')
    expect(tabs.element.getAttribute('aria-label')).toBe('Diagrams')
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

  it.each(['Enter', ' '])('activates the focused tab on %j', (k) => {
    tabs.update(scan(THREE), 0)
    all()[2].focus()

    key(all()[2], k)

    expect(onActivate).toHaveBeenCalledWith(2)
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
