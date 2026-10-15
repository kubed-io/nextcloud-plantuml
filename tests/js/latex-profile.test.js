// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The latex profile: LaTeX inside `@startlatex`, in an inline `<latex>…</latex>`
// and in a `<latex>` … `</latex>` block, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import { core } from './helpers/core.js'
import { loadProfile, needed } from '../../src/editor/profiles/index.js'
import latexProfile from '../../src/editor/profiles/latex.js'

const latex = latexProfile(core)
const language = plantumlLanguage({ latex: latex.mode })

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

/** The same, for the lines of a `@startlatex` block. */
const read = (...lines) => readDoc(['@startlatex', ...lines, '@endlatex']).slice(1, -1)

describe('the latex profile', () => {
  it('is the latex type with no completions or lints', () => {
    expect(latex).toMatchObject({ type: 'latex', completions: [], lints: [], values: [] })
    expect(latex.mode).toBeTruthy()
  })

  it('loads as the latex type', async () => {
    expect((await loadProfile('latex')).type).toBe('latex')
  })

  it('is needed for a latex block and for a line holding <latex>, never for <LATEX>', () => {
    const neededFor = (text) => needed(scan(text), text)
    expect(neededFor('@startlatex\nx^2\n@endlatex\n')).toEqual(new Set(['latex']))
    expect(neededFor('@startuml\nA -> B : <latex>x^2</latex>\n@enduml\n')).toEqual(new Set(['latex']))
    expect(neededFor('@startuml\nnote left\n<latex>\nx\n</latex>\nend note\n@enduml\n')).toEqual(new Set(['latex']))
    expect(neededFor('@startuml\nA -> B : <LATEX>x^2</LATEX>\n@enduml\n')).toEqual(new Set())
  })
})

describe('a @startlatex block', () => {
  it('reads a sum: commands, scripts, braces, numbers and relations', () => {
    expect(read('\\sum_{i=0}^{n-1} i = \\frac{n(n-1)}{2}')).toEqual([
      ['\\sum', 'FunctionName'], ['_', 'operator'], ['{', 'punctuation'], ['=', 'operator'], ['0', 'number'], ['}', 'punctuation'],
      ['^', 'operator'], ['{', 'punctuation'], ['-', 'operator'], ['1', 'number'], ['}', 'punctuation'], ['=', 'operator'],
      ['\\frac', 'FunctionName'], ['{', 'punctuation'], ['(', 'punctuation'], ['-', 'operator'], ['1', 'number'], [')}{', 'punctuation'], ['2', 'number'], ['}', 'punctuation'],
    ])
  })

  it('reads an environment: its name moss, & and \\\\ operators', () => {
    expect(read('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}')).toEqual([
      ['\\begin', 'FunctionName'], ['{', 'punctuation'], ['pmatrix', 'typeName'], ['}', 'punctuation'], ['&', 'operator'],
      ['\\\\', 'operator'], ['&', 'operator'], ['\\end', 'FunctionName'], ['{', 'punctuation'], ['pmatrix', 'typeName'], ['}', 'punctuation'],
    ])
    expect(read('\\begin{align*}')).toEqual([['\\begin', 'FunctionName'], ['{', 'punctuation'], ['align*', 'typeName'], ['}', 'punctuation']])
  })

  it('takes any \\name as a command, and \\begin without braces as one too', () => {
    expect(read('\\foobar \\begin x \\alpha')).toEqual([['\\foobar', 'FunctionName'], ['\\begin', 'FunctionName'], ['\\alpha', 'FunctionName']])
  })

  it('reads a control symbol as a command, so \\% starts no comment', () => {
    expect(read('50\\% \\, \\{')).toEqual([['50', 'number'], ['\\%', 'FunctionName'], ['\\,', 'FunctionName'], ['\\{', 'FunctionName']])
  })

  it('reads % to the line end as a comment, and the next line as ever', () => {
    expect(read('x^2 % note {', '$y$')).toEqual([
      ['^', 'operator'], ['2', 'number'], ['% note {', 'comment'], ['$', 'punctuation'], ['$', 'punctuation'],
    ])
  })

  it('reads [ ] as brackets and $ as grey', () => {
    expect(read('\\sqrt[3]{8} $$')).toEqual([
      ['\\sqrt', 'FunctionName'], ['[', 'punctuation'], ['3', 'number'], [']{', 'punctuation'], ['8', 'number'],
      ['}', 'punctuation'], ['$$', 'punctuation'],
    ])
  })

  it('reads ( ) as punctuation', () => {
    expect(read('f(x)')).toEqual([['(', 'punctuation'], [')', 'punctuation']])
  })

  it('reads a setting line as a keyword and its value', () => {
    expect(read('color red', 'backgroundcolor #EEF', '  scale 2', 'DPI 300', 'x')).toEqual([
      ['color', 'keyword'], ['red', 'ColorLiteral'],
      ['backgroundcolor', 'keyword'], ['#EEF', 'ColorLiteral'],
      ['scale', 'keyword'], ['2', 'number'],
      ['DPI', 'keyword'], ['300', 'number'],
    ])
    // Without its space, it is no setting.
    expect(read('color{red}')).toEqual([['{', 'punctuation'], ['}', 'punctuation']])
  })

  it("leaves a comment line PlantUML's, and never crashes on what LaTeX would not read", () => {
    expect(read("' a note", '§ \\')).toEqual([["' a note", 'comment'], ['\\', 'FunctionName']])
  })
})

