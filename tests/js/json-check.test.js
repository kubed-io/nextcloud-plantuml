// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// T10: `@startjson` is checked as PlantUML 1.2026.8's own reader reads it. The probes are
// the 55 files the live server was asked about; `verdicts.txt` is what it answered.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { checkJson, jsonLines } from '../../src/editor/profiles/json-check.js'
import { jsonLint } from '../../src/editor/lint/json.js'
import { scan } from '../../src/editor/blocks.js'
import { subDiagramsOf } from '../../src/editor/sub-diagrams.js'

const dir = new URL('./fixtures/json-probes/', import.meta.url)
const verdicts = readFileSync(new URL('verdicts.txt', dir), 'utf8').trim().split('\n').map((line) => line.split(' '))
const lint = jsonLint({ scan, subDiagrams: subDiagramsOf })
const found = (doc) => lint(EditorState.create({ doc }))

describe('the reader', () => {
  it('has the 55 probes', () => {
    expect(verdicts).toHaveLength(55)
  })

  for (const [name, verdict] of verdicts) {
    it(`${name}: ${verdict}`, () => {
      const lines = readFileSync(new URL(`${name}.puml`, dir), 'utf8').split('\n').slice(1, -2)

      expect(checkJson(jsonLines(lines).join('\n') + '\n') === null).toBe(verdict === 'ACCEPT')
    })
  }

  it('blanks the lines it drops and never removes one', () => {
    const lines = ['title x', '', "' c", '{', '#highlight "a"', '"a": 1', '}']

    expect(jsonLines(lines)).toEqual(['', '', '', '{', '', '"a": 1', '}'])
  })
})

describe('the nesting limit', () => {
  const nest = (n) => '['.repeat(n) + ']'.repeat(n)

  it('accepts 1000 levels', () => {
    expect(checkJson(nest(1000))).toBeNull()
    expect(checkJson('{"a":'.repeat(1000) + '1' + '}'.repeat(1000))).toBeNull()
  })

  it('refuses 1001, where the reader stands after the bracket', () => {
    expect(checkJson(nest(1001))).toEqual({ message: 'Nesting too deep', offset: 1001 })
  })

  it('answers 100000 without throwing', () => {
    expect(checkJson(nest(100000))).toMatchObject({ message: 'Nesting too deep' })
    expect(checkJson('['.repeat(100000))).toMatchObject({ message: 'Nesting too deep' })
  })
})

describe('the lint', () => {
  it('marks Expected \':\' from the 1', () => {
    const doc = '@startjson\n{"a" 1}\n@endjson\n'
    const at = doc.indexOf('1}')

    expect(found(doc)).toEqual([{ from: at, to: at + 2, severity: 'error', message: "Expected ':'" }])
  })

  it('marks Expected name at the }', () => {
    const doc = '@startjson\n{"a": 1,}\n@endjson\n'
    const at = doc.indexOf('}')

    expect(found(doc)).toEqual([{ from: at, to: at + 1, severity: 'error', message: 'Expected name' }])
  })

  it('marks Unexpected end of input on the last line with data, from its last character', () => {
    const doc = '@startjson\n{\n"a": 1\n@endjson\n'
    const end = doc.indexOf('\n@endjson')

    expect(found(doc)).toEqual([{ from: end - 1, to: end, severity: 'error', message: 'Unexpected end of input' }])
  })

  it('leaves title, style and #highlight lines alone', () => {
    const doc = '@startjson\ntitle x\n{"a": 1}\n<style>\njson {\n  BackGroundColor red\n}\n</style>\n#highlight "a"\n@endjson\n'

    expect(found(doc)).toEqual([])
  })

  it('skips a skinparam block to its closing brace, and still marks an error after it', () => {
    for (const head of ['skinparam {', 'skinparam json {']) {
      const doc = `@startjson\n${head}\nBackgroundColor red\n}\n{"a": 1}\n@endjson\n`
      expect(found(doc)).toEqual([])
      const bad = `@startjson\n${head}\nBackgroundColor red\n}\n{"a" 1}\n@endjson\n`
      const at = bad.indexOf('1}')
      expect(found(bad)).toEqual([{ from: at, to: at + 2, severity: 'error', message: "Expected ':'" }])
    }
  })

  it('marks a title after the second data line, which the server reads as JSON', () => {
    const doc = '@startjson\n{\n"a": 1,\n"b": 2,\ntitle x\n}\n@endjson\n'
    const at = doc.indexOf('title x')
    const result = found(doc)

    expect(result).toHaveLength(1)
    expect(result[0].from).toBe(at)
    expect(result[0].to).toBe(at + 'title x'.length)
  })

  it('never checks a uml block', () => {
    expect(found('@startuml\n{\n@enduml\n')).toEqual([])
  })

  it('puts a second block\'s error in that block', () => {
    const doc = '@startjson\n{"a": 1}\n@endjson\n@startjson\n{"a" 1}\n@endjson\n'
    const result = found(doc)

    expect(result).toHaveLength(1)
    expect(result[0].from).toBe(doc.lastIndexOf('1}'))
  })

  it('marks a raw newline in a string on the last character of its line', () => {
    const doc = '@startjson\n{"a":"x\ny"}\n@endjson\n'
    const end = doc.indexOf('\ny')

    expect(found(doc)).toEqual([{ from: end - 1, to: end, severity: 'error', message: 'Expected valid string character' }])
  })

  it('maps an error below a style block, a comment and a title to its own line and column', () => {
    const doc = "@startjson\ntitle x\n<style>\njson {\n}\n</style>\n/' a\nb '/\n{\n  \"a\" 1\n}\n@endjson\n"
    const at = doc.indexOf('1\n}')

    expect(found(doc)).toEqual([{ from: at, to: at + 1, severity: 'error', message: "Expected ':'" }])
  })
})

