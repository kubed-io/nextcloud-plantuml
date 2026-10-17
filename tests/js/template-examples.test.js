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
    expect(sources({}, own, [{ type: 'gantt' }, { type: 'git' }])).toEqual([{ key: 'example:gantt', source: '@startgantt\n[A] lasts 1 day\n@endgantt' }])
  })
})
