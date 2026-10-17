// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { appendBlock, named, takenNames, uniqueName } from '../../src/editor/add/insert.js'
import { scan } from '../../src/editor/blocks.js'

const apply = (doc, c) => doc.slice(0, c.from) + c.insert + doc.slice(c.to)

describe('takenNames', () => {
  it('holds each block\'s name, and an unnamed block\'s type, as the tabs read', () => {
    expect(takenNames(scan('@startuml\n@enduml\n@startgantt plan\n@endgantt'))).toEqual(new Set(['uml', 'plan']))
  })
})

describe('a name the file already has', () => {
  const taken = (doc) => takenNames(scan(doc))

  it('makes Empty uml, added to an unnamed @startuml, uml-2', () => {
    expect(uniqueName('uml', taken('@startuml\n@enduml'))).toBe('uml-2')
  })

  it('makes class-diagram added twice class-diagram-2', () => {
    const block = '@startuml(id=L)\n@enduml'
    let doc = ''
    for (const expected of ['class-diagram', 'class-diagram-2']) {
      const name = uniqueName('class-diagram', taken(doc))
      expect(name).toBe(expected)
      doc = apply(doc, appendBlock(doc, named(block, name)))
    }
    expect(doc).toBe('@startuml class-diagram\n@enduml\n\n@startuml class-diagram-2\n@enduml')
  })
})

describe('uniqueName', () => {
  it('keeps a name the file does not have', () => {
    expect(uniqueName('class-diagram', new Set(['nodes']))).toBe('class-diagram')
  })

  it('numbers a taken one from -2', () => {
    expect(uniqueName('gantt', new Set(['gantt']))).toBe('gantt-2')
    expect(uniqueName('gantt', new Set(['gantt', 'gantt-2']))).toBe('gantt-3')
  })
})

describe('named', () => {
  it('writes the name on the @start line', () => {
    expect(named('@startuml\nA\n@enduml', 'class-diagram')).toBe('@startuml class-diagram\nA\n@enduml')
  })

  it('replaces the name the line had', () => {
    expect(named('@startuml Old\n@enduml', 'New')).toBe('@startuml New\n@enduml')
  })

  it('drops an id, which a second copy would duplicate, and keeps other arguments', () => {
    expect(named('@startuml(id=L) Old\n@enduml', 'New')).toBe('@startuml New\n@enduml')
    expect(named('@startuml( id = L )\n@enduml', 'New')).toBe('@startuml New\n@enduml')
    expect(named('@startditaa(--no-shadows)\n@endditaa', 'box')).toBe('@startditaa(--no-shadows) box\n@endditaa')
  })

  it('drops what a name cannot hold', () => {
    expect(named('@startuml\n@enduml', '"a {b}"')).toBe('@startuml a b\n@enduml')
  })
})

describe('appendBlock', () => {
  const block = '@startgantt gantt\n\n@endgantt'

  it('leaves exactly one blank line after the last text', () => {
    const doc = '@startuml\nA\n@enduml'
    const c = appendBlock(doc, block)
    const after = apply(doc, c)
    expect(after).toBe('@startuml\nA\n@enduml\n\n@startgantt gantt\n\n@endgantt')
    expect(after.slice(c.start).startsWith('@startgantt gantt\n')).toBe(true)
    expect(after.slice(0, c.cursor).split('\n')).toHaveLength(6)
  })

  it('trims blank lines at the end to that one, keeping the file\'s final newline', () => {
    const doc = '@startuml\nA\n@enduml\n\n\n  \n'
    expect(apply(doc, appendBlock(doc, block))).toBe('@startuml\nA\n@enduml\n\n@startgantt gantt\n\n@endgantt\n')
  })

  it('keeps a final newline the file had, and adds none it did not', () => {
    expect(apply('@enduml\n', appendBlock('@enduml\n', block)).endsWith('@endgantt\n')).toBe(true)
    expect(apply('@enduml', appendBlock('@enduml', block)).endsWith('@endgantt')).toBe(true)
  })

  it('gives an empty file the block alone', () => {
    for (const doc of ['', '\n\n']) {
      const c = appendBlock(doc, block)
      expect(apply(doc, c)).toBe(block)
      expect(c.start).toBe(0)
      expect(c.cursor).toBe('@startgantt gantt\n'.length)
    }
  })
})

describe('line endings and separators', () => {
  it('reads a CRLF template as \\n lines', () => {
    expect(named('@startuml(id=L)\r\nA\r\n@enduml\r\n', 'x')).toBe('@startuml x\nA\n@enduml\n')
    expect(apply('@enduml', appendBlock('@enduml', '@startuml\r\n@enduml'))).toBe('@enduml\n\n@startuml\n@enduml')
  })

  it('names a start line holding U+2028 without throwing', () => {
    expect(named('@startuml a\u2028b\n@enduml', 'x')).toBe('@startuml x\n@enduml')
  })

  it('returns a block with no start line unchanged', () => {
    expect(named('A\n@enduml', 'x')).toBe('A\n@enduml')
  })

  it('counts a last line of only U+2028 or NBSP as text, not blank', () => {
    for (const mark of ['\u2028', '\u00a0']) {
      const doc = `@enduml\n${mark}\n`
      expect(apply(doc, appendBlock(doc, '@startuml\n@enduml'))).toBe(`@enduml\n${mark}\n\n@startuml\n@enduml\n`)
    }
  })
})
