// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The style vocabulary is generated from PlantUML's source (X1); these tests
// read the committed JSON, never the network.
import { describe, expect, it } from 'vitest'
import vocabulary from '../../src/editor/data/vocabulary.json'

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
