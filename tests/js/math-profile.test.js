// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The math profile: AsciiMath inside `@startmath` and in an inline
// `<math>…</math>`, read the way CodeMirror reads them.
import { describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import { core } from './helpers/core.js'
import { loadProfile, needed, profileExtension } from '../../src/editor/profiles/index.js'
import { valuesOn } from '../../src/editor/values/index.js'
import { serverColors } from '../../src/editor/completion/server-list.js'
import mathProfile from '../../src/editor/profiles/math.js'

vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ colors: { red: '#FF0000' } }), { status: 200 }))

const math = mathProfile(core)
const language = plantumlLanguage({ math: math.mode })

/** [text, token class] for every highlighted span of `lines`. */
function readDoc(lines) {
  const doc = Text.of(lines)
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

/** The same, for the lines of a `@startmath` block. */
const read = (...lines) => readDoc(['@startmath', ...lines, '@endmath']).slice(1, -1)

describe('the math profile', () => {
  it('is the math type with no completions or lints', () => {
    expect(math).toMatchObject({ type: 'math', completions: [], lints: [], values: [] })
    expect(math.mode).toBeTruthy()
  })

  it('loads as the math type', async () => {
    expect((await loadProfile('math')).type).toBe('math')
  })

  it('is needed for a math block and for a line holding <math>, never for <MATH>', () => {
    const neededFor = (text) => needed(scan(text), text)
    expect(neededFor('@startmath\nx^2\n@endmath\n')).toEqual(new Set(['math']))
    expect(neededFor('@startuml\nA -> B : <math>x^2</math>\n@enduml\n')).toEqual(new Set(['math']))
    expect(neededFor('@startuml\nA -> B : <MATH>x^2</MATH>\n@enduml\n')).toEqual(new Set())
  })
})

describe('a @startmath block', () => {
  it('reads a formula: functions ochre, symbols slate, operators, scripts, numbers and brackets', () => {
    expect(read('f(t)=(a_0)/2 + sum_(n=1)^ooa_ncos((npit)/L)')).toEqual([
      ['(', 'paren'], [')', 'paren'], ['=', 'compareOperator'], ['(', 'paren'], ['_', 'operator'], ['0', 'number'],
      [')', 'paren'], ['/', 'arithmeticOperator'], ['2', 'number'], ['+', 'arithmeticOperator'], ['sum', 'FunctionName'], ['_', 'operator'],
      ['(', 'paren'], ['=', 'compareOperator'], ['1', 'number'], [')', 'paren'], ['^', 'operator'], ['oo', 'VariableName'],
      ['_', 'operator'], ['cos', 'FunctionName'], ['((', 'paren'], ['pi', 'VariableName'], [')', 'paren'],
      ['/', 'arithmeticOperator'], [')', 'paren'],
    ])
  })

  it('takes the longest name at any position, as PlantUML does', () => {
    expect(read('sinx')).toEqual([['sin', 'FunctionName']])
    expect(read('alphabeta')).toEqual([['alphabeta', 'VariableName']])
    expect(read('x lt= y |-> z')).toEqual([['lt=', 'compareOperator'], ['|->', 'operator']])
    expect(read('1.5 xx 2.25')).toEqual([['1.5', 'number'], ['xx', 'arithmeticOperator'], ['2.25', 'number']])
  })

  it('reads AA and EE as symbols, and the word operators as operators', () => {
    expect(read('AA x in RR, EE y')).toEqual([
      ['AA', 'VariableName'], ['in', 'compareOperator'], ['RR', 'VariableName'], [',', 'separator'], ['EE', 'VariableName'],
    ])
    expect(read('a and b => c')).toEqual([['and', 'logicOperator'], ['=>', 'operator']])
  })

  it('reads a quoted text and a text( ) argument as strings, whatever words they hold', () => {
    expect(read('"for all" x + text(a or b)')).toEqual([
      ['"for all"', 'string'], ['+', 'arithmeticOperator'], ['text', 'FunctionName'], ['(', 'paren'], ['a or b', 'string'], [')', 'paren'],
    ])
    expect(read('x "open to the end')).toEqual([['"open to the end', 'string']])
  })

  it('names the angle brackets angle brackets and the invisible ones braces', () => {
    expect(read('(: a :)')).toEqual([['(:', 'angleBracket'], [':)', 'angleBracket']])
    expect(read('{: x :}')).toEqual([['{:', 'brace'], [':}', 'brace']])
  })

  it('reads a setting line as a keyword and its value', () => {
    expect(read('color red', 'backgroundcolor #EEF', '  scale 2', 'DPI 300', 'x')).toEqual([
      ['color', 'keyword'], ['red', 'ColorLiteral'],
      ['backgroundcolor', 'keyword'], ['#EEF', 'ColorLiteral'],
      ['scale', 'keyword'], ['2', 'number'],
      ['DPI', 'keyword'], ['300', 'number'],
    ])
    // Without its space, `color` is AsciiMath's colour command.
    expect(read('color(red)(x)')).toEqual([['color', 'FunctionName'], ['(', 'paren'], [')(', 'paren'], [')', 'paren']])
  })

  it("gives the colour pencil a setting's colour (C6)", async () => {
    await serverColors()
    const state = EditorState.create({ doc: '@startmath\ncolor red\nx\n@endmath', extensions: [profileExtension([math])] })
    expect(valuesOn(state, 2).filter((value) => value.colours).map((value) => state.sliceDoc(value.from, value.to))).toEqual(['red'])
  })

  it("leaves a comment line PlantUML's, and never crashes on what AsciiMath would not read", () => {
    expect(read("' a note", 'x^2')).toEqual([["' a note", 'comment'], ['^', 'operator'], ['2', 'number']])
    expect(read('§ ?? \\alpha')).toEqual([['§', 'operator'], ['??', 'operator'], ['\\', 'punctuation'], ['alpha', 'VariableName']])
  })
})

describe('an inline <math>', () => {
  it('reads its middle as AsciiMath and its tags as tags, in a note and a label', () => {
    expect(readDoc(['note: area <math>pi r^2</math>', 'actor A'])).toEqual([
      ['note', 'keyword'], ['<math>', 'tagName'], ['pi', 'VariableName'], ['^', 'operator'], ['2', 'number'], ['</math>', 'tagName'],
      ['actor', 'keyword'], ['A', 'typeName'],
    ])
    expect(readDoc(['A -> B : x <math>sinx</math> y'])).toEqual([
      ['->', 'LinkOperator'], ['x ', 'labelName'], ['<math>', 'tagName'], ['sin', 'FunctionName'], ['</math>', 'tagName'], [' y', 'labelName'],
    ])
  })

  it('ends at the first </math>, and never reads a setting', () => {
    expect(readDoc(['note: <math>color red</math> and <math>"a</math>'])).toEqual([
      ['note', 'keyword'], ['<math>', 'tagName'], ['color', 'FunctionName'], ['</math>', 'tagName'], ['<math>', 'tagName'], ['"a', 'string'],
      ['</math>', 'tagName'],
    ])
  })
})
