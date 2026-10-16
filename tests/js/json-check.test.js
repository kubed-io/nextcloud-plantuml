// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// T10: `@startjson` is checked as PlantUML 1.2026.8's own reader reads it. The probes are
// the 53 files the live server was asked about; `verdicts.txt` is what it answered.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { checkJson, jsonLines } from '../../src/editor/profiles/json-check.js'
import { jsonLint } from '../../src/editor/lint/json.js'
import { scan } from '../../src/editor/blocks.js'

const dir = new URL('./fixtures/json-probes/', import.meta.url)
const verdicts = readFileSync(new URL('verdicts.txt', dir), 'utf8').trim().split('\n').map((line) => line.split(' '))
const lint = jsonLint({ scan })
const found = (doc) => lint(EditorState.create({ doc }))

describe('the reader', () => {
  it('has the 53 probes', () => {
    expect(verdicts).toHaveLength(53)
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
})
