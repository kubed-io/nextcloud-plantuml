// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The overlay driven through window.OCA.PlantUml.openEditor, with save.js and
// preview.js mocked at their seams: what is asserted is what the user sees
// and what would be written.
import { readFileSync } from 'node:fs'
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
    fileAccess: vi.fn(),
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
  fileAccess: seams.fileAccess,
}))
vi.mock('@nextcloud/event-bus', () => ({ emit: seams.emit }))
vi.mock('@nextcloud/notify_push', () => ({ listen: seams.listen }))
vi.mock('../../src/editor/preview.js', () => ({
  debouncedRender: seams.debouncedRender,
  cancel: seams.cancel,
}))

// jsdom has no layout: CodeMirror measures the text it draws, a view given a new state among it.
Range.prototype.getClientRects ??= () => []
Range.prototype.getBoundingClientRect ??= () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })

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
  seams.fileAccess.mockResolvedValue(null)
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
    expect(seams.debouncedRender).toHaveBeenLastCalledWith(DOC, 1, '/Diagrams/Order flow.puml', expect.any(Function), null)
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

describe('the focus in the bar (L9)', () => {
  const inSource = () => EditorView.findFromDOM(q('.cm-editor')).contentDOM.contains(document.activeElement)

  it('hands the focus to the source when Refresh, focused, is disabled while it reloads', async () => {
    await open()
    const held = deferred()
    seams.loadFile.mockReturnValue(held.promise)
    refreshButton().focus()

    refreshButton().click()
    await settle()

    expect(refreshButton().disabled).toBe(true)
    expect(inSource()).toBe(true)
    held.resolve({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
  })

  it('hands it to the source when Ctrl+S is pressed on a focused Refresh', async () => {
    await open()
    type("' mine\n")
    const held = deferred()
    seams.saveFile.mockReturnValue(held.promise)
    refreshButton().focus()

    refreshButton().dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    await settle()

    expect(refreshButton().disabled).toBe(true)
    expect(inSource()).toBe(true)
    held.resolve('"put"')
  })

  it('hands it to the source when Reload or Save as copy, focused, goes as the conflict clears', async () => {
    const CONFLICT_FILE = '@startuml\nA -> C\n@enduml\n'
    for (const button of [reloadButton, copyButton]) {
      await open()
      type("' mine\n")
      seams.saveFile.mockRejectedValueOnce(new seams.ConflictError())
      saveButton().click()
      await settle()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      seams.loadFile.mockResolvedValue({ content: CONFLICT_FILE, etag: '"theirs"' })
      seams.saveCopy.mockResolvedValue({ node: { path: '/Diagrams/Order flow (copy).puml', basename: 'Order flow (copy).puml' }, etag: '"copy"' })
      button().focus()
      expect(document.activeElement).toBe(button())

      button().click()
      await settle()

      expect(button().hidden).toBe(true)
      expect(inSource()).toBe(true)
      q('.plantuml-editor__close').click()
      await settle()
    }
  })

  it('hands it to Save when the source is hidden', async () => {
    await open()
    toggle().click()
    const held = deferred()
    seams.loadFile.mockReturnValue(held.promise)
    refreshButton().focus()

    refreshButton().click()
    await settle()

    expect(refreshButton().disabled).toBe(true)
    expect(document.activeElement).toBe(saveButton())
    held.resolve({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
  })

  it('leaves the focus in the source when the bar redraws on an autosave status change', async () => {
    await open()
    q('.cm-content').focus()
    type("' mine\n")
    seams.saveFile.mockResolvedValue('"put"')

    saveButton().click()
    await settle()

    expect(inSource()).toBe(true)
  })

  it('leaves the focus on the open Add menu when the bar redraws', async () => {
    await open()
    const menuButton = q('.plantuml-editor__add-type')
    expect(menuButton).not.toBeNull()
    menuButton.focus()
    type("' mine\n")
    seams.saveFile.mockResolvedValue('"put"')

    saveButton().click()
    await settle()

    expect(document.activeElement).toBe(menuButton)
  })

  it('leaves the focus on a button that stays usable', async () => {
    await open()
    type("' mine\n")
    seams.saveFile.mockResolvedValue('"put"')
    saveButton().focus()

    saveButton().click()
    await settle()

    expect(document.activeElement).toBe(saveButton())
  })
})

describe('the editor as a key boundary', () => {
  // Files' hotkeys are useHotKey on window: Enter on a row (the Viewer), Delete,
  // F2, D, S, v, Alt+ArrowUp. Enter's cancels a button's own Enter click. These
  // stand-ins listen where Files does and on document, which a key reaches first,
  // and cancel what they get, as Files does.
  const HOTKEYS = [['Delete'], ['F2'], ['d'], ['s'], ['v'], ['ArrowUp', { altKey: true }], ['Enter']]
  let onWindow
  let onDocument
  const press = (target, k, init = {}) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }
  const hotkeys = (target) => HOTKEYS.map(([k, init]) => press(target, k, init))
  const seen = () => [...onWindow.mock.calls, ...onDocument.mock.calls].map(([event]) => event.key)

  beforeEach(() => {
    onWindow = vi.fn((event) => event.preventDefault())
    onDocument = vi.fn((event) => event.preventDefault())
    window.addEventListener('keydown', onWindow)
    document.addEventListener('keydown', onDocument)
    seams.loadFile.mockResolvedValue({ content: '@startuml first\nA -> B\n@enduml\n@startuml second\nB -> C\n@enduml\n', etag: '"get"' })
  })

  afterEach(() => {
    window.removeEventListener('keydown', onWindow)
    document.removeEventListener('keydown', onDocument)
  })

  it('keeps Files\' hotkeys from every button of the bar, the tabs and their menu, a button\'s Enter click left to the browser', async () => {
    await open()
    const buttons = [...document.querySelectorAll('.plantuml-editor button')]
    for (const name of ['add-new', 'add-type', 'source-toggle', 'refresh', 'save', 'close', 'tab', 'more-button', 'menu-item']) {
      expect(buttons.some((b) => b.classList.contains(`plantuml-editor__${name}`))).toBe(true)
    }

    for (const button of buttons) {
      // Not cancelled: the browser's own Enter click on a button is what does its action.
      expect(hotkeys(button).at(-1).defaultPrevented).toBe(false)
    }
    expect(seen()).toEqual([])
    expect(q('.plantuml-editor')).not.toBeNull()
  })

  it('keeps them from Files when the focus fell to the body, as when a focused button is disabled', async () => {
    await open()
    document.body.focus()

    hotkeys(document.body)

    expect(onWindow).not.toHaveBeenCalled()
    expect(q('.plantuml-editor')).not.toBeNull()
  })

  it('keeps them from the type menu\'s rows', async () => {
    await open()
    q('.plantuml-editor__add-type').click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())

    hotkeys(q('.plantuml-add__menu-item'))

    expect(seen()).toEqual([])
  })

  it('keeps them from the Add diagram modal', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }))
    await open()
    q('.plantuml-editor__add-new').click()
    await vi.waitFor(() => expect(q('.plantuml-add__dialog')).not.toBeNull())

    for (const target of ['.plantuml-add__close', '.plantuml-add__search', '.plantuml-add__type:not([aria-selected="true"])', '.plantuml-add__template']) {
      hotkeys(q(target))
    }

    expect(seen()).toEqual([])
  })

  it('keeps them from the source, where Enter still breaks the line', async () => {
    await open()
    const view = EditorView.findFromDOM(q('.cm-editor'))
    view.dispatch({ selection: { anchor: '@startuml first'.length } })

    expect(press(q('.cm-content'), 'Enter').defaultPrevented).toBe(true)
    expect(view.state.doc.toString()).toMatch(/^@startuml first\n\nA -> B\n/)
    hotkeys(q('.cm-content'))

    expect(seen()).toEqual([])
  })

  it('still closes on Escape from a bar button, and on Ctrl+S saves once', async () => {
    // Without the stand-ins: the one on document would cancel the keys before the editor's own handler.
    window.removeEventListener('keydown', onWindow)
    document.removeEventListener('keydown', onDocument)
    seams.saveFile.mockResolvedValue('"put"')
    await open()
    type("' edit\n")
    press(q('.plantuml-editor__refresh'), 's', { ctrlKey: true })
    await settle()
    expect(seams.saveFile).toHaveBeenCalledTimes(1)

    press(q('.plantuml-editor__source-toggle'), 'Escape')
    await settle()

    expect(q('.plantuml-editor')).toBeNull()
  })

  // jsdom moves no focus on a press. A browser gives it to the press's nearest
  // focusable ancestor, or to the body when there is none, unless the mousedown
  // was cancelled (CodeMirror's is, and it focuses itself).
  const pressOn = (target) => {
    if (target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))) {
      const focusable = target.closest('button, a[href], input, [contenteditable="true"], [tabindex]')
      if (focusable) {
        focusable.focus()
      } else {
        document.activeElement?.blur()
      }
    }
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }

  it.each([
    ['a blank part of the bar', () => q('.plantuml-editor__bar')],
    ['the drawing pane', () => q('.plantuml-editor__image')],
  ])('keeps the focus in the editor after a press on %s, so Delete never reaches Files and Escape still closes it', async (_where, target) => {
    await open()

    pressOn(target())
    expect(document.activeElement).toBe(q('.plantuml-editor'))
    press(document.activeElement, 'Delete')
    expect(seen()).toEqual([])

    // Without the stand-ins: the one on document would cancel Escape before the editor's own handler.
    window.removeEventListener('keydown', onWindow)
    document.removeEventListener('keydown', onDocument)
    press(document.activeElement, 'Escape')
    await settle()
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('leaves the focus on the source or a button pressed', async () => {
    await open()
    q('.cm-content').focus()
    pressOn(q('.cm-line'))
    expect(document.activeElement).toBe(q('.cm-content'))

    // Refresh would hand the focus on as it disables itself (L9); Save stays usable.
    pressOn(q('.plantuml-editor__save'))
    expect(document.activeElement).toBe(q('.plantuml-editor__save'))
  })

  it('shows no ring on the overlay itself, which takes the focus only to keep it', () => {
    // Read from disk: vitest hands a stylesheet import back empty, ?raw too.
    const css = readFileSync('css/editor.css', 'utf8')
    expect(css).toMatch(/^\.plantuml-editor:focus \{\n\toutline: none;\n\}/m)
    // The root only: no control of the editor loses its ring.
    expect(css).not.toMatch(/^\.plantuml-editor :focus|^\.plantuml-editor \*:focus/m)
  })

  it('still marks the source while Ctrl is held in it, for its links', async () => {
    await open()
    const editor = q('.cm-editor')

    press(q('.cm-content'), 'Control', { ctrlKey: true })
    expect(editor.classList.contains('cm-plantuml-ctrl')).toBe(true)
    q('.cm-content').dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
    expect(editor.classList.contains('cm-plantuml-ctrl')).toBe(false)
  })
})

