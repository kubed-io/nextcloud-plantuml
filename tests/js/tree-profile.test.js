// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The mindmap and wbs profiles: what their modes name inside `@startmindmap`
// and `@startwbs` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import mindmapProfile, { wbs as wbsProfile } from '../../src/editor/profiles/tree.js'

const mindmap = mindmapProfile(core)
const wbs = wbsProfile(core)
const language = plantumlLanguage({ mindmap: mindmap.mode, wbs: wbs.mode })

/** [text, token class] for every highlighted span of the lines in a block of `type`. */
function tokens(type, ...lines) {
  const doc = Text.of([`@start${type}`, ...lines, `@end${type}`])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}
const mm = (...lines) => tokens('mindmap', ...lines)
const wb = (...lines) => tokens('wbs', ...lines)

/** [text, token class] for every highlighted span of a whole document. */
function parse(doc) {
  const out = []
  language.parser.parse(doc).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.slice(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('the mindmap profile', () => {
  it('is the mindmap type with no completions or lints', () => {
    expect(mindmap).toMatchObject({ type: 'mindmap', completions: [], lints: [], values: [] })
  })

  it('names the marker runs list markers, never links', () => {
    expect(mm('** Completion')).toEqual([['**', 'list']])
    expect(mm('  *** Directives')).toEqual([['***', 'list']])
    expect(mm('-- Windows 95')).toEqual([['--', 'list']])
    expect(mm('+++ deep')).toEqual([['+++', 'list']])
    expect(mm('# hash node')).toEqual([['#', 'list']])
    expect(mm('0 root')).toEqual([['0', 'list']])
    expect(mm('** a --> b')).toEqual([['**', 'list']])
  })

  it('reads a colour in brackets and the boxless underscore after the marker', () => {
    expect(mm('*[#Orange] root')).toEqual([['*', 'list'], ['[', 'squareBracket'], ['#Orange', 'ColorLiteral'], [']', 'squareBracket']])
    expect(mm('--[#lightgreen] Windows 98').slice(0, 2)).toEqual([['--', 'list'], ['[', 'squareBracket']])
    expect(mm('**_ boxless')).toEqual([['**', 'list'], ['_', 'modifier']])
    // A bracket after a space is the label's.
    expect(mm('** [#red] a')).toEqual([['**', 'list']])
  })

  it('reads the label as Creole with a trailing stereotype', () => {
    expect(mm('** a **b** <<green>>')).toEqual([['**', 'list'], ['**b**', 'strong'], ['<<', 'angleBracket'], ['green', 'annotation'], ['>>', 'angleBracket']])
  })

  it('reads a multi-line box down to the line ending in a semicolon', () => {
    expect(mm('**:multi', 'line **two**;')).toEqual([
      ['**', 'list'], [':', 'bracket'], ['**two**', 'strong'], [';', 'bracket'],
    ])
    expect(mm('**:a -> b;', '** next')).toEqual([['**', 'list'], [':', 'bracket'], [';', 'bracket'], ['**', 'list']])
    expect(mm('**:x', 'y; <<s>>')).toEqual([
      ['**', 'list'], [':', 'bracket'], [';', 'bracket'], ['<<', 'angleBracket'], ['s', 'annotation'], ['>>', 'angleBracket'],
    ])
  })

  it('ends a box left open at the block end, the next diagram read as ever', () => {
    const out = parse('@startmindmap\n**:open\nstill **open**\n@endmindmap\n@startuml\nA -> B\n@enduml')
    expect(out).toContainEqual(['@endmindmap', 'keyword'])
    expect(out).toContainEqual(['->', 'LinkOperator'])
    expect(out).toContainEqual(['@enduml', 'keyword'])
  })

  it('colours the text after an inline formula, and the next line', () => {
    expect(mm('* a <math>x</math> **b**', '** c')).toEqual([
      ['*', 'list'], ['<math>', 'tagName'], ['</math>', 'tagName'], ['**b**', 'strong'], ['**', 'list'],
    ])
    expect(mm('* <latex>y</latex> //i//').slice(-1)).toEqual([['//i//', 'emphasis']])
  })

  it('reads the side and direction lines as keywords', () => {
    expect(mm('left side')).toEqual([['left side', 'keyword']])
    expect(mm('top to bottom direction')).toEqual([['top to bottom direction', 'keyword']])
    expect(mm('plain words')).toEqual([])
  })

  it('reads the common commands', () => {
    expect(mm('title Features')).toEqual([['title', 'keyword']])
    expect(mm('legend', 'not a node', 'end legend')).toEqual([['legend', 'keyword'], ['end legend', 'keyword']])
  })

  it('names the diagram', () => {
    const doc = '@startmindmap features\n@endmindmap'
    const found = []
    language.parser.parse(doc).iterate({ enter: (n) => { if (!n.type.isTop) found.push([doc.slice(n.from, n.to), n.type.name]) } })
    expect(found).toContainEqual(['features', 'DiagramName'])
  })
})

describe('the wbs profile', () => {
  it('is the wbs type with no completions or lints', () => {
    expect(wbs).toMatchObject({ type: 'wbs', completions: [], lints: [], values: [] })
  })

  it('names the marker run, the modifiers in order and the sides', () => {
    expect(wb('* Root')).toEqual([['*', 'list']])
    expect(wb('--[#pink] Update <<red>>').slice(0, 4)).toEqual([['--', 'list'], ['[', 'squareBracket'], ['#pink', 'ColorLiteral'], [']', 'squareBracket']])
    // CodeMirror joins neighbouring spans of one token.
    expect(wb('*_< left')).toEqual([['*', 'list'], ['_<', 'modifier']])
    expect(wb('**> right')).toEqual([['**', 'list'], ['>', 'modifier']])
  })

  it('reads the colour and the id in either order', () => {
    expect(wb('**[#pink](a) Item')).toEqual([
      ['**', 'list'], ['[', 'squareBracket'], ['#pink', 'ColorLiteral'], [']', 'squareBracket'], ['(', 'paren'], ['a', 'typeName'], [')', 'paren'],
    ])
    expect(wb('**(B) Task B')).toEqual([['**', 'list'], ['(', 'paren'], ['B', 'typeName'], [')', 'paren']])
    expect(wb('**<[#FFBBBB] Left (a) id').slice(0, 5)).toEqual([['**', 'list'], ['<', 'modifier'], ['[', 'squareBracket'], ['#FFBBBB', 'ColorLiteral'], [']', 'squareBracket']])
    expect(wb('**(a)[#red] x').slice(1, 7)).toEqual([['(', 'paren'], ['a', 'typeName'], [')', 'paren'], ['[', 'squareBracket'], ['#red', 'ColorLiteral'], [']', 'squareBracket']])
  })

  it('reads a quoted label with its id', () => {
    expect(wb('** "Task C" as C')).toEqual([['**', 'list'], ['"Task C"', 'string'], ['as', 'keyword'], ['C', 'typeName']])
  })

  it('reads a multi-line box', () => {
    expect(wb('**:multi', 'line;')).toEqual([['**', 'list'], [':', 'bracket'], [';', 'bracket']])
  })

  it('reads a link, its references plain', () => {
    expect(wb('A -> B #red <<s>> : label')).toEqual([
      ['->', 'LinkOperator'], ['#red', 'ColorLiteral'], ['<<', 'angleBracket'], ['s', 'annotation'], ['>>', 'angleBracket'], ['label', 'labelName'],
    ])
    expect(wb('A .> C : link label')).toEqual([['.>', 'LinkOperator'], ['link label', 'labelName']])
  })

  it('has no side lines and no # marker', () => {
    expect(wb('left side')).toEqual([])
    expect(wb('# x').some(([, token]) => token === 'list')).toBe(false)
  })

  it('reads the common commands', () => {
    expect(wb('title Work')).toEqual([['title', 'keyword']])
  })

  it('reads no direction line: wbs registers none, the server refuses it', () => {
    expect(wb('top to bottom direction')).toEqual([])
    expect(wb('left to right direction', '* Root')).toEqual([['*', 'list']])
  })

  it('reads a link between ids of any letters, as an (id) holds', () => {
    expect(wb('Äpfel -> Birne : x')).toEqual([['->', 'LinkOperator'], ['x', 'labelName']])
    expect(wb('a1 .> é')).toEqual([['.>', 'LinkOperator']])
  })

  it('ends a box left open at the block end, the next diagram read as ever', () => {
    const out = parse('@startwbs\n**:open\nstill open\n@endwbs\n@startuml\nA -> B\n@enduml')
    expect(out).toContainEqual(['@endwbs', 'keyword'])
    expect(out).toContainEqual(['->', 'LinkOperator'])
  })

  it('colours the text after an inline formula', () => {
    expect(wb('* a <math>x</math> **b**', '** c')).toEqual([
      ['*', 'list'], ['<math>', 'tagName'], ['</math>', 'tagName'], ['**b**', 'strong'], ['**', 'list'],
    ])
    expect(wb('A -> B : <math>x</math> **b**').slice(-1)).toEqual([['**b**', 'strong_labelName']])
  })
})
