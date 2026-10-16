// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The element under a position (I6): the syntax tree's token there, with its
// text, names the docs key; every other token names none. Its card on hover
// (I2), pinned in place by a click or the keys (I3), and Escape's order (K1).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, activateHover, hasHoverTooltips } from '@codemirror/view'
import { keymap } from '@codemirror/view'
import { setDiagnostics } from '@codemirror/lint'
import { autocompletion, completionStatus, hasNextSnippetField, snippet, startCompletion } from '@codemirror/autocomplete'
import { elementAt } from '../../src/editor/docs/element.js'
import { buildDocs, loadDocs } from '../../src/editor/docs/index.js'
import { DOC_HOVER, closeDoc, docPinned, docSource, pinDocAt, plantumlDocs } from '../../src/editor/docs/hover.js'
import { plantumlLint, plantumlLintKeymap, tooltipFilter } from '../../src/editor/lint/index.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import { core } from './helpers/core.js'
import styleProfile from '../../src/editor/profiles/style.js'
import ganttProfile, { project as projectProfile } from '../../src/editor/profiles/gantt.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'
import dotProfile from '../../src/editor/profiles/dot.js'
import mindmapProfile from '../../src/editor/profiles/tree.js'
import jsonProfile from '../../src/editor/profiles/json.js'
import hclProfile from '../../src/editor/profiles/hcl.js'
import ownLines from '../../src/editor/data/docs/own.json'
import docLinks from '../../src/editor/data/docs/links.json'
import sourceData from '../../src/editor/data/docs/source.json'
import builtinList from '../../src/editor/data/builtins.json'
import language from '../../src/editor/data/language.json'
import vocabulary from '../../src/editor/data/vocabulary.json'
import { atTopLevel } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'

// The real functions, counted: the top-level check and the scan run only where they are needed.
vi.mock('../../src/editor/plantuml-mode.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, atTopLevel: vi.fn(real.atTopLevel) }
})
vi.mock('../../src/editor/blocks.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, scan: vi.fn(real.scan) }
})
// A small index in place of the data chunks.
vi.mock('../../src/editor/docs/index.js', async (importOriginal) => {
  const real = await importOriginal()
  const docs = real.buildDocs({
    own: {
      'keyword:alt': { summary: 'Alternatives, one drawn per else', example: 'alt paid\nend' },
      'function:%strlen': { signature: '%strlen(text)', summary: 'The length of a string' },
    },
    links: { links: { 'keyword:alt': { page: 'sequence-diagram', anchor: 'grouping', section: 'Grouping message' } } },
    source: { themes: {}, libraries: {} },
    builtins: [],
    language: { skinparameters: [] },
    vocabulary: { style: { selectors: [], properties: [] } },
  })
  return { ...real, loadDocs: vi.fn(() => Promise.resolve(docs)) }
})

const extensions = [profileExtension([styleProfile(core), ganttProfile(core), projectProfile(core), yamlProfile(core), dotProfile(core), jsonProfile(core), hclProfile(core), mindmapProfile(core)])]

/**
 * The element inside the `nth` (0-based) `word` of the lines, one character in,
 * or at its end with `side` -1.
 */
function on(lines, word, { nth = 0, side = 1 } = {}) {
  const doc = lines.join('\n')
  let at = -1
  for (let i = 0; i <= nth; i++) {
    at = doc.indexOf(word, at + 1)
  }
  expect(at, `${word} in the document`).toBeGreaterThanOrEqual(0)
  const state = EditorState.create({ doc, extensions })
  return elementAt(state, side === -1 ? at + word.length : at + 1, side)
}

const key = (...args) => on(...args)?.key ?? null

