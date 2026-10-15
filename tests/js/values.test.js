// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The value registry (W3), the chooser on values from a list (W1) and the
// stepper on numbers (W2), in a real view: `|` in a document marks the cursor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { acceptCompletion, completionStatus, currentCompletions, setSelectedCompletion } from '@codemirror/autocomplete'
import { history, undo } from '@codemirror/commands'
import { translate } from '@nextcloud/l10n'
import { scan } from '../../src/editor/blocks.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import styleProfile from '../../src/editor/profiles/style.js'
import { plantumlCompletion } from '../../src/editor/completion/index.js'
import { valueAt } from '../../src/editor/values/index.js'
import { valueWidgets } from '../../src/editor/values/widgets.js'
import vocabulary from '../../src/editor/data/vocabulary.json'

const THEMES = ['_none_', 'cerulean', 'cerulean-outline', 'vibrant']
// The theme list is asked once per page, so once for this file.
vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ themes: THEMES }), { status: 200 })))

const profile = styleProfile({ scan, t: translate })
const extensions = [profileExtension([profile]), plantumlCompletion, history(), valueWidgets]

const style = (...lines) => `<style>\nnode {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n</style>`

function stateAt(marked) {
  return EditorState.create({ doc: marked.replace('|', ''), extensions: [profileExtension([profile])] })
}

let view = null

function open(marked) {
  const pos = marked.indexOf('|')
  view = new EditorView({
    state: EditorState.create({ doc: marked.replace('|', ''), selection: { anchor: pos }, extensions }),
    parent: document.body,
  })
  return view
}

const doc = () => view.state.doc.toString()
const choosers = () => [...view.dom.querySelectorAll('.cm-plantuml-chooser')]
const steppers = () => [...view.dom.querySelectorAll('.cm-plantuml-stepper')]
const button = (label) => view.dom.querySelector(`.cm-plantuml-stepper button[aria-label="${label}"]`)

/** A press and release, as a click on a stepper half is. */
function press(target, init = {}) {
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init })
  target.dispatchEvent(down)
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, ...init }))
  return down
}

function click(target) {
  const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
  target.dispatchEvent(down)
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  return down
}

async function shown() {
  await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
  return currentCompletions(view.state).map((option) => option.label)
}

/** Picks `label` from the open list; the popup takes no pick in its first 75 ms. */
async function pick(label) {
  const index = (await shown()).indexOf(label)
  view.dispatch({ effects: setSelectedCompletion(index) })
  await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true))
}

afterEach(() => {
  view?.destroy()
  view = null
  vi.useRealTimers()
})

