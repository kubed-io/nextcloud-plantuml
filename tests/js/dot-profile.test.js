// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The dot profile: what its mode names inside `@startdot` blocks, read the way
// CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import dotProfile from '../../src/editor/profiles/dot.js'

const dot = dotProfile(core)
const language = plantumlLanguage({ dot: dot.mode })

/** [text, token class] for every highlighted span of `lines`, in a block of `type`. */
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
const dotTokens = (...lines) => tokens('dot', ...lines)

describe('the dot profile', () => {
  it('is the dot type with no completions or lints', () => {
    expect(dot).toMatchObject({ type: 'dot', completions: [], lints: [], values: [] })
  })

  it('reads a graph header: keyword, id a classifier, brace', () => {
    expect(dotTokens('digraph foo {')).toEqual([['digraph', 'keyword'], ['foo', 'typeName'], ['{', 'brace']])
    expect(dotTokens('STRICT GRAPH g {')).toEqual([['STRICT', 'keyword'], ['GRAPH', 'keyword'], ['g', 'typeName'], ['{', 'brace']])
    expect(dotTokens('subgraph cluster_0 {')).toEqual([['subgraph', 'keyword'], ['cluster_0', 'typeName'], ['{', 'brace']])
    expect(dotTokens('}')).toEqual([['}', 'brace']])
  })

  it('reads an edge with an attribute list', () => {
    expect(dotTokens('  a -> b [label="x", weight=2.5];')).toEqual([
      ['->', 'LinkOperator'], ['[', 'squareBracket'], ['label', 'attributeName'], ['=', 'definitionOperator'], ['"x"', 'string'],
      [',', 'separator'], ['weight', 'attributeName'], ['=', 'definitionOperator'], ['2.5', 'number'], [']', 'squareBracket'], [';', 'separator'],
    ])
    expect(dotTokens('a -- b')).toEqual([['--', 'LinkOperator']])
  })

  it('reads a statement key as a property', () => {
    expect(dotTokens('  rankdir=LR')).toEqual([['rankdir', 'propertyName'], ['=', 'definitionOperator']])
    expect(dotTokens('label = "x";')).toEqual([['label', 'propertyName'], ['=', 'definitionOperator'], ['"x"', 'string'], [';', 'separator']])
  })

  it('reads a colour value after a key ending color', () => {
    expect(dotTokens('node [shape=box, color="#ff0000"]')).toEqual([
      ['node', 'keyword'], ['[', 'squareBracket'], ['shape', 'attributeName'], ['=', 'definitionOperator'], [',', 'separator'],
      ['color', 'attributeName'], ['=', 'definitionOperator'], ['"', 'string'], ['#ff0000', 'ColorLiteral'], ['"', 'string'], [']', 'squareBracket'],
    ])
    expect(dotTokens('color=red')).toEqual([['color', 'propertyName'], ['=', 'definitionOperator'], ['red', 'ColorLiteral']])
    expect(dotTokens('c [fillcolor=yellow, fontcolor="navy"]')).toContainEqual(['yellow', 'ColorLiteral'])
    expect(dotTokens('c [fillcolor=yellow, fontcolor="navy"]')).toContainEqual(['navy', 'ColorLiteral'])
    expect(dotTokens('c [fillcolor=#abc]')).toContainEqual(['#abc', 'ColorLiteral'])
    expect(dotTokens('c [style=filled]')).not.toContainEqual(['filled', 'ColorLiteral'])
  })

  it('reads the escapes of a string', () => {
    expect(dotTokens('label="a\\nb\\l"')).toEqual([
      ['label', 'propertyName'], ['=', 'definitionOperator'], ['"a', 'string'], ['\\n', 'escape'], ['b', 'string'], ['\\l', 'escape'], ['"', 'string'],
    ])
    // Neighbouring escapes are one span.
    expect(dotTokens('label="say \\"hi\\"\\r"')).toContainEqual(['\\"\\r', 'escape'])
  })

  it('ends an unfinished string with its line', () => {
    expect(dotTokens('label="open', 'a -> b')).toContainEqual(['->', 'LinkOperator'])
  })

  it('reads an HTML label with its tags', () => {
    expect(dotTokens('label=<<b>bold</b>>')).toEqual([
      ['label', 'propertyName'], ['=', 'definitionOperator'], ['<', 'angleBracket'], ['<b>', 'tagName'], ['</b>', 'tagName'], ['>', 'angleBracket'],
    ])
  })

  it('reads an HTML label across lines', () => {
    expect(dotTokens('a [label=<', '<table><tr><td>x</td></tr></table>', '>]', 'a -> b')).toContainEqual(['->', 'LinkOperator'])
  })

  it('reads a port as a separator', () => {
    expect(dotTokens('a:n -> b:s')).toEqual([[':', 'separator'], ['->', 'LinkOperator'], [':', 'separator']])
  })

  it('reads the three comments', () => {
    expect(dotTokens('// c')).toEqual([['// c', 'comment']])
    expect(dotTokens('a -> b // c')).toEqual([['->', 'LinkOperator'], ['// c', 'comment']])
    expect(dotTokens('# c')).toEqual([['# c', 'comment']])
    expect(dotTokens('/* a', 'b */')).toEqual([['/* a', 'comment'], ['b */', 'comment']])
    expect(dotTokens('/* a */ x -> y')).toEqual([['/* a */', 'comment'], ['->', 'LinkOperator']])
  })

  it('reads a # line as a comment, never a swatch (Review Focus 3)', () => {
    expect(dotTokens('#ff0000')).toEqual([['#ff0000', 'comment']])
    expect(dotTokens('#fff red')).toEqual([['#fff red', 'comment']])
  })

  it('leaves the # of an indented line to the value rules', () => {
    expect(dotTokens('  # x')).not.toContainEqual(['# x', 'comment'])
  })

  it('ends a block comment at the next @end (Review Focus 4)', () => {
    const doc = '@startdot\n/* open\n@enddot\n@startuml\nA -> B\n@enduml'
    const out = []
    language.parser.parse(doc).iterate({
      enter(node) {
        if (!node.type.isTop) out.push([doc.slice(node.from, node.to), node.type.name])
      },
    })
    expect(out).toContainEqual(['@enddot', 'keyword'])
    expect(out).toContainEqual(['->', 'LinkOperator'])
  })

  it('ends an attribute list at its end', () => {
    expect(dotTokens('a [x=1,', ' y=2]', 'b -> c')).toContainEqual(['->', 'LinkOperator'])
  })

  it('has no common lines (G4)', () => {
    expect(dotTokens('title X')).toEqual([])
  })
})
