// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The source pane follows Nextcloud's theme: every colour is a theme variable,
// so a dark theme never gets CodeMirror's dark-on-white defaults.
import { describe, expect, it } from 'vitest'
import { tags } from '@lezer/highlight'
import { highlightStyle } from '../../src/editor/theme.js'

describe('the editor highlight style', () => {
  it('colours every token the PlantUML mode emits', () => {
    const styled = highlightStyle.specs.map((spec) => spec.tag)
    for (const tag of [tags.meta, tags.keyword, tags.string, tags.operator, tags.comment]) {
      expect(styled).toContain(tag)
    }
  })

  it('takes every colour from Nextcloud theme variables, never a literal', () => {
    for (const spec of highlightStyle.specs) {
      expect(spec.color).toMatch(/var\(--color-[a-z-]+\)/)
      expect(spec.color).not.toMatch(/#|rgba?\(|hsla?\(/)
    }
  })
})
