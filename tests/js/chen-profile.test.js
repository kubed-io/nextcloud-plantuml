// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The chen profile: what its mode names inside `@startchen` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import chenProfile from '../../src/editor/profiles/chen.js'

const chen = chenProfile(core)
const language = plantumlLanguage({ chen: chen.mode })

/** [text, token class] for every highlighted span of the lines in a chen block. */
function tokens(...lines) {
  const doc = Text.of(['@startchen', ...lines, '@endchen'])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the chen profile', () => {
  it('is the chen type with no completions or lints', () => {
    expect(chen).toMatchObject({ type: 'chen', completions: [], lints: [], values: [] })
  })

  it('reads an entity header: display, alias, stereotype, colour, brace', () => {
    expect(tokens('entity "Customer" as CUSTOMER <<weak>> #lightblue {')).toEqual([
      ['entity', 'keyword'], ['"Customer"', 'string'], ['as', 'keyword'], ['CUSTOMER', 'typeName'],
      ['<<', 'angleBracket'], ['weak', 'annotation'], ['>>', 'angleBracket'], ['#lightblue', 'ColorLiteral'], ['{', 'brace'],
    ])
  })

  it('reads a relationship header and the attributes in a body', () => {
    expect(tokens('relationship RENTED_TO {', '  Number : INTEGER <<key>>', '  Name {', '  }', '}', 'A -- B')).toEqual([
      ['relationship', 'keyword'], ['RENTED_TO', 'typeName'], ['{', 'brace'],
      ['Number', 'propertyName'], [':', 'separator'], ['INTEGER', 'typeName'],
      ['<<', 'angleBracket'], ['key', 'annotation'], ['>>', 'angleBracket'],
      ['Name', 'propertyName'], ['{', 'brace'], ['}', 'brace'], ['}', 'brace'],
      ['--', 'LinkOperator'],
    ])
  })

  it('takes a name with spaces and a colon whole, and a display alias', () => {
    expect(tokens('entity E {', '  Date of birth : DATE', '  "No." as Number <<key>>', '}')).toEqual([
      ['entity', 'keyword'], ['E', 'typeName'], ['{', 'brace'],
      ['Date of birth', 'propertyName'], [':', 'separator'], ['DATE', 'typeName'],
      ['"No."', 'string'], ['as', 'keyword'], ['Number', 'propertyName'],
      ['<<', 'angleBracket'], ['key', 'annotation'], ['>>', 'angleBracket'], ['}', 'brace'],
    ])
  })

  it('reads a connector: strokes around a cardinality', () => {
    expect(tokens('RENTED_TO -(N,M)- DIRECTOR')).toEqual([
      ['-', 'LinkOperator'], ['(', 'paren'], ['N', 'number'], [',', 'separator'], ['M', 'number'], [')', 'paren'], ['-', 'LinkOperator'],
    ])
    expect(tokens('A =1= B')).toEqual([['=', 'LinkOperator'], ['1', 'number'], ['=', 'LinkOperator']])
    expect(tokens('A -N- B #red')).toEqual([['-', 'LinkOperator'], ['N', 'number'], ['-', 'LinkOperator'], ['#red', 'ColorLiteral']])
    expect(tokens('A -- B')).toEqual([['--', 'LinkOperator']])
  })

  it('reads subclass links and their list', () => {
    expect(tokens('PERSON ->- U { A, B } #red')).toEqual([
      ['->-', 'LinkOperator'], ['U', 'modifier'], ['{', 'brace'], [',', 'separator'], ['}', 'brace'], ['#red', 'ColorLiteral'],
    ])
    expect(tokens('CHILD =>= d { P }')).toEqual([['=>=', 'LinkOperator'], ['d', 'modifier'], ['{', 'brace'], ['}', 'brace']])
    expect(tokens('M -<- C')).toEqual([['-<-', 'LinkOperator']])
    expect(tokens('M =<= C')).toEqual([['=<=', 'LinkOperator']])
  })

  it('reads an attribute named note or state as an attribute, and the lines after the body as chen', () => {
    expect(tokens('entity E {', '  note', '  state', '  class', '}', 'A -- B')).toEqual([
      ['entity', 'keyword'], ['E', 'typeName'], ['{', 'brace'],
      ['note', 'propertyName'], ['state', 'propertyName'], ['class', 'propertyName'], ['}', 'brace'],
      ['--', 'LinkOperator'],
    ])
  })

  it('reads the direction and the common lines', () => {
    expect(tokens('left to right direction')).toEqual([['left to right direction', 'keyword']])
    expect(tokens('top to bottom direction')).toEqual([['top to bottom direction', 'keyword']])
    expect(tokens('title Movies')[0]).toEqual(['title', 'keyword'])
  })
})
