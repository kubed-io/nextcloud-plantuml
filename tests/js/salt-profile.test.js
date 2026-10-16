// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The salt profile: what its mode names inside `@startsalt` blocks, read the way
// CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import saltProfile from '../../src/editor/profiles/salt.js'

const salt = saltProfile(core)
const language = plantumlLanguage({ salt: salt.mode })

/** [text, token class] for every highlighted span of `doc`. */
function parse(language, doc) {
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

/** The tokens of `lines` in a salt block, without its `@start` and `@end` lines. */
const top = (...lines) => parse(language, Text.of(['@startsalt', ...lines, '@endsalt'])).slice(1, -1)
/** The same, in a block opened with `{` and closed with `}`, without those two braces. */
const salted = (...lines) => top('{', ...lines, '}').slice(1, -1)

describe('the salt profile', () => {
  it('is the salt type with no completions, lints or values', () => {
    expect(salt).toMatchObject({ type: 'salt', completions: [], lints: [], values: [] })
  })

  it('reads an opener\'s kind as a modifier', () => {
    expect(salted('{+', '}')).toEqual([['{', 'brace'], ['+', 'modifier'], ['}', 'brace']])
    expect(salted('{ T+', '}')).toEqual([['{', 'brace'], ['T+', 'modifier'], ['}', 'brace']])
    expect(salted('{T', '}')).toContainEqual(['T', 'modifier'])
    expect(salted('{ Text', '}').map(([, token]) => token)).not.toContain('modifier')
    for (const kind of ['SI', 'S-', 'S', '*', '/', '#', '!', '-']) {
      expect(salted(`{${kind}`, '}'), kind).toEqual([['{', 'brace'], [kind, 'modifier'], ['}', 'brace']])
    }
    expect(salted('{S+', '}')).toEqual([['{', 'brace'], ['S', 'modifier'], ['}', 'brace']])
    expect(salted('{^"Group box"', '}')).toEqual([['{', 'brace'], ['^', 'modifier'], ['"Group box"', 'string'], ['}', 'brace']])
  })

  it('reads text fields, checkboxes, radios, buttons and droplists', () => {
    expect(salted('Login | "MyName   "')).toEqual([['|', 'separator'], ['"MyName   "', 'string']])
    expect(salted('[X] Remember | [ ] Not | [] No')).toEqual([
      ['[', 'squareBracket'], ['X', 'atom'], [']', 'squareBracket'], ['|', 'separator'],
      ['[ ]', 'squareBracket'], ['|', 'separator'], ['[]', 'squareBracket'],
    ])
    expect(salted('[x] lower').map(([, token]) => token)).not.toContain('atom')
    expect(salted('(X) on | ( ) off')).toEqual([
      ['(', 'paren'], ['X', 'atom'], [')', 'paren'], ['|', 'separator'], ['( )', 'paren'],
    ])
    expect(salted('[Cancel] | [**OK**]')).toEqual([
      ['[', 'squareBracket'], [']', 'squareBracket'], ['|', 'separator'],
      ['[', 'squareBracket'], ['**OK**', 'strong'], [']', 'squareBracket'],
    ])
    expect(salted('[[https://x.io]]').map(([, token]) => token)).not.toContain('squareBracket')
    expect(salted('^Droplist^')).toEqual([['^', 'squareBracket'], ['^', 'squareBracket']])
  })

  it('reads a separator cell as a heading, never a link (Review Focus 3)', () => {
    expect(salted('..Dotted.. | == | ~~wavy~~ | --')).toEqual([
      ['..Dotted..', 'heading'], ['|', 'separator'], ['==', 'heading'], ['|', 'separator'],
      ['~~wavy~~', 'heading'], ['|', 'separator'], ['--', 'heading'],
    ])
    expect(salted('a --> b').map(([, token]) => token)).not.toContain('LinkOperator')
  })

  it('reads spacers, merges, a tree\'s depth, a menu\'s separator and border cells', () => {
    expect(salted('. | *')).toEqual([['.', 'punctuation'], ['|', 'separator'], ['*', 'punctuation']])
    expect(top('{T', '++ America | "x"', '}')).toEqual([
      ['{', 'brace'], ['T', 'modifier'], ['++', 'list'], ['|', 'separator'], ['"x"', 'string'], ['}', 'brace'],
    ])
    expect(salted('{*', 'File | - | Open', '}')).toContainEqual(['-', 'heading'])
    expect(salted('N= [North]')).toEqual([
      ['N', 'attributeName'], ['=', 'definitionOperator'], ['[', 'squareBracket'], [']', 'squareBracket'],
    ])
  })

  it('keeps `*`, `-` and `+` to the kinds that give them a meaning', () => {
    expect(salted('{T', 'a | *', '}').map(([, token]) => token)).not.toContain('punctuation')
    expect(salted('a | -').map(([, token]) => token)).not.toContain('heading')
    expect(salted('+ a').map(([, token]) => token)).not.toContain('list')
    // Only a tree row's first cell has a depth.
    expect(top('{T', '+ a | + b', '}').filter(([, token]) => token === 'list')).toEqual([['+', 'list']])
  })

  it('reads an image, its pixel rows and its reuse', () => {
    expect(salted('<<smile', '..XX..', '>>', '<<smile>>')).toEqual([
      ['<<', 'angleBracket'], ['smile', 'typeName'], ['..XX..', 'SpriteData'], ['>>', 'angleBracket'],
      ['<<', 'angleBracket'], ['smile', 'typeName'], ['>>', 'angleBracket'],
    ])
    // An image without a name.
    expect(salted('<<', 'X.', '>>')).toEqual([['<<', 'angleBracket'], ['X.', 'SpriteData'], ['>>', 'angleBracket']])
  })

  it('reads escapes and Creole in a cell', () => {
    expect(salted('a \\{ escaped \\| pipe \\}')).toEqual([['\\{', 'escape'], ['\\|', 'escape'], ['\\}', 'escape']])
    expect(salted('<&person> me')).toEqual([['<&person>', 'tagName']])
    const note = parse(plantumlLanguage({}), Text.of(['@startuml', 'note : <color:red>x</color>', '@enduml']))
    // The note's `note` and `:` come first; the note's `:` makes no node.
    const creole = note.slice(note.findIndex(([text]) => text === '<color'), -1)
    expect(creole[0]).toEqual(['<color', 'tagName'])
    expect(salted('<color:red>x</color>')).toEqual(creole)
  })

  it('never lets Creole read past a cell\'s end', () => {
    expect(salted('**a | b**')).toEqual([['|', 'separator']])
    expect(salted('a ~| b')).toContainEqual(['|', 'separator'])
    // A tag left open ends with its cell, and the block's `}` still closes it.
    expect(top('{', '<font size=2 }', 'skinparam x y')).toContainEqual(['skinparam', 'keyword'])
    expect(top('{', '<font size=2 }', 'skinparam x y')).toContainEqual(['}', 'brace'])
  })

  it('opens and closes blocks mid-line', () => {
    const found = top('{# a | b | *', 'c | d | e }', 'skinparam x y')
    expect(found).toEqual([
      ['{', 'brace'], ['#', 'modifier'], ['|', 'separator'], ['|', 'separator'], ['*', 'punctuation'],
      ['|', 'separator'], ['|', 'separator'], ['}', 'brace'], ['skinparam', 'keyword'],
    ])
    // A nested block closed mid-line: the row goes on in the outer block, which then closes.
    expect(top('{', '{+ a | b } | *', '}', 'title x')).toEqual([
      ['{', 'brace'], ['{', 'brace'], ['+', 'modifier'], ['|', 'separator'], ['}', 'brace'],
      ['|', 'separator'], ['*', 'punctuation'], ['}', 'brace'], ['title', 'keyword'],
    ])
    // An opener after text in a cell.
    expect(salted('a {S b }')).toEqual([['{', 'brace'], ['S', 'modifier'], ['}', 'brace']])
  })

  it('reads the top lines: common commands keywords, a `salt` line plain', () => {
    expect(top('title Login')).toContainEqual(['title', 'keyword'])
    expect(top('salt')).toEqual([])
    expect(top('skinparam x y')).toContainEqual(['skinparam', 'keyword'])
    expect(top('sprite $s [4x4/16] {', 'FFFF', '}', '{', '}')).toContainEqual(['FFFF', 'SpriteData'])
  })

  it('ends what is left open at the block\'s end (P5)', () => {
    const next = ['@startuml', 'A -> B', '@enduml']
    for (const open of [['{', 'a'], ['{', '<<x', 'XX'], ['{', '{+ a | b', 'c']]) {
      const found = parse(language, Text.of(['@startsalt', ...open, '@endsalt', ...next]))
      expect(found, open.join(' / ')).toContainEqual(['->', 'LinkOperator'])
    }
  })
})