const selectedTab = () => q('.plantuml-editor__tab[aria-selected="true"]').textContent
const view = () => EditorView.findFromDOM(q('.cm-editor'))
const cursorLine = () => view().state.doc.lineAt(view().state.selection.main.head)

describe('opening at a diagram', () => {
  beforeEach(() => {
    seams.loadFile.mockResolvedValue({ content: '@startuml a\nA -> B\n@enduml\n@startuml b\nC -> D\n@enduml\n', etag: '"get"' })
  })

  it('opens on the diagram asked for, the cursor at the end of its @start line', async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }, { diagram: 1 })
    await settle()

    expect(selectedTab()).toBe('b')
    expect(cursorLine().number).toBe(4)
    expect(view().state.selection.main.head).toBe(cursorLine().to)
  })

  it("puts the cursor on the first diagram's @start line when that one is asked for", async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }, { diagram: 0 })
    await settle()

    expect(selectedTab()).toBe('a')
    expect(cursorLine().number).toBe(1)
    expect(view().state.selection.main.head).toBe(cursorLine().to)
  })

  it('opens on the first diagram, cursor at the top, when the one asked for is past the end', async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }, { diagram: 9 })
    await settle()

    expect(selectedTab()).toBe('a')
    expect(view().state.selection.main.head).toBe(0)
  })
})

