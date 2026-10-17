// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMenu } from '../../../src/viewer/menu.js'

let anchor
let onPick
let menu
let what
const items = [{ label: 'SVG', value: 'svg' }, { label: 'PNG', value: 'png' }]
const shown = () => document.querySelector('.plantuml-viewer__menu')
// Item names are read from data-value or the label span: the icon's SVG markup brings whitespace of its own.
const focused = () => document.activeElement.dataset.value
const key = (name) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

beforeEach(() => {
  document.body.replaceChildren()
  const bar = document.createElement('div')
  anchor = document.createElement('button')
  Object.defineProperty(anchor, 'offsetLeft', { configurable: true, value: 120 })
  bar.append(anchor)
  document.body.append(bar)
  onPick = vi.fn()
  what = 'login'
  menu = createMenu({ anchor, heading: () => what, items, onPick })
})

describe('the export menu', () => {
  it('opens under its button, left edges aligned, its heading first and out of the focus order', () => {
    menu.open()
    expect(shown().hidden).toBe(false)
    expect(shown().style.left).toBe('120px')
    expect(shown().firstElementChild.textContent).toBe('login')
    expect(shown().firstElementChild.tabIndex).toBe(-1)
    expect(focused()).toBe('svg')
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
  })

  it('is named by its heading, which is no item of it', () => {
    menu.destroy()
    menu = createMenu({ anchor, heading: () => what, items, onPick, idPrefix: 'plantuml-viewer-7-' })
    const title = shown().firstElementChild

    expect(title.id).toBe('plantuml-viewer-7-export-heading')
    expect(shown().getAttribute('aria-labelledby')).toBe('plantuml-viewer-7-export-heading')
    expect(title.getAttribute('role')).toBe('none')
  })

  it('reads its heading anew each time it opens', () => {
    menu.open()
    menu.close()
    what = '2 diagrams, as .zip'
    menu.open()
    expect(shown().firstElementChild.textContent).toBe('2 diagrams, as .zip')
  })

  it('labels each item with its format, an icon before it', () => {
    expect([...shown().querySelectorAll('.plantuml-viewer__menu-label')].map((label) => label.textContent)).toEqual(['SVG', 'PNG'])
    expect(shown().querySelectorAll('[role="menuitem"] .plantuml-viewer__menu-icon svg')).toHaveLength(2)
  })

  it('moves with the arrows and wraps', () => {
    menu.open()
    key('ArrowDown')
    expect(focused()).toBe('png')
    key('ArrowDown')
    expect(focused()).toBe('svg')
    key('ArrowUp')
    expect(focused()).toBe('png')
    key('Home')
    expect(focused()).toBe('svg')
    key('End')
    expect(focused()).toBe('png')
  })

  it('closes on Escape, back to its button', () => {
    menu.open()
    key('Escape')
    expect(shown().hidden).toBe(true)
    expect(document.activeElement).toBe(anchor)
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes when Tab takes the focus on', () => {
    menu.open()
    key('Tab')
    expect(shown().hidden).toBe(true)
  })

  it('picks and closes', () => {
    menu.open()
    shown().querySelectorAll('[role="menuitem"]')[1].click()
    expect(onPick).toHaveBeenCalledWith('png')
    expect(shown().hidden).toBe(true)
  })

  it('closes on a click elsewhere', () => {
    menu.open()
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(shown().hidden).toBe(true)
  })

  it('stays open for a click on its own button, which decides for itself', () => {
    menu.open()
    anchor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(shown().hidden).toBe(false)
  })

  it('leaves the page as it found it once destroyed', () => {
    menu.open()
    menu.destroy()
    expect(shown()).toBeNull()
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
  })
})
