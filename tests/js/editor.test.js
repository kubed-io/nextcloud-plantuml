// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The overlay driven through window.OCA.PlantUml.openEditor, with save.js and
// preview.js mocked at their seams: what is asserted is what the user sees
// and what would be written.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { completionStatus, startCompletion } from '@codemirror/autocomplete'

const seams = vi.hoisted(() => {
  class ConflictError extends Error {}
  return {
    ConflictError,
    loadFile: vi.fn(),
    saveFile: vi.fn(),
    saveCopy: vi.fn(),
    debouncedRender: vi.fn(),
    cancel: vi.fn(),
    emit: vi.fn(),
    answer: {},
  }
})
vi.mock('../../src/editor/save.js', () => ({
  ConflictError: seams.ConflictError,
  loadFile: seams.loadFile,
  saveFile: seams.saveFile,
  saveCopy: seams.saveCopy,
}))
vi.mock('@nextcloud/event-bus', () => ({ emit: seams.emit }))
vi.mock('../../src/editor/preview.js', () => ({
  debouncedRender: seams.debouncedRender,
  cancel: seams.cancel,
}))

const q = (selector) => document.querySelector(selector)
const settle = () => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(0) : new Promise((resolve) => setTimeout(resolve, 0)))
const type = (text) => EditorView.findFromDOM(q('.cm-editor')).dispatch({ changes: { from: 0, insert: text } })
const status = () => q('.plantuml-editor__status').textContent
const saveButton = () => q('.plantuml-editor__save')
const indicator = () => saveButton().dataset.state
const reloadButton = () => q('.plantuml-editor__reload')
const copyButton = () => q('.plantuml-editor__copy')
const source = () => EditorView.findFromDOM(q('.cm-editor')).state.doc.toString()

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