describe('elementAt: known elements', () => {
  it('reads a diagram from its @start or @end line', () => {
    expect(on(['@startyaml', 'a: 1', '@endyaml'], '@startyaml')).toEqual({ key: 'diagram:yaml', type: 'yaml', from: 0, to: 10 })
    expect(key(['@startuml(id=x)', 'A -> B', '@enduml'], '@startuml')).toBe('diagram:uml')
    expect(on(['@startgantt', '[T] lasts 5 days', '@endgantt'], '@endgantt')).toMatchObject({ key: 'diagram:gantt', type: 'gantt' })
  })

  it('reads a keyword, a phrase as its words lower-cased', () => {
    expect(on(['alt paid', 'end'], 'alt')).toEqual({ key: 'keyword:alt', type: 'uml', from: 0, to: 3 })
    expect(key(['note over A', 'text', 'end note'], 'end note')).toBe('keyword:end note')
    expect(key(['note over A', 'text', 'end  note'], 'end  note')).toBe('keyword:end note')
  })

  it('reads a keyword lower-cased, as PlantUML reads its commands', () => {
    expect(on(['@startgantt', '[T] LASTS 5 days', '@endgantt'], 'LASTS')).toMatchObject({ key: 'keyword:lasts', type: 'gantt' })
    expect(on(['@startdot', 'DIGRAPH g {', '}', '@enddot'], 'DIGRAPH')).toMatchObject({ key: 'keyword:digraph', type: 'dot' })
  })

  it('takes the block’s type for a keyword', () => {
    expect(on(['@startgantt', '[T] lasts 5 days', '@endgantt'], 'lasts')).toMatchObject({ key: 'keyword:lasts', type: 'gantt' })
    expect(on(['@startuml', 'start', '@enduml'], 'start', { nth: 1 })).toMatchObject({ key: 'keyword:start', type: 'uml' })
  })

  it('reads a directive and a function as written', () => {
    expect(key(['!include <C4/C4_Container>'], '!include')).toBe('directive:!include')
    expect(key(['!function $f()', '!return 1', '!end function'], '!end function')).toBe('directive:!endfunction')
    expect(key(['!$x = %strlen("ab")'], '%strlen')).toBe('function:%strlen')
    expect(key(['A -> B : %strlen("x")'], '%strlen')).toBe('function:%strlen')
  })

  it('reads a Creole tag as its bare word, opening or closing', () => {
    expect(on(['A -> B : <back:red>hi</back>'], '<back')).toMatchObject({ key: 'tag:back', from: 9, to: 14 })
    expect(key(['A -> B : <back:red>hi</back>'], '</back>')).toBe('tag:back')
    expect(key(['A -> B : <b>hi</b>'], '<b>')).toBe('tag:b')
  })

  it('reads C4’s connectors', () => {
    expect(key(['A --> B'], '-->')).toBe('connector:-->')
    expect(key(['A --|> B'], '--|>')).toBe('connector:--|>')
  })

  it('reads a style block’s selector and property, lower-cased', () => {
    const style = ['<style>', 'activityBar {', '  BackgroundColor red', '}', '</style>']
    expect(key(style, 'activityBar')).toBe('selector:activitybar')
    expect(key(style, 'BackgroundColor')).toBe('property:backgroundcolor')
  })

  it('reads a skin parameter’s name, and not its value', () => {
    expect(on(['skinparam BackgroundColor red'], 'BackgroundColor')).toEqual({ key: 'skinparam:backgroundcolor', type: 'uml', from: 10, to: 25 })
    expect(on(['skinparam BackgroundColor red'], 'red')).toBeNull()
  })

  it('reads a theme after !theme and a library in !include <…>', () => {
    expect(on(['!theme cerulean'], 'cerulean')).toEqual({ key: 'theme:cerulean', type: 'uml', from: 7, to: 15 })
    expect(on(['!include <C4/C4_Container>'], 'C4')).toEqual({ key: 'library:c4', type: 'uml', from: 10, to: 12 })
    expect(key(['!include <c4/C4_Container>'], 'c4')).toBe('library:c4')
    expect(key(['!include <DomainStory/domainStory>'], 'DomainStory')).toBe('library:domainstory')
  })

  it('reads a helper command alone on its line', () => {
    expect(on(['listfonts'], 'listfonts')).toEqual({ key: 'helper:listfonts', type: 'uml', from: 0, to: 9 })
    expect(key(['  help themes'], 'themes')).toBe('helper:help themes')
    expect(key(['class C {', '}', 'listfonts'], 'listfonts')).toBe('helper:listfonts')
    expect(key(['note over A', 'text', 'end note', 'skinparam BackgroundColor red'], 'BackgroundColor')).toBe('skinparam:backgroundcolor')
  })

  it('takes the side: the end of a word belongs to it before, not after', () => {
    expect(key(['alt paid'], 'alt', { side: -1 })).toBe('keyword:alt')
    expect(on(['alt paid'], 'alt ', { side: -1 })).toBeNull()
  })
})

