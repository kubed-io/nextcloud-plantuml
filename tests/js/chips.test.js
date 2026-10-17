// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// R9, R10: the `<>` chip after a linked file's path, and Ctrl (Cmd) + click on
// the path. Whether a file is there is asked once for the page, again at R6's
// moments (the window focused, the tab shown) and at each open. The answers are
// kept for the page, across tests too: a test that needs none uses its own file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const seams = vi.hoisted(() => ({ fileAccess: vi.fn() }))
vi.mock('../../src/editor/save.js', () => ({ fileAccess: seams.fileAccess }))
const { forgetLinkedFiles, linkedChips } = await import('../../src/editor/linked/chips.js')
const { filePath } = await import('../../src/editor/lint/state.js')

const MAIN = '@startuml order-flow\n<style file=./UML_Fun.css>\n!include ./UML_Fun_parts.puml\n@enduml\n'
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const press = (target, init) => {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
const chips = () => view.dom.querySelectorAll('button.cm-plantuml-link-chip')
/** The text of the chip's line before the chip. */
const before = (chip) => {
  const range = document.createRange()
  range.setStart(chip.closest('.cm-line'), 0)
  range.setEndBefore(chip)
  return range.toString()
}
// A mousedown handler after the chips': it sees every press they leave to CodeMirror.
const passed = vi.fn()
let view

function mount(open, doc) {
  const extensions = [filePath.of('/Diagrams/Order flow.puml'), linkedChips(open), EditorView.domEventHandlers({ mousedown: passed })]
  view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions }) })
}

async function editor(open = vi.fn(), doc = MAIN) {
  mount(open, doc)
  await settle()
  return open
}

beforeEach(() => {
  vi.resetAllMocks()
  forgetLinkedFiles()
  seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: true } : null))
})
afterEach(() => {
  view?.destroy()
  vi.restoreAllMocks()
})

