// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { serverAnswering } from './helpers/server.js'

const seams = vi.hoisted(() => ({
  loadFile: vi.fn(),
  fileAccess: vi.fn(),
  currentEtag: vi.fn(),
  saveFile: vi.fn(),
  saveCopy: vi.fn(),
  cancel: vi.fn(),
  debouncedRender: vi.fn(),
}))
vi.mock('../../src/editor/save.js', () => ({
  ConflictError: class extends Error {},
  loadFile: seams.loadFile,
  currentEtag: seams.currentEtag,
  saveFile: seams.saveFile,
  saveCopy: seams.saveCopy,
  fileAccess: seams.fileAccess,
}))
vi.mock('../../src/editor/preview.js', () => ({ cancel: seams.cancel, debouncedRender: seams.debouncedRender }))
vi.mock('@nextcloud/event-bus', () => ({ emit: vi.fn() }))
vi.mock('@nextcloud/notify_push', () => ({ listen: vi.fn() }))

// jsdom has no layout: CodeMirror measures the text it draws.
Range.prototype.getClientRects ??= () => []
Range.prototype.getBoundingClientRect ??= () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })

const MAIN = '@startuml\n!include ./parts.puml\n@enduml\n'
const PARTS = '@startuml parts\nactor Customer\n@enduml\n'
const LINK = { kind: 'include', path: '/Diagrams/parts.puml', written: './parts.puml', section: null, block: null }

let createLinkedMode
beforeAll(async () => {
  serverAnswering({})
  ;({ createLinkedMode } = await import('../../src/editor/linked/mode.js'))
})

describe('linked mode', () => {
  let view
  let main
  let onChange
  let mode

  beforeEach(() => {
    seams.loadFile.mockResolvedValue({ content: PARTS, etag: '"p1"' })
    seams.fileAccess.mockResolvedValue({ writable: true })
    seams.currentEtag.mockRejectedValue(new Error('not asked in this test'))
    view = new EditorView({ parent: document.body, state: EditorState.create({ doc: MAIN }) })
    main = { name: 'Order flow.puml', session: { pause: vi.fn(), resume: vi.fn(async () => {}), say: vi.fn(), isDirty: () => false } }
    onChange = vi.fn()
    mode = createLinkedMode({
      view: () => view,
      main: () => main,
      isClosing: () => false,
      isClosed: () => false,
      savedOrDiscarded: async () => true,
      showState: () => {},
      redraw: () => {},
      mainChanged: () => {},
      onChange,
    })
  })

  afterEach(() => {
    mode.stop()
    view.destroy()
    vi.restoreAllMocks()
  })

  it('says a linked file opened, which is then the open one', async () => {
    await mode.open(LINK)

    expect(onChange.mock.calls).toEqual([[true]])
    expect(mode.isOpen()).toBe(true)
    expect(mode.current()).toMatchObject({ name: 'parts.puml', readOnly: false })
    expect(view.state.doc.toString()).toBe(PARTS)
    expect(mode.mainState().doc.toString()).toBe(MAIN)
  })

  it('says the main file is back on going back', async () => {
    await mode.open(LINK)

    expect(await mode.goBack()).toBe(true)

    expect(onChange.mock.calls).toEqual([[true], [false]])
    expect(mode.isOpen()).toBe(false)
    expect(view.state.doc.toString()).toBe(MAIN)
  })

  it('says nothing when the file cannot be read, and the main file stays', async () => {
    seams.fileAccess.mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await mode.open(LINK)

    expect(onChange).not.toHaveBeenCalled()
    expect(mode.isOpen()).toBe(false)
    expect(main.session.say).toHaveBeenCalledWith('Could not open the file')
    expect(view.state.doc.toString()).toBe(MAIN)
  })

  it('sends the open file\'s text in place of the file it names (R13)', async () => {
    expect(mode.overrides()).toBeNull()

    await mode.open(LINK)

    expect(mode.overrides()).toEqual({ './parts.puml': PARTS })
  })
})
