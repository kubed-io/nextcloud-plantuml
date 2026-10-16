// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The packetdiag profile (T24): what its mode names inside `@startpacketdiag` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import packetdiagProfile from '../../src/editor/profiles/packetdiag.js'

const profile = packetdiagProfile(core)
const language = plantumlLanguage({ packetdiag: profile.mode })

/** [text, token class] for every highlighted span of the lines in a block. */
function tokens(...lines) {
  const doc = Text.of(['@startpacketdiag', ...lines, '@endpacketdiag'])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the packetdiag profile', () => {
  it('is the packetdiag type with no completions or lints', () => {
    expect(profile).toMatchObject({ type: 'packetdiag', completions: [], lints: [], values: [] })
  })

  it('reads the wrapper', () => {
    expect(tokens('packetdiag {')).toEqual([['packetdiag', 'keyword'], ['{', 'brace']])
    expect(tokens('}')).toEqual([['}', 'brace']])
  })

  it('reads an option', () => {
    expect(tokens('  colwidth = 32')).toEqual([['colwidth', 'propertyName'], ['=', 'definitionOperator'], ['32', 'number']])
    expect(tokens('  scale_direction = rtl;')).toEqual([
      ['scale_direction', 'propertyName'], ['=', 'definitionOperator'], ['rtl', 'atom'], [';', 'separator'],
    ])
    expect(tokens('same_height=true')).toEqual([['same_height', 'propertyName'], ['=', 'definitionOperator'], ['true', 'atom']])
  })

  it('reads a field: a range, a colon, a Creole description', () => {
    expect(tokens('  0-15: Source Port')).toEqual([['0', 'number'], ['-', 'separator'], ['15', 'number'], [':', 'separator']])
    expect(tokens('  7: x **bold**').map(([, token]) => token)).toEqual(['number', 'separator', 'strong'])
  })

  it('reads a field with no colon, and an auto field', () => {
    expect(tokens('  8-9 gap')).toEqual([['8', 'number'], ['-', 'separator'], ['9', 'number']])
    expect(tokens('  * x [len = 8]')).toEqual([
      ['*', 'atom'], ['[', 'squareBracket'], ['len', 'attributeName'], ['=', 'definitionOperator'], ['8', 'number'], [']', 'squareBracket'],
    ])
  })

  it('reads the attribute list', () => {
    expect(tokens('  106: URG [rotate = 270]')).toEqual([
      ['106', 'number'], [':', 'separator'], ['[', 'squareBracket'], ['rotate', 'attributeName'],
      ['=', 'definitionOperator'], ['270', 'number'], [']', 'squareBracket'],
    ])
    expect(tokens('  3: a [len = 8, height = 2]').filter(([, t]) => t === 'separator').length).toBe(2)
  })

  it('reads a description as text: as, is and a colour are not tokens', () => {
    const found = tokens('  8-15: data as text is #red')
    expect(found.map(([, token]) => token)).not.toContain('keyword')
    expect(found.map(([, token]) => token)).not.toContain('ColorLiteral')
  })

  it('ends an attribute list with its line', () => {
    expect(tokens('  3: a [len = ', '  colwidth = 8').slice(-3)).toEqual([['colwidth', 'propertyName'], ['=', 'definitionOperator'], ['8', 'number']])
  })

  it('reads the common lines', () => {
    expect(tokens('hide footbox')[0]).toEqual(['hide', 'keyword'])
    expect(tokens('title')[0]).toEqual(['title', 'keyword'])
  })

  it('reads a field in an unclosed wrapper the same', () => {
    expect(tokens('packetdiag {', '  1: a').slice(2)).toEqual([['1', 'number'], [':', 'separator']])
  })
})
