// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The wire profile: what its mode names inside `@startwire` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import wireProfile from '../../src/editor/profiles/wire.js'

const wire = wireProfile(core)
const language = plantumlLanguage({ wire: wire.mode })

/** [text, token class] for every highlighted span of the lines in a wire block. */
function tokens(...lines) {
  const doc = Text.of(['@startwire', ...lines, '@endwire'])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the wire profile', () => {
  it('is the wire type with no completions or lints', () => {
    expect(wire).toMatchObject({ type: 'wire', completions: [], lints: [], values: [] })
  })

  it('reads a component: the marker, its name, its size and colour', () => {
    expect(tokens('* DDR3L [100x50] #salmon')).toEqual([
      ['*', 'list'], ['DDR3L', 'typeName'], ['[', 'squareBracket'], ['100x50', 'number'], [']', 'squareBracket'], ['#salmon', 'ColorLiteral']])
    expect(tokens('\t* inner')).toEqual([['*', 'list'], ['inner', 'typeName']])
    expect(tokens('    * inner')).toEqual([['*', 'list'], ['inner', 'typeName']])
  })

  it('reads a spot at the start of a line', () => {
    expect(tokens('spot third(100%+10, 50%) #cyan')).toEqual([
      ['spot', 'keyword'], ['third', 'typeName'], ['(', 'paren'], ['100%+10', 'number'], [',', 'separator'], ['50%', 'number'], [')', 'paren'], ['#cyan', 'ColorLiteral']])
    // An indented spot is a server error: plain.
    expect(tokens('  spot a')).toEqual([])
  })

  it('reads goto, move and print as functions', () => {
    expect(tokens('goto(100,10)')).toEqual([['goto', 'FunctionName'], ['(', 'paren'], ['100', 'number'], [',', 'separator'], ['10', 'number'], [')', 'paren']])
    expect(tokens('\tmove(10, 30)').slice(0, 2)).toEqual([['move', 'FunctionName'], ['(', 'paren']])
    expect(tokens('\tprint("Foo 10")')).toEqual([['print', 'FunctionName'], ['(', 'paren'], ['"Foo 10"', 'string'], [')', 'paren']])
  })

  it('reads signed offsets as numbers, wire having no arithmetic', () => {
    expect(tokens('move(-40, 10)')).toEqual([['move', 'FunctionName'], ['(', 'paren'], ['-40', 'number'], [',', 'separator'], ['10', 'number'], [')', 'paren']])
    expect(tokens('goto(100,10)')).toEqual([['goto', 'FunctionName'], ['(', 'paren'], ['100', 'number'], [',', 'separator'], ['10', 'number'], [')', 'paren']])
  })

  it('reads a digit name after a style as a name, and a sign in a coordinate as a number', () => {
    expect(tokens('a - 2')).toEqual([['-', 'LinkOperator']])
    expect(tokens('a -2')).toEqual([['-', 'LinkOperator']])
    expect(tokens('a(10, -5) -> b').filter(([, t]) => t === 'number')).toEqual([['10', 'number'], ['-5', 'number']])
  })

  it('reads the common commands that take text before a link', () => {
    for (const word of ['title', 'header', 'footer', 'caption', 'mainframe', 'legend']) {
      expect(tokens(`${word} -> b`).map(([, t]) => t)).not.toContain('LinkOperator')
    }
    expect(tokens('legend -> b')[0]).toEqual(['legend', 'keyword'])
    expect(tokens('scale -> b')).toEqual([['->', 'LinkOperator']])
    expect(tokens('hide -> b')).toEqual([['->', 'LinkOperator']])
  })

  it('reads an indented link plain', () => {
    expect(tokens('  a -> b')).toEqual([])
  })

  it('colours the text after an inline formula in a label', () => {
    expect(tokens('a -> b : <math>x</math> **b**', '* c')).toEqual([
      ['->', 'LinkOperator'], ['<math>', 'tagName'], ['</math>', 'tagName'], [' ', 'labelName'], ['**b**', 'strong_labelName'], ['*', 'list'], ['c', 'typeName'],
    ])
  })

  it('reads a link with its colour before the label', () => {
    expect(tokens('DDR3 <=> SLC_NAND #red : abcd')).toEqual([['<=>', 'LinkOperator'], ['#red', 'ColorLiteral'], ['abcd', 'labelName']])
    expect(tokens('DDR3L(100%,50%-10) => Big_Chip.EEPROM : 32 bit').slice(0, 7)).toEqual([
      ['(', 'paren'], ['100%', 'number'], [',', 'separator'], ['50%-10', 'number'], [')', 'paren'], ['=>', 'LinkOperator'], ['32 bit', 'labelName']])
  })

  it('reads every link style, a lone - or = included', () => {
    for (const style of ['->', '<->', '<-', '-', '=>', '<=>', '<=', '=', '-->', '<-->', '<--', '--', '==>', '<==>', '<==', '==']) {
      expect(tokens(`a ${style} b`)).toEqual([[style, 'LinkOperator']])
    }
    expect(tokens('a = b')).toEqual([['=', 'LinkOperator']])
    expect(tokens('a - b')).toEqual([['-', 'LinkOperator']])
  })

  it('reads a line of - alone as a column break (Review Focus 2)', () => {
    expect(tokens('--')).toEqual([['--', 'heading']])
    expect(tokens('-------')).toEqual([['-------', 'heading']])
    expect(tokens('\t--')).toEqual([['--', 'heading']])
  })

  it('never reads a uml keyword as one in a link (Review Focus 1)', () => {
    expect(tokens('class -> other')).toEqual([['->', 'LinkOperator']])
  })

  it('reads the shared commands', () => {
    expect(tokens('title Wire')).toEqual([['title', 'keyword']])
  })
})
