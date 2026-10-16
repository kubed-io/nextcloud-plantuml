// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The chart profile: what its mode names inside `@startchart` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import chartProfile from '../../src/editor/profiles/chart.js'

const chart = chartProfile(core)
const language = plantumlLanguage({ chart: chart.mode })

/** [text, token class] for every highlighted span of the lines in a chart block. */
function tokens(...lines) {
  const doc = Text.of(['@startchart', ...lines, '@endchart'])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the chart profile', () => {
  it('is the chart type with no completions or lints', () => {
    expect(chart).toMatchObject({ type: 'chart', completions: [], lints: [], values: [] })
  })

  it('reads an axis: title, labels, modifiers', () => {
    expect(tokens('h-axis "Quarters" [Q1, Q2] label-right grid')).toEqual([
      ['h-axis', 'keyword'], ['"Quarters"', 'string'], ['[', 'squareBracket'], [',', 'separator'], [']', 'squareBracket'],
      ['label-right', 'modifier'], ['grid', 'modifier'],
    ])
  })

  it('reads a range as number, separator, number, and a tick pair', () => {
    expect(tokens('v-axis "Revenue" 0 --> 100 ticks [0:"Poor", 100:"Great"]')).toEqual([
      ['v-axis', 'keyword'], ['"Revenue"', 'string'], ['0', 'number'], ['-->', 'separator'], ['100', 'number'],
      ['ticks', 'keyword'], ['[', 'squareBracket'], ['0', 'number'], [':', 'separator'], ['"Poor"', 'string'],
      [',', 'separator'], ['100', 'number'], [':', 'separator'], ['"Great"', 'string'], [']', 'squareBracket'],
    ])
    expect(tokens('h-axis -10 -> 2.5')).toEqual([['h-axis', 'keyword'], ['-10', 'number'], ['->', 'separator'], ['2.5', 'number']])
  })

  it('reads a series: stereotype, signed decimals, colour, modifier', () => {
    expect(tokens('bar <<s>> "Sales" [45, 62.5, -10] #3498db labels')).toEqual([
      ['bar', 'keyword'], ['<<', 'angleBracket'], ['s', 'annotation'], ['>>', 'angleBracket'], ['"Sales"', 'string'],
      ['[', 'squareBracket'], ['45', 'number'], [',', 'separator'], ['62.5', 'number'], [',', 'separator'], ['-10', 'number'], [']', 'squareBracket'],
      ['#3498db', 'ColorLiteral'], ['labels', 'modifier'],
    ])
  })

  it('reads coordinate pairs and a marker', () => {
    const found = tokens('scatter "P" [(1,12),(6,34)] <<square>>')
    expect(found).toContainEqual(['(', 'paren'])
    expect(found).toContainEqual(['square', 'annotation'])
    expect(found.filter(([, token]) => token === 'number').length).toBe(4)
  })

  it('reads value words and annotation', () => {
    expect(tokens('stackMode stacked')).toEqual([['stackMode', 'keyword'], ['stacked', 'atom']])
    expect(tokens('annotation "Peak" at (Q4, 70) <<arrow>>')).toContainEqual(['at', 'keyword'])
  })

  it('reads legend as one line, so the lines after it are still read', () => {
    expect(tokens('legend right', 'bar [1,2] #red')).toEqual([
      ['legend', 'keyword'], ['right', 'atom'],
      ['bar', 'keyword'], ['[', 'squareBracket'], ['1', 'number'], [',', 'separator'], ['2', 'number'], [']', 'squareBracket'], ['#red', 'ColorLiteral'],
    ])
  })

  it('keeps keywords case-sensitive and the common lines the lexicon\'s', () => {
    expect(tokens('BAR [1,2]').some(([, token]) => token === 'keyword')).toBe(false)
    expect(tokens('title Dual axis')).toEqual([['title', 'keyword']])
  })

  it('ends an unclosed bracket with its line', () => {
    expect(tokens('bar [1, 2', 'line [3]')).toContainEqual(['line', 'keyword'])
  })
})
