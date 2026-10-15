// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The style profile: what its mode names between `<style>` and `</style>`,
// read the way CodeMirror reads it, inside the PlantUML language.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import styleProfile from '../../src/editor/profiles/style.js'
import { translate } from '@nextcloud/l10n'

const WORD_WRAP = `<style>
node {
    Padding 12
    Margin 3
    HorizontalAlignment center
    LineColor blue
    LineThickness 3.0
    BackgroundColor gold
    RoundCorner 40
    MaximumWidth 100
}

rootNode {
    LineStyle 8.0;3.0
    LineColor red
    BackgroundColor white
    LineThickness 1.0
    RoundCorner 0
    Shadowing 0.0
}

leafNode {
    LineColor gold
    RoundCorner 0
    Padding 3
}

arrow {
    LineStyle 4
    LineThickness 0.5
    LineColor green
}
</style>`

const profile = styleProfile({ scan, t: translate })

/** [text, token class] for every highlighted span of `lines`. */
function tokens(...lines) {
  const doc = Text.of(lines)
  const out = []
  plantumlLanguage({ style: profile.mode }).parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('the style profile', () => {
  it('is made from the core it is given, translator included: the style type with its mode, completion, lint and values', () => {
    expect(profile).toMatchObject({ type: 'style', completions: [expect.any(Function)], lints: [expect.any(Function)], values: [{ match: expect.any(Function) }] })
    expect(profile.lints[0]).not.toBe(styleProfile({ scan, t: translate }).lints[0])
    expect(typeof profile.mode.token).toBe('function')
  })

  it('names selectors as tags, classes and depths as classes, braces, properties, colours, numbers and comments', () => {
    expect(tokens(
      '@startuml',
      '<style>',
      'root {',
      '  FontSize 22',
      '}',
      '.server {',
      '  BackGroundColor #FFF3B0;',
      '  LineColor red',
      '}',
      'node:depth(1) {',
      "  ' a comment",
      '}',
      '</style>',
      '@enduml',
    )).toEqual([
      ['@startuml', 'keyword'],
      ['<style>', 'tagName'],
      ['root', 'typeName'],
      ['{', 'bracket'],
      ['FontSize', 'propertyName'],
      ['22', 'StyleNumber'],
      ['}', 'bracket'],
      ['.server', 'className'],
      ['{', 'bracket'],
      ['BackGroundColor', 'propertyName'],
      ['#FFF3B0', 'ColorLiteral'],
      [';', 'punctuation'],
      ['LineColor', 'propertyName'],
      ['red', 'ColorLiteral'],
      ['}', 'bracket'],
      ['node', 'typeName'],
      [':depth(1)', 'className'],
      ['{', 'bracket'],
      ["' a comment", 'comment'],
      ['}', 'bracket'],
      ['</style>', 'tagName'],
      ['@enduml', 'keyword'],
    ])
  })

  it('tells a nested selector from a property by the brace after it, and reads declarations split by ;', () => {
    expect(tokens('<style>', 'mindmapDiagram {', '  node { FontSize 1; LineColor #ABC }', '  arrow {', '  }', '}', '</style>')).toEqual([
      ['<style>', 'tagName'],
      ['mindmapDiagram', 'typeName'],
      ['{', 'bracket'],
      ['node', 'typeName'],
      ['{', 'bracket'],
      ['FontSize', 'propertyName'],
      ['1', 'StyleNumber'],
      [';', 'punctuation'],
      ['LineColor', 'propertyName'],
      ['#ABC', 'ColorLiteral'],
      ['}', 'bracket'],
      ['arrow', 'typeName'],
      ['{', 'bracket'],
      ['}', 'bracket'],
      ['}', 'bracket'],
      ['</style>', 'tagName'],
    ])
  })

  // CodeMirror makes one node of two tokens of one name side by side.
  it('reads the middle of a one-line block with the style grammar', () => {
    expect(tokens('<style>note { BackgroundColor red }</style>', 'actor A')).toEqual([
      ['<style>', 'tagName'],
      ['note', 'typeName'],
      ['{', 'bracket'],
      ['BackgroundColor', 'propertyName'],
      ['red', 'ColorLiteral'],
      ['}', 'bracket'],
      ['</style>', 'tagName'],
      ['actor', 'keyword'],
    ])
  })

  it('takes a word for a colour in a property whose name ends in Color, and for a word elsewhere', () => {
    const values = tokens('<style>', 'node {', '  FontColor Navy; BackGroundColor #AliceBlue', '  FontStyle bold; LineStyle dashed', '}', '</style>')
      .filter(([, name]) => !['tagName', 'typeName', 'bracket', 'propertyName', 'punctuation'].includes(name))
    expect(values).toEqual([['Navy', 'ColorLiteral'], ['#AliceBlue', 'ColorLiteral'], ['bold', 'atom'], ['dashed', 'atom']])
  })

  it('ends a value at the end of its line, so the next line starts a declaration', () => {
    expect(tokens('<style>', 'node {', '  Padding 4', '  Margin 2', '}', '</style>').filter(([, name]) => name === 'propertyName')).toEqual([
      ['Padding', 'propertyName'],
      ['Margin', 'propertyName'],
    ])
  })

  it('reads a dash pattern, 8.0;3.0 or 8-3, as one value of two numbers, not a separator', () => {
    const named = (...lines) => tokens('<style>', 'node {', ...lines, '}', '</style>').filter(([, name]) => !['tagName', 'typeName', 'bracket'].includes(name))
    expect(named('  LineStyle 8.0;3.0', '  LineColor red')).toEqual([
      ['LineStyle', 'propertyName'], ['8.0', 'StyleNumber'], [';', 'operator'], ['3.0', 'StyleNumber'],
      ['LineColor', 'propertyName'], ['red', 'ColorLiteral'],
    ])
    expect(named('  LineStyle 8-3')).toEqual([['LineStyle', 'propertyName'], ['8', 'StyleNumber'], ['-', 'operator'], ['3', 'StyleNumber']])
    expect(named('  LineStyle 4; LineColor red').map(([, name]) => name)).toEqual(['propertyName', 'StyleNumber', 'punctuation', 'propertyName', 'ColorLiteral'])
  })

  it('starts each line with no dash pattern open', () => {
    const named = tokens('<style>', 'node {', '  LineStyle 8', '-3', '}', '</style>').filter(([, name]) => !['tagName', 'typeName', 'bracket'].includes(name))
    expect(named).not.toContainEqual(['-', 'operator'])
  })

  it('takes no #ABCDE for a colour: five hex digits are a broken hex, not a name', () => {
    expect(tokens('<style>', 'node {', '  LineColor #ABCDE; BackgroundColor #ABCDEF', '}', '</style>')).toEqual(expect.arrayContaining([
      ['#ABCDE', 'atom'],
      ['#ABCDEF', 'ColorLiteral'],
    ]))
  })

  it("reads /' … '/ as a comment, on one line or several, and the declarations after it", () => {
    expect(tokens('<style>', "/' node { FontSise 1 } '/", "node { /' a", "  LineColor red '/ FontSize 2 }", '</style>')).toEqual([
      ['<style>', 'tagName'],
      ["/' node { FontSise 1 } '/", 'comment'],
      ['node', 'typeName'],
      ['{', 'bracket'],
      ["/' a", 'comment'],
      ["  LineColor red '/", 'comment'],
      ['FontSize', 'propertyName'],
      ['2', 'StyleNumber'],
      ['}', 'bracket'],
      ['</style>', 'tagName'],
    ])
  })

  it('reads the Word Wrap block of plantuml.com/mindmap-diagram', () => {
    const names = tokens(...WORD_WRAP.split('\n')).map(([, name]) => name)
    expect(names).not.toContain(null)
    expect(tokens(...WORD_WRAP.split('\n'))).toContainEqual(['8.0', 'StyleNumber'])
  })
})
