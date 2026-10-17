// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import keywords from '../unit/fixtures/help-keywords.txt?raw'
import library from '../../lib/Service/TemplateLibrary.php?raw'
import { ICONS, iconSvg } from '../../src/editor/data/template-icons.js'
import templates from '../../src/editor/data/templates.json'
import { TYPES } from '../../src/editor/add/types.js'
import { blocksOf, scan } from '../../src/editor/blocks.js'

describe('the types Add diagram lists', () => {
  it('are the server\'s @start types less def, chronology and jcckit', () => {
    const served = new Set([...keywords.matchAll(/@start(\w+)/g)].map((m) => m[1]))
    for (const gone of ['def', 'chronology', 'jcckit']) served.delete(gone)
    expect(new Set(TYPES.map((t) => t.type))).toEqual(served)
    expect(TYPES).toHaveLength(27)
  })

  it('run UML first, then as the style guide orders them', () => {
    expect(TYPES.map((t) => t.name)).toEqual(['UML', 'BPM', 'Board', 'Chart', 'Chen ER', 'Creole', 'DOT', 'Ditaa', 'EBNF', 'Files', 'Flow', 'Gantt', 'Git', 'HCL', 'JSON', 'LaTeX', 'Math', 'MindMap', 'Project', 'Regex', 'Salt', 'Sprites', 'WBS', 'Wire', 'YAML', 'nwdiag', 'packetdiag'])
  })

  it('are the ones the server counts for the admin card (TemplateLibrary::TYPES)', () => {
    const [, list] = /public const TYPES = \[([^\]]*)\]/.exec(library)
    expect([...list.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual(TYPES.map((t) => t.type))
  })
})

describe('the icons', () => {
  it('are the 36 of A7, and every type and built-in names one of them', () => {
    expect(Object.keys(ICONS)).toHaveLength(36)
    for (const { icon } of [...TYPES, ...templates.uml]) expect(ICONS[icon]).toMatch(/^M/)
  })

  it('draw in currentColor at the size asked, and nothing for an unknown name', () => {
    const svg = iconSvg('chart-gantt', 24)
    expect(svg).toContain('fill="currentColor"')
    expect(svg).toContain('width="24"')
    expect(svg).toContain('aria-hidden="true"')
    expect(iconSvg('nope')).toBe('')
  })
})

describe('the built-in templates', () => {
  it('are nine UML diagrams in A8\'s order, one bare block each', () => {
    expect(templates.uml.map((t) => t.title)).toEqual(['Sequence', 'Class', 'Use case', 'Activity', 'Component', 'State', 'Deployment', 'Object', 'Timing'])
    for (const { text } of templates.uml) {
      const blocks = blocksOf(scan(text))
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('uml')
      expect(text.split('\n')[0]).toBe('@startuml')
      expect(blocks[0].end).toBe(text.split('\n').length)
    }
  })

  it('are named as the board adds Class', () => {
    expect(templates.uml.find((t) => t.title === 'Class').name).toBe('class-diagram')
    expect(templates.uml.find((t) => t.title === 'Use case').name).toBe('use-case-diagram')
  })

  it('never use skinparam', () => {
    for (const { text } of templates.uml) expect(text).not.toMatch(/^\s*skinparam\b/mi)
  })
})
