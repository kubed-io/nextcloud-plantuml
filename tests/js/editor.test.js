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
import { forceLinting } from '@codemirror/lint'
import { undo } from '@codemirror/commands'
import { ensureSyntaxTree, language } from '@codemirror/language'
import swallowed from '../fixtures/diagrams/swallowed.puml?raw'
import { serverAnswering } from './helpers/server.js'

const seams = vi.hoisted(() => {
  class ConflictError extends Error {}
  return {
    ConflictError,
    loadFile: vi.fn(),
    currentEtag: vi.fn(),
    saveFile: vi.fn(),
    saveCopy: vi.fn(),
    debouncedRender: vi.fn(),
    cancel: vi.fn(),
    emit: vi.fn(),
    listen: vi.fn(),
    answer: {},
  }
})
vi.mock('../../src/editor/save.js', () => ({
  ConflictError: seams.ConflictError,
  loadFile: seams.loadFile,
  currentEtag: seams.currentEtag,
  saveFile: seams.saveFile,
  saveCopy: seams.saveCopy,
}))
vi.mock('@nextcloud/event-bus', () => ({ emit: seams.emit }))
vi.mock('@nextcloud/notify_push', () => ({ listen: seams.listen }))
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
const refreshButton = () => q('.plantuml-editor__refresh')
const toggle = () => q('.plantuml-editor__source-toggle')
const source = () => EditorView.findFromDOM(q('.cm-editor')).state.doc.toString()
const image = () => q('.plantuml-editor__image')
// What PlantUML answers for a diagram with one link, cut down.
const diagram = (label = 'docs') => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
  + ' style="width:120px;height:40px;background:#FFFFFF;" width="120px" height="40px" viewBox="0 0 120 40"'
  + ` preserveAspectRatio="none"><a target="_top" href="https://example.com/docs" xlink:href="https://example.com/docs">`
  + `<text x="5" y="20">${label}</text></a></svg>`

// The server's named colours (X14), asked once for the page, so set before any test.
const COLORS = { AliceBlue: '#F0F8FF', Red: '#FF0000', Yellow: '#FFFF00', Odd: null }

beforeAll(async () => {
  window.OCA = {}
  serverAnswering({ colors: COLORS })
  await import('../../src/editor.js')
})

