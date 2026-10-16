// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The element under a position (I6): the syntax tree's token there, with its
// text, names the docs key; every other token names none.
import { describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { elementAt } from '../../src/editor/docs/element.js'
import { buildDocs } from '../../src/editor/docs/index.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import { core } from './helpers/core.js'
import styleProfile from '../../src/editor/profiles/style.js'
import ganttProfile, { project as projectProfile } from '../../src/editor/profiles/gantt.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'
import dotProfile from '../../src/editor/profiles/dot.js'
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

const extensions = [profileExtension([styleProfile(core), ganttProfile(core), projectProfile(core), yamlProfile(core), dotProfile(core)])]

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

  it('reads a keyword, a two-word one as its last word', () => {
    expect(on(['alt paid', 'end'], 'alt')).toEqual({ key: 'keyword:alt', type: 'uml', from: 0, to: 3 })
    expect(key(['note over A', 'text', 'end note'], 'end note')).toBe('keyword:note')
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
    expect(on(['!include <C4/C4_Container>'], 'C4')).toEqual({ key: 'library:C4', type: 'uml', from: 10, to: 12 })
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
