// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The ebnf profile (T8): what its mode names inside `@startebnf` blocks, read the way
// CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import ebnfProfile from '../../src/editor/profiles/ebnf.js'

const ebnf = ebnfProfile(core)
const language = plantumlLanguage({ ebnf: ebnf.mode })

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
const read = (...lines) => tokens('ebnf', ...lines)

/** [text, token class] for every highlighted span of a whole document. */
function all(...lines) {
  const doc = Text.of(lines)
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('the ebnf profile', () => {
  it('is the ebnf type with no completions or lints', () => {
    expect(ebnf).toMatchObject({ type: 'ebnf', completions: [], lints: [], values: [] })
  })

  it('reads a rule: its name, the definition, separators, brackets, strings and the terminator', () => {
    expect(read('expr = term , { ( "+" | "-" ) , term } ;')).toEqual([
      ['expr', 'typeName'], ['=', 'definitionOperator'], [',', 'separator'], ['{', 'brace'], ['(', 'paren'],
      ['"+"', 'string'], ['|', 'logicOperator'], ['"-"', 'string'], [')', 'paren'], [',', 'separator'],
      ['}', 'brace'], [';', 'separator'],
    ])
  })

  it('takes a hyphenated name whole and a single-quoted string', () => {
    expect(read("my-rule = 'a' ;")).toEqual([
      ['my-rule', 'typeName'], ['=', 'definitionOperator'], ["'a'", 'string'], [';', 'separator'],
    ])
  })

  it('reads a dash with spaces around it as the exception', () => {
    expect(read('consonant = letter - vowel ;')).toEqual([
      ['consonant', 'typeName'], ['=', 'definitionOperator'], ['-', 'arithmeticOperator'], [';', 'separator'],
    ])
  })

  it('reads a count and its star, and the one-or-more close', () => {
    expect(read('three = 3 * "ab" ;')).toEqual([
      ['three', 'typeName'], ['=', 'definitionOperator'], ['3', 'number'], ['*', 'Quantifier'], ['"ab"', 'string'], [';', 'separator'],
    ])
    expect(read('some = { x }- ;')).toEqual([
      ['some', 'typeName'], ['=', 'definitionOperator'], ['{', 'brace'], ['}', 'brace'], ['-', 'Quantifier'], [';', 'separator'],
    ])
  })

  it('reads a special sequence as a string', () => {
    expect(read('sp = ? any char ? ;')).toEqual([
      ['sp', 'typeName'], ['=', 'definitionOperator'], ['? any char ?', 'string'], [';', 'separator'],
    ])
  })

  it('reads comments across lines, the documentation form too', () => {
    expect(read('(* a', 'comment *)')).toEqual([['(* a', 'comment'], ['comment *)', 'comment']])
    expect(read('(** doc **)')).toEqual([['(** doc **)', 'comment']])
  })

  it('names a rule only at a line start, and a keyword-like name is no keyword', () => {
    expect(read('file = "a" ;')[0]).toEqual(['file', 'typeName'])
    expect(read('file = "a" ;').some(([, token]) => token === 'keyword')).toBe(false)
    expect(read('a =', '  b | c', '  ;')).toEqual([
      ['a', 'typeName'], ['=', 'definitionOperator'], ['|', 'logicOperator'], [';', 'separator'],
    ])
  })

  it('does not let an open comment or rule run into the next block', () => {
    for (const open of ['(* open', 'a = b']) {
      const out = all('@startebnf', open, '@endebnf', '@startuml', 'A -> B', '@enduml')
      expect(out).toContainEqual(['@endebnf', 'keyword'])
      expect(out).toContainEqual(['->', 'LinkOperator'])
    }
  })

  it('ends a rule at its semicolon, mid-line too', () => {
    expect(read('x = a ; (* n *)', 'y = b ;')).toContainEqual(['(* n *)', 'comment'])
    expect(read('x = a ; (* n *)', 'y = b ;')).toContainEqual(['y', 'typeName'])
    const names = read('x = a ; y = b ;', 'z = c ;').filter(([, token]) => token === 'typeName')
    expect(names).toEqual([['x', 'typeName'], ['z', 'typeName']])
    expect(read('x = ";" , a', '  , b ;', 'y = c ;').filter(([, token]) => token === 'typeName')).toEqual([['x', 'typeName'], ['y', 'typeName']])
    expect(read('x = ? ; ? ,', 'w ;', 'y = c ;').filter(([, token]) => token === 'typeName').length).toBe(2)
  })

  it('reads a string with no escapes, and leaks an unclosed one nowhere', () => {
    expect(read('a = "a\\" , b ;')).toEqual([
      ['a', 'typeName'], ['=', 'definitionOperator'], ['"a\\"', 'string'], [',', 'separator'], [';', 'separator'],
    ])
    expect(read('a = "abc ;', 'b = c ;').filter(([, token]) => token === 'typeName')).toEqual([['a', 'typeName'], ['b', 'typeName']])
  })
})
