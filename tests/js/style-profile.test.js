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
  it('is made from the core it is given, translator included: the style type with its mode, completion, lint and no values yet', () => {
    expect(profile).toMatchObject({ type: 'style', completions: [expect.any(Function)], lints: [expect.any(Function)], values: [] })
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
      ['root', 'tagName'],
      ['{', 'bracket'],
      ['FontSize', 'propertyName'],
      ['22', 'number'],
      ['}', 'bracket'],
      ['.server', 'className'],
      ['{', 'bracket'],
      ['BackGroundColor', 'propertyName'],
      ['#FFF3B0', 'ColorLiteral'],
      [';', 'punctuation'],
      ['LineColor', 'propertyName'],
      ['red', 'atom'],
      ['}', 'bracket'],
      ['node', 'tagName'],
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
      ['mindmapDiagram', 'tagName'],
      ['{', 'bracket'],
      ['node', 'tagName'],
      ['{', 'bracket'],
      ['FontSize', 'propertyName'],
      ['1', 'number'],
      [';', 'punctuation'],
      ['LineColor', 'propertyName'],
      ['#ABC', 'ColorLiteral'],
      ['}', 'bracket'],
      ['arrow', 'tagName'],
      ['{', 'bracket'],
      ['}', 'bracket'],
      ['}', 'bracket'],
      ['</style>', 'tagName'],
    ])
  })

  // CodeMirror makes one node of two tokens of one name side by side.
  it('reads the middle of a one-line block with the style grammar', () => {
    expect(tokens('<style>note { BackgroundColor red }</style>', 'actor A')).toEqual([
      ['<style>note', 'tagName'],
      ['{', 'bracket'],
      ['BackgroundColor', 'propertyName'],
      ['red', 'atom'],
      ['}', 'bracket'],
      ['</style>', 'tagName'],
      ['actor', 'keyword'],
    ])
  })

  it('ends a value at the end of its line, so the next line starts a declaration', () => {
    expect(tokens('<style>', 'node {', '  Padding 4', '  Margin 2', '}', '</style>').filter(([, name]) => name === 'propertyName')).toEqual([
      ['Padding', 'propertyName'],
      ['Margin', 'propertyName'],
    ])
  })
})
