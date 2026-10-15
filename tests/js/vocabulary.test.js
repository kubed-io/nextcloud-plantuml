// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The style vocabulary is generated from PlantUML's source (X1); these tests
// read the committed JSON, never the network.
import { describe, expect, it } from 'vitest'
import vocabulary from '../../src/editor/data/vocabulary.json'
import builtins from '../../src/editor/data/builtins.json'
import { enumConstants, readmeRows, signatures } from '../../scripts/vocabulary.mjs'

describe('style vocabulary', () => {
  it('records the PlantUML version it came from', () => {
    expect(vocabulary.plantuml).toBe('1.2026.8')
  })

  it('has the 30 style properties', () => {
    const { properties } = vocabulary.style
    expect(properties).toHaveLength(30)
    expect(properties).toEqual(expect.arrayContaining(['BackGroundColor', 'FontStyle', 'RoundCorner']))
  })

  it('has the 157 selectors with the Java underscore suffix dropped', () => {
    const { selectors } = vocabulary.style
    expect(selectors).toHaveLength(157)
    expect(selectors).toEqual(expect.arrayContaining(['mindmapDiagram', 'class', 'package']))
    expect(selectors.filter((s) => s.endsWith('_'))).toEqual([])
  })

  it('has the font styles without backcolor', () => {
    expect(vocabulary.style.fontStyles).toEqual(['plain', 'italic', 'bold', 'underline', 'strike', 'wave'])
  })
})

describe('built-in functions', () => {
  const byName = Object.fromEntries(builtins.map((f) => [f.name, f]))

  it('has a described entry for the documented functions', () => {
    for (const name of ['%date', '%lighten', '%get_all_stdlib', '%strlen']) {
      expect(byName[name].description).not.toBe('')
    }
    expect(byName['%strlen'].example).toBe('%strlen("foo")')
  })

  it('has an empty description for a function without a readme row', () => {
    expect(byName['%get_current_theme']).toMatchObject({ description: '', example: '' })
  })

  it('is sorted by name', () => {
    expect(builtins.map((f) => f.name)).toEqual(builtins.map((f) => f.name).sort())
  })
})

describe('the generator', () => {
  it('reads the constants of a Java enum, ignoring arguments and comments', () => {
    const java = 'public enum E {\n  A("x,y"), // c\n  B_, C;\n  int z;\n}'
    expect(enumConstants(java)).toEqual(['A', 'B_', 'C'])
  })

  it('reads every signature of a builtin class, and none from one without', () => {
    expect(signatures('x = new TFunctionSignature("%a", 2); y = new TFunctionSignature("%b", 0);')).toEqual([
      { name: '%a', args: 2 },
      { name: '%b', args: 0 },
    ])
    expect(signatures('class Helper {}')).toEqual([])
  })

  it('reads a readme row and skips its continuation rows', () => {
    const md = '| ``%chr`` | A [link](http://x) | ``%chr(65)`` | ``A`` |\n|  | more | ``%chr(66)`` | ``B`` |'
    expect([...readmeRows(md)]).toEqual([['%chr', { description: 'A link', example: '%chr(65)' }]])
  })
})
