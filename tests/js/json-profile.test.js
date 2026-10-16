// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The json profile: what its mode names inside `@startjson` blocks, read the way
// CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import jsonProfile from '../../src/editor/profiles/json.js'

const json = jsonProfile(core)
const language = plantumlLanguage({ json: json.mode })

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
const jsonTokens = (...lines) => tokens('json', ...lines)

describe('the json profile', () => {
  it('is the json type with no completions or values', () => {
    expect(json).toMatchObject({ type: 'json', completions: [], values: [] })
  })

  it('puts the json mode\'s tokens into the dictionary\'s categories', () => {
    expect(jsonTokens('{"a": -1, "b": [true, null], "c": "x"}')).toEqual([
      ['{', 'brace'], ['"a"', 'propertyName'], [':', 'separator'], ['-1', 'number'],
      [',', 'separator'], ['"b"', 'propertyName'], [':', 'separator'], ['[', 'squareBracket'],
      ['true', 'atom'], [',', 'separator'], ['null', 'atom'], [']', 'squareBracket'],
      [',', 'separator'], ['"c"', 'propertyName'], [':', 'separator'], ['"x"', 'string'], ['}', 'brace'],
    ])
  })

  it('reads a key in an object inside an array, and after a comment line', () => {
    const nested = jsonTokens('[', '  {"k": "v"}', ']')
    expect(nested).toContainEqual(['"k"', 'propertyName'])
    expect(nested).toContainEqual(['"v"', 'string'])
    const commented = jsonTokens('{', '  // note', '  "k": "v"', '}')
    expect(commented).toContainEqual(['// note', 'comment'])
    expect(commented).toContainEqual(['"k"', 'propertyName'])
    expect(commented).toContainEqual(['"v"', 'string'])
  })

  it('reads the common lines before the second data line', () => {
    const titled = jsonTokens('title A <b>titled</b> json', '{}')
    expect(titled).toContainEqual(['title', 'keyword'])
    expect(titled.some(([, name]) => name === 'propertyName')).toBe(false)
    expect(jsonTokens('scale 2', '{}')).toEqual(expect.arrayContaining([['scale', 'keyword'], ['2', 'number']]))
    expect(jsonTokens('skin rose', '{}')).toContainEqual(['skin', 'keyword'])
  })

  it('reads title after the second data line as json text', () => {
    const late = jsonTokens('{', '"a": 1,', 'title x', '}')
    expect(late.some(([, name]) => name === 'keyword')).toBe(false)
  })

  it('reads a #highlight line at column 0', () => {
    const line = jsonTokens('#highlight "phones" / "1" <<important>>')
    expect(line.slice(0, 4)).toEqual([['#highlight', 'keyword'], ['"phones"', 'string'], ['/', 'separator'], ['"1"', 'string']])
    expect(line.slice(4).map(([text]) => text)).toEqual(['<<', 'important', '>>'])
    expect(jsonTokens('#highlight a / 0 / * / **')).toEqual([
      ['#highlight', 'keyword'], ['a', 'propertyName'], ['/', 'separator'], ['0', 'number'], ['/', 'separator'],
      ['*', 'atom'], ['/', 'separator'], ['**', 'atom'],
    ])
    expect(jsonTokens(' #highlight "a"').some(([, name]) => name === 'keyword')).toBe(false)
  })

  it('leaves what is not json plain', () => {
    expect(jsonTokens('{', '"s": "string \'single\'"', 'nope', '}').filter(([text]) => text === 'nope')).toEqual([])
  })
})
