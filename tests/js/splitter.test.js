// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The line between source and diagram: dragged, keyed, reset, remembered.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@nextcloud/l10n', () => ({ translate: (_app, text) => text }))

const { createSplitter, STORAGE_KEY } = await import('../../src/editor/splitter.js')

let panes, source, handle
const split = () => panes.style.getPropertyValue('--plantuml-split')
const pointer = (type, clientX) => handle.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX }))
const key = (k) => handle.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

beforeEach(() => {
  window.localStorage.clear()
  panes = document.createElement('div')
  source = document.createElement('div')
  source.id = 'src'
  panes.getBoundingClientRect = () => ({ left: 100, width: 1000, top: 0, height: 500, right: 1100, bottom: 500 })
  handle = createSplitter(panes, source)
  panes.append(source, handle)
  document.body.replaceChildren(panes)
})

describe('the splitter', () => {
  it('is a focusable vertical separator for the source pane, at 50% to start', () => {
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('tabindex')).toBe('0')
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('aria-controls')).toBe('src')
    expect(handle.getAttribute('aria-valuenow')).toBe('50')
    expect(split()).toBe('50%')
  })

  it('follows a drag, and remembers where it was let go', () => {
    pointer('pointerdown', 600)
    pointer('pointermove', 400)
    expect(split()).toBe('30%')
    expect(handle.classList.contains('plantuml-editor__splitter--dragging')).toBe(true)
    pointer('pointerup', 400)
    expect(handle.classList.contains('plantuml-editor__splitter--dragging')).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('30')

    pointer('pointermove', 900)
    expect(split()).toBe('30%')
  })

  it('stops at 20% and 80%', () => {
    pointer('pointerdown', 600)
    pointer('pointermove', 105)
    expect(split()).toBe('20%')
    pointer('pointermove', 1095)
    expect(split()).toBe('80%')
  })

  it('moves by 5% on the arrow keys, to the ends on Home and End, and back to half on Enter', () => {
    key('ArrowLeft')
    expect(split()).toBe('45%')
    key('ArrowRight')
    key('ArrowRight')
    expect(split()).toBe('55%')
    key('Home')
    expect(split()).toBe('20%')
    key('End')
    expect(split()).toBe('80%')
    key('Enter')
    expect(split()).toBe('50%')
  })

  it('goes back to half on a double click', () => {
    key('Home')
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(split()).toBe('50%')
  })

  it('opens where it was last left, and at half when storage holds nonsense or throws', () => {
    window.localStorage.setItem(STORAGE_KEY, '35')
    expect(createSplitter(panes, source).getAttribute('aria-valuenow')).toBe('35')

    window.localStorage.setItem(STORAGE_KEY, '99')
    expect(createSplitter(panes, source).getAttribute('aria-valuenow')).toBe('50')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(createSplitter(panes, source).getAttribute('aria-valuenow')).toBe('50')
    vi.restoreAllMocks()
  })
})