describe('elementAt: everything else is nothing (I6)', () => {
  it.each([
    ['a label', ['A -> B : alt paid'], 'alt'],
    ['a comment', ["' alt"], 'alt'],
    ['a string', ['"alt"'], 'alt'],
    ['note text', ['note left : end'], 'end'],
    ['a declared name', ['participant alt'], 'alt'],
    ['a number', ['!$x = 12'], '12'],
    ['a colour', ['class A #Red'], '#Red'],
    ['an icon', ['A -> B : <&star>'], 'star'],
    ['an emoji', ['A -> B : <:smile:>'], 'smile'],
    ['a variable', ['A -> $var'], '$var'],
    ['a bare !', ['!$x = 1'], '!', { side: -1 }],
    ['a yaml block’s #highlight line', ['@startyaml', '#highlight "a"', 'a: 1', '@endyaml'], 'highlight'],
    ['a tag’s closing bracket', ['A -> B : <back:red>hi</back>'], 'red>', { side: -1 }],
    ['a link operator outside C4’s list', ['A -[#red]-> B'], '-['],
    ['a library’s file', ['!include <C4/C4_Container>'], 'C4_'],
    ['a word on a helper’s line with more', ['listfonts now'], 'listfonts'],
    ['a selector-like name outside a style block', ['class node'], 'node'],
    ['a helper word in a note’s body', ['note over A', 'colors', 'end note'], 'colors'],
    ['a helper word in a legend’s body', ['legend', 'license', 'endlegend'], 'license'],
    ['a helper word in a title’s body', ['title', 'version', 'end title'], 'version'],
    ['a skin parameter in a note’s body', ['note as N', 'skinparam BackgroundColor red', 'end note'], 'BackgroundColor'],
    ['a helper word outside uml', ['@startyaml', 'colors', '@endyaml'], 'colors'],
    ['a helper word in a class body', ['class C {', 'colors', '}'], 'colors'],
    ['a skin parameter in a class body', ['class C {', 'skinparam BackgroundColor red', '}'], 'BackgroundColor'],
    ['a helper word in a multi-line activity box', [':first', 'colors', 'last;'], 'colors'],
    ['a theme in a multi-line activity box', [':first', '!theme cerulean', 'last;'], 'cerulean'],
    ['a skin parameter outside uml', ['@startyaml', 'skinparam BackgroundColor red', '@endyaml'], 'BackgroundColor'],
  ])('%s', (_name, lines, word, options) => {
    expect(on(lines, word, options)).toBeNull()
  })
})

