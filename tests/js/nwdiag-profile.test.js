// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The nwdiag profile (T25): what its mode names inside `@startnwdiag` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import nwdiagProfile from '../../src/editor/profiles/nwdiag.js'

const profile = nwdiagProfile(core)
const language = plantumlLanguage({ nwdiag: profile.mode })

/** [text, token class] for every highlighted span of the lines in a block. */
function tokens(...lines) {
  const doc = Text.of(['@startnwdiag', ...lines, '@endnwdiag'])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the nwdiag profile', () => {
  it('is the nwdiag type with no completions or lints', () => {
    expect(profile).toMatchObject({ type: 'nwdiag', completions: [], lints: [], values: [] })
  })

  it('reads the keywords, a name a classifier, the braces', () => {
    expect(tokens('nwdiag {')).toEqual([['nwdiag', 'keyword'], ['{', 'brace']])
    expect(tokens('  network dmz {')).toEqual([['network', 'keyword'], ['dmz', 'typeName'], ['{', 'brace']])
    expect(tokens('  group web {')).toEqual([['group', 'keyword'], ['web', 'typeName'], ['{', 'brace']])
    expect(tokens('}')).toEqual([['}', 'brace']])
  })

  it('reads a property', () => {
    expect(tokens('  address = "210.x.x.x/24"')).toEqual([['address', 'propertyName'], ['=', 'definitionOperator'], ['"210.x.x.x/24"', 'string']])
    expect(tokens('  width = full;')).toEqual([['width', 'propertyName'], ['=', 'definitionOperator'], ['full', 'atom'], [';', 'separator']])
    expect(tokens('  description = "db <b>master</b>"')).toEqual([['description', 'propertyName'], ['=', 'definitionOperator'], ['"db <b>master</b>"', 'string']])
  })

  it('gives a colour its swatch, quoted or not', () => {
    expect(tokens('  color = "#FFAAAA"')).toEqual([
      ['color', 'propertyName'], ['=', 'definitionOperator'], ['"', 'string'], ['#FFAAAA', 'ColorLiteral'], ['"', 'string'],
    ])
    expect(tokens('  color = pink')).toEqual([['color', 'propertyName'], ['=', 'definitionOperator'], ['pink', 'ColorLiteral']])
    expect(tokens('  color = "red";').map(([, t]) => t)).toEqual(['propertyName', 'definitionOperator', 'string', 'ColorLiteral', 'string', 'separator'])
  })

  it('reads an element with its attribute list', () => {
    expect(tokens('  web01 [address = "210.x.x.1", shape = database];')).toEqual([
      ['web01', 'typeName'], ['[', 'squareBracket'],
      ['address', 'attributeName'], ['=', 'definitionOperator'], ['"210.x.x.1"', 'string'], [',', 'separator'],
      ['shape', 'attributeName'], ['=', 'definitionOperator'], ['database', 'atom'],
      [']', 'squareBracket'], [';', 'separator'],
    ])
    expect(tokens('  a [color = "red", shape = "node"]').map(([, t]) => t)).toContain('ColorLiteral')
    expect(tokens('  db01;')).toEqual([['db01', 'typeName'], [';', 'separator']])
  })

  it('reads a link and a comment', () => {
    expect(tokens('inet -- router;')).toEqual([['inet', 'typeName'], ['--', 'LinkOperator'], ['router', 'typeName'], [';', 'separator']])
    expect(tokens('// c')).toEqual([['// c', 'comment']])
  })

  it('ends an attribute list with its line', () => {
    expect(tokens('  a [address = ', '  b -- c').map(([, t]) => t).slice(-3)).toEqual(['typeName', 'LinkOperator', 'typeName'])
  })

  it('reads the common lines', () => {
    expect(tokens('hide footbox')[0]).toEqual(['hide', 'keyword'])
  })
})
