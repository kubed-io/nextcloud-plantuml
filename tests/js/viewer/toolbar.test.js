// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createToolbar } from '../../../src/viewer/toolbar.js'

const names = (toolbar) => [...toolbar.element.querySelectorAll('button, .plantuml-viewer__divider')]
  .map((part) => part.getAttribute('aria-label') ?? 'divider')
const options = { single: false, editable: true, onMode: vi.fn(), onExport: vi.fn(), onEdit: vi.fn() }

describe('the toolbar', () => {
  it('puts the switch, a divider, Export and Edit in that order', () => {
    expect(names(createToolbar(options))).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Export', 'Edit'])
  })

  it('is a named group, promising no arrow keys of a toolbar', () => {
    // ←/→ on its buttons go on to the Viewer, which shows the next file.
    const { element } = createToolbar(options)
    expect(element.getAttribute('role')).toBe('group')
    expect(element.getAttribute('aria-label')).toBe('Diagram toolbar')
  })

  it('has no switch and no divider for one diagram', () => {
    expect(names(createToolbar({ ...options, single: true }))).toEqual(['Export', 'Edit'])
  })

  it('has no Edit without a server to draw with', () => {
    expect(names(createToolbar({ ...options, editable: false }))).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Export'])
  })

  it('presses the one mode shown', () => {
    const toolbar = createToolbar(options)
    toolbar.setMode('wall')
    const pressed = [...toolbar.element.querySelectorAll('[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'))
    expect(pressed).toEqual(['Wall'])
  })

  it('asks for the mode clicked', () => {
    const onMode = vi.fn()
    createToolbar({ ...options, onMode }).element.querySelector('[aria-label="Stack"]').click()
    expect(onMode).toHaveBeenCalledWith('stack')
  })

  it('draws icons alone, each button\'s word its hover text and its name', () => {
    const toolbar = createToolbar(options)
    const buttons = [...toolbar.element.querySelectorAll('button')]
    expect(buttons.map((b) => b.title)).toEqual(['Tabs', 'Stack', 'Wall', 'Export', 'Edit'])
    for (const b of buttons) {
      expect(b.querySelector('.plantuml-viewer__label')).toBeNull()
      expect(b.textContent.trim()).toBe('')
      expect(b.getAttribute('aria-label')).toBe(b.title)
    }
  })

  it('still draws the label span when asked for words', () => {
    const button = createToolbar({ ...options, labelled: true }).exportButton
    expect(button.querySelector('.plantuml-viewer__label').textContent).toBe('Export')
  })

  it('has no Export for a file whose share forbids download', () => {
    const toolbar = createToolbar({ ...options, exportable: false })
    expect(names(toolbar)).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Edit'])
    expect(toolbar.exportButton).toBeNull()
    expect(() => toolbar.setExportLabel('Export 2')).not.toThrow()
  })

  it('renames Export in its hover text and name', () => {
    const toolbar = createToolbar(options)
    toolbar.setExportLabel('Export 2')
    expect(toolbar.exportButton.querySelector('.plantuml-viewer__label')).toBeNull()
    expect(toolbar.exportButton.getAttribute('aria-label')).toBe('Export 2')
    expect(toolbar.exportButton.title).toBe('Export 2')
  })
})

describe('the Viewer\'s focus ring (VW2)', () => {
  // Read from disk: vitest hands a stylesheet import back empty, ?raw too.
  const css = readFileSync('css/viewer.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))

  it('is the app\'s on the toolbar, the tabs and the menu\'s rows, over core\'s !important one', () => {
    const shared = rules.find((r) => r.selector.startsWith('.plantuml-viewer .plantuml-viewer__head button:not(:disabled)'))
    expect(shared?.selector).toBe('.plantuml-viewer .plantuml-viewer__head button:not(:disabled):focus-visible')
    expect(shared.body).toMatch(/outline: 2px solid var\(--color-primary-element\) !important;/)
    expect(shared.body).toMatch(/box-shadow: none !important;/)
  })

  it('leaves no button an outline of the app\'s that core\'s !important one would beat', () => {
    const beaten = rules.filter((r) => /button[^,]*:focus-visible/.test(r.selector) && /(^|;)\s*outline:(?![^;]*!important)/.test(r.body))
    expect(beaten.map((r) => r.selector)).toEqual([])
  })
})
