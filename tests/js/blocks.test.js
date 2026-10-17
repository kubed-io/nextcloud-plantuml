/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { blocksOf, diagramAt, diagramsOf, diagramsWithout, label, scan } from '../../src/editor/blocks.js'

const dir = new URL('../fixtures/diagrams/', import.meta.url)
const expected = JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8'))
const read = (file) => readFileSync(new URL(file, dir), 'utf8')

describe('scan', () => {
  for (const file of Object.keys(expected)) {
    it(`reads ${file}`, () => {
      expect(scan(read(file))).toEqual(expected[file])
    })
  }

  it('marks a block after a newpage, left open past the last image, as undrawn', () => {
    expect(scan('@startuml a\n@enduml\n@startuml b\nA\nnewpage\nB\n').map((d) => d.drawn)).toEqual([true, false, false])
  })

  it('gives an empty document one diagram', () => {
    expect(scan('')).toEqual([
      { index: 0, type: 'uml', name: '', id: null, page: 1, pages: 1, from: 1, to: 1, start: null, end: null, render: 0, drawn: true },
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

  it('names a block as PlantUML reads it, and gives the id of its argument', () => {
    const first = (line) => scan(`${line}\n@enduml`)[0]
    expect(first('@startuml My Fun Diagram')).toMatchObject({ name: 'My Fun Diagram', id: null })
    expect(first('@startuml "quoted name"')).toMatchObject({ name: 'quoted name' })
    expect(first('@startuml “curly name”')).toMatchObject({ name: 'curly name' })
    expect(first('@startuml{fun_file.png}')).toMatchObject({ name: 'fun_file.png' })
    expect(first('@startuml(id=fun) Fun name')).toMatchObject({ name: 'Fun name', id: 'fun' })
    expect(first('@startuml(id=fun)')).toMatchObject({ name: 'fun', id: 'fun' })
    // An empty name falls back to the id, as the include resolver reads it.
    expect(first('@startuml(id=fun) ""')).toMatchObject({ name: 'fun', id: 'fun' })
    expect(first('@startuml ""')).toMatchObject({ name: '', id: null })
    expect(first('@startuml(id = fun)')).toMatchObject({ id: 'fun' })
    expect(first('@startjcckit(300,200)')).toMatchObject({ type: 'jcckit', name: '', id: null })
    expect(first('@startuml a, b')).toMatchObject({ name: 'a, b' })
    expect(first('@startuml file://out/diagram')).toMatchObject({ name: 'file://out/diagram' })
  })

  it('still opens no block for a half-typed start: a type followed by anything but a name or its arguments', () => {
    expect(scan('@startuml,x\n@enduml')[0].start).toBeNull()
    expect(scan('@startuml(id=x\n@enduml')[0].start).toBeNull()
  })

  it('names a block by its id argument', () => {
    expect(scan('@startuml(id=legend)\n@enduml')[0]).toMatchObject({ type: 'uml', name: 'legend' })
    expect(scan('@startdef(id=actors)\n@enddef')[0]).toMatchObject({ type: 'def', name: 'actors' })
  })
})

// The name and id were read by a lazy group before a trailing class: quadratic, so a long run
// of spaces held the editor and the Viewer for seconds (160,000 took node several).
describe('a @start line with a huge run of spaces', () => {
  const timed = (text) => {
    const begun = performance.now()
    const diagrams = scan(text)
    return [diagrams, performance.now() - begun]
  }

  it('reads a name with 200,000 spaces inside it in under 200 ms', () => {
    const name = `a${' '.repeat(200000)}b`
    const [diagrams, ms] = timed(`@startuml ${name}   \n@enduml\n@startuml c\n@enduml`)
    expect(diagrams.map((d) => d.name)).toEqual([name, 'c'])
    expect(ms).toBeLessThan(200)
  })

  it('reads an id with 200,000 spaces inside it in under 200 ms', () => {
    const id = `x${' '.repeat(200000)}y`
    const [diagrams, ms] = timed(`@startuml(id=${id}   )\n@enduml`)
    expect(diagrams[0]).toMatchObject({ id, name: id })
    expect(ms).toBeLessThan(200)
  })

  it('reads a 40,000-letter @start word with a line separator after it in under 200 ms, as PlantUML opens it', () => {
    const [diagrams, ms] = timed(`@start${'a'.repeat(40000)}\u2028x\n@enduml`)
    expect(diagrams.map((d) => [d.start, d.name])).toEqual([[1, 'x']])
    expect(ms).toBeLessThan(200)
  })

  it('still keeps quotes out of a name: one left inside opens no block', () => {
    expect(scan('@startuml a "b" c\n@enduml')[0].start).toBeNull()
    expect(scan('@startuml "a b" }\n@enduml')[0].name).toBe('a b')
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
    expect(blocksOf(scan(read('pages.puml')))).toEqual([{ type: 'uml', name: 'big', id: null, start: 1, end: 9 }])
  })

  it('lists every block and leaves out a file with no @start', () => {
    expect(blocksOf(scan(read('outside-text.puml')))).toEqual([
      { type: 'uml', name: '', id: null, start: 2, end: 4 },
      { type: 'mindmap', name: '', id: null, start: 6, end: 8 },
    ])
    expect(blocksOf(scan('A -> B'))).toEqual([])
  })
})

describe('diagramsOf, one scan per document version', () => {
  const doc = Text.of(['@startuml a', 'A -> B', '@enduml', '@startyaml', 'a: 1', '@endyaml'])

  it('is the scan of the document, the same array each time it is asked', () => {
    expect(diagramsOf(doc)).toEqual(scan(doc.toString()))
    expect(diagramsOf(doc)).toBe(diagramsOf(doc))
  })

  it('scans the text the caller already read, without reading the document again', () => {
    const fresh = Text.of(['@startjson', '{}', '@endjson'])
    const text = fresh.sliceString(0)
    const read = vi.spyOn(fresh, 'toString')

    expect(diagramsOf(fresh, text)).toEqual(scan(text))
    expect(read).not.toHaveBeenCalled()
  })

  it('reads an edited document afresh and keeps the version before it', () => {
    const state = EditorState.create({ doc })
    const before = diagramsOf(state.doc)
    const { state: after } = state.update({ changes: { from: 0, to: state.doc.line(1).to, insert: '@startsalt b' } })

    expect(diagramsOf(after.doc)).not.toBe(before)
    expect(diagramsOf(after.doc)[0]).toMatchObject({ type: 'salt', name: 'b', start: 1, end: 3 })
    expect(diagramsOf(state.doc)).toBe(before)
  })

  it('answers two editors holding the same text each for its own document', () => {
    const lines = ['@startuml a', 'A -> B', '@enduml']
    const one = EditorState.create({ doc: Text.of(lines) })
    const two = EditorState.create({ doc: Text.of(lines) })
    const first = diagramsOf(one.doc)
    const { state: edited } = one.update({ changes: { from: 0, to: one.doc.line(1).to, insert: '@startsalt b' } })

    expect(diagramsOf(two.doc)).not.toBe(first)
    expect(diagramsOf(two.doc)).toEqual(first)
    expect(diagramsOf(edited.doc)[0]).toMatchObject({ type: 'salt', name: 'b' })
    expect(diagramsOf(two.doc)[0]).toMatchObject({ type: 'uml', name: 'a' })
  })
})

describe('diagramsWithout, the diagrams around a line still being typed', () => {
  const blanked = (doc, n) => {
    const lines = doc.toString().split('\n')
    lines[n - 1] = ''
    return scan(lines.join('\n'))
  }

  it('reads the document\'s own scan where the line opens, closes and pages nothing', () => {
    const doc = Text.of(['@startuml', 'A -> B', '@sta', '@enduml'])
    expect(diagramsWithout(doc, 2)).toBe(diagramsOf(doc))
    expect(diagramsWithout(doc, 3)).toBe(diagramsOf(doc))
  })

  it('reads the document with the line blank where it is a @start, @end or newpage line', () => {
    const doc = Text.of(['@startuml', 'A -> B', 'newpage', '@startu', '@enduml'])
    for (const n of [1, 3, 4, 5]) {
      expect(diagramsWithout(doc, n)).toEqual(blanked(doc, n))
      expect(diagramsWithout(doc, n)).not.toEqual(diagramsOf(doc))
    }
  })

  for (const file of Object.keys(expected)) {
    it(`reads every line of ${file} as the scan with that line blank`, () => {
      const doc = Text.of(read(file).split('\n'))
      for (let n = 1; n <= doc.lines; n++) {
        expect(diagramsWithout(doc, n)).toEqual(blanked(doc, n))
      }
    })
  }
})