describe('a linked file', () => {
  // screens / linked-main, linked-style and linked-include, verbatim.
  const MAIN = "@startuml nodes\n@enduml\n@startuml order-flow\n' checkout, happy path\n<style file=./UML_Fun.css>\n!include ./UML_Fun_parts.puml\nparticipant Shop\nparticipant Payment\nCustomer -> Shop : place order\nShop -> Payment : charge\nPayment --> Shop : ok\nShop --> Customer : confirmation\n@enduml\n@startyaml config\nserver: plantuml\ntheme: plain\n@endyaml\n"
  const STYLE = 'participant {\n  BackgroundColor   #FFE08A\n  LineColor   #8A6D00\n  FontStyle bold\n}\narrow {\n  LineColor   #8A6D00\n}\n'
  const PARTS = "@startuml parts\n' the cast every diagram shares\nactor Customer\n<style file=./parts.css>\n@enduml\n@startuml(id=extra) more\nactor Clerk\n@enduml\n"
  const FILES = {
    '/Diagrams/Order flow.puml': { content: MAIN, etag: '"m1"' },
    '/Diagrams/UML_Fun.css': { content: STYLE, etag: '"s1"' },
    '/Diagrams/UML_Fun_parts.puml': { content: PARTS, etag: '"p1"' },
    '/Diagrams/parts.css': { content: 'actor {}\n', etag: '"c1"' },
  }
  let files
  let serverError
  const chip = (name) => q(`button.cm-plantuml-link-chip[aria-label="Open ${name}"]`)
  const pressChip = async (name) => {
    chip(name).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await settle()
  }

  // The style profile is a chunk of its own: one settle() does not cover its import.
  // The editor in use is the one the profiles tests imported last, so its modules are asked.
  beforeAll(async () => {
    const { loadSheetProfile } = await import('../../src/editor/profiles/index.js')
    await loadSheetProfile()
    ;({ serverError } = await import('../../src/editor/lint/state.js'))
  })

  beforeEach(() => {
    files = structuredClone(FILES)
    seams.loadFile.mockImplementation(async (path) => files[path] ?? Promise.reject(new Error('404')))
    seams.fileAccess.mockImplementation(async (path) => (files[path] ? { writable: true } : null))
  })

  /** Opens the style file with the cursor on its `<style file=…>` line, in the order-flow diagram. */
  async function openStyle() {
    await open()
    view().dispatch({ selection: { anchor: MAIN.indexOf('<style') } })
    await settle()
    await pressChip('UML_Fun.css')
  }

  it('asks again whether a linked file is there at each open', async () => {
    const asks = () => seams.fileAccess.mock.calls.filter(([path]) => path === '/Diagrams/UML_Fun.css').length
    await open()
    await settle()
    expect(asks()).toBe(1)
    q('.plantuml-editor__close').click()
    await settle()

    await open()
    await settle()

    expect(asks()).toBe(2)
  })

  it('takes over the source pane, named in the breadcrumb', async () => {
    await openStyle()

    expect(source()).toBe(STYLE)
    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml›UML_Fun.css')
    expect(q('button.cm-plantuml-link-chip')).toBeNull()
  })

  it('reads a style file with the editor\'s own parts: line numbers, undo and swatches', async () => {
    await openStyle()

    expect(q('.cm-lineNumbers')).not.toBeNull()
    expect([...document.querySelectorAll('.cm-content span[data-color] input[type=color]')].map((swatch) => swatch.dataset.colorraw)).toContain('#FFE08A')
    view().dispatch({ changes: { from: 0, insert: "' x\n" } })
    undo(view())
    expect(source()).toBe(STYLE)
  })

  it.each([
    ['the ×', () => q('.plantuml-editor__back').click()],
    ['the main crumb', () => q('.plantuml-editor__crumb').click()],
    ['Escape', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))],
    ['Escape in the source', () => q('.cm-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))],
    ['Escape on the ×', () => q('.plantuml-editor__back').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))],
  ])('goes back on %s, the editor still open', async (_how, back) => {
    await openStyle()

    back()
    await settle()

    expect(source()).toBe(MAIN)
    expect(q('.plantuml-editor')).not.toBeNull()
    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml')
  })

  it('hides Add diagram while the linked file is open, and shows it again on going back', async () => {
    await openStyle()
    expect(q('.plantuml-editor__add').hidden).toBe(true)

    q('.plantuml-editor__back').click()
    await settle()

    expect(q('.plantuml-editor__add').hidden).toBe(false)
  })

  it('closes an open type menu when a linked file opens', async () => {
    await open()
    view().dispatch({ selection: { anchor: MAIN.indexOf('<style') } })
    await settle()
    q('.plantuml-editor__add-type').click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())

    await pressChip('UML_Fun.css')

    await vi.waitFor(() => expect(q('.plantuml-add__menu')).toBeNull())
    expect(q('.plantuml-editor__add-type').getAttribute('aria-expanded')).toBe('false')
  })

  it('closes an open Add diagram modal when a linked file opens', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }))
    await open()
    view().dispatch({ selection: { anchor: MAIN.indexOf('<style') } })
    await settle()
    q('.plantuml-editor__add-new').click()
    await vi.waitFor(() => expect(q('.plantuml-add__dialog')).not.toBeNull())

    await pressChip('UML_Fun.css')

    await vi.waitFor(() => expect(q('.plantuml-add')).toBeNull())
    expect(source()).toBe(STYLE)
    expect(q('.plantuml-editor')).not.toBeNull()
  })

  it('keeps the main file whole: text, unsaved edit, selection and undo', async () => {
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" }, selection: { anchor: 3 } })
    await settle()
    await pressChip('UML_Fun.css')
    view().dispatch({ changes: { from: 0, insert: "' theirs\n" } })

    q('.plantuml-editor__back').click()
    await settle()

    expect(source()).toBe("' mine\n" + MAIN)
    expect(view().state.selection.main.head).toBe(3)
    undo(view())
    expect(source()).toBe(MAIN)
  })

  it('autosaves the main file\'s own text while a linked file is open', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockResolvedValue('"m2"')
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    await vi.advanceTimersByTimeAsync(0)
    await pressChip('UML_Fun.css')

    await vi.advanceTimersByTimeAsync(2000)

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', "' mine\n" + MAIN, '"m1"')
    expect(seams.saveFile.mock.calls.some(([path, text]) => path === '/Diagrams/Order flow.puml' && text === STYLE)).toBe(false)
  })

  it('reads a linked .puml as a diagram, with no chips of its own', async () => {
    await open()
    await settle()
    await pressChip('UML_Fun_parts.puml')
    await settle()

    expect(source()).toBe(PARTS)
    expect(q('button.cm-plantuml-link-chip')).toBeNull()
  })

  it.each([
    ['!includesub ./UML_Fun_parts.puml!B', "@startuml\n!startsub A\nX\n!endsub\n!startsub B\nY\n!endsub\n@enduml\n", 5],
    ['!include ./UML_Fun_parts.puml!1', PARTS, 6],
    ['!include ./UML_Fun_parts.puml!extra', PARTS, 6],
  ])('opens %s where the line points', async (line, content, number) => {
    files['/Diagrams/UML_Fun_parts.puml'] = { content, etag: '"p1"' }
    files['/Diagrams/Order flow.puml'] = { content: `@startuml\n${line}\n@enduml\n`, etag: '"m1"' }
    await open()
    await settle()
    await pressChip('UML_Fun_parts.puml')

    expect(view().state.doc.lineAt(view().state.selection.main.head).number).toBe(number)
  })

  it('stays on the main file when the linked one cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await open()
    await settle()
    delete files['/Diagrams/UML_Fun.css']
    await pressChip('UML_Fun.css')

    expect(source()).toBe(MAIN)
    expect(status()).toBe('Could not open the file')
    expect(error).toHaveBeenCalledWith('[plantuml] could not open /Diagrams/UML_Fun.css', expect.any(Error))
  })

  it('says a second "Could not open the file" again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await open()
    await settle()
    delete files['/Diagrams/UML_Fun.css']
    await pressChip('UML_Fun.css')
    const rewrites = []
    const observer = new MutationObserver((records) => rewrites.push(...records))
    observer.observe(q('.plantuml-editor__status'), { childList: true, characterData: true, subtree: true })

    await pressChip('UML_Fun.css')
    await settle()
    observer.disconnect()

    expect(status()).toBe('Could not open the file')
    expect(rewrites).not.toHaveLength(0)
  })

  it('still saves the main file on closing after a linked file could not be opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    seams.saveFile.mockResolvedValue('"m2"')
    await open()
    await settle()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    delete files['/Diagrams/UML_Fun.css']
    await pressChip('UML_Fun.css')

    q('.plantuml-editor__close').click()
    await settle()
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', "' mine\n" + MAIN, '"m1"')
    expect(confirm).not.toHaveBeenCalled()
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('catches the tabs and the drawing up on going back, when the main file changed elsewhere while parked', async () => {
    const theirs = MAIN.replace('@startuml nodes', '@startuml servers')
    const looking = deferred()
    await open()
    await settle()
    seams.currentEtag.mockReturnValueOnce(looking.promise)
    window.dispatchEvent(new Event('focus'))
    await settle()
    await settle()
    await pressChip('UML_Fun.css')
    files['/Diagrams/Order flow.puml'] = { content: theirs, etag: '"m2"' }
    looking.resolve('"m2"')
    await settle()

    q('.plantuml-editor__back').click()
    await settle()

    expect(source()).toBe(theirs)
    expect([...document.querySelectorAll('.plantuml-editor__tab')].map((tab) => tab.textContent)).toContain('servers')
    expect(seams.debouncedRender.mock.calls.at(-1)[0]).toBe(theirs)
  })

  it('closes from the main file on the next Escape', async () => {
    await openStyle()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    expect(q('.plantuml-editor')).toBeNull()
  })

  const lastRender = () => seams.debouncedRender.mock.calls.at(-1)

  it('draws the main file, its tab kept, with the linked file\'s unsaved text', async () => {
    await openStyle()

    view().dispatch({ changes: { from: 0, insert: "' new\n" } })

    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe('order-flow')
    expect(lastRender()[0]).toBe(MAIN)
    expect(lastRender()[1]).toBe(1)
    expect(lastRender()[4]).toEqual({ './UML_Fun.css': "' new\n" + STYLE })
  })

  it('sends no overrides for a file that may only be read', async () => {
    seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: false } : { writable: true }))
    await openStyle()

    window.dispatchEvent(new Event('focus'))

    expect(lastRender()[4]).toBeNull()
  })

  it('keeps the tab while the cursor moves in the linked file, and a tab only redraws', async () => {
    await openStyle()

    view().dispatch({ selection: { anchor: STYLE.length - 1 } })
    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe('order-flow')
    ;[...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'nodes').click()

    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe('nodes')
    expect(lastRender()[1]).toBe(0)
    expect(view().state.selection.main.head).toBe(STYLE.length - 1)
  })

  it('marks a server mistake on the main file\'s line, not the linked file\'s', async () => {
    await openStyle()
    seams.answer = { error: null, svg: diagram(), mistake: { message: 'In UML_Fun.css, line 2: bad', line: 5 } }
    view().dispatch({ changes: { from: 0, insert: ' ' } })
    await settle()
    expect(view().state.field(serverError, false)).toBeNull()

    q('.plantuml-editor__back').click()
    await settle()

    expect(view().state.field(serverError)).toEqual({ message: 'In UML_Fun.css, line 2: bad', pos: MAIN.indexOf('<style') })
  })

  const typeLinked = (text) => view().dispatch({ changes: { from: 0, insert: text } })

  it('autosaves the linked file against its own ETag, two seconds after typing stops', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockResolvedValue('"s2"')
    await openStyle()

    typeLinked("' new\n")
    await vi.advanceTimersByTimeAsync(2000)

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', "' new\n" + STYLE, '"s1"')
    expect(indicator()).toBe('saved')
  })

  it('gives the linked file its own conflict line', async () => {
    vi.useFakeTimers()
    await openStyle()
    typeLinked("' new\n")
    seams.currentEtag.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? '"theirs"' : '"m1"'))

    // A check before the 2 s autosave: as a save would, it meets their change.
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)

    expect(status()).toBe('Someone else changed this file')
    expect(reloadButton().hidden).toBe(false)
    expect(copyButton().hidden).toBe(false)
  })

  it('never checks the main file while the linked file is open, and checks it at once on going back', async () => {
    vi.useFakeTimers()
    seams.currentEtag.mockResolvedValue('"s1"')
    await openStyle()
    await vi.advanceTimersByTimeAsync(30000)
    expect(seams.currentEtag.mock.calls.map(([path]) => path)).not.toContain('/Diagrams/Order flow.puml')

    seams.currentEtag.mockResolvedValue('"m1"')
    q('.plantuml-editor__back').click()
    await vi.advanceTimersByTimeAsync(0)

    expect(seams.currentEtag).toHaveBeenCalledWith('/Diagrams/Order flow.puml')
  })

  it('saves the linked file before going back', async () => {
    seams.saveFile.mockResolvedValue('"s2"')
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', "' new\n" + STYLE, '"s1"')
    expect(source()).toBe(MAIN)
  })

  it('goes back once however often it is asked while the linked file saves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const saving = deferred()
    seams.saveFile.mockReturnValue(saving.promise)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    q('.plantuml-editor__back').click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
    saving.reject(new Error('507'))
    await settle()

    expect(seams.saveFile).toHaveBeenCalledTimes(1)
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(source()).toBe(MAIN)
    expect(q('.plantuml-editor')).not.toBeNull()
  })

  it('opens a linked file again while the main file is still checked, and closing saves it', async () => {
    const looking = deferred()
    seams.saveFile.mockResolvedValue('"s2"')
    await openStyle()
    seams.currentEtag.mockImplementation((path) => (path === '/Diagrams/Order flow.puml' ? looking.promise : Promise.resolve('"s1"')))
    q('.plantuml-editor__back').click()
    await settle()
    await pressChip('UML_Fun.css')
    typeLinked("' new\n")

    q('.plantuml-editor__close').click()
    await settle()
    looking.resolve('"m1"')
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', "' new\n" + STYLE, '"s1"')
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('opens no linked file while closing saves the main one', async () => {
    const saving = deferred()
    seams.saveFile.mockReturnValue(saving.promise)
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    await settle()

    q('.plantuml-editor__close').click()
    await pressChip('UML_Fun.css')
    saving.resolve('"m2"')
    await settle()
    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(q('.plantuml-editor')).toBeNull()
    expect(seams.loadFile.mock.calls.map(([path]) => path)).not.toContain('/Diagrams/UML_Fun.css')
    expect(seams.currentEtag.mock.calls.map(([path]) => path)).not.toContain('/Diagrams/UML_Fun.css')
  })

  it('stays on the linked file when its save is refused', async () => {
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await settle()

    expect(source()).toBe("' new\n" + STYLE)
    expect(status()).toBe('Someone else changed this file')
  })

  it.each([[true, MAIN], [false, "' new\n" + STYLE]])('asks before discarding a save that failed (OK: %s)', async (ok, shown) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seams.saveFile.mockRejectedValue(new Error('507'))
    vi.spyOn(window, 'confirm').mockReturnValue(ok)
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await settle()

    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(source()).toBe(shown)
  })

  it('asks after ten seconds of a save that hangs, and the save settling late leaves the bar to the main file', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const saving = deferred()
    seams.saveFile.mockReturnValue(saving.promise)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await vi.advanceTimersByTimeAsync(10000)
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(source()).toBe(MAIN)
    saving.reject(new Error('507'))
    await vi.advanceTimersByTimeAsync(0)

    expect(status()).toBe('')
    expect(indicator()).toBe('saved')
  })

  // A refused save stays on the conflict line first; going back from it asks at once.
  it.each([
    ['failed', 1, () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      seams.saveFile.mockRejectedValue(new Error('507'))
    }],
    ['was refused', 2, () => seams.saveFile.mockRejectedValue(new seams.ConflictError())],
  ])('draws the main file from its own files again once the linked text whose save %s is discarded', async (_how, clicks, saving) => {
    saving()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openStyle()
    typeLinked("' new\n")
    expect(lastRender()[4]).toEqual({ './UML_Fun.css': "' new\n" + STYLE })
    seams.cancel.mockClear()

    for (let i = 0; i < clicks; i++) {
      q('.plantuml-editor__back').click()
      await settle()
    }

    expect(seams.saveFile).toHaveBeenCalledTimes(1)
    expect(seams.cancel).toHaveBeenCalled()
    expect(lastRender()[0]).toBe(MAIN)
    expect(lastRender()[4]).toBeNull()
  })

  it('saves the linked file, then the main one, on closing', async () => {
    seams.saveFile.mockResolvedValue('"x2"')
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    await settle()
    await pressChip('UML_Fun.css')
    typeLinked("' new\n")

    q('.plantuml-editor__close').click()
    await settle()

    expect(seams.saveFile.mock.calls.map(([path]) => path)).toEqual(['/Diagrams/UML_Fun.css', '/Diagrams/Order flow.puml'])
    expect(q('.plantuml-editor')).toBeNull()
  })

  it.each([
    ['the main file', () => view().dispatch({ changes: { from: 0, insert: "' mine\n" } }), () => {}],
    ['the linked file', () => {}, () => typeLinked("' new\n")],
  ])('holds the page while %s is unsaved', async (_which, editMain, editLinked) => {
    await open()
    editMain()
    await settle()
    await pressChip('UML_Fun.css')
    editLinked()
    const event = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('opens a file that may only be read as read-only, locked and never saved', async () => {
    vi.useFakeTimers()
    seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: false } : { writable: true }))
    await openStyle()

    typeLinked("' new\n")
    await vi.advanceTimersByTimeAsync(31000)

    expect(source()).toBe(STYLE)
    expect(q('.plantuml-editor__lock').title).toBe('Read only')
    expect(saveButton().hidden).toBe(true)
    expect(seams.saveFile).not.toHaveBeenCalled()
  })

  it('shows the save indicator again on going back from a file that may only be read', async () => {
    seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: false } : { writable: true }))
    await openStyle()

    q('.plantuml-editor__back').click()
    await settle()

    expect(saveButton().hidden).toBe(false)
  })

  it('reloads a file that may only be read from the file', async () => {
    seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: false } : { writable: true }))
    await openStyle()
    files['/Diagrams/UML_Fun.css'] = { content: "' theirs\n" + STYLE, etag: '"s2"' }

    refreshButton().click()
    await settle()

    expect(source()).toBe("' theirs\n" + STYLE)
  })

  it('takes theirs into the linked file on Reload, the main file left alone', async () => {
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openStyle()
    typeLinked("' new\n")
    saveButton().click()
    await settle()
    files['/Diagrams/UML_Fun.css'] = { content: "' theirs\n" + STYLE, etag: '"s2"' }

    reloadButton().click()
    await settle()

    expect(source()).toBe("' theirs\n" + STYLE)
    expect(status()).toBe('')
    expect(seams.loadFile.mock.calls.filter(([path]) => path === '/Diagrams/Order flow.puml')).toHaveLength(1)
  })

  it('saves the linked file on Ctrl+S from outside the source', async () => {
    seams.saveFile.mockResolvedValue('"s2"')
    await openStyle()
    typeLinked("' new\n")

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', "' new\n" + STYLE, '"s1"')
  })

  it('stops sending overrides once the linked file is saved as a copy', async () => {
    seams.saveCopy.mockResolvedValue({ node: { path: '/Diagrams/UML_Fun (copy).css', basename: 'UML_Fun (copy).css' }, etag: '"c1"' })
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    await openStyle()
    typeLinked("' new\n")
    saveButton().click() // Save as copy shows on a conflict (S8)
    await settle()

    copyButton().click()
    await settle()
    typeLinked(' ')

    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml›UML_Fun (copy).css')
    expect(seams.debouncedRender.mock.calls.at(-1)[4]).toBeNull()
  })
})

