// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The source pane follows Nextcloud's theme: every colour is a theme variable,
// so a dark theme never gets CodeMirror's dark-on-white defaults.
import { describe, expect, it } from 'vitest'
import { tags } from '@lezer/highlight'
import { highlightStyle, surfaceRules } from '../../src/editor/theme.js'

const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/i

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
      expect(spec.color).not.toMatch(LITERAL)
    }
  })
})

describe('the editor surface', () => {
  const declarations = Object.entries(surfaceRules)
    .flatMap(([selector, rule]) => Object.entries(rule).map(([property, value]) => [selector, property, value]))

  it.each([
    ['the completion popup, its selected option, kinds and info', ['.cm-tooltip-autocomplete', 'li[aria-selected]', '.cm-completionIcon-keyword', '.cm-completionInfo']],
    ['the active line and the matched bracket', ['.cm-activeLine', '.cm-activeLineGutter', '.cm-matchingBracket']],
    ['the search panel and its matches', ['.cm-panels', '.cm-search', '.cm-searchMatch', '.cm-selectionMatch']],
    ["the search panel's field and buttons", ['.cm-textfield', '.cm-button', '.cm-button:active', '[name=close]']],
    ['snippet fields and a disabled popup', ['.cm-snippetField', '.cm-snippetFieldPosition', '.cm-tooltip-autocomplete-disabled']],
    ['the diagnostics: underline, gutter mark, tooltip and panel', ['.cm-lintRange-error', '.cm-lintRange-warning', '.cm-lintRange-info', '.cm-lintPoint-warning', '.cm-lint-marker-error', '.cm-lint-marker-warning', '.cm-diagnostic-warning', '.cm-diagnosticAction', '.cm-panel-lint']],
  ])('styles %s', (_what, parts) => {
    const selectors = Object.keys(surfaceRules).join('\n')
    for (const part of parts) {
      expect(selectors).toContain(part)
    }
  })

  it('takes every colour from Nextcloud theme variables, never a literal', () => {
    const coloured = declarations.filter(([, property]) => /color|background|shadow|outline|^border(?!Radius)/i.test(property))
    expect(coloured.length).toBeGreaterThan(0)
    for (const [selector, property, value] of coloured) {
      expect(value, `${selector} ${property}`).not.toMatch(LITERAL)
      if (!/^(?:transparent|none|inherit|0)$/.test(value)) {
        expect(value, `${selector} ${property}`).toMatch(/var\(--[a-z-]+/)
      }
    }
  })
})