beforeEach(() => {
  vi.resetAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:diagram')
  seams.answer = { error: null, svg: diagram() }
  // The answer never lands inside the change that asked for it.
  seams.debouncedRender.mockImplementation((_source, _index, _path, cb) => queueMicrotask(() => cb(seams.answer.error, seams.answer.svg, seams.answer.mistake ?? null)))
  seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
  // A test about changes elsewhere says what the file's ETag is; any other
  // test's checks fail, which the editor keeps to the debug console.
  seams.currentEtag.mockRejectedValue(new Error('not asked in this test'))
  vi.spyOn(console, 'debug').mockImplementation(() => {})
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
    expect(image().hidden).toBe(false)
    expect(image().querySelector('svg').textContent).toBe('docs')
    expect(indicator()).toBe('saved')
    expect(q('#content').hasAttribute('inert')).toBe(true)
  })

  it('draws the diagram inline, named for a screen reader, its links opening in a new tab', async () => {
    seams.answer.svg = diagram().replace('<text', '<script>alert(1)</script><text')
    await open()

    expect(image().getAttribute('role')).toBe('img')
    expect(image().getAttribute('aria-label')).toBe('Order flow.puml')
    expect(image().querySelectorAll('svg')).toHaveLength(1)
    expect(image().querySelector('script')).toBeNull()
    expect(image().querySelector('svg').getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    const link = image().querySelector('a')
    expect(link.getAttribute('href')).toBe('https://example.com/docs')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('keeps the diagram on screen until the next one is drawn, then swaps it', async () => {
    await open()
    let answer
    seams.debouncedRender.mockImplementation((_source, _index, _path, cb) => { answer = cb })

    type("' edit\n")
    expect(image().hidden).toBe(false)
    expect(image().textContent).toBe('docs')

    answer(null, diagram('changed'), null)
    expect(image().querySelectorAll('svg')).toHaveLength(1)
    expect(image().textContent).toBe('changed')
  })

  it('says it could not draw the diagram when the answer is no SVG', async () => {
    await open()

    seams.answer = { error: null, svg: '<html><body>Log in</body></html>' }
    type("' edit\n")
    await settle()

    expect(q('.plantuml-editor__problem').textContent).toBe('Could not draw the diagram')
    expect(q('.plantuml-editor__problem').hidden).toBe(false)
    expect(image().hidden).toBe(true)
  })

  it('wraps long lines, so the source never scrolls sideways', async () => {
    await open()
    expect(q('.cm-editor .cm-content').classList.contains('cm-lineWrapping')).toBe(true)
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
    await settle()

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

  it('closes a pinned doc card first, from the card or the source, and the editor only after', async () => {
    await open()
    const view = EditorView.findFromDOM(q('.cm-editor'))
    const docKeys = () => {
      q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'k', keyCode: 75, ctrlKey: true, bubbles: true, cancelable: true }))
      q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'i', keyCode: 73, ctrlKey: true, bubbles: true, cancelable: true }))
    }
    view.dispatch({ selection: { anchor: 1 } })
    await vi.waitFor(() => {
      docKeys()
      expect(q('.cm-doc-pinned .cm-doc')).not.toBeNull()
    })

    docKeys()
    expect(q('.cm-doc-pinned').contains(document.activeElement)).toBe(true)
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }))
    expect(q('.cm-doc')).toBeNull()
    expect(document.activeElement).toBe(q('.cm-content'))
    expect(q('.plantuml-editor')).not.toBeNull()

    docKeys()
    expect(q('.cm-doc-pinned')).not.toBeNull()
    escape()
    expect(q('.cm-doc')).toBeNull()
    expect(q('.plantuml-editor')).not.toBeNull()

    escape()
    await settle()
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('closes the diagnostics panel first, and the editor only after', async () => {
    await open()
    const key = (target, init) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

    key(q('.cm-content'), { key: 'M', keyCode: 77, ctrlKey: true, shiftKey: true })
    expect(q('.cm-panel-lint')).not.toBeNull()

    key(q('.cm-panel-lint ul'), { key: 'Escape', keyCode: 27 })
    expect(q('.cm-panel-lint')).toBeNull()
    expect(q('.plantuml-editor')).not.toBeNull()

    // Escape typed in the source closes an open panel too, not the editor.
    key(q('.cm-content'), { key: 'M', keyCode: 77, ctrlKey: true, shiftKey: true })
    key(q('.cm-content'), { key: 'Escape', keyCode: 27 })
    expect(q('.cm-panel-lint')).toBeNull()
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

describe('validation', () => {
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const lint = async () => {
    await settle()
    forceLinting(view())
    await settle()
  }
  const openPanel = () => q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'M', keyCode: 77, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))

  it('warns that the diagram has no name, and names it after the file', async () => {
    await open()
    await lint()

    expect(q('.cm-lintRange-warning').textContent).toBe('@startuml')
    expect(q('.cm-lint-marker-warning')).not.toBeNull()
    openPanel()
    expect(q('.cm-panel-lint').textContent).toContain('Name the diagram: @startuml <name>')
    q('.cm-panel-lint .cm-diagnosticAction').click()

    expect(source().split('\n')[0]).toBe('@startuml Order_flow')
  })

  it('names it after the copy once the source is saved as one', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
    await open()
    type("' mine\n")
    seams.saveFile.mockRejectedValueOnce(new seams.ConflictError())
    saveButton().click()
    await settle()
    seams.saveCopy.mockResolvedValue({ node: { path: '/Diagrams/Order flow (copy).puml', basename: 'Order flow (copy).puml' }, etag: '"copy"' })
    copyButton().click()
    await lint()

    openPanel()
    q('.cm-panel-lint .cm-diagnosticAction').click()

    expect(source().split('\n')[1]).toBe('@startuml Order_flow_copy')
  })

  it('underlines the line the server names as a mistake, until a render comes back clean', async () => {
    await open()
    seams.answer = { ...seams.answer, mistake: { message: 'Syntax Error? (Assumed diagram type: sequence)', line: 3 } }
    type("' edit\n")
    await lint()

    expect(q('.cm-lintRange-error').textContent).toBe('A -> B')
    openPanel()
    expect(q('.cm-panel-lint').textContent).toContain('Syntax Error? (Assumed diagram type: sequence)')

    seams.answer = { ...seams.answer, mistake: null }
    type("' fixed\n")
    await lint()
    expect(q('.cm-lintRange-error')).toBeNull()
  })

  it('forgets the mistake once the source is emptied, as there is nothing left to draw', async () => {
    await open()
    seams.answer = { ...seams.answer, mistake: { message: 'Syntax Error?', line: 1 } }
    type("' edit\n")
    await lint()
    expect(q('.cm-lintRange-error, .cm-lintPoint-error')).not.toBeNull()

    view().dispatch({ changes: { from: 0, to: view().state.doc.length } })
    await lint()

    expect(q('.cm-lintRange-error, .cm-lintPoint-error')).toBeNull()
  })

  it('underlines nothing when the server cannot draw, and still says why', async () => {
    await open()
    seams.answer = { error: new Error('unreachable'), mistake: { message: 'stale', line: 1 } }
    type("' edit\n")
    await lint()

    expect(q('.cm-lintRange-error')).toBeNull()
    expect(q('.plantuml-editor__problem').textContent).toBe('unreachable')
  })
})

