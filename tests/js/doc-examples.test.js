/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it, vi } from 'vitest'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
const { sourceOf } = await import('../../scripts/doc-examples.mjs')

describe('doc-examples sourceOf', () => {
  it('importing the script makes no network call', () => {
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('wraps a function fragment in a message line', () => {
    expect(sourceOf('function:%upper', '%upper("a")')).toBe('@startuml\nAlice -> Bob : %upper("a")\n@enduml')
  })

  it('wraps a one-line tag fragment in a message line', () => {
    expect(sourceOf('tag:b', '<b>bold</b>')).toBe('@startuml\nA -> B : <b>bold</b>\n@enduml')
  })

  it('leaves a tag example with a line break as it is', () => {
    expect(sourceOf('tag:ul', '* one\n* two')).toBe('@startuml\n* one\n* two\n@enduml')
  })

  it('wraps a bare style property in a style block with an element', () => {
    expect(sourceOf('property:BackGroundColor', 'BackGroundColor red')).toBe(
      '@startuml\n<style>\nnode {\n  BackGroundColor red\n}\n</style>\nnode Web\n@enduml')
  })

  it('does not treat a replacement pattern in a property as one', () => {
    expect(sourceOf('property:x', "a$&b").includes('  a$&b\n')).toBe(true)
  })

  it('passes an example that starts a diagram through', () => {
    const example = '@startgantt\n[A] lasts 2 days\n@endgantt'
    expect(sourceOf('diagram:gantt', example)).toBe(example)
  })

  it('wraps a keyword:x@gantt example in its own type', () => {
    expect(sourceOf('keyword:lasts@gantt', '[A] lasts 2 days')).toBe('@startgantt\n[A] lasts 2 days\n@endgantt')
  })
})
