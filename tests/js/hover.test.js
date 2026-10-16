// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The element under a position (I6): the syntax tree's token there, with its
// text, names the docs key; every other token names none.
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { elementAt } from '../../src/editor/docs/element.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import { core } from './helpers/core.js'
import styleProfile from '../../src/editor/profiles/style.js'
import ganttProfile from '../../src/editor/profiles/gantt.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'

const extensions = [profileExtension([styleProfile(core), ganttProfile(core), yamlProfile(core)])]

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
  ])('%s', (_name, lines, word, options) => {
    expect(on(lines, word, options)).toBeNull()
  })
})