describe('the colour picker', () => {
  const swatch = () => q('.cm-content span[data-color] input[type=color]')

  it.each([
    ['skinparam backgroundColor #2B3E50', '#2B3E50'],
    ['api -[#FF6F61,bold]-> jobs', '#FF6F61'],
    ['node web #ABC', '#ABC'],
  ])('puts a swatch on the colour in `%s`, and a pick rewrites it in place', async (line, colour) => {
    seams.loadFile.mockResolvedValue({ content: `@startuml\n${line}\n@enduml\n`, etag: '"get"' })
    await open()

    expect(swatch().dataset.colorraw).toBe(colour)
    expect(swatch().value).toBe(colour.length === 4 ? `#${[...colour.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : colour.toLowerCase())

    swatch().value = '#00ff00'
    swatch().dispatchEvent(new Event('change', { bubbles: true }))

    expect(source()).toBe(`@startuml\n${line.replace(colour, '#00ff00')}\n@enduml\n`)
    expect(indicator()).toBe('unsaved')
  })

  const swatches = () => [...document.querySelectorAll('.cm-content span[data-color]')]
  const pick = (input, value) => {
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  it('puts the server\'s swatch on a named colour, one per colour, and a pick writes #rrggbb', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nnode web #AliceBlue\nnode db #FF0000\n@enduml\n', etag: '"get"' })
    await open()
    await vi.waitFor(() => expect(swatches()).toHaveLength(2))

    const named = swatches()[0].querySelector('input')
    expect(named.dataset.colorraw).toBe('#AliceBlue')
    expect(named.value).toBe('#f0f8ff')
    expect(swatches()[0].style.backgroundColor).toBe('rgb(240, 248, 255)')

    pick(named, '#00ff00')

    expect(source()).toBe('@startuml\nnode web #00ff00\nnode db #FF0000\n@enduml\n')
  })

  it('gives each part of a gradient its swatch, and a pick keeps the second without its #', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nrectangle A #Red/Yellow\n@enduml\n', etag: '"get"' })
    await open()
    await vi.waitFor(() => expect(swatches()).toHaveLength(2))

    expect(swatches().map((swatch) => swatch.dataset.color)).toEqual(['#ff0000', '#ffff00'])
    pick(swatches()[1].querySelector('input'), '#00ff00')
    expect(source()).toBe('@startuml\nrectangle A #Red/00ff00\n@enduml\n')
    pick(swatches()[0].querySelector('input'), '#0000ff')
    expect(source()).toBe('@startuml\nrectangle A #0000ff/00ff00\n@enduml\n')
  })

  it('puts a swatch on a named colour in a style block, and a pick writes #rrggbb', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\n<style>\nnode { LineColor yellow; FontStyle bold }\n</style>\n@enduml\n', etag: '"get"' })
    await open()
    await vi.waitFor(() => expect(swatches()).toHaveLength(1))

    expect(swatches()[0].dataset.color).toBe('#ffff00')
    pick(swatches()[0].querySelector('input'), '#00ff00')
    expect(source()).toBe('@startuml\n<style>\nnode { LineColor #00ff00; FontStyle bold }\n</style>\n@enduml\n')
  })

  it('puts no swatch on a name the server does not draw', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nnode a #NoSuchColour\nnode b #Odd\nnode c #Red\n@enduml\n', etag: '"get"' })
    await open()
    await vi.waitFor(() => expect(swatches()).toHaveLength(1))

    expect(swatches()[0].querySelector('input').dataset.colorraw).toBe('#Red')
  })

  it('offers the server\'s colours after a # with their swatches', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nactor Bob #\n@enduml\n', etag: '"get"' })
    await open()
    const view = EditorView.findFromDOM(q('.cm-editor'))
    view.dispatch({ selection: { anchor: '@startuml\nactor Bob #'.length } })
    startCompletion(view)
    await vi.waitFor(() => expect(q('.cm-tooltip-autocomplete')).not.toBeNull())

    const offered = Object.fromEntries([...document.querySelectorAll('.cm-tooltip-autocomplete li')]
      .map((item) => [item.querySelector('.cm-completionLabel').textContent, item.querySelector('span[data-color]')?.dataset.color ?? null]))
    expect(offered).toEqual(COLORS)
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
    expect(image().getAttribute('aria-label')).toBe('Order flow (copy).puml')
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

  it('resolves the diagram\'s relative files against the copy once it carries on there (R4)', async () => {
    await conflict()
    seams.saveCopy.mockResolvedValue({ node: { path: '/Shared/Order flow (copy).puml', basename: 'Order flow (copy).puml' }, etag: '"copy"' })

    copyButton().click()
    await settle()
    type("' again\n")

    expect(seams.debouncedRender.mock.calls.at(-1)[2]).toBe('/Shared/Order flow (copy).puml')
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
    await vi.advanceTimersByTimeAsync(55 * 60000)
    expect(saveButton().title).toBe('Saved 1 h ago')
    await vi.advanceTimersByTimeAsync(2 * 60 * 60000)
    expect(saveButton().title).toBe('Saved 3 h ago')
  })

  it('saves at once on Ctrl+S', async () => {
    await open()
    type("' edit\n")
    seams.saveFile.mockResolvedValueOnce('"put"')

    q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    await settle()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
  })

  it('saves exactly once on Ctrl+S from the source, the browser\'s Save page kept away', async () => {
    await open()
    type("' edit\n")
    seams.saveFile.mockResolvedValue('"put"')
    const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })

    q('.cm-content').dispatchEvent(save)
    await settle()

    expect(save.defaultPrevented).toBe(true)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
  })

  it('leaves Ctrl+Shift+S alone, in the source or out of it, Caps Lock or not', async () => {
    await open()
    type("' edit\n")
    seams.saveFile.mockResolvedValue('"put"')
    const presses = [
      [q('.cm-content'), { key: 'S', ctrlKey: true, shiftKey: true }],
      [saveButton(), { key: 'S', ctrlKey: true, shiftKey: true }],
      [saveButton(), { key: 's', metaKey: true, shiftKey: true }],
    ].map(([target, init]) => {
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event
    })
    await settle()

    expect(presses.map((event) => event.defaultPrevented)).toEqual([false, false, false])
    expect(seams.saveFile).not.toHaveBeenCalled()

    saveButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, bubbles: true, cancelable: true }))
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

  it('asks before discarding when that save fails, and on a later close asks without saving again', async () => {
    await open()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    type("' edit\n")
    seams.saveFile.mockRejectedValueOnce(new Error('403'))

    q('.plantuml-editor__close').click()
    await settle()
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(q('.plantuml-editor')).not.toBeNull()
    expect(status()).toBe('Could not save the file')

    window.confirm.mockReturnValue(true)
    q('.plantuml-editor__close').click()
    await settle()
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('asks before discarding when the save is still hanging after ten seconds', async () => {
    vi.useFakeTimers()
    await open()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    type("' edit\n")
    seams.saveFile.mockReturnValueOnce(new Promise(() => {}))

    q('.plantuml-editor__close').click()
    await vi.advanceTimersByTimeAsync(9999)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(q('.plantuml-editor')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(1)
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('sends nothing after a discard, when the hanging save later fails', async () => {
    vi.useFakeTimers()
    await open()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const hung = deferred()
    seams.saveFile.mockReturnValueOnce(hung.promise)
    type("' edit\n")

    q('.plantuml-editor__close').click()
    await vi.advanceTimersByTimeAsync(10000)
    expect(q('.plantuml-editor')).toBeNull()

    hung.reject(new Error('504'))
    await vi.advanceTimersByTimeAsync(60000)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
  })

  it('sends nothing after a discard, when the hanging save later lands with an edit typed meanwhile', async () => {
    vi.useFakeTimers()
    await open()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const hung = deferred()
    seams.saveFile.mockReturnValueOnce(hung.promise)
    type("' edit\n")

    q('.plantuml-editor__close').click()
    await vi.advanceTimersByTimeAsync(5000)
    type("' late\n")
    await vi.advanceTimersByTimeAsync(5000)
    expect(q('.plantuml-editor')).toBeNull()

    hung.resolve('"late"')
    await vi.advanceTimersByTimeAsync(60000)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
  })

  it('waits for a save already in flight, then closes without another', async () => {
    await open()
    const pending = deferred()
    seams.saveFile.mockReturnValueOnce(pending.promise)
    type("' edit\n")
    saveButton().click()

    q('.plantuml-editor__close').click()
    await settle()
    expect(q('.plantuml-editor')).not.toBeNull()

    pending.resolve('"put"')
    await settle()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('saves a change typed while it was saving, then closes', async () => {
    await open()
    const first = deferred()
    seams.saveFile.mockReturnValueOnce(first.promise).mockResolvedValueOnce('"second"')
    type("' edit\n")

    q('.plantuml-editor__close').click()
    await settle()
    type("' late\n")
    first.resolve('"first"')
    await settle()

    expect(seams.saveFile).toHaveBeenCalledTimes(2)
    expect(seams.saveFile).toHaveBeenLastCalledWith('/Diagrams/Order flow.puml', expect.stringContaining("' late"), '"first"')
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('saves nothing once closed', async () => {
    vi.useFakeTimers()
    await open()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    seams.saveFile.mockRejectedValueOnce(new Error('503'))
    type("' edit\n")

    q('.plantuml-editor__close').click()
    await settle()
    expect(q('.plantuml-editor')).toBeNull()

    await vi.advanceTimersByTimeAsync(120000)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
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

describe('when the file changes elsewhere', () => {
  const CONFLICT = 'Someone else changed this file'
  const PATH = '/Diagrams/Order flow.puml'
  const THEIRS = '@startuml\nA -> B\nB -> C\n@enduml\n'
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const focusPage = () => window.dispatchEvent(new Event('focus'))

  beforeEach(() => vi.useFakeTimers())

  it('takes the new version into a clean editor, the cursor where it was, and says so until the next change', async () => {
    await open()
    view().dispatch({ selection: { anchor: '@startuml\nA -> B\n@'.length } })
    seams.currentEtag.mockResolvedValue('"theirs"')
    seams.loadFile.mockResolvedValue({ content: THEIRS, etag: '"theirs"' })

    await vi.advanceTimersByTimeAsync(10000)
    expect(source()).toBe(THEIRS)
    expect(view().state.selection.main.head).toBe('@startuml\nA -> B\nB -> C\n@'.length)
    expect(status()).toBe('Updated from the file')
    expect(indicator()).toBe('saved')
    expect(q('.plantuml-editor__image').hidden).toBe(false)

    // Taking their version is no edit of ours: nothing is written back.
    await vi.advanceTimersByTimeAsync(30000)
    expect(seams.saveFile).not.toHaveBeenCalled()
    expect(seams.loadFile).toHaveBeenCalledTimes(2)

    type("' mine\n")
    expect(status()).toBe('')
    seams.saveFile.mockResolvedValueOnce('"put"')
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenLastCalledWith(PATH, expect.stringContaining('B -> C'), '"theirs"')
  })

  it('keeps their version out of the undo history, and its tooltip on the last save of ours', async () => {
    await open()
    const before = q('.plantuml-editor__save').title
    seams.currentEtag.mockResolvedValue('"theirs"')
    seams.loadFile.mockResolvedValue({ content: THEIRS, etag: '"theirs"' })

    await vi.advanceTimersByTimeAsync(10000)
    expect(source()).toBe(THEIRS)
    expect(q('.plantuml-editor__save').title).toBe(before)

    undo(view())
    expect(source()).toBe(THEIRS)
  })

  it('still closes when a check fails while closing waits for it', async () => {
    await open()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    type("' mine\n")
    const looking = deferred()
    seams.currentEtag.mockReturnValueOnce(looking.promise)
    seams.saveFile.mockResolvedValue('"put"')

    focusPage()
    await settle()
    q('.plantuml-editor__close').click()
    looking.reject(new Error('404'))
    await vi.advanceTimersByTimeAsync(100)

    expect(q('.plantuml-editor')).toBeNull()
  })

  it('looks again as soon as the page has the focus back', async () => {
    await open()
    seams.currentEtag.mockResolvedValue('"theirs"')
    seams.loadFile.mockResolvedValue({ content: THEIRS, etag: '"theirs"' })

    focusPage()
    await settle()
    expect(seams.currentEtag).toHaveBeenCalledWith(PATH)
    expect(source()).toBe(THEIRS)
  })

  it('does not take its own save for a change elsewhere', async () => {
    await open()
    type("' mine\n")
    seams.saveFile.mockResolvedValueOnce('"put"')
    seams.currentEtag.mockResolvedValue('"put"')

    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(20000)
    expect(seams.currentEtag).toHaveBeenCalled()
    expect(seams.loadFile).toHaveBeenCalledTimes(1)
    expect(source()).toContain("' mine")
    expect(status()).toBe('')
  })

  it('leaves unsaved changes alone and offers Reload and Save as copy, autosaving nothing', async () => {
    await open()
    type("' mine\n")
    seams.currentEtag.mockResolvedValue('"theirs"')

    focusPage()
    await settle()
    expect(status()).toBe(CONFLICT)
    expect(reloadButton().hidden).toBe(false)
    expect(copyButton().hidden).toBe(false)
    expect(source()).toContain("' mine")

    await vi.advanceTimersByTimeAsync(60000)
    expect(seams.saveFile).not.toHaveBeenCalled()
    expect(seams.loadFile).toHaveBeenCalledTimes(1)
  })

  it('keeps a change typed while the new version was loading, and offers the way out', async () => {
    await open()
    seams.currentEtag.mockResolvedValue('"theirs"')
    let arrive
    seams.loadFile.mockReturnValueOnce(new Promise((resolve) => { arrive = resolve }))

    focusPage()
    await settle()
    type("' mine\n")
    arrive({ content: THEIRS, etag: '"theirs"' })
    await settle()

    expect(source()).toContain("' mine")
    expect(source()).not.toContain('B -> C')
    expect(status()).toBe(CONFLICT)
  })

  it('shows no spinner while it looks, and a Save clicked meanwhile still lands', async () => {
    await open()
    type("' mine\n")
    let answer
    seams.currentEtag.mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))
    seams.saveFile.mockResolvedValueOnce('"put"')

    focusPage()
    await settle()
    expect(indicator()).toBe('unsaved')
    saveButton().click()
    await settle()
    expect(seams.saveFile).not.toHaveBeenCalled()

    answer('"get"')
    await settle()
    expect(seams.saveFile).toHaveBeenCalledWith(PATH, expect.stringContaining("' mine"), '"get"')
    expect(indicator()).toBe('saved')
  })

  it('says nothing when the check fails', async () => {
    await open()
    seams.currentEtag.mockRejectedValue(new Error('503'))

    await vi.advanceTimersByTimeAsync(10000)
    expect(seams.currentEtag).toHaveBeenCalled()
    expect(console.debug).toHaveBeenCalled()
    expect(status()).toBe('')
    expect(seams.loadFile).toHaveBeenCalledTimes(1)
  })

  it('stops looking once closed', async () => {
    await open()
    seams.currentEtag.mockResolvedValue('"theirs"')
    q('.plantuml-editor__close').click()
    await settle()

    await vi.advanceTimersByTimeAsync(60000)
    focusPage()
    await settle()
    expect(seams.currentEtag).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('the diagram\'s relative files', () => {
  const PATH = '/Diagrams/Order flow.puml'
  const lastRender = () => seams.debouncedRender.mock.calls.at(-1)
  const showPage = () => document.dispatchEvent(new Event('visibilitychange'))
  const focusPage = () => window.dispatchEvent(new Event('focus'))

  it('resolve against the file\'s folder: each render sends its path (R4)', async () => {
    await open()
    type("' edit\n")

    expect(lastRender().slice(0, 3)).toEqual([source(), 0, PATH])
  })

  it.each([['shown again', showPage], ['focused again', focusPage]])('are drawn again when the page is %s, so an edited include shows (R6)', async (_moment, moment) => {
    await open()
    type("' edit\n")
    const renders = seams.debouncedRender.mock.calls.length

    moment()

    expect(seams.debouncedRender.mock.calls.length).toBe(renders + 1)
    expect(lastRender().slice(0, 3)).toEqual([source(), 0, PATH])
  })

  it('are not drawn again while the page is hidden', async () => {
    await open()
    const renders = seams.debouncedRender.mock.calls.length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    showPage()

    expect(seams.debouncedRender.mock.calls.length).toBe(renders)
  })

  it('are not drawn again once the editor is closed', async () => {
    await open()
    q('.plantuml-editor__close').click()
    await settle()
    const renders = seams.debouncedRender.mock.calls.length

    showPage()
    focusPage()

    expect(seams.debouncedRender.mock.calls.length).toBe(renders)
  })
})

describe('the Reload button', () => {
  const THEIRS = '@startuml\nA -> C\n@enduml\n'

  it('is in the bar all the time, as an icon named for what it does', async () => {
    await open()

    expect(refreshButton().hidden).toBe(false)
    expect(refreshButton().getAttribute('aria-label')).toBe('Reload from the file')
    expect(refreshButton().title).toBe('Reload from the file')
    expect(refreshButton().querySelector('svg')).not.toBeNull()
  })

  it('reloads at once when nothing is unsaved', async () => {
    await open()
    vi.spyOn(window, 'confirm')
    seams.loadFile.mockResolvedValue({ content: THEIRS, etag: '"theirs"' })

    refreshButton().click()
    await settle()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(source()).toBe(THEIRS)
    expect(indicator()).toBe('saved')
  })

  it('asks before replacing unsaved changes', async () => {
    await open()
    type("' mine\n")
    seams.loadFile.mockResolvedValue({ content: THEIRS, etag: '"theirs"' })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    refreshButton().click()
    await settle()
    expect(window.confirm).toHaveBeenCalledWith('Replace your changes with the saved file?')
    expect(source()).toContain("' mine")

    window.confirm.mockReturnValue(true)
    refreshButton().click()
    await settle()
    expect(source()).toBe(THEIRS)
    expect(indicator()).toBe('saved')
  })
})

describe('the diagram tabs', () => {
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const tabs = () => [...document.querySelectorAll('.plantuml-editor__diagram [role="tab"]')]
  const selected = () => tabs().map((tab) => tab.getAttribute('aria-selected') === 'true')
  const lastIndex = () => seams.debouncedRender.mock.calls.at(-1)[1]
  const lineStart = (n) => view().state.doc.line(n).from
  const DOC = '@startuml first\nA -> B\n@enduml\n\nnote between\n\n@startuml second\nB -> C\n@enduml\n@startsalt third\n{\n}\n@endsalt\n'

  beforeEach(() => {
    seams.loadFile.mockResolvedValue({ content: DOC, etag: '"get"' })
  })

  it('opens on the first diagram, one tab per diagram, at the top of the diagram pane', async () => {
    await open()

    expect(q('.plantuml-editor__diagram').firstElementChild.querySelector('[role="tablist"]')).not.toBeNull()
    expect(tabs().map((tab) => tab.textContent)).toEqual(['first', 'second', 'third'])
    expect(selected()).toEqual([true, false, false])
    expect(lastIndex()).toBe(0)
    expect(tabs()[0].getAttribute('aria-controls')).toBe(image().id)
  })

  it('draws no strip for a file of one diagram', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
    await open()

    expect(q('.plantuml-editor__diagram').firstElementChild.hidden).toBe(true)
  })

  it('follows the cursor into the second block, and draws it', async () => {
    await open()

    view().dispatch({ selection: { anchor: lineStart(8) } })

    expect(selected()).toEqual([false, true, false])
    expect(seams.debouncedRender).toHaveBeenLastCalledWith(DOC, 1, '/Diagrams/Order flow.puml', expect.any(Function))
  })

  it('draws nothing again while the cursor stays in the same diagram', async () => {
    await open()
    view().dispatch({ selection: { anchor: lineStart(8) } })
    const renders = seams.debouncedRender.mock.calls.length

    view().dispatch({ selection: { anchor: lineStart(9) } })

    expect(seams.debouncedRender.mock.calls.length).toBe(renders)
  })

  it('keeps the tab on a line between blocks', async () => {
    await open()
    view().dispatch({ selection: { anchor: lineStart(8) } })
    const renders = seams.debouncedRender.mock.calls.length

    view().dispatch({ selection: { anchor: lineStart(5) } })

    expect(selected()).toEqual([false, true, false])
    expect(seams.debouncedRender.mock.calls.length).toBe(renders)
  })

  it('puts the cursor at the end of the @start line of the tab activated, and the focus in the source', async () => {
    await open()
    tabs()[1].focus()

    tabs()[1].click()

    expect(view().state.selection.main.head).toBe(view().state.doc.line(7).to)
    expect(document.activeElement).toBe(q('.cm-content'))
    expect(selected()).toEqual([false, true, false])
    expect(lastIndex()).toBe(1)
  })

  it('with the source hidden only the diagram changes, and the focus stays on the tab', async () => {
    await open()
    toggle().click()
    tabs()[1].focus()

    tabs()[1].click()

    expect(selected()).toEqual([false, true, false])
    expect(lastIndex()).toBe(1)
    expect(document.activeElement).toBe(tabs()[1])
  })

  it('moves to the last diagram when the active one is deleted, never past it', async () => {
    await open()
    view().dispatch({ selection: { anchor: lineStart(11) } })
    expect(lastIndex()).toBe(2)

    view().dispatch({ changes: { from: lineStart(10), to: view().state.doc.length } })

    expect(tabs().map((tab) => tab.textContent)).toEqual(['first', 'second'])
    expect(selected()).toEqual([false, true])
    expect(lastIndex()).toBe(1)
  })

  it('asks for the image PlantUML draws, which an unclosed block before it does not count', async () => {
    seams.loadFile.mockResolvedValue({ content: swallowed, etag: '"get"' })
    await open()

    view().dispatch({ selection: { anchor: lineStart(4) } })

    expect(selected()).toEqual([false, true])
    expect(lastIndex()).toBe(0)
    expect(seams.debouncedRender.mock.calls.map((call) => call[1])).not.toContain(1)
  })

  it('draws no answer under a tab it was not asked for', async () => {
    await open()
    const answers = []
    seams.debouncedRender.mockImplementation((_source, _index, _path, cb) => answers.push(cb))
    type("' edit\n")
    view().dispatch({ selection: { anchor: lineStart(9) } })

    answers[0](null, diagram('first'), null)
    await settle()
    expect(image().textContent).toBe('docs')

    answers[1](null, diagram('second'), null)
    await settle()
    expect(image().textContent).toBe('second')
  })

  it('marks no mistake from an answer for the tab left behind', async () => {
    await open()
    const answers = []
    seams.debouncedRender.mockImplementation((_source, _index, _path, cb) => answers.push(cb))
    type("' edit\n")
    view().dispatch({ selection: { anchor: lineStart(9) } })

    answers[0](null, diagram(), { message: 'Syntax Error?', line: 3 })
    await settle()
    forceLinting(view())
    await settle()

    expect(q('.cm-lintRange-error')).toBeNull()
  })
})

describe('profiles', () => {
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const DOC = '@startuml flow\nA -> B\n@enduml\n@startyaml config\nkey: value\n@endyaml\n'
  /** The node the language reads at the start of `text`. */
  const nodeAt = (text) => {
    const { state } = view()
    return ensureSyntaxTree(state, state.doc.length, 5000).resolveInner(state.doc.toString().indexOf(text), 1).name
  }
  const close = async () => {
    q('.plantuml-editor__close').click()
    await settle()
  }
  let PROFILES
  let yamlProfile

  // What is loaded stays loaded for the page, so each test gets a new page.
  beforeEach(async () => {
    vi.resetModules()
    await import('../../src/editor.js')
    ;({ PROFILES } = await import('../../src/editor/profiles/index.js'))
    yamlProfile = await import('../../src/editor/profiles/yaml.js')
    seams.loadFile.mockResolvedValue({ content: DOC, etag: '"get"' })
  })

  it('reads a yaml block as plain text until its profile arrives, then as yaml', async () => {
    const arrival = deferred()
    const yaml = vi.spyOn(PROFILES, 'yaml').mockReturnValue(arrival.promise)
    await open()
    expect(nodeAt('key')).not.toBe('atom')

    arrival.resolve(yamlProfile)
    await settle()

    expect(nodeAt('key')).toBe('atom')
    // A keystroke keeps the language: the document is not read again from the top.
    const yamlLanguage = view().state.facet(language)
    type("' edit\n")
    await settle()
    expect(view().state.facet(language)).toBe(yamlLanguage)
    expect(yaml).toHaveBeenCalledTimes(1)
  })

  it('asks for a profile once a block of its type is typed', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
    const yaml = vi.spyOn(PROFILES, 'yaml')
    await open()
    expect(yaml).not.toHaveBeenCalled()

    type('@startyaml config\nkey: value\n@endyaml\n')
    await settle()

    expect(yaml).toHaveBeenCalledTimes(1)
  })

  it('dispatches nothing into a closed editor when a profile arrives late', async () => {
    const arrival = deferred()
    vi.spyOn(PROFILES, 'yaml').mockReturnValue(arrival.promise)
    await open()
    const closed = view()
    await close()
    expect(q('.plantuml-editor')).toBeNull()
    const dispatch = vi.spyOn(closed, 'dispatch')

    arrival.resolve(yamlProfile)
    await settle()

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('leaves the block plain when its profile will not load, and tries again on the next open, not the next keystroke', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const yaml = vi.spyOn(PROFILES, 'yaml').mockRejectedValue(new Error('404'))
    await open()
    type("' one\n")
    type("' two\n")
    await settle()

    expect(yaml).toHaveBeenCalledTimes(1)
    // jsdom cannot measure text, which CodeMirror also logs as an error.
    expect(console.error.mock.calls.filter(([message]) => /profile/.test(message))).toEqual([
      ['[plantuml] could not load the yaml profile', expect.any(Error)],
    ])
    expect(nodeAt('key')).not.toBe('atom')
    expect(q('.plantuml-editor__problem').hidden).toBe(true)

    await close()
    await open()
    expect(yaml).toHaveBeenCalledTimes(2)
  })
})

describe('the Source toggle', () => {
  it('is revealed with the file, before the Reload icon, pressed, named Source', async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Order flow.puml', basename: 'Order flow.puml' })
    expect(toggle().hidden).toBe(true)
    await settle()

    expect(toggle().hidden).toBe(false)
    expect(toggle().nextElementSibling).toBe(refreshButton())
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(toggle().getAttribute('aria-label')).toBe('Source')
    expect(toggle().title).toBe('Source')
    expect(toggle().getAttribute('aria-controls')).toBe('plantuml-editor-source')
    expect(toggle().querySelector('svg')).not.toBeNull()
  })

  it('hides the source on a click and gives the focus to the toggle', async () => {
    await open()
    expect(document.activeElement).toBe(q('.cm-content'))

    toggle().click()

    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    expect(q('.plantuml-editor').classList.contains('plantuml-editor--diagram-only')).toBe(true)
    expect(document.activeElement).toBe(toggle())
  })

  it('leaves the focus alone when it was not in the source', async () => {
    await open()
    saveButton().focus()

    toggle().click()

    expect(document.activeElement).toBe(saveButton())
  })

  it('shows the source again on a second click and focuses it', async () => {
    await open()
    toggle().click()

    toggle().click()

    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(q('.plantuml-editor').classList.contains('plantuml-editor--diagram-only')).toBe(false)
    expect(document.activeElement).toBe(q('.cm-content'))
  })

  it('keeps the split the splitter left', async () => {
    await open()
    q('.plantuml-editor__panes').style.setProperty('--plantuml-split', '35%')

    toggle().click()
    toggle().click()

    expect(q('.plantuml-editor__panes').style.getPropertyValue('--plantuml-split')).toBe('35%')
  })

  it('still saves on Ctrl+S and Cmd+S, once, while the source is hidden', async () => {
    await open()
    type("' edit\n")
    toggle().click()
    seams.saveFile.mockResolvedValue('"put"')

    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    await settle()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    type("' more\n")
    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }))
    await settle()
    expect(seams.saveFile).toHaveBeenCalledTimes(2)
  })

  it('still closes on Escape while the source is hidden', async () => {
    await open()
    toggle().click()

    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

    expect(q('.plantuml-editor')).toBeNull()
  })

  it('shows the source on a fresh open', async () => {
    await open()
    toggle().click()
    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

    await open()

    expect(toggle().getAttribute('aria-pressed')).toBe('true')
    expect(q('.plantuml-editor').classList.contains('plantuml-editor--diagram-only')).toBe(false)
  })
})
