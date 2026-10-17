// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Where the push bundle is fetched from: beside the editor, under its query,
// with a key for the bundle's own content.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('pushUrl', () => {
  it('sits beside the editor, keeps its query and adds the bundle hash', async () => {
    vi.stubGlobal('__PLANTUML_PUSH_HASH__', 'abc123def456')
    const { pushUrl } = await import('../../src/editor/push.js')

    expect(pushUrl('https://cloud.test/apps/plantuml/dist/plantuml-editor.js?v=1.2&h=eeee'))
      .toBe('https://cloud.test/apps/plantuml/dist/plantuml-push.js?v=1.2&h=eeee&p=abc123def456')
  })

  it('has no key to add when built without one', async () => {
    vi.stubGlobal('__PLANTUML_PUSH_HASH__', '')
    const { pushUrl } = await import('../../src/editor/push.js')

    expect(pushUrl('https://cloud.test/dist/plantuml-editor.js')).toBe('https://cloud.test/dist/plantuml-push.js')
  })
})