describe('the linked-file chip', () => {
  it('appears once its file answers, named for its file', async () => {
    await editor()

    expect(chips()).toHaveLength(1)
    expect(chips()[0].getAttribute('aria-label')).toBe('Open UML_Fun.css')
    expect(chips()[0].title).toBe('Open UML_Fun.css')
    expect(chips()[0].querySelector('svg')).not.toBeNull()
  })

  it('sits after the > of a style line', async () => {
    await editor()

    expect(before(chips()[0])).toBe('<style file=./UML_Fun.css>')
  })

  it.each([
    ['an include', '!include ./x.puml', '!include ./x.puml'],
    ['a quoted include', '!include_once "./x.puml"  ', '!include_once "./x.puml"'],
    ['an included block', '!include ./x.puml!2', '!include ./x.puml'],
    ['an included section, before its name', '!includesub ./x.puml!NAME', '!includesub ./x.puml'],
  ])('follows the path of %s', async (_, line, text) => {
    seams.fileAccess.mockResolvedValue({ writable: false })

    await editor(vi.fn(), `@startuml\n${line}\n@enduml\n`)

    expect(chips()).toHaveLength(1)
    expect(before(chips()[0])).toBe(text)
  })

  it('opens the file it names', async () => {
    const open = await editor()

    press(chips()[0])

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'style', written: './UML_Fun.css', path: '/Diagrams/UML_Fun.css' }))
  })

  it('opens the file on a Ctrl+click on its path', async () => {
    const open = await editor()

    const event = press(view.contentDOM.querySelector('.cm-plantuml-link[data-linked-path="/Diagrams/UML_Fun.css"]'), { ctrlKey: true })

    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'style', path: '/Diagrams/UML_Fun.css' }))
    expect(event.defaultPrevented).toBe(true)
    expect(passed).not.toHaveBeenCalled()
  })

  it('a linked path is marked as a link, with no key held', async () => {
    await editor()

    const path = view.contentDOM.querySelector('.cm-plantuml-link[data-linked-path="/Diagrams/UML_Fun.css"]')

    expect(path.textContent).toContain('UML_Fun.css')
    expect(view.dom.classList.contains('cm-plantuml-ctrl')).toBe(false)
  })

  it('leaves a Ctrl+click anywhere else to CodeMirror', async () => {
    const open = await editor()

    press(view.contentDOM.querySelector('.cm-line'), { ctrlKey: true })

    expect(open).not.toHaveBeenCalled()
    expect(passed).toHaveBeenCalledTimes(1)
  })

  it('leaves a plain click on the path to CodeMirror', async () => {
    const open = await editor()

    press(view.contentDOM.querySelector('.cm-plantuml-link'))

    expect(open).not.toHaveBeenCalled()
    expect(passed).toHaveBeenCalledTimes(1)
  })

  it('gives a path whose file is not there neither a chip nor a link', async () => {
    await editor()

    expect(view.dom.querySelector('[data-linked-path="/Diagrams/UML_Fun_parts.puml"]')).toBeNull()
  })

  it('takes Cmd, not Ctrl, on macOS', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const open = await editor()
    const path = view.contentDOM.querySelector('.cm-plantuml-link[data-linked-path="/Diagrams/UML_Fun.css"]')

    press(path, { ctrlKey: true })
    press(path, { metaKey: true })

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('marks the editor while Ctrl is held', async () => {
    await editor()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
    expect(view.dom.classList.contains('cm-plantuml-ctrl')).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }))
    expect(view.dom.classList.contains('cm-plantuml-ctrl')).toBe(false)
  })

  it('asks once per path until the window is focused again, then asks again', async () => {
    await editor()
    view.dispatch({ changes: { from: 0, insert: "' a comment\n" } })
    expect(seams.fileAccess).toHaveBeenCalledTimes(2) // the style file and the parts file

    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(seams.fileAccess).toHaveBeenCalledTimes(4))
  })

  it('asks again when the tab is shown again', async () => {
    await editor()

    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => expect(seams.fileAccess).toHaveBeenCalledTimes(4))
  })

  it('asks once per path for a return that both focuses the window and shows the tab', async () => {
    await editor()

    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(seams.fileAccess).toHaveBeenCalledTimes(4))
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(seams.fileAccess).toHaveBeenCalledTimes(4)
  })

  it('keeps the chips showing while the files are asked again', async () => {
    await editor()
    seams.fileAccess.mockReturnValue(new Promise(() => {}))

    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(seams.fileAccess).toHaveBeenCalledTimes(4))

    expect(chips()).toHaveLength(1)
  })

  it('keeps the answers for the page: the editor drawn again does not ask again', async () => {
    await editor()
    view.destroy()

    await editor()

    expect(seams.fileAccess).toHaveBeenCalledTimes(2)
    expect(chips()).toHaveLength(1)
  })

  it('asks again at the next open', async () => {
    await editor()
    view.destroy()

    forgetLinkedFiles()
    await editor()

    expect(seams.fileAccess).toHaveBeenCalledTimes(4)
  })

  it('draws an answer that lands after the editor was drawn again', async () => {
    let answer
    seams.fileAccess.mockImplementation((path) => (path === '/Diagrams/UML_Fun.css' ? new Promise((resolve) => { answer = resolve }) : Promise.resolve(null)))
    mount(vi.fn(), MAIN)
    view.destroy()
    mount(vi.fn(), MAIN)

    answer({ writable: true })
    await settle()

    expect(chips()).toHaveLength(1)
  })

  it('keeps a failed answer until the next return, not asking at every edit', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    // A file no other test asks for, so no answer kept for the page shows its chip.
    seams.fileAccess.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ writable: true })
    await editor(vi.fn(), '@startuml\n<style file=./Offline.css>\n@enduml\n')
    const asked = () => seams.fileAccess.mock.calls.filter(([path]) => path === '/Diagrams/Offline.css')

    for (const insert of ["' one\n", "' two\n", "' three\n"]) {
      view.dispatch({ changes: { from: 0, insert } })
      await settle()
    }
    expect(asked()).toHaveLength(1)
    expect(chips()).toHaveLength(0)

    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(chips()).toHaveLength(1))
    expect(asked()).toHaveLength(2)
  })

  it('gives a line linking the main file itself no chip', async () => {
    seams.fileAccess.mockResolvedValue({ writable: true })

    await editor(vi.fn(), '@startuml\n!include "Order flow.puml"\n!include "./Order flow.puml"\n@enduml\n')

    expect(chips()).toHaveLength(0)
    expect(view.dom.querySelector('[data-linked-path]')).toBeNull()
    expect(seams.fileAccess).not.toHaveBeenCalled()
  })

  it.each([
    ['its chip', () => press(chips()[0])],
    ['a Ctrl+click on its path', () => press(view.contentDOM.querySelector('.cm-plantuml-link'), { ctrlKey: true })],
  ])('logs an open that fails from %s', async (_, click) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('gone')
    await editor(vi.fn().mockRejectedValue(failure))

    click()
    await settle()

    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not open /Diagrams/UML_Fun.css'), failure)
  })

  it('drops the chip of a file that went away', async () => {
    await editor()
    seams.fileAccess.mockResolvedValue(null)

    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(chips()).toHaveLength(0))
  })
})
