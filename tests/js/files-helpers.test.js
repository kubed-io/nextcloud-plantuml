// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { APP_ID, MIMETYPE, isDiagram } from '../../src/files-helpers.js'

describe('files-helpers', () => {
  it('names the app', () => {
    expect(APP_ID).toBe('plantuml')
  })

  it('recognises a diagram file by its mimetype', () => {
    expect(isDiagram({ mime: MIMETYPE })).toBe(true)
    expect(isDiagram({ mime: 'text/plain' })).toBe(false)
    expect(isDiagram(undefined)).toBe(false)
  })
})