describe('the lint of a {{json sub-diagram', () => {
  const note = (body) => `@startuml\nnote right\n  {{json\n${body}\n  }}\nend note\n@enduml\n`

  it('marks Expected \':\' from the 1, the two spaces counted', () => {
    const doc = note('  {"a" 1}')
    const at = doc.indexOf('1}')

    expect(found(doc)).toEqual([{ from: at, to: at + 2, severity: 'error', message: "Expected ':'" }])
  })

  it('leaves valid JSON alone', () => {
    expect(found(note('  {"a": 1}'))).toEqual([])
  })

  it('leaves an indented #highlight alone', () => {
    expect(found(note('  #highlight "a"\n  {"a": 1}'))).toEqual([])
  })

  // The server (1.2026.8) cuts a line's spaces and tabs only, and draws each of these as checked here.
  it('cuts tabs and mixed indentation as the server does, the cut counted in the column', () => {
    for (const indent of ['\t', ' \t ']) {
      expect(found(note(`${indent}{"a": 1}`)), JSON.stringify(indent)).toEqual([])
      const doc = note(`${indent}{"a" 1}`)
      const at = doc.indexOf('1}')
      expect(found(doc), JSON.stringify(indent)).toEqual([{ from: at, to: at + 2, severity: 'error', message: "Expected ':'" }])
    }
  })

  it('keeps a no-break space, which the server reads as data and refuses (Final review 4)', () => {
    const doc = note(' {"a": 1}')
    const at = doc.indexOf(' ')
    const result = found(doc)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ from: at, to: doc.indexOf('\n', at), severity: 'error' })
  })

  it('marks Unexpected end of input on its last line with data, from its last character', () => {
    const doc = note('  {\n  "a": 1')
    const end = doc.indexOf('\n  }}')

    expect(found(doc)).toEqual([{ from: end - 1, to: end, severity: 'error', message: 'Unexpected end of input' }])
  })

  it('marks a raw newline in a string on the last character of its line', () => {
    const doc = note('  {"a":"x\n  y"}')
    const end = doc.indexOf('\n  y')

    expect(found(doc)).toEqual([{ from: end - 1, to: end, severity: 'error', message: 'Expected valid string character' }])
  })

  it('does not check one in a /\' … \'/ comment, which the server drops (Final review 2)', () => {
    expect(found("@startuml\n/'\nnote right\n  {{json\n  {\"a\" 1}\n  }}\nend note\n'/\nA -> B\n@enduml\n")).toEqual([])
    // A one-line comment closes on its line: the sub-diagram after it is checked.
    const doc = "@startuml\n/' x '/\nnote right\n  {{json\n  {\"a\" 1}\n  }}\nend note\n@enduml\n"
    expect(found(doc)).toHaveLength(1)
  })

  it('does not check a {{json left open', () => {
    expect(found('@startuml\nnote right\n  {{json\n  {"a" 1}\nend note\n@enduml\n')).toEqual([])
  })

  it('does not check one outside a uml diagram', () => {
    expect(found('@startmindmap\n{{json\n{"a" 1}\n}}\n@endmindmap\n')).toEqual([])
  })
})
