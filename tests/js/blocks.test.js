/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blocksOf, diagramAt, label, scan } from '../../src/editor/blocks.js'

const dir = new URL('../fixtures/diagrams/', import.meta.url)
const expected = JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8'))
const read = (file) => readFileSync(new URL(file, dir), 'utf8')

describe('scan', () => {
  for (const file of Object.keys(expected)) {
    it(`reads ${file}`, () => {
      expect(scan(read(file))).toEqual(expected[file])
    })
  }

  it('gives an empty document one diagram', () => {
    expect(scan('')).toEqual([
      { index: 0, type: 'uml', name: '', page: 1, pages: 1, from: 1, to: 1, start: null, end: null, render: 0 },
    ])
  })

  it('closes an unclosed block at the next @start', () => {
    const [a, b] = scan('@startuml\nA\n@startsalt\n{\n}\n@endsalt')
    expect(a).toMatchObject({ type: 'uml', from: 1, to: 2, start: 1, end: null })
    expect(b).toMatchObject({ type: 'salt', index: 1, start: 3, end: 6 })
  })
})

// PlantUML's own count, checked against the live server on 2026-10-14: a
// `@start` begins its block afresh, dropping what an unclosed block before it
// held; any `@end` closes; a file in which nothing closes is drawn wrapped in
// `@startuml`…`@enduml`. `/svg/<n>` past the last image answers 400.
describe('render, the image PlantUML draws for a diagram', () => {
  const renders = (text) => scan(text).map((d) => d.render)

  it('gives an unclosed block the image of the block that closes after it', () => {
    expect(renders(read('swallowed.puml'))).toEqual([0, 0])
    expect(renders('@startyaml\na: 1\n@startuml\nA -> B\n@enduml\n@startsalt\n{\n}\n@endsalt')).toEqual([0, 0, 1])
  })

  it('drops the pages of an unclosed uml block', () => {
    expect(renders('@startuml\nA -> B\nnewpage\nB -> C\n@startsalt\n{\n}\n@endsalt')).toEqual([0, 0, 0])
  })

  it('pages the uml block that a later @start began', () => {
    expect(renders('@startyaml\na: 1\n@startuml\nA -> B\nnewpage\nC -> D\n@enduml')).toEqual([0, 0, 1])
    expect(renders('@startuml\nA -> B\n@startuml\nB -> C\nnewpage\nC -> D\n@enduml')).toEqual([0, 0, 1])
  })

  it('draws a file nothing closes as if wrapped in @startuml and @enduml', () => {
    expect(renders('@startyaml\na: 1\n@startuml\nA -> B')).toEqual([0, 0])
    expect(renders('@startuml\nA -> B\nnewpage\nC -> D')).toEqual([0, 1])
    expect(renders('@enduml\n@startyaml\na: 1')).toEqual([1])
  })

  it('counts an unclosed block after the last image past the end, where PlantUML draws none', () => {
    expect(renders('@startuml\nA -> B\n@enduml\n@startyaml\na: 1')).toEqual([0, 1])
  })
})

describe('diagramAt', () => {
  const outside = scan(read('outside-text.puml'))
  const pages = scan(read('pages.puml'))

  it('is null on a line between blocks', () => {
    expect(diagramAt(outside, 1)).toBeNull()
    expect(diagramAt(outside, 5)).toBeNull()
    expect(diagramAt(outside, 9)).toBeNull()
  })

  it('finds the diagram whose block holds the line', () => {
    expect(diagramAt(outside, 2).index).toBe(0)
    expect(diagramAt(outside, 7).index).toBe(1)
  })

  it('finds the page by its line range', () => {
    expect(diagramAt(pages, 2).page).toBe(1)
    expect(diagramAt(pages, 3).page).toBe(2)
    expect(diagramAt(pages, 7).page).toBe(4)
  })

  it('gives the @end line the last page', () => {
    expect(diagramAt(pages, 9).page).toBe(4)
    expect(diagramAt(outside, 4).index).toBe(0)
  })

  it('gives a document with no @start every line', () => {
    expect(diagramAt(scan('A -> B\nB -> C'), 2).index).toBe(0)
  })

  it('holds the rest of an unclosed block', () => {
    expect(diagramAt(scan(read('unclosed.puml')), 3).type).toBe('yaml')
  })
})

describe('scan block arguments', () => {
  it('reads a block whose arguments are not an id, so the tabs after it stay in step', () => {
    const [a, b] = scan('@startjcckit(300,200)\nx\n@endjcckit\n@startuml a\n@enduml')
    expect(a).toMatchObject({ index: 0, type: 'jcckit', name: '' })
    expect(b).toMatchObject({ index: 1, type: 'uml', name: 'a' })
    expect(label(b)).toBe('a')
  })

  it('names a block by its id argument', () => {
    expect(scan('@startuml(id=legend)\n@enduml')[0]).toMatchObject({ type: 'uml', name: 'legend' })
    expect(scan('@startdef(id=actors)\n@enddef')[0]).toMatchObject({ type: 'def', name: 'actors' })
  })
})

describe('label', () => {
  it('is the name, else the type, plus the page of a multi-page block', () => {
    const nodes = { type: 'uml', name: 'nodes', page: 2, pages: 3 }
    expect(label(nodes)).toBe('nodes 2')
    expect(label({ type: 'salt', name: '', page: 1, pages: 1 })).toBe('salt')
    expect(label({ type: 'uml', name: '', page: 1, pages: 2 })).toBe('uml 1')
  })
})

describe('blocksOf', () => {
  it('merges the pages of a block', () => {
    expect(blocksOf(scan(read('pages.puml')))).toEqual([{ type: 'uml', name: 'big', start: 1, end: 9 }])
  })

  it('lists every block and leaves out a file with no @start', () => {
    expect(blocksOf(scan(read('outside-text.puml')))).toEqual([
      { type: 'uml', name: '', start: 2, end: 4 },
      { type: 'mindmap', name: '', start: 6, end: 8 },
    ])
    expect(blocksOf(scan('A -> B'))).toEqual([])
  })
})