describe('elementAt with the index: a block’s own words', () => {
  const docs = buildDocs({
    own: {
      'keyword:node': { summary: 'A deployment node' },
      'keyword:lasts@gantt': { summary: 'How long a task takes' },
      'keyword:alt': { summary: 'Alternatives' },
      'connector:->': { summary: 'Arrow' },
      'directive:!include': { summary: 'Includes a file' },
    },
    links: { links: {} },
    source: { themes: {}, libraries: {} },
    builtins: [],
    language: { skinparameters: [] },
    vocabulary: { style: { selectors: [], properties: [] } },
  })
  const entry = (lines, word) => {
    const element = on(lines, word)
    return element && docs.get(element.key, element.type)
  }
  const dot = ['@startdot', 'digraph g {', 'node [shape=box]', 'a -> b', '}', '@enddot']

  it('gives a dot block’s `node` and `->` no uml card', () => {
    expect(on(dot, 'node')).toMatchObject({ key: 'keyword:node', type: 'dot' })
    expect(entry(dot, 'node')).toBeUndefined()
    expect(on(dot, '->')).toMatchObject({ key: 'connector:->', type: 'dot' })
    expect(entry(dot, '->')).toBeUndefined()
  })

  it('gives a gantt keyword its gantt entry, and uml words their own', () => {
    expect(entry(['@startgantt', '[T] lasts 5 days', '@endgantt'], 'lasts').summary).toBe('How long a task takes')
    expect(on(['@startproject', '[T] lasts 5 days', '@endproject'], 'lasts')).toMatchObject({ key: 'keyword:lasts', type: 'project' })
    expect(entry(['@startproject', '[T] lasts 5 days', '@endproject'], 'lasts').summary).toBe('How long a task takes')
    expect(entry(['node n', 'A -> B'], 'node').summary).toBe('A deployment node')
    expect(entry(['A -> B'], '->').summary).toBe('Arrow')
    expect(entry(['@startuml', 'alt x', 'end', '@enduml'], 'alt').summary).toBe('Alternatives')
  })
})

// The shipped index (the mock above stands in for loadDocs only).
const shipped = buildDocs({ own: ownLines, links: docLinks, source: sourceData, builtins: builtinList, language, vocabulary })

describe('elementAt with the shipped index: a data block’s values open no card', () => {
  const card = (lines, word) => {
    const element = on(lines, word)
    return (element && shipped.get(element.key, element.type)) ?? null
  }

  it.each([
    ['a yaml true', ['@startyaml', 'a: true', '@endyaml'], 'true'],
    ['a yaml false', ['@startyaml', 'a: false', '@endyaml'], 'false'],
    ['a json literal true', ['@startjson', '{"a": true}', '@endjson'], 'true'],
    ['an hcl atom', ['@starthcl', 'a = true', '@endhcl'], 'true'],
  ])('%s', (_name, lines, word) => {
    expect(card(lines, word)).toBeNull()
  })
})

describe('elementAt with the shipped index: a phrase', () => {
  const card = (lines, word) => {
    const element = on(lines, word)
    return element && shipped.get(element.key, element.type)
  }

  it('is its own entry’s where it has one, else its last word’s', () => {
    expect(card(['@startmindmap', 'left to right direction', '* root', '@endmindmap'], 'left to right direction').summary).toBe('Lays the map out left to right')
    expect(card(['note over A', 'text', 'end note'], 'end note')).toBe(shipped.get('keyword:note'))
    expect(card(['start', 'fork', '  :a;', 'end fork'], 'end fork')).toBe(shipped.get('keyword:fork'))
  })
})

describe('elementAt: only the work a position needs', () => {
  const lines = ['@startuml', 'alt paid', '  A -> B : hi', 'end', 'listfonts', '@enduml']

  it('runs no top-level check on a token', () => {
    atTopLevel.mockClear()
    expect(key(lines, 'alt')).toBe('keyword:alt')
    expect(key(lines, '->')).toBe('connector:->')
    expect(atTopLevel).not.toHaveBeenCalled()
  })

  it('runs it on untokenised text in a uml block, and not outside one', () => {
    atTopLevel.mockClear()
    expect(key(lines, 'listfonts')).toBe('helper:listfonts')
    expect(atTopLevel).toHaveBeenCalledTimes(1)
    atTopLevel.mockClear()
    expect(key(['@startyaml', 'colors', '@endyaml'], 'colors')).toBeNull()
    expect(atTopLevel).not.toHaveBeenCalled()
  })

  it('reads no block for a token that names nothing', () => {
    scan.mockClear()
    expect(key(lines, 'hi')).toBeNull()
    expect(scan).not.toHaveBeenCalled()
  })
})