describe('an inline <latex>', () => {
  it('reads its middle as LaTeX and its tags as tags, in a note and a label', () => {
    expect(readDoc(['note: area <latex>\\alpha^2</latex>', 'actor A'])).toEqual([
      ['note', 'keyword'], ['<latex>', 'tagName'], ['\\alpha', 'FunctionName'], ['^', 'operator'], ['2', 'number'], ['</latex>', 'tagName'],
      ['actor', 'keyword'],
    ])
    expect(readDoc(['A -> B : x <latex>\\pi</latex> y'])).toEqual([
      ['->', 'operator'], ['x ', 'labelName'], ['<latex>', 'tagName'], ['\\pi', 'FunctionName'], ['</latex>', 'tagName'], [' y', 'labelName'],
    ])
  })

  it('never reads a setting in an inline <latex>', () => {
    expect(readDoc(['note: <latex>color red</latex>'])).toEqual([['note', 'keyword'], ['<latex>', 'tagName'], ['</latex>', 'tagName']])
  })

  it('ends at the first </latex>, and a % comment stops there too', () => {
    expect(readDoc(['note: <latex>x % c</latex> and <latex>\\a</latex>'])).toEqual([
      ['note', 'keyword'], ['<latex>', 'tagName'], ['% c', 'comment'], ['</latex>', 'tagName'], ['<latex>', 'tagName'],
      ['\\a', 'FunctionName'], ['</latex>', 'tagName'],
    ])
  })
})

describe('a <latex> block', () => {
  it('reads the lines between a <latex> line and a </latex> line as LaTeX, in a note', () => {
    expect(readDoc(['note over A', '<latex>', '\\int_0^1 x', '</latex>', 'end note', 'actor B'])).toEqual([
      ['note', 'keyword'], ['<latex>', 'tagName'], ['\\int', 'FunctionName'], ['_', 'operator'], ['0', 'number'], ['^', 'operator'],
      ['1', 'number'], ['</latex>', 'tagName'], ['end note', 'keyword'], ['actor', 'keyword'],
    ])
  })

  it('is exactly the <latex> line: an indented or trailing one opens nothing', () => {
    expect(readDoc(['note left', ' <latex>', 'x', 'end note']).map(([, token]) => token)).not.toContain('FunctionName')
    expect(readDoc(['note left', '<latex> ', '\\a', 'end note'])).not.toContainEqual(['\\a', 'FunctionName'])
  })

  it('ends with the note when never closed, and reads the note as ever after', () => {
    expect(readDoc(['note left', '<latex>', '\\a', 'end note', 'actor B'])).toEqual([
      ['note', 'keyword'], ['<latex>', 'tagName'], ['\\a', 'FunctionName'], ['end note', 'keyword'], ['actor', 'keyword'],
    ])
  })
})

describe('without the latex profile', () => {
  const plain = plantumlLanguage({})
  const read = (lines) => {
    const doc = Text.of(lines)
    const out = []
    plain.parser.parse(doc.toString()).iterate({ enter(node) { if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name]) } })
    return out
  }

  it('leaves the middle of an inline <latex> and of a block plain', () => {
    expect(read(['note: <latex>\\a^2</latex>'])).toEqual([['note', 'keyword'], ['<latex>', 'tagName'], ['</latex>', 'tagName']])
    expect(read(['note left', '<latex>', '\\a', '</latex>', 'end note', 'actor B'])).toEqual([
      ['note', 'keyword'], ['<latex>', 'tagName'], ['</latex>', 'tagName'], ['end note', 'keyword'], ['actor', 'keyword'],
    ])
  })
})
