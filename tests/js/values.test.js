// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The value registry (W3), the chooser on values from a list (W1) and the
// stepper on numbers (W2), in a real view: `|` in a document marks the cursor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { acceptCompletion, completionStatus, currentCompletions, setSelectedCompletion, startCompletion } from '@codemirror/autocomplete'
import { history, undo } from '@codemirror/commands'
import { translate } from '@nextcloud/l10n'
import { scan } from '../../src/editor/blocks.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import styleProfile from '../../src/editor/profiles/style.js'
import { plantumlCompletion } from '../../src/editor/completion/index.js'
import { stepNumber, valueAt, valuesOn } from '../../src/editor/values/index.js'
import { valueWidgets } from '../../src/editor/values/widgets.js'
import vocabulary from '../../src/editor/data/vocabulary.json'

const THEMES = ['_none_', 'cerulean', 'cerulean-outline', 'vibrant']
// The theme list is asked once per page, so once for this file.
vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
const fetch = vi.fn(async () => new Response(JSON.stringify({ themes: THEMES }), { status: 200 }))
vi.stubGlobal('fetch', fetch)

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

describe('a tag\'s values (W4)', () => {
  const on = (text) => valuesOn(stateAt(text), 1)

  it('finds valign as a list and vspace as a number in an img tag', async () => {
    const text = '<img src=x.png valign=top vspace=4>'
    const [valign, vspace] = on(text)

    expect(valign).toMatchObject({ from: text.indexOf('top'), to: text.indexOf('top') + 3, kind: 'list' })
    expect(await valign.options()).toEqual(['top', 'middle', 'bottom'])
    expect(vspace).toMatchObject({ from: text.indexOf('4'), to: text.indexOf('4') + 1, kind: 'number', min: 0 })
  })

  it.each([
    ['<font size=12>', '12'],
    ['<font color=red size="9.5">', '9.5'],
    ['<space:8>', '8'],
    ['<&star{scale=1.5}>', '1.5'],
    ['<&star{color=red,scale=2}>', '2'],
  ])('finds a number, never below 0, in %j', (text, word) => {
    const from = text.indexOf(word)
    expect(on(text)).toEqual([expect.objectContaining({ from, to: from + word.length, kind: 'number', min: 0 })])
  })

  it('finds none where the attribute belongs to another tag', () => {
    expect(on('<font vspace=4> <img size=3> <u scale=2> <b>x</b>')).toEqual([])
  })

  it('steps a scale by its own last decimal and stops at 0', () => {
    expect(stepNumber('0.1', -1, 0)).toBe('0.0')
    expect(stepNumber('0', -1, 0)).toBe('0')
    expect(stepNumber('1.5', 1, 0)).toBe('1.6')
  })

  it('finds an empty valign for the list to open on', () => {
    const text = '<img valign=>'
    expect(on(text)).toEqual([expect.objectContaining({ from: text.indexOf('>'), to: text.indexOf('>'), kind: 'list' })])
  })

  it('takes the server\'s fonts for <font:family>, spaces kept', async () => {
    const text = '<font:DejaVu Sans>x</font>'
    fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ fonts: ['DejaVu Sans', 'Dialog'] }), { status: 200 }))
    const [family] = on(text)

    expect(family).toMatchObject({ from: '<font:'.length, to: '<font:DejaVu Sans'.length, kind: 'list' })
    expect(await family.options()).toEqual(['DejaVu Sans', 'Dialog'])
  })

  // A family holds spaces, so an unclosed `<font:` is what is typed up to the cursor, or, with
  // the cursor elsewhere, its first word (the pencil's).
  it.each([
    ['<font:De| and more', 'De'],
    ['<font:DejaVu Sa|', 'DejaVu Sa'],
    ['<font:Dej|aVu Sans and more', 'Dej'],
    ['A -> B : <font:|hello</font>', ''],
    ['<font:Sans Serif and more|', 'Sans Serif and more'],
    ['<font:Sans Serif and more <b>x</b>|', 'Sans'],
    ['A|<font:Sans Serif', 'Sans'],
    ['<font:DejaVu Sans>x</font>|', 'DejaVu Sans'],
  ])('reads the family of %j as %j', (marked, family) => {
    const state = EditorState.create({ doc: marked.replace('|', ''), selection: { anchor: marked.indexOf('|') } })
    const [value] = valuesOn(state, 1)

    expect(state.sliceDoc(value.from, value.to)).toBe(family)
  })

  it.each([
    ['A -> B : <font:|hello</font>', 'A -> B : <font:Dialog>hello</font>'],
    ['<font:De| and more', '<font:Dialog> and more'],
    ['<font:Dej|aVu Sans>x', '<font:Dialog>x'],
  ])('a font picked in %j keeps the text after the family', async (marked, picked) => {
    open(marked)
    startCompletion(view)
    await pick('Dialog')

    expect(doc()).toBe(picked)
  })

  it('resolves no fonts when the server cannot answer', async () => {
    vi.resetModules()
    fetch.mockImplementationOnce(async () => new Response('{}', { status: 503 }))
    const { valuesOn: fresh } = await import('../../src/editor/values/index.js')
    const state = EditorState.create({ doc: '<font:Dialog>' })

    expect(await fresh(state, 1)[0].options()).toEqual([])
  })

  it('draws no pencil for <font:…> once the server is known to list no fonts, and one while it is pending', async () => {
    vi.resetModules()
    fetch.mockImplementationOnce(async () => new Response('{}', { status: 503 }))
    const widgets = (await import('../../src/editor/values/widgets.js')).valueWidgets
    const { serverList } = await import('../../src/editor/completion/server-list.js')
    const make = () => new EditorView({ state: EditorState.create({ doc: '<font:Dejavu>', selection: { anchor: 3 }, extensions: [widgets] }), parent: document.body })

    view = make()
    expect(choosers()).toHaveLength(1)
    view.destroy()
    await serverList('fonts')
    view = make()

    expect(choosers()).toHaveLength(0)
  })

  it('replaces only the word of a quoted valign', async () => {
    const text = '<img valign="top">'
    open(text.replace('top', 'to|p'))
    const value = valueAt(view.state, view.state.selection.main.head)

    expect(value).toMatchObject({ from: text.indexOf('top'), to: text.indexOf('top') + 3, kind: 'list' })
    click(choosers()[0])
    await pick('middle')
    expect(doc()).toBe('<img valign="middle">')
  })

  it('finds a scale only in the braces after an icon, emoji, sprite, image or QR code', () => {
    expect(on('skinparam x { scale=2 }')).toEqual([])
    expect(on('A -> B : {scale=3}')).toEqual([])
    for (const tag of ['<&star>{scale=3}', '<:smile:>{scale=3}', '<$box>{scale=3}', '<img:a.png>{scale=3}', '<qrcode:hi>{scale=3}']) {
      expect(on(tag)).toEqual([expect.objectContaining({ from: tag.indexOf('3'), kind: 'number', min: 0 })])
    }
  })

  it('draws a pencil after a valign and a stepper after a vspace on the cursor\'s line', () => {
    open('<img src=x.png valign=top| vspace=4>')

    expect(choosers()).toHaveLength(1)
    expect(steppers()).toHaveLength(1)
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