describe('the card on hover (I2) and pinned (I3)', () => {
  const doc = ['alt paid', '  A -> B : hi', 'end', 'participant Bob', '!$x = %strlen("ab")'].join('\n')
  const at = (word, offset = 1) => doc.indexOf(word) + offset
  let views = []

  function viewOf(extra = []) {
    const view = new EditorView({
      parent: document.body,
      // As the editor orders them: the completion before the docs.
      state: EditorState.create({ doc, extensions: [...extensions, ...extra, plantumlDocs, plantumlLint] }),
    })
    views.push(view)
    return view
  }
  const host = (view) => view.dom.querySelector('.cm-tooltip-hover')
  const card = (view) => view.dom.querySelector('.cm-tooltip-hover .cm-doc')
  const key = (target, init) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }
  const docKeys = (view) => {
    key(view.contentDOM, { key: 'k', keyCode: 75, ctrlKey: true })
    key(view.contentDOM, { key: 'i', keyCode: 73, ctrlKey: true })
  }

  beforeAll(async () => {
    // Until the index arrives no card shows; the view asks for it as it opens.
    const view = viewOf()
    expect(docSource(view, at('alt'), 1)).toBeNull()
    expect(pinDocAt(view, at('alt'))).toBe(false)
    await loadDocs()
    expect(docSource(view, at('alt'), 1)).toMatchObject({ pos: 0, end: 3 })
  })

  afterEach(() => {
    for (const view of views) {
      view.destroy()
    }
    views = []
    document.body.innerHTML = ''
  })

  it('waits 500 ms and goes on an edit', () => {
    expect(DOC_HOVER).toEqual({ hoverTime: 500, hideOnChange: true })
  })

  it('answers a known element with its tooltip at the element, the same one twice', () => {
    const view = viewOf()
    const tooltip = docSource(view, at('alt'), 1)
    expect(tooltip).toMatchObject({ pos: 0, end: 3, above: false })
    expect(docSource(view, at('alt', 2), 1)).toBe(tooltip)
    expect(docSource(view, at('alt', 3), -1)).toBe(tooltip)
    expect(docSource(view, at('%strlen'), 1)).toMatchObject({ pos: doc.indexOf('%strlen'), end: doc.indexOf('%strlen') + 7 })
  })

  it.each([
    ['a string', '"ab"'],
    ['a name', 'Bob'],
    ['a word with no entry', 'end'],
  ])('answers %s with nothing', (_name, word) => {
    expect(docSource(viewOf(), at(word), 1)).toBeNull()
  })

  it('pins in place: the same card, the lint message still beside it (Review Focus 1)', () => {
    const view = viewOf()
    view.dispatch(setDiagnostics(view.state, [{ from: 0, to: 3, severity: 'warning', message: 'An alt with no else' }]))
    activateHover(view, at('alt'), 1)
    const shown = card(view)
    expect(shown).not.toBeNull()
    expect(host(view).querySelector('.cm-tooltip-lint')).not.toBeNull()
    expect(host(view).getAttribute('role')).toBe('tooltip')
    expect(host(view).classList.contains('cm-doc-pinned')).toBe(false)

    expect(pinDocAt(view, at('alt'))).toBe(true)
    expect(card(view)).toBe(shown)
    expect(shown.isConnected).toBe(true)
    expect(host(view).querySelector('.cm-tooltip-lint')?.textContent).toContain('An alt with no else')
    expect(host(view).classList.contains('cm-doc-pinned')).toBe(true)
    expect(host(view).getAttribute('role')).toBe('dialog')
    expect(host(view).getAttribute('aria-label')).toBe('alt')
    expect(shown.getAttribute('tabindex')).toBe('-1')
    expect(host(view).contains(document.activeElement)).toBe(true)
    expect(view.state.field(docPinned)).toEqual({ pos: at('alt') })
  })

  it('pins on a click in the card, and not on its link', () => {
    const view = viewOf()
    activateHover(view, at('alt'), 1)
    const link = card(view).querySelector('.cm-doc-link')
    link.addEventListener('click', (event) => event.preventDefault())
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(view.state.field(docPinned)).toBeNull()

    card(view).querySelector('.cm-doc-summary').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(view.state.field(docPinned)).toEqual({ pos: at('alt') })
  })

  it('closes on an edit', () => {
    const view = viewOf()
    pinDocAt(view, at('alt'))
    view.dispatch({ changes: { from: doc.length, insert: '\n' } })
    expect(view.state.field(docPinned)).toBeNull()
    expect(hasHoverTooltips(view.state)).toBe(false)
  })

  it('closes on closeDoc and on ×, focus back in the source, the caret where it was', () => {
    const view = viewOf()
    view.dispatch({ selection: { anchor: at('paid') } })
    pinDocAt(view, at('alt'))
    expect(closeDoc(view)).toBe(true)
    expect(hasHoverTooltips(view.state)).toBe(false)
    expect(view.state.field(docPinned)).toBeNull()
    expect(document.activeElement).toBe(view.contentDOM)
    expect(view.state.selection.main.head).toBe(at('paid'))
    expect(closeDoc(view)).toBe(false)

    pinDocAt(view, at('alt'))
    card(view).querySelector('.cm-doc-close').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(hasHoverTooltips(view.state)).toBe(false)
    expect(document.activeElement).toBe(view.contentDOM)
  })

  it('closes on a mousedown outside it, and not inside', () => {
    const view = viewOf()
    pinDocAt(view, at('alt'))
    card(view).querySelector('.cm-doc-summary').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(view.state.field(docPinned)).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(view.state.field(docPinned)).toBeNull()
    expect(hasHoverTooltips(view.state)).toBe(false)
  })

  it('opens no other card, nor another word’s lint message, while pinned', () => {
    const view = viewOf()
    view.dispatch(setDiagnostics(view.state, [{ from: doc.indexOf('Bob'), to: doc.indexOf('Bob') + 3, severity: 'warning', message: 'Bob is never used' }]))
    pinDocAt(view, at('alt'))
    expect(docSource(view, at('%strlen'), 1)).toBeNull()
    activateHover(view, at('Bob'), 1)
    expect(host(view).querySelector('.cm-tooltip-lint')).toBeNull()
    expect(view.state.field(docPinned)).toEqual({ pos: at('alt') })
  })

  it('closes on Escape in the card, which no one else then sees (Review Focus 2)', () => {
    const view = viewOf()
    view.dispatch({ selection: { anchor: at('paid') } })
    pinDocAt(view, at('alt'))
    const escape = key(document.activeElement, { key: 'Escape', keyCode: 27 })
    expect(escape.defaultPrevented).toBe(true)
    expect(hasHoverTooltips(view.state)).toBe(false)
    expect(document.activeElement).toBe(view.contentDOM)
    expect(view.state.selection.main.head).toBe(at('paid'))
  })

  it('closes the completion list first on Escape, then the card', async () => {
    const view = viewOf([autocompletion({ override: [(context) => ({ from: context.pos, options: [{ label: 'alt' }, { label: 'else' }] })] })])
    view.focus()
    view.dispatch({ selection: { anchor: at('%strlen') } })
    docKeys(view)
    expect(view.state.field(docPinned)).not.toBeNull()
    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))

    expect(key(view.contentDOM, { key: 'Escape', keyCode: 27 }).defaultPrevented).toBe(true)
    expect(completionStatus(view.state)).toBeNull()
    expect(view.state.field(docPinned)).not.toBeNull()

    expect(key(view.contentDOM, { key: 'Escape', keyCode: 27 }).defaultPrevented).toBe(true)
    expect(view.state.field(docPinned)).toBeNull()
    expect(key(view.contentDOM, { key: 'Escape', keyCode: 27 }).defaultPrevented).toBe(false)
  })

  it('opens the caret’s card pinned on Mod-k Mod-i, and moves focus into it on the same keys again', () => {
    const view = viewOf()
    view.focus()
    view.dispatch({ selection: { anchor: at('%strlen', 2) } })
    docKeys(view)
    expect(view.state.field(docPinned)).toEqual({ pos: at('%strlen', 2) })
    expect(card(view).querySelector('.cm-doc-name').textContent).toBe('%strlen(text)')
    expect(document.activeElement).toBe(view.contentDOM)

    docKeys(view)
    expect(host(view).contains(document.activeElement)).toBe(true)
    expect(view.state.selection.main.head).toBe(at('%strlen', 2))
  })

  // Fix round 1: a carded word's lint messages ride in its card, one tooltip at 500 ms below the word.
  const alt = (message = 'An alt with no else', apply = () => {}) => ({ from: 0, to: 3, severity: 'warning', message, actions: [{ name: 'Add else', apply }] })
  const bob = { from: doc.indexOf('Bob'), to: doc.indexOf('Bob') + 3, severity: 'warning', message: 'Bob is never used' }

  it('draws a carded word’s lint message in its own tooltip, above the card', () => {
    const view = viewOf()
    view.dispatch(setDiagnostics(view.state, [alt()]))
    const tooltip = docSource(view, at('alt'), 1)
    expect(tooltip).toMatchObject({ pos: 0, end: 3, above: false })
    const { dom } = tooltip.create(view)
    expect([...dom.children].map((el) => el.classList[0])).toEqual(['cm-tooltip-lint', 'cm-doc'])
    const item = dom.querySelector('ul.cm-tooltip-lint > li.cm-diagnostic.cm-diagnostic-warning')
    expect(item.querySelector('.cm-diagnosticText').textContent).toBe('An alt with no else')
    expect(item.querySelector('button.cm-diagnosticAction').textContent).toBe('Add else')

    activateHover(view, at('alt'), 1)
    expect(host(view).querySelectorAll('.cm-tooltip-lint')).toHaveLength(1)
    expect(host(view).querySelectorAll('.cm-tooltip-section')).toHaveLength(1)
  })

  it('leaves lint’s own hover nothing on a carded word, and an uncarded word’s messages as they were', () => {
    const view = viewOf()
    const [onAlt] = [alt()]
    view.dispatch(setDiagnostics(view.state, [onAlt, bob]))
    expect(tooltipFilter([onAlt], view.state) ?? []).toEqual([])
    expect(tooltipFilter([bob], view.state)).toEqual([bob])
    expect(tooltipFilter([onAlt, bob], view.state)).toEqual([bob])
  })

  it('shows a message on a carded word, where the pointer is beside the word, alone', () => {
    const view = viewOf()
    const line = { from: 0, to: 'alt paid'.length, severity: 'error', message: 'Syntax error' }
    view.dispatch(setDiagnostics(view.state, [line]))
    expect(tooltipFilter([line], view.state) ?? []).toEqual([])
    const tooltip = docSource(view, at('paid'), 1)
    expect(tooltip).toMatchObject({ above: true })
    const { dom } = tooltip.create(view)
    expect(dom.matches('ul.cm-tooltip-lint')).toBe(true)
    expect(dom.textContent).toContain('Syntax error')
    expect(pinDocAt(view, at('paid'))).toBe(false)
  })

  it('spans a message shown alone over the pointer’s word only, so the carded word beside it still gets its card', () => {
    const view = viewOf()
    const line = { from: 0, to: 'alt paid'.length, severity: 'error', message: 'Syntax error' }
    view.dispatch(setDiagnostics(view.state, [line]))
    expect(docSource(view, at('paid'), 1)).toMatchObject({ pos: 4, end: 8, above: true })
    expect(docSource(view, at('paid', 3), -1)).toMatchObject({ pos: 4, end: 8 })
    expect(docSource(view, 3, 1)).toMatchObject({ pos: 3, end: 3 })
    expect(docSource(view, at('alt'), 1)).toMatchObject({ pos: 0, end: 3, above: false })
  })

  it('keeps a message shown alone inside its own range', () => {
    const view = viewOf()
    const part = { from: 0, to: 'alt pa'.length, severity: 'error', message: 'Syntax error' }
    view.dispatch(setDiagnostics(view.state, [part]))
    expect(docSource(view, at('paid'), 1)).toMatchObject({ pos: 4, end: 6 })
  })

  it('applies an action from the card’s box', () => {
    const view = viewOf()
    const apply = vi.fn((view, from, to) => view.dispatch({ changes: { from: to, insert: ' x' } }))
    view.dispatch(setDiagnostics(view.state, [alt('An alt with no else', apply)]))
    activateHover(view, at('alt'), 1)
    host(view).querySelector('button.cm-diagnosticAction').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(view, 0, 3)
    expect(view.state.doc.toString().startsWith('alt x paid')).toBe(true)
  })

  it('keeps the card and its message together when pinned', () => {
    const view = viewOf()
    view.dispatch(setDiagnostics(view.state, [alt()]))
    activateHover(view, at('alt'), 1)
    const shown = card(view)
    expect(pinDocAt(view, at('alt'))).toBe(true)
    expect(card(view)).toBe(shown)
    expect(host(view).querySelectorAll('.cm-tooltip-lint')).toHaveLength(1)
    expect(host(view).classList.contains('cm-doc-pinned')).toBe(true)
  })

  it('opens F8’s message on a carded word, which moves to the diagnostic, not the pointer', () => {
    const view = viewOf([keymap.of(plantumlLintKeymap)])
    view.dispatch(setDiagnostics(view.state, [alt()]))
    view.dispatch({ selection: { anchor: doc.length } })
    key(view.contentDOM, { key: 'F8', keyCode: 119 })
    expect(view.state.selection.main).toMatchObject({ from: 0, to: 3 })
    expect(host(view)?.querySelector('.cm-tooltip-lint')?.textContent).toContain('An alt with no else')
  })

  it('closes on Escape from an action button in the pinned box (Review Focus 2)', () => {
    const view = viewOf()
    view.dispatch(setDiagnostics(view.state, [alt()]))
    activateHover(view, at('alt'), 1)
    pinDocAt(view, at('alt'))
    const button = host(view).querySelector('button.cm-diagnosticAction')
    button.focus()
    expect(document.activeElement).toBe(button)
    expect(key(button, { key: 'Escape', keyCode: 27 }).defaultPrevented).toBe(true)
    expect(hasHoverTooltips(view.state)).toBe(false)
    expect(document.activeElement).toBe(view.contentDOM)
  })

  it('gives focus back to the source when an action’s edit closes the pinned box', async () => {
    const view = viewOf()
    const apply = (view, from, to) => view.dispatch({ changes: { from: to, insert: ' x' } })
    view.dispatch(setDiagnostics(view.state, [alt('An alt with no else', apply)]))
    pinDocAt(view, at('alt'))
    const button = host(view).querySelector('button.cm-diagnosticAction')
    button.focus()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(hasHoverTooltips(view.state)).toBe(false)
    await vi.waitFor(() => expect(document.activeElement).toBe(view.contentDOM))
  })

  it('leaves focus where it went when the box closes with focus outside it', async () => {
    const view = viewOf()
    const other = document.body.appendChild(document.createElement('input'))
    pinDocAt(view, at('alt'))
    other.focus()
    view.dispatch({ changes: { from: doc.length, insert: '\n' } })
    expect(hasHoverTooltips(view.state)).toBe(false)
    await Promise.resolve()
    expect(document.activeElement).toBe(other)
  })

  it('closes a pinned card on Escape before a snippet’s fields (K1)', () => {
    const view = viewOf()
    view.focus()
    snippet('note ${1:left} : ${2:text}')(view, null, doc.length, doc.length)
    expect(hasNextSnippetField(view.state)).toBe(true)
    expect(pinDocAt(view, at('alt'), { focus: false })).toBe(true)

    expect(key(view.contentDOM, { key: 'Escape', keyCode: 27 }).defaultPrevented).toBe(true)
    expect(view.state.field(docPinned)).toBeNull()
    expect(hasNextSnippetField(view.state)).toBe(true)

    key(view.contentDOM, { key: 'Escape', keyCode: 27 })
    expect(hasNextSnippetField(view.state)).toBe(false)
  })

  it('leaves no listener behind once the view is gone', () => {
    const view = viewOf()
    pinDocAt(view, at('alt'))
    view.destroy()
    views = views.filter((other) => other !== view)
    const dispatch = vi.spyOn(view, 'dispatch')
    expect(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))).not.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
