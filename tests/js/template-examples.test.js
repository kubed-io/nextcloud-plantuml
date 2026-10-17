/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it, vi } from 'vitest'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
const { sources } = await import('../../scripts/template-examples.mjs')

describe('template-examples', () => {
  it('importing the script makes no network call', () => {
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('names each built-in by its type and title, sent as written', () => {
    const list = sources({ uml: [{ title: 'Class', text: '@startuml\nclass A\n@enduml' }] }, {}, [])
    expect(list).toEqual([{ key: 'uml:Class', source: '@startuml\nclass A\n@enduml' }])
  })

  it('adds each listed type\'s Example, and no other own.json entry', () => {
    const own = {
      'diagram:gantt': { example: '@startgantt\n[A] lasts 1 day\n@endgantt' },
      'diagram:def': { example: '@startdef\n!define A\n@enddef' },
      'keyword:as': { example: 'A as B' },
    }
    expect(sources({}, own, [{ type: 'gantt' }])).toEqual([{ key: 'example:gantt', type: 'gantt', source: '@startgantt\n[A] lasts 1 day\n@endgantt' }])
  })

  it('keeps a type with no Example, without a source, so the run can fail on it', () => {
    expect(sources({}, {}, [{ type: 'git' }])).toEqual([{ key: 'example:git', type: 'git', source: undefined }])
  })

  it('draws the 9 built-ins and the 27 Examples, every one with a source', async () => {
    const { readData } = await import('../../scripts/lib.mjs')
    const { TYPES } = await import('../../src/editor/add/types.js')
    const list = sources(await readData('data/templates.json'), await readData('data/docs/own.json'), TYPES)
    expect(list).toHaveLength(36)
    expect(list.filter(({ source }) => !source)).toEqual([])
  })
})