describe('valueAt', () => {
  it('finds a style value from a list, with its range', () => {
    const text = style('FontStyle bold')
    const from = text.indexOf('bold')
    const value = valueAt(stateAt(text), from + 2)

    expect(value).toMatchObject({ from, to: from + 4, kind: 'list' })
    expect(value.options()).toEqual(vocabulary.style.fontStyles)
  })

  it.each([
    ['HorizontalAlignment center', 'center', ['left', 'center', 'right']],
    ['ShowStereotype false', 'false', ['true', 'false']],
  ])('finds %s as a list value', (line, word, list) => {
    const text = style(line)
    const value = valueAt(stateAt(text), text.indexOf(word))
    expect(value).toMatchObject({ kind: 'list', from: text.indexOf(word), to: text.indexOf(word) + word.length })
    expect(value.options()).toEqual(list)
  })

  it('finds a style number, never below 0 for a property that cannot be negative', () => {
    const text = style('FontSize 22')
    const from = text.indexOf('22')

    expect(valueAt(stateAt(text), from)).toMatchObject({ from, to: from + 2, kind: 'number', min: 0 })
  })

  it('finds a number on a one-line style block', () => {
    const text = '<style>node { Padding 4 }</style>'
    expect(valueAt(stateAt(text), text.indexOf('4'))).toMatchObject({ kind: 'number', min: 0 })
  })

  it('finds nothing on other lines, outside a style block, or in a value with no list', () => {
    const text = style('FontSize 22', 'LineColor red')
    const state = stateAt(text)

    expect(valueAt(state, text.indexOf('node'))).toBeNull()
    expect(valueAt(state, text.indexOf('red'))).toBeNull()
    expect(valueAt(state, text.indexOf('FontSize'))).toBeNull()
    expect(valueAt(stateAt('node {\n  FontSize 22\n}'), 'node {\n  FontSize 2'.length)).toBeNull()
  })

  it.each([
    ['!theme cerulean', 'cerulean', 'list'],
    ['  !theme vibrant', 'vibrant', 'list'],
    ['skinparam LineThickness 2', '2', 'number'],
    ['skinparam classFontSize 14', '14', 'number'],
    ['scale 1.5', '1.5', 'number'],
    ['title <size:18>Big</size>', '18', 'number'],
  ])('finds the core value in %j', (text, word, kind) => {
    const from = text.indexOf(word)
    expect(valueAt(stateAt(text), from)).toMatchObject({ from, to: from + word.length, kind })
  })

  it('takes the server\'s themes for a theme\'s list', async () => {
    expect(await valueAt(stateAt('!theme cerulean'), 8).options()).toEqual(THEMES)
  })

  it('finds each number in a style value of several, never below 0 where the property cannot be negative', () => {
    const text = style('Margin 10 20 10 20')
    const state = stateAt(text)
    const line = text.indexOf('Margin')
    const at = [7, 10, 13, 16].map((column) => line + column)

    expect(at.map((pos) => valueAt(state, pos))).toEqual(at.map((from) => expect.objectContaining({ from, to: from + 2, kind: 'number', min: 0 })))
  })

  it('finds the numbers in a skinparam block, and none after it closes', () => {
    const text = 'skinparam class {\n  FontSize 12\n  LineThickness 2\n  BackgroundColor red\n}\nFontSize 14'
    const state = stateAt(text)

    expect(valueAt(state, text.indexOf('12'))).toMatchObject({ from: text.indexOf('12'), to: text.indexOf('12') + 2, kind: 'number', min: 0 })
    expect(valueAt(state, text.indexOf(' 2') + 1)).toMatchObject({ kind: 'number' })
    expect(valueAt(state, text.indexOf('red'))).toBeNull()
    expect(valueAt(state, text.indexOf('14'))).toBeNull()
    expect(valueAt(stateAt('skinparam {\n  Padding 4\n}'), 'skinparam {\n  Padding '.length)).toMatchObject({ kind: 'number' })
  })

  it('finds no core value where the line means something else', () => {
    expect(valueAt(stateAt('A -> B : !theme x'), 16)).toBeNull()
    expect(valueAt(stateAt('skinparam backgroundColor red'), 27)).toBeNull()
    expect(valueAt(stateAt('A -> B : 12'), 10)).toBeNull()
  })
})

