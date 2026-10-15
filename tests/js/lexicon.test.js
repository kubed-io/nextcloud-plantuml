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

/** [text, node name] for every highlighted span, the way CodeMirror reads `mode`. */
function spans(mode, lines) {
  const doc = Text.of(lines)
  const out = []
  StreamLanguage.define(mode).parser.parse(doc.toString()).iterate({
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
