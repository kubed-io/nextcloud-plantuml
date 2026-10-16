// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The regex profile: what its mode names inside `@startregex` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import regexProfile from '../../src/editor/profiles/regex.js'

const regex = regexProfile(core)
const language = plantumlLanguage({ regex: regex.mode })

/** [text, token class] for every highlighted span of the lines in a regex block. */
function tokens(...lines) {
  const doc = Text.of(['@startregex', ...lines, '@endregex'])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the regex profile', () => {
  it('is the regex type with no completions or lints', () => {
    expect(regex).toMatchObject({ type: 'regex', completions: [], lints: [], values: [] })
  })

  it('reads a named group, a class and its range, anchors and a quantifier', () => {
    expect(tokens('^(?<user>[\\w.+-]+)@x$')).toEqual([
      ['^', 'keyword'], ['(?<', 'paren'], ['user', 'typeName'], ['>', 'paren'],
      ['[', 'squareBracket'], ['\\w', 'escape'], ['-', 'separator'], [']', 'squareBracket'],
      ['+', 'Quantifier'], [')', 'paren'], ['$', 'keyword'],
    ])
  })

  it('reads alternation and a braced quantifier', () => {
    expect(tokens('(?:a|b){2,5}')).toEqual([['(?:', 'paren'], ['|', 'logicOperator'], [')', 'paren'], ['{2,5}', 'Quantifier']])
  })

  it('reads a lazy quantifier whole', () => {
    expect(tokens('a*?')).toEqual([['*?', 'Quantifier']])
  })

  it('reads the escapes: property, hex, unicode and octal', () => {
    // Four escapes; side by side, the tree joins neighbours of one class into a single span.
    expect(tokens('\\p{Lu}a\\x{1F600}b\uFFFFc\\0377')).toEqual([
      ['\\p{Lu}', 'escape'], ['\\x{1F600}', 'escape'], ['\uFFFF', 'escape'], ['\\0377', 'escape'],
    ])
    expect(tokens('\\p{Lu}\\x{1F600}\uFFFF\\0377')).toEqual([['\\p{Lu}\\x{1F600}\uFFFF\\0377', 'escape']])
  })

  it('reads a dot as an escape', () => {
    expect(tokens('.')).toEqual([['.', 'escape']])
  })

  it('reads a leading caret in a class as logical', () => {
    expect(tokens('[^a-z]')).toEqual([['[', 'squareBracket'], ['^', 'logicOperator'], ['-', 'separator'], [']', 'squareBracket']])
  })

  it('reads a POSIX class name as an escape inside the brackets', () => {
    expect(tokens('[[:alpha:]]')).toEqual([['[', 'squareBracket'], ['[:alpha:]', 'escape'], [']', 'squareBracket']])
  })

  it('reads (?#...) as a comment', () => {
    expect(tokens('(?#note)')).toEqual([['(?#note)', 'comment']])
  })

  it('reads \\Q and \\E as escapes and the text between as regex', () => {
    expect(tokens('\\Qx\\E')).toEqual([['\\Q', 'escape'], ['\\E', 'escape']])
  })

  it('reads the other group openers and the escaped metacharacters', () => {
    expect(tokens('(?<=a)x(?!b)y\\.\\b')).toEqual([
      ['(?<=', 'paren'], [')', 'paren'], ['(?!', 'paren'], [')', 'paren'], ['\\.', 'escape'], ['\\b', 'keyword'],
    ])
  })

  it('has no colours and no strings', () => {
    expect(tokens('#fff')).toEqual([])
    expect(tokens('"q"')).toEqual([])
  })

  it('reads the common commands at a line start', () => {
    expect(tokens('title My regex')).toEqual([['title', 'keyword']])
  })

  it('ends an unclosed class or group with its line', () => {
    expect(tokens('[a-', 'b-c')).toEqual([['[', 'squareBracket'], ['-', 'separator']])
    expect(tokens('(a', 'b*')).toEqual([['(', 'paren'], ['*', 'Quantifier']])
  })
})