describe('the chooser', () => {
  it('is one pencil button after each list value on the cursor\'s line, labelled, with no focus stop', () => {
    open(style('FontStyle bold|', 'FontSize 12'))

    expect(choosers()).toHaveLength(1)
    const [chooser] = choosers()
    expect(chooser.tagName).toBe('BUTTON')
    expect(chooser.getAttribute('aria-label')).toBe('Choose a value')
    expect(chooser.getAttribute('title')).toBe('Choose a value')
    expect(chooser.getAttribute('tabindex')).toBe('-1')
    expect(chooser.querySelector('svg')).not.toBeNull()
    expect(chooser.parentNode.textContent).toContain('bold')
  })

  it('selects the value and opens its whole list with the current value selected, keeping the focus', async () => {
    const text = style('FontStyle bold')
    open(text.replace('FontStyle', 'Font|Style'))

    const down = click(choosers()[0])

    expect(down.defaultPrevented).toBe(true)
    const from = text.indexOf('bold')
    expect(view.state.selection.main).toMatchObject({ from, to: from + 4 })
    const labels = await shown()
    expect(labels[0]).toBe('bold')
    expect(new Set(labels)).toEqual(new Set(vocabulary.style.fontStyles))
  })

  it('replaces the whole value with the one picked', async () => {
    open(style('FontStyle bold|'))

    click(choosers()[0])
    await pick('italic')

    expect(doc()).toBe(style('FontStyle italic'))
  })

  it('opens the same list on Ctrl-Space inside the value, and replaces the whole word', async () => {
    open(style('FontStyle bol|d'))

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, ctrlKey: true, bubbles: true, cancelable: true }))
    expect((await shown())[0]).toBe('bold')
    await pick('wave')

    expect(doc()).toBe(style('FontStyle wave'))
  })

  it('opens the server\'s themes after !theme', async () => {
    open('@startuml\n!theme cerul|ean\n@enduml')

    expect(choosers()).toHaveLength(1)
    click(choosers()[0])
    const labels = await shown()
    expect(labels[0]).toBe('cerulean')
    expect(new Set(labels)).toEqual(new Set(THEMES))
    await pick('vibrant')

    expect(doc()).toBe('@startuml\n!theme vibrant\n@enduml')
  })

  it('shows on the cursor\'s line only, and follows the cursor', () => {
    const text = style('FontStyle bold', 'HorizontalAlignment left')
    open(`|${text}`)
    expect(choosers()).toHaveLength(0)

    view.dispatch({ selection: { anchor: text.indexOf('left') } })
    expect(choosers()).toHaveLength(1)
    expect(choosers()[0].parentNode.textContent).toContain('left')
    expect(choosers()[0].parentNode.textContent).not.toContain('bold')
  })
})

