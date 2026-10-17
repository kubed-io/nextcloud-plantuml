// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
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

  it('shows words on its buttons, or icons alone that still have names', () => {
    // The icons' SVG markup brings whitespace of its own, so the label span is what is read.
    expect(createToolbar(options).exportButton.querySelector('.plantuml-viewer__label').textContent).toBe('Export')
    const bare = createToolbar({ ...options, labelled: false })
    expect(bare.exportButton.querySelector('.plantuml-viewer__label')).toBeNull()
    expect(bare.exportButton.textContent.trim()).toBe('')
    expect(bare.exportButton.getAttribute('aria-label')).toBe('Export')
    expect(bare.exportButton.title).toBe('Export')
  })

  it('has no Export for a file whose share forbids download', () => {
    const toolbar = createToolbar({ ...options, exportable: false })
    expect(names(toolbar)).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Edit'])
    expect(toolbar.exportButton).toBeNull()
    expect(() => toolbar.setExportLabel('Export 2')).not.toThrow()
  })

  it('renames Export, words or not', () => {
    const labelled = createToolbar(options)
    labelled.setExportLabel('Export 2')
    expect(labelled.exportButton.querySelector('.plantuml-viewer__label').textContent).toBe('Export 2')
    const bare = createToolbar({ ...options, labelled: false })
    bare.setExportLabel('Export 2')
    expect(bare.exportButton.getAttribute('aria-label')).toBe('Export 2')
    expect(bare.exportButton.title).toBe('Export 2')
  })
})