// Close what a test left open, so its listeners and timers go with it.
afterEach(async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  q('.plantuml-editor__close')?.click()
  await settle()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A promise the test settles itself, for a save still in flight. */
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

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
    expect(indicator()).toBe('saved')
    expect(q('#content').hasAttribute('inert')).toBe(true)
  })

  it('saves with the ETag it read, then with the one the save returned, and states a conflict', async () => {
    await open()

    type("' first\n")
    expect(indicator()).toBe('unsaved')
    seams.saveFile.mockResolvedValueOnce('"put"')
    saveButton().click()
    await settle()
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' first"), '"get"')
    expect(indicator()).toBe('saved')
    expect(status()).toBe('')

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

  it('saves a change on Escape, then closes back to where it was opened', async () => {
    await open()
    type("' edit\n")
    vi.spyOn(window, 'confirm')
    seams.saveFile.mockResolvedValueOnce('"put"')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' edit"), '"get"')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(q('.plantuml-editor')).toBeNull()
    expect(seams.cancel).toHaveBeenCalled()
    expect(q('#content').hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(q('#opener'))
  })
})

describe('Escape', () => {
  const escape = () => q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

  it('closes the completion popup first, and the editor only after', async () => {
    await open()
    const view = EditorView.findFromDOM(q('.cm-editor'))
    view.dispatch({ selection: { anchor: 0 } })
    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))

    escape()
    expect(completionStatus(view.state)).toBeNull()
    expect(q('.plantuml-editor')).not.toBeNull()

    escape()
    await settle()
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('closes the search panel first, and the editor only after', async () => {
    await open()
    const key = (target, init) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

    key(q('.cm-content'), { key: 'f', ctrlKey: true })
    expect(q('.cm-search')).not.toBeNull()

    key(q('.cm-search input'), { key: 'Escape' })
    expect(q('.cm-search')).toBeNull()
    expect(q('.plantuml-editor')).not.toBeNull()

    escape()
    await settle()
    expect(q('.plantuml-editor')).toBeNull()
  })
})

describe('the source pane', () => {
  const key = (init) => q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  const view = () => EditorView.findFromDOM(q('.cm-editor'))

  it('marks the line the cursor is on, in the text and in the gutter', async () => {
    await open()

    expect(q('.cm-activeLine')).not.toBeNull()
    expect(q('.cm-activeLineGutter')).not.toBeNull()
  })

  it('indents with Tab and toggles a comment with Ctrl+/', async () => {
    await open()
    view().dispatch({ selection: { anchor: '@startuml\n'.length } })

    key({ key: 'Tab' })
    expect(source().split('\n')[1]).toBe('  A -> B')

    key({ key: '/', ctrlKey: true })
    expect(source().split('\n')[1]).toBe("  ' A -> B")
  })

  it('outlines the bracket matching the one at the cursor', async () => {
    seams.loadFile.mockResolvedValue({ content: 'class A {\n}\n', etag: '"get"' })
    await open()
    view().dispatch({ selection: { anchor: 'class A {'.length } })

    expect(q('.cm-matchingBracket')).not.toBeNull()
  })
})

describe('after someone else changed the file', () => {
  const CONFLICT = 'Someone else changed this file'

  /** Opens, edits and saves into a 412. */
  async function conflict() {
    await open()
    type("' mine\n")
    seams.saveFile.mockRejectedValueOnce(new seams.ConflictError())
    saveButton().click()
    await settle()
  }

  it('offers Reload and Save as copy, and keeps saying so as the source changes', async () => {
    await conflict()

    expect(status()).toBe(CONFLICT)
    expect(reloadButton().hidden).toBe(false)
    expect(copyButton().hidden).toBe(false)

    type("' more\n")

    expect(status()).toBe(CONFLICT)
    expect(reloadButton().hidden).toBe(false)
    expect(copyButton().hidden).toBe(false)
  })

  it('shows neither action before a conflict', async () => {
    await open()
    type("' mine\n")

    expect(reloadButton().hidden).toBe(true)
    expect(copyButton().hidden).toBe(true)
  })

  it('Reload asks first, then replaces the source with the saved file and saves on from its ETag', async () => {
    await conflict()
    seams.loadFile.mockResolvedValue({ content: "@startuml\nA -> C\n@enduml\n", etag: '"theirs"' })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    reloadButton().click()
    await settle()
    expect(window.confirm).toHaveBeenCalledWith('Replace your changes with the saved file?')
    expect(source()).toContain("' mine")
    expect(status()).toBe(CONFLICT)

    window.confirm.mockReturnValue(true)
    reloadButton().click()
    await settle()
    expect(seams.loadFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml')
    expect(source()).toBe("@startuml\nA -> C\n@enduml\n")
    expect(status()).toBe('')
    expect(indicator()).toBe('saved')
    expect(reloadButton().hidden).toBe(true)
    expect(copyButton().hidden).toBe(true)

    type("' again\n")
    seams.saveFile.mockResolvedValueOnce('"next"')
    saveButton().click()
    await settle()
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml', expect.stringContaining('A -> C'), '"theirs"')
  })

  it('Save as copy writes the source to a copy, announces it to Files and carries on editing the copy', async () => {
    await conflict()
    const copy = { path: '/Diagrams/Order flow (copy).puml', basename: 'Order flow (copy).puml' }
    seams.saveCopy.mockResolvedValue({ node: copy, etag: '"copy"' })

    copyButton().click()
    await settle()

    expect(seams.saveCopy).toHaveBeenCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' mine"))
    expect(seams.emit).toHaveBeenCalledWith('files:node:created', copy)
    expect(q('.plantuml-editor__name').textContent).toBe('Order flow (copy).puml')
    expect(q('.plantuml-editor').getAttribute('aria-label')).toBe('Order flow (copy).puml')
    expect(status()).toBe('')
    expect(indicator()).toBe('saved')
    expect(reloadButton().hidden).toBe(true)
    expect(copyButton().hidden).toBe(true)

    type("' again\n")
    seams.saveFile.mockResolvedValueOnce('"next"')
    saveButton().click()
    await settle()
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow (copy).puml', expect.stringContaining("' again"), '"copy"')
  })

  it('says so when the copy cannot be saved, and still offers both actions', async () => {
    await conflict()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seams.saveCopy.mockRejectedValue(new Error('Could not save a copy'))

    copyButton().click()
    await settle()

    expect(status()).toBe('Could not save a copy')
    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml')
    expect(reloadButton().hidden).toBe(false)
    expect(copyButton().hidden).toBe(false)
  })

  it('autosaves nothing until it is resolved, then saves on again', async () => {
    vi.useFakeTimers()
    await conflict()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    type("' more\n")
    await vi.advanceTimersByTimeAsync(60000)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    seams.saveCopy.mockResolvedValue({ node: { path: '/Diagrams/Order flow (copy).puml', basename: 'Order flow (copy).puml' }, etag: '"copy"' })
    copyButton().click()
    await settle()
    type("' after\n")
    seams.saveFile.mockResolvedValueOnce('"next"')
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenCalledTimes(2)
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow (copy).puml', expect.stringContaining("' after"), '"copy"')
  })

  it('asks before closing discards the changes', async () => {
    await conflict()
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(q('.plantuml-editor')).not.toBeNull()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    window.confirm.mockReturnValue(true)
    q('.plantuml-editor__close').click()
    await settle()
    expect(q('.plantuml-editor')).toBeNull()
  })
})

describe('saving by itself', () => {
  beforeEach(() => vi.useFakeTimers())

  it('saves a change once typing has paused for two seconds, without a click', async () => {
    await open()
    type("' edit\n")
    seams.saveFile.mockResolvedValueOnce('"put"')

    await vi.advanceTimersByTimeAsync(1999)
    expect(seams.saveFile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' edit"), '"get"')
    expect(indicator()).toBe('saved')
  })

  it('saves a change made while a save was in flight with the next save', async () => {
    await open()
    const first = deferred()
    seams.saveFile.mockReturnValueOnce(first.promise).mockResolvedValueOnce('"second"')

    type("' one\n")
    await vi.advanceTimersByTimeAsync(2000)
    expect(indicator()).toBe('saving')
    type("' two\n")
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    first.resolve('"first"')
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenCalledTimes(2)
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' two"), '"first"')
    expect(indicator()).toBe('saved')
  })

  it('keeps a failed save unsaved, says so, and tries again on the next change only', async () => {
    await open()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seams.saveFile.mockRejectedValueOnce(new Error('503'))

    type("' edit\n")
    await vi.advanceTimersByTimeAsync(2000)
    expect(status()).toBe('Could not save the file')
    expect(indicator()).toBe('unsaved')
    await vi.advanceTimersByTimeAsync(60000)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    seams.saveFile.mockResolvedValueOnce('"put"')
    type("' again\n")
    expect(status()).toBe('')
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenCalledTimes(2)
    expect(indicator()).toBe('saved')
  })
})

describe('the save indicator', () => {
  it('is one Save button: a check when saved, a dot when not, a spinner while saving', async () => {
    await open()
    expect(saveButton().getAttribute('aria-label')).toBe('Save')
    expect(saveButton().querySelector('svg')).not.toBeNull()
    expect(indicator()).toBe('saved')

    type("' edit\n")
    expect(indicator()).toBe('unsaved')
    expect(saveButton().title).toBe('Unsaved changes')

    const pending = deferred()
    seams.saveFile.mockReturnValueOnce(pending.promise)
    saveButton().click()
    expect(indicator()).toBe('saving')
    expect(saveButton().classList.contains('icon-loading-small')).toBe(true)

    pending.resolve('"put"')
    await settle()
    expect(indicator()).toBe('saved')
    expect(saveButton().classList.contains('icon-loading-small')).toBe(false)
    expect(saveButton().title).toBe('Saved just now')
  })

  it('says how long ago the last save was', async () => {
    vi.useFakeTimers()
    await open()
    type("' edit\n")
    seams.saveFile.mockResolvedValueOnce('"put"')
    saveButton().click()
    await settle()
    expect(saveButton().title).toBe('Saved just now')

    await vi.advanceTimersByTimeAsync(60000)
    expect(saveButton().title).toBe('Saved 1 min ago')
    await vi.advanceTimersByTimeAsync(4 * 60000)
    expect(saveButton().title).toBe('Saved 5 min ago')
  })

  it('saves at once on Ctrl+S', async () => {
    await open()
    type("' edit\n")
    seams.saveFile.mockResolvedValueOnce('"put"')

    q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    await settle()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
  })
})

describe('closing', () => {
  it('saves unsaved changes first, then closes', async () => {
    await open()
    type("' edit\n")
    vi.spyOn(window, 'confirm')
    seams.saveFile.mockResolvedValueOnce('"put"')

    q('.plantuml-editor__close').click()
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' edit"), '"get"')
    expect(window.confirm).not.toHaveBeenCalled()
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('stays open and says so when that save is refused', async () => {
    await open()
    type("' edit\n")
    seams.saveFile.mockRejectedValueOnce(new seams.ConflictError())

    q('.plantuml-editor__close').click()
    await settle()

    expect(q('.plantuml-editor')).not.toBeNull()
    expect(status()).toBe('Someone else changed this file')
    expect(source()).toContain("' edit")
  })

  it('stays open and says so when that save fails', async () => {
    await open()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    type("' edit\n")
    seams.saveFile.mockRejectedValueOnce(new Error('503'))

    q('.plantuml-editor__close').click()
    await settle()

    expect(q('.plantuml-editor')).not.toBeNull()
    expect(status()).toBe('Could not save the file')
  })

  it('has the browser ask before leaving the page with unsaved changes', async () => {
    await open()
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)

    type("' edit\n")
    expect(leave()).toBe(true)
  })
})
