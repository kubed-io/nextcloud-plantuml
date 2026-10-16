// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The lexicon: the core grammar's shared rules, and the helpers a profile builds
// its own stream modes with, handed to it as `core.lex`.
import { describe, expect, it } from 'vitest'
import { StreamLanguage, StringStream } from '@codemirror/language'
import { Text } from '@codemirror/state'
import { core } from './helpers/core.js'
import { lex } from '../../src/editor/lexicon/index.js'
import { tokenTable } from '../../src/editor/lexicon/tags.js'

/** [text, token] for each call of `mode.token` over `lines`, plain text included as null. */
function calls(mode, lines) {
  const state = mode.startState(2)
  const out = []
  for (const line of lines) {
    const stream = new StringStream(line, 4, 2)
    while (!stream.eol()) {
      stream.start = stream.pos
      const token = mode.token(stream, state)
      out.push([stream.current(), token])
    }
  }
  return out
}

/** [text, node name] for every highlighted span, the way CodeMirror reads `mode` with the editor's own tags. */
function spans(mode, lines) {
  const doc = Text.of(lines)
  const out = []
  StreamLanguage.define({ ...mode, tokenTable }).parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('lex', () => {
  it('is what the loader hands every profile as core.lex', () => {
    expect(core.lex).toBe(lex)
    expect(Object.keys(core)).toEqual(['scan', 't', 'lex'])
  })

  it('matches the first rule with a single token where the stream stands, and moves past it', () => {
    const stream = new StringStream('#red x', 4, 2)

    expect(lex.match(stream, lex.colours)).toBe('ColorLiteral')
    expect(stream.pos).toBe(4)
  })

  it('matches nothing on plain text, and leaves the stream where it was', () => {
    const stream = new StringStream('plain', 4, 2)

    expect(lex.match(stream, lex.colours)).toBeNull()
    expect(stream.pos).toBe(0)
  })

  it('skips a rule whose tokens are groups', () => {
    const stream = new StringStream('#Red/Yellow', 4, 2)

    // The gradient rule is groups; the name rule then takes `#Red` alone.
    expect(lex.match(stream, lex.colours)).toBe('ColorLiteral')
    expect(stream.pos).toBe(4)
  })

  it('makes a table whose pushed line states end with their line', () => {
    const mode = lex.table({
      start: [{ regex: /a/, token: 'keyword', push: 'inner' }, { regex: /./, token: null }],
      inner: [{ regex: /./, token: 'string' }],
    }, { lineStates: ['inner'] })

    expect(calls(mode, ['a b', 'c'])).toEqual([['a', 'keyword'], [' ', 'string'], ['b', 'string'], ['c', null]])
  })

  it('makes a table that starts the next line in the successor of the state a line ended in', () => {
    const mode = lex.table({
      start: [{ regex: /:/, token: null, next: 'label' }, { regex: /./, token: null }],
      label: [{ regex: /./, token: 'labelName' }],
    }, { nextLine: { label: 'start' } })

    expect(calls(mode, [':x', 'y'])).toEqual([[':', null], ['x', 'labelName'], ['y', null]])
  })

  it('reads a line as Creole on a base token in a text mode', () => {
    expect(spans(lex.textMode('labelName'), ['**b** x'])).toEqual([['**b**', 'strong_labelName'], [' x', 'labelName']])
  })

  it("ends a text mode's tag and inline formula with their line", () => {
    expect(spans(lex.textMode('labelName'), ['<font size=12', 'a <math>x</math>', 'b']).slice(-1)).toEqual([['b', 'labelName']])
  })
})

/** A table of `lex.common(options)`'s lines, any other word plain. */
function commonTable(options) {
  const { rules, states } = lex.common(options)
  return lex.table({ start: [...rules, { regex: /\w+/, token: null }], ...states })
}

describe('lex.common', () => {
  const common = (...lines) => spans(commonTable(), lines)

  it('reads a title as a keyword and its text as Creole, no diagram name', () => {
    expect(common('title x **y**')).toEqual([['title', 'keyword'], ['**y**', 'strong']])
  })

  it('reads a legend as a body of Creole down to end legend', () => {
    expect(common('legend', '**l**', 'end legend', 'x')).toEqual([['legend', 'keyword'], ['**l**', 'strong'], ['end legend', 'keyword']])
  })

  it('reads the keyword lines, a number among their words', () => {
    expect(common('scale 2')).toEqual([['scale', 'keyword'], ['2', 'number']])
    expect(common('skinparam backgroundColor #EEF')).toEqual([['skinparam', 'keyword'], ['#EEF', 'ColorLiteral']])
    expect(common('left to right direction')).toEqual([['left to right direction', 'keyword']])
    expect(common('caption a //b//', 'mainframe c')).toEqual([['caption', 'keyword'], ['//b//', 'emphasis'], ['mainframe', 'keyword']])
  })

  it('reads a title, a header and a footer alone on their line down to their end, in any case', () => {
    expect(common('Header', '**h**', 'End Header')).toEqual([['Header', 'keyword'], ['**h**', 'strong'], ['End Header', 'keyword']])
    expect(common('title', '= T', 'end title')).toEqual([['title', 'keyword'], ['= T', 'heading'], ['end title', 'keyword']])
  })

  it('ends its lines with their line, a tag left open with them', () => {
    expect(common('title <font size=12', 'scale 2')).toEqual([['title', 'keyword'], ['<font', 'tagName'], ['size', 'attributeName'], ['=', 'definitionOperator'], ['12', 'string'], ['scale', 'keyword'], ['2', 'number']])
    expect(common('footer <math>x</math> **f**', 'scale 2').slice(-3)).toEqual([['**f**', 'strong'], ['scale', 'keyword'], ['2', 'number']])
  })

  it('reads a <latex> block in a body plain, to its </latex> or the end of the body', () => {
    expect(common('legend', '<latex>', 'x^2', '</latex>', '**b**', 'end legend', 'scale 2')).toEqual([
      ['legend', 'keyword'], ['<latex>', 'tagName'], ['</latex>', 'tagName'], ['**b**', 'strong'], ['end legend', 'keyword'], ['scale', 'keyword'], ['2', 'number'],
    ])
    expect(common('legend', '<latex>', 'x', 'end legend', 'scale 2')).toEqual([
      ['legend', 'keyword'], ['<latex>', 'tagName'], ['end legend', 'keyword'], ['scale', 'keyword'], ['2', 'number'],
    ])
  })

  it('reads a legend as one keyword line when asked, the next line its own', () => {
    expect(spans(commonTable({ legend: 'line' }), ['legend right', 'bar', 'scale 2'])).toEqual([['legend', 'keyword'], ['scale', 'keyword'], ['2', 'number']])
  })

  it('reads only the title with all off, as hcl takes it', () => {
    expect(spans(commonTable({ all: false, title: true }), ['title **t**', 'scale 2', 'legend', 'x'])).toEqual([['title', 'keyword'], ['**t**', 'strong']])
  })

  it('reads no title when asked', () => {
    expect(spans(commonTable({ title: false }), ['title x', 'scale 2'])).toEqual([['scale', 'keyword'], ['2', 'number']])
  })
})

describe('lex.setting', () => {
  it("reads a setting line's keyword, then its value, then the rest plain", () => {
    const stream = new StringStream('scale 2 3', 4, 2)
    const state = { value: 'keyword' }
    const next = () => {
      stream.eatSpace()
      stream.start = stream.pos
      return lex.setting(stream, state)
    }

    expect([next(), next(), next()]).toEqual(['keyword', 'number', null])
    expect(stream.eol()).toBe(true)
  })
})
