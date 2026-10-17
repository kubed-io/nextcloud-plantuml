// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { arrange, builtins, emptyText, fromFiles, matching } from '../../src/editor/add/catalog.js'

const OWN = {
  'diagram:uml': { summary: 'UML diagrams, drawn from text', example: '@startuml\nAlice -> Bob : hi\n@enduml' },
  'diagram:gantt': { example: '@startgantt\n[Task] lasts 3 days\n@endgantt' },
}

const titles = (list) => list.map((t) => t.title)

describe('emptyText', () => {
  it('is the two lines with a blank one between', () => {
    expect(emptyText('gantt')).toBe('@startgantt\n\n@endgantt')
  })

  it('braces salt and json, as the @start completion does', () => {
    expect(emptyText('salt')).toBe('@startsalt\n{\n\t\n}\n@endsalt')
    expect(emptyText('json')).toBe('@startjson\n{\n\t\n}\n@endjson')
  })
})

describe('builtins', () => {
  const all = builtins(OWN)
  const of = (type) => all.filter((t) => t.type === type)

  it('gives UML Empty, Example and its nine', () => {
    expect(titles(of('uml'))).toEqual(['Empty', 'Example', 'Sequence', 'Class', 'Use case', 'Activity', 'Component', 'State', 'Deployment', 'Object', 'Timing'])
  })

  it('names Empty and Example by the type\'s word and describes them as the board does', () => {
    const [empty, example] = of('uml')
    expect(empty).toMatchObject({ name: 'uml', description: '@startuml and @enduml, nothing between', text: '@startuml\n\n@enduml', icon: 'shape-outline', source: 'builtin' })
    expect(example).toMatchObject({ name: 'uml', description: 'Alice -> Bob : hi', text: OWN['diagram:uml'].example })
  })

  it('gives a type without an example Empty alone', () => {
    expect(titles(of('git'))).toEqual(['Empty'])
  })

  it('wears a UML built-in\'s own icon, any other its type\'s', () => {
    expect(of('uml').find((t) => t.title === 'Class').icon).toBe('card-bulleted-outline')
    expect(of('gantt')[0].icon).toBe('chart-gantt')
  })
})

describe('fromFiles', () => {
  const file = (text, path = 'Templates/flows.puml', source = 'shared') => fromFiles([{ source, path, text }])

  it('takes each block as written, @start line to @end line', () => {
    const [t] = file("' before\n@startuml(id=L) Login\nA -> B\n@enduml\nafter")
    expect(t.text).toBe('@startuml(id=L) Login\nA -> B\n@enduml')
    expect(t.type).toBe('uml')
  })

  it('titles a named block by its name', () => {
    expect(file('@startuml(id=L) Login\n@enduml')[0]).toMatchObject({ title: 'Login', name: 'Login' })
  })

  it('titles unnamed blocks by the file, numbered from the second', () => {
    expect(titles(file('@startuml\n@enduml\n@startuml\n@enduml\n@startuml\n@enduml'))).toEqual(['flows', 'flows 2', 'flows 3'])
  })

  it('describes a block by its first comment, else by the path', () => {
    expect(file("@startuml\n' Checkout steps\nA -> B\n@enduml")[0].description).toBe('Shared · Checkout steps')
    expect(file('@startuml\n@enduml', 'Templates/retro.puml', 'yours')[0].description).toBe('Yours · Templates/retro.puml')
  })

  it('falls back to the path for a bare comment', () => {
    expect(file("@startuml\n'\nA -> B\n@enduml")[0].description).toBe('Shared · Templates/flows.puml')
  })

  it('gives nothing for a file with no block, or a block never closed', () => {
    expect(file('A -> B')).toEqual([])
    expect(file('@startuml\nA -> B')).toEqual([])
  })

  it('drops an unclosed block before a closed one, and keeps the closed', () => {
    expect(titles(file('@startuml Lost\nA -> B\n@startuml Kept\n@enduml'))).toEqual(['Kept'])
  })

  it('takes a multi-page block as one', () => {
    expect(file('@startuml\nA\nnewpage\nB\n@enduml')).toHaveLength(1)
  })

  it('leaves out a type Add diagram does not list', () => {
    expect(file('@startdef\n!define A\n@enddef')).toEqual([])
  })
})

describe('arrange', () => {
  it('puts the built-ins first, then shared, then yours, each by title', () => {
    const files = fromFiles([
      { source: 'yours', path: 'Templates/b.puml', text: '@startuml Aaa\n@enduml' },
      { source: 'shared', path: 'Templates/a.puml', text: '@startuml Beta\n@enduml\n@startuml Alpha\n@enduml' },
    ])
    const uml = arrange(builtins(OWN), files).get('uml')
    expect(titles(uml).slice(-3)).toEqual(['Alpha', 'Beta', 'Aaa'])
    expect(uml[0].title).toBe('Empty')
  })

  it('keys every type, in A6\'s order', () => {
    const keys = [...arrange(builtins(OWN), []).keys()]
    expect(keys).toHaveLength(27)
    expect(keys[0]).toBe('uml')
    expect(keys.at(-1)).toBe('packetdiag')
  })
})

describe('matching', () => {
  const arranged = arrange(builtins(OWN), [])

  it('finds a type by its name, word, @start word or a template\'s title', () => {
    expect(matching(arranged, 'mind')).toEqual(['mindmap'])
    expect(matching(arranged, '@startgantt')).toEqual(['gantt'])
    expect(matching(arranged, 'SEQ')).toEqual(['uml'])
  })

  it('keeps every type for a blank search', () => {
    expect(matching(arranged, '  ')).toHaveLength(27)
  })
})