describe('the stepper', () => {
  beforeEach(() => vi.useFakeTimers())

  it('is one control after each number on the cursor\'s line, its halves labelled, with no focus stop', () => {
    open(style('FontSize 22|', 'Padding 4'))

    expect(steppers()).toHaveLength(1)
    const halves = [...steppers()[0].querySelectorAll('button')]
    expect(halves.map((half) => half.getAttribute('aria-label'))).toEqual(['Increase', 'Decrease'])
    expect(halves.map((half) => half.getAttribute('tabindex'))).toEqual(['-1', '-1'])
    expect(halves.map((half) => half.textContent)).toEqual(['▲', '▼'])
  })

  it('steps by 1, and by 10 with Shift, keeping the focus', () => {
    open(style('FontSize 22|'))

    const down = press(button('Increase'))
    expect(down.defaultPrevented).toBe(true)
    expect(doc()).toBe(style('FontSize 23'))

    press(button('Decrease'))
    expect(doc()).toBe(style('FontSize 22'))

    press(button('Increase'), { shiftKey: true })
    expect(doc()).toBe(style('FontSize 32'))
  })

  it('never goes below 0 where the property cannot be negative', () => {
    open(style('FontSize 0|'))

    press(button('Decrease'))
    expect(doc()).toBe(style('FontSize 0'))
    press(button('Increase'))
    press(button('Decrease'), { shiftKey: true })
    expect(doc()).toBe(style('FontSize 0'))
  })

  it('steps a number with decimals by its last decimal place', () => {
    open(style('FontSize 1.5|'))

    press(button('Increase'))
    expect(doc()).toBe(style('FontSize 1.6'))
    press(button('Decrease'), { shiftKey: true })
    expect(doc()).toBe(style('FontSize 0.6'))
  })

  it.each([
    ['skinparam LineThickness 2|', 'skinparam LineThickness 3'],
    ['scale 1.5|', 'scale 1.6'],
    ['title <size:1|8>Big</size>', 'title <size:19>Big</size>'],
    ['skinparam defaultFontSize 9|', 'skinparam defaultFontSize 10'],
  ])('steps the number in %j', (marked, after) => {
    open(marked)

    press(button('Increase'))
    expect(doc()).toBe(after)
  })

  it('steps each number in a style value of several', () => {
    open(style('Padding 4 8|'))

    expect(steppers()).toHaveLength(2)
    press(steppers()[1].querySelector('button[aria-label="Increase"]'))
    expect(doc()).toBe(style('Padding 4 9'))
    press(steppers()[0].querySelector('button[aria-label="Decrease"]'))
    expect(doc()).toBe(style('Padding 3 9'))
  })

  it('steps each number of a dash pattern written 8.0;3.0 on its own', () => {
    open(style('LineStyle 8.0;3.0|'))
    expect(steppers()).toHaveLength(2)
    press(steppers()[1].querySelector('button[aria-label="Increase"]'))
    expect(doc()).toBe(style('LineStyle 8.0;3.1'))
    press(steppers()[0].querySelector('button[aria-label="Decrease"]'))
    expect(doc()).toBe(style('LineStyle 7.9;3.1'))
  })

  it('steps each number of a dash pattern written 8-3', () => {
    open(style('LineStyle 8-3|'))
    expect(steppers()).toHaveLength(2)
    press(steppers()[1].querySelector('button[aria-label="Increase"]'))
    expect(doc()).toBe(style('LineStyle 8-4'))
  })

  it('steps a number in a skinparam block', () => {
    open('skinparam class {\n  FontSize 12|\n}')

    press(button('Increase'))
    expect(doc()).toBe('skinparam class {\n  FontSize 13\n}')
  })

  it('steps a number already below 0 by 1, never jumping to 0', () => {
    open('skinparam x -3|')

    press(button('Increase'))
    expect(doc()).toBe('skinparam x -2')
    press(button('Decrease'))
    press(button('Decrease'))
    expect(doc()).toBe('skinparam x -4')
  })

  it('stops a held step when the view goes, dispatching nothing into it', () => {
    open(style('FontSize 10|'))

    button('Increase').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    const dispatch = vi.spyOn(view, 'dispatch')
    const removed = vi.spyOn(document, 'removeEventListener')
    view.destroy()
    vi.advanceTimersByTime(2000)

    expect(dispatch).not.toHaveBeenCalled()
    expect(removed).toHaveBeenCalledWith('mouseup', expect.any(Function))
    removed.mockRestore()
  })

  it('keeps the cursor after a number it was after', () => {
    const text = style('FontSize 9')
    open(text.replace('9', '9|'))

    press(button('Increase'))
    expect(view.state.selection.main.head).toBe(text.indexOf('9') + 2)
  })

  it('undoes a burst of clicks in one step, and a click after a pause in another', () => {
    open(style('FontSize 22|'))

    press(button('Increase'))
    vi.advanceTimersByTime(100)
    press(button('Increase'))
    vi.advanceTimersByTime(100)
    press(button('Increase'))
    expect(doc()).toBe(style('FontSize 25'))
    vi.advanceTimersByTime(1000)
    press(button('Increase'))
    expect(doc()).toBe(style('FontSize 26'))

    undo(view)
    expect(doc()).toBe(style('FontSize 25'))
    undo(view)
    expect(doc()).toBe(style('FontSize 22'))
  })

  it('repeats every 80 ms while held, after 400 ms, until released', () => {
    open(style('FontSize 10|'))

    button('Increase').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    expect(doc()).toBe(style('FontSize 11'))
    vi.advanceTimersByTime(399)
    expect(doc()).toBe(style('FontSize 11'))
    vi.advanceTimersByTime(1)
    expect(doc()).toBe(style('FontSize 12'))
    vi.advanceTimersByTime(160)
    expect(doc()).toBe(style('FontSize 14'))

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    vi.advanceTimersByTime(1000)
    expect(doc()).toBe(style('FontSize 14'))
  })

  it('shows on the cursor\'s line only', () => {
    const text = style('FontSize 22', 'Padding 4')
    open(`${text}|`)
    expect(steppers()).toHaveLength(0)

    view.dispatch({ selection: { anchor: text.indexOf('4') } })
    expect(steppers()).toHaveLength(1)
    expect(steppers()[0].parentNode.textContent).toContain('Padding')
    expect(steppers()[0].parentNode.textContent).not.toContain('FontSize')
  })
})
