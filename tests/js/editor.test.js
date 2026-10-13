// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The overlay driven through window.OCA.PlantUml.openEditor, with save.js and
// preview.js mocked at their seams: what is asserted is what the user sees
// and what would be written.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'

const seams = vi.hoisted(() => {
  class ConflictError extends Error {}
  return { ConflictError, loadFile: vi.fn(), saveFile: vi.fn(), debouncedRender: vi.fn(), cancel: vi.fn(), answer: {} }
})
vi.mock('../../src/editor/save.js', () => ({
  ConflictError: seams.ConflictError,
  loadFile: seams.loadFile,
  saveFile: seams.saveFile,
}))
vi.mock('../../src/editor/preview.js', () => ({
  debouncedRender: seams.debouncedRender,
  cancel: seams.cancel,
}))

const q = (selector) => document.querySelector(selector)
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const type = (text) => EditorView.findFromDOM(q('.cm-editor')).dispatch({ changes: { from: 0, insert: text } })
const status = () => q('.plantuml-editor__status').textContent
const saveButton = () => q('.plantuml-editor__save')

beforeAll(async () => {
  window.OCA = {}
  await import('../../src/editor.js')
})

beforeEach(() => {
  vi.resetAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:diagram')
  URL.revokeObjectURL = vi.fn()
  seams.answer = { error: null, blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }) }
  seams.debouncedRender.mockImplementation((_source, cb) => cb(seams.answer.error, seams.answer.blob))
  seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
  document.body.innerHTML = '<div id="content"><button id="opener">Edit diagram</button></div>'
})

// Close what a test left open, so its Escape listener goes with it.
afterEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  q('.plantuml-editor__close')?.click()
  vi.restoreAllMocks()
})

async function open() {
  q('#opener').focus()
  window.OCA.PlantUml.openEditor({ path: '/Diagrams/Order flow.puml', basename: 'Order flow.puml' })
  await settle()
}

describe('the editor overlay', () => {
  it('opens on the source with its diagram, the page beneath out of reach', async () => {
    await open()

    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml')
    expect(q('.cm-content').textContent).toContain('A -> B')
    expect(q('.plantuml-editor__image').hidden).toBe(false)
    expect(q('.plantuml-editor__image').src).toBe('blob:diagram')
    expect(saveButton().disabled).toBe(true)
    expect(q('#content').hasAttribute('inert')).toBe(true)
  })

  it('saves with the ETag it read, then with the one the save returned, and states a conflict', async () => {
    await open()

    type("' first\n")
    expect(status()).toBe('Unsaved changes')
    seams.saveFile.mockResolvedValueOnce('"put"')
    saveButton().click()
    await settle()
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' first"), '"get"')
    expect(status()).toBe('Saved')
    expect(saveButton().disabled).toBe(true)

    type("' second\n")
    seams.saveFile.mockRejectedValueOnce(new seams.ConflictError())
    saveButton().click()
    await settle()
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' second"), '"put"')
    expect(status()).toBe('Someone else changed this file')
  })

  it('shows the problem where the diagram was and keeps the source editable', async () => {
    await open()

    seams.answer = { error: new Error('not set') }
    type("' edit\n")

    expect(q('.plantuml-editor__problem').textContent).toBe('not set')
    expect(q('.plantuml-editor__problem').getAttribute('role')).toBe('status')
    expect(q('.plantuml-editor__problem').hidden).toBe(false)
    expect(q('.plantuml-editor__image').hidden).toBe(true)
    expect(q('.cm-content').getAttribute('contenteditable')).toBe('true')
  })

  it('asks before Escape discards changes, and closes back to where it was opened', async () => {
    await open()
    type("' edit\n")
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(q('.plantuml-editor')).not.toBeNull()

    window.confirm.mockReturnValue(true)
    q('.plantuml-editor__close').click()

    expect(q('.plantuml-editor')).toBeNull()
    expect(seams.cancel).toHaveBeenCalled()
    expect(q('#content').hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(q('#opener'))
  })
})