describe('Add diagram', () => {
  const addButton = () => q('.plantuml-editor__add-new')
  const typeButton = () => q('.plantuml-editor__add-type')
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const pickType = async (name) => {
    typeButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    ;[...document.querySelectorAll('.plantuml-add__menu [role="menuitem"]')].find((i) => i.textContent === name).click()
  }

  it('sits just before the Source toggle, once the file is there', async () => {
    let loaded
    seams.loadFile.mockReturnValue(new Promise((resolve) => { loaded = resolve }))
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Order flow.puml', basename: 'Order flow.puml' })
    expect(q('.plantuml-editor__add').hidden).toBe(true)
    loaded({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
    await settle()
    expect(q('.plantuml-editor__add').hidden).toBe(false)
    expect(q('.plantuml-editor__add').nextElementSibling).toBe(toggle())
    expect(addButton().getAttribute('aria-label')).toBe('Add diagram')
    expect(addButton().title).toBe('Add diagram')
    expect(typeButton().getAttribute('aria-label')).toBe('Add a diagram of a type')
    expect(typeButton().getAttribute('aria-haspopup')).toBe('menu')
  })

  it('adds an empty Gantt from the type menu, one blank line down, its tab active', async () => {
    await open()
    await pickType('Gantt')
    expect(source()).toBe('@startuml\nA -> B\n@enduml\n\n@startgantt gantt\n\n@endgantt\n')
    expect(view().state.doc.lineAt(view().state.selection.main.head).number).toBe(6)
    expect(q('.plantuml-editor__tab[aria-selected="true"]').textContent).toBe('gantt')
  })

  it('names a second one gantt-2', async () => {
    await open()
    await pickType('Gantt')
    await pickType('Gantt')
    expect(source()).toContain('@startgantt gantt-2\n')
  })

  it('names an Empty UML uml-2 beside an unnamed @startuml, whose tab reads uml', async () => {
    await open()
    await pickType('UML')
    expect(source()).toContain('\n\n@startuml uml-2\n')
  })

  it('takes one undo to remove', async () => {
    await open()
    await pickType('Gantt')
    undo(view())
    expect(source()).toBe('@startuml\nA -> B\n@enduml\n')
  })

  it('is one undo step of its own, never merged with the typing just before or after it', async () => {
    await open()
    const typeAt = (at, insert) => view().dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: 'input.type' })
    typeAt(view().state.doc.length, "' x")
    await pickType('Gantt')
    typeAt(view().state.selection.main.head, 'y')

    undo(view())
    expect(source()).toBe("@startuml\nA -> B\n@enduml\n' x\n\n@startgantt gantt\n\n@endgantt")
    undo(view())
    expect(source()).toBe("@startuml\nA -> B\n@enduml\n' x")
  })

  it('leaves the focus on the new diagram\'s tab with the source hidden, as B4 does', async () => {
    await open()
    toggle().click()
    await pickType('Gantt')
    expect(document.activeElement).toBe(q('.plantuml-editor__tab[aria-selected="true"]'))
    expect(document.activeElement.textContent).toBe('gantt')
  })

  it('is saved as any change is', async () => {
    seams.saveFile.mockResolvedValue('"put"')
    await open()
    vi.useFakeTimers()
    await pickType('Gantt')
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', expect.stringContaining('@startgantt gantt'), '"get"')
  })

  it('shows the ▾ half open while its menu is', async () => {
    await open()
    typeButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    expect(typeButton().getAttribute('aria-expanded')).toBe('true')
    typeButton().click()
    // The click reaches the menu through the loaded chunk's promise, a tick later.
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).toBeNull())
    expect(typeButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the editor open when Escape closes the menu', async () => {
    await open()
    typeButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
    expect(q('.plantuml-add__menu')).toBeNull()
    expect(q('.plantuml-editor')).not.toBeNull()
  })

  describe('from its modal', () => {
    const templates = () => [...document.querySelectorAll('.plantuml-add__template')]
    const openModal = async () => {
      addButton().click()
      await vi.waitFor(() => expect(q('.plantuml-add__dialog')).not.toBeNull())
    }

    beforeEach(() => {
      vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }))
    })

    it('adds the template picked in the modal, under its name', async () => {
      await open()
      await openModal()
      templates().find((r) => r.textContent.startsWith('Class')).click()
      expect(source()).toContain('\n\n@startuml class-diagram\nclass Customer\n')
      expect(q('.plantuml-editor__tab[aria-selected="true"]').textContent).toBe('class-diagram')
      expect(q('.plantuml-add')).toBeNull()
    })

    it('changes nothing when the modal is closed', async () => {
      await open()
      await openModal()
      q('.plantuml-add__close').click()
      expect(source()).toBe('@startuml\nA -> B\n@enduml\n')
      expect(q('.plantuml-editor')).not.toBeNull()
      expect(document.activeElement).toBe(addButton())
    })

    it('leaves the editor open when Escape closes the modal, the focus back on +', async () => {
      await open()
      await openModal()
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await settle()
      expect(q('.plantuml-add')).toBeNull()
      expect(q('.plantuml-editor')).not.toBeNull()
      expect(document.activeElement).toBe(addButton())
    })

    it('takes one undo to remove', async () => {
      await open()
      await openModal()
      templates().find((r) => r.textContent.startsWith('Sequence')).click()
      undo(view())
      expect(source()).toBe('@startuml\nA -> B\n@enduml\n')
    })

    it('leaves the focus on the new diagram\'s tab with the source hidden, as B4 does', async () => {
      await open()
      toggle().click()
      await openModal()
      templates()[0].focus()
      templates()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      expect(document.activeElement).toBe(q('.plantuml-editor__tab[aria-selected="true"]'))
      expect(document.activeElement.textContent).toBe('uml-2')
    })

    it('opens on the built-ins alone when the route fails, and adds from them', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 500 }))
      await open()
      await openModal()
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[plantuml] could not list the templates', 500))
      expect(templates().map((r) => r.querySelector('.plantuml-add__template-title').textContent).slice(0, 3)).toEqual(['Empty', 'Example', 'Sequence'])
      templates()[0].click()
      expect(source()).toContain('\n\n@startuml uml-2\n')
    })

    it('takes in the user\'s own templates when the route answers', async () => {
      vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ files: [{ source: 'yours', path: 'Templates/retro.puml', text: '@startuml retro\nA -> B\n@enduml' }] }), { status: 200 }))
      await open()
      await openModal()
      await vi.waitFor(() => expect(templates().at(-1).textContent).toContain('Yours · Templates/retro.puml'))
      templates().at(-1).click()
      expect(source()).toContain('\n\n@startuml retro\nA -> B\n@enduml\n')
    })
  })

  // The last tests in the file: each loads a new editor whose add chunk is held back.
  describe('when the add chunk arrives late', () => {
    const MAIN = '@startuml order-flow\n<style file=./UML_Fun.css>\nA -> B\n@enduml\n'
    // The menu may close again at once (focus), so what counts is that it was ever added.
    const watch = (overlay) => {
      const added = []
      new MutationObserver((records) => {
        for (const node of records.flatMap((r) => [...r.addedNodes])) added.push(node.className)
      }).observe(overlay, { childList: true, subtree: true })
      return added
    }
    const STYLE = 'participant {\n  LineColor #8A6D00\n}\n'
    let release
    let imported

    beforeEach(async () => {
      vi.resetModules()
      const gate = new Promise((resolve) => { release = resolve })
      let imports
      imported = new Promise((resolve) => { imports = resolve })
      vi.doMock('../../src/editor/add/index.js', async (importOriginal) => {
        await gate
        const chunk = await importOriginal()
        imports()
        return chunk
      })
      await import('../../src/editor.js')
      const files = { '/Diagrams/Order flow.puml': { content: MAIN, etag: '"m1"' }, '/Diagrams/UML_Fun.css': { content: STYLE, etag: '"s1"' } }
      seams.loadFile.mockImplementation(async (path) => files[path] ?? Promise.reject(new Error('404')))
      seams.fileAccess.mockImplementation(async (path) => (files[path] ? { writable: true } : null))
    })

    afterEach(() => {
      release()
      vi.doUnmock('../../src/editor/add/index.js')
    })

    it('opens nothing over a linked file opened meanwhile, and the button stays hidden', async () => {
      const { loadSheetProfile } = await import('../../src/editor/profiles/index.js')
      await loadSheetProfile()
      await open()
      view().dispatch({ selection: { anchor: MAIN.indexOf('<style') } })
      await settle()
      const added = watch(q('.plantuml-editor'))
      typeButton().click()
      q('button.cm-plantuml-link-chip[aria-label="Open UML_Fun.css"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await settle()
      expect(source()).toBe(STYLE)

      release()
      await imported
      await settle()

      expect(added.filter((c) => String(c).includes('plantuml-add'))).toEqual([])
      expect(typeButton().getAttribute('aria-expanded')).toBe('false')
      expect(q('.plantuml-editor__add').hidden).toBe(true)
    })

    it('opens nothing once the editor has closed, and throws nothing', async () => {
      await open()
      const added = watch(q('.plantuml-editor'))
      typeButton().click()
      q('.plantuml-editor__close').click()
      await settle()
      expect(q('.plantuml-editor')).toBeNull()

      release()
      await imported
      await settle()

      expect(added.filter((c) => String(c).includes('plantuml-add'))).toEqual([])
    })
  })

  // Last in the file: it loads a new editor whose add chunk fails once.
  it('tries the chunk again after it failed to load: the next click opens the menu', async () => {
    vi.resetModules()
    let failures = 1
    vi.doMock('../../src/editor/add/index.js', async (importOriginal) => {
      if (failures-- > 0) {
        throw new Error('offline')
      }
      return importOriginal()
    })
    try {
      await import('../../src/editor.js')
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      await open()

      typeButton().click()
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[plantuml] could not load Add diagram', expect.any(Error)))
      expect(q('.plantuml-add__menu')).toBeNull()
      expect(status()).toBe('Could not open Add diagram')
      typeButton().click()

      await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
      expect(status()).toBe('')
    } finally {
      vi.doUnmock('../../src/editor/add/index.js')
    }
  })
})
