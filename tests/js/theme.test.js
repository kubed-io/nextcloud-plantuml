// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The source pane follows Nextcloud's theme: every colour is a theme variable,
// so a dark theme never gets CodeMirror's dark-on-white defaults.
import { describe, expect, it } from 'vitest'
import { highlightTree, tags } from '@lezer/highlight'
import { highlightStyle, surfaceRules } from '../../src/editor/theme.js'
import { plantumlLanguage, underline } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import styleProfile from '../../src/editor/profiles/style.js'

const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/i

describe('the editor highlight style', () => {
  const styled = highlightStyle.specs.flatMap((spec) => spec.tag)

  it('colours every token the PlantUML mode emits', () => {
    for (const tag of [tags.meta, tags.keyword, tags.string, tags.operator, tags.comment, tags.labelName, tags.heading, tags.color, tags.attributeName, tags.link, tags.tagName, tags.punctuation]) {
      expect(styled).toContain(tag)
    }
  })

  // The names CodeMirror's legacy modes emit, as a nested profile's mode would.
  it.each(['atom', 'number', 'property', 'def', 'variable-2', 'meta', 'string', 'keyword', 'comment'])('colours a nested mode\'s %s token', (name) => {
    const inner = { token: (stream) => { stream.skipToEnd(); return name } }
    const tree = plantumlLanguage({ yaml: inner }).parser.parse('@startyaml\nx\n@endyaml')
    const styled = []
    highlightTree(tree, highlightStyle, (from, to) => styled.push([from, to]))
    expect(styled).toContainEqual([11, 12])
  })

  it('colours every token the style profile\'s mode emits', () => {
    const doc = '<style>\n.server node {\n  FontSize 2; LineColor red\n}\n</style>'
    const tree = plantumlLanguage({ style: styleProfile({ scan }).mode }).parser.parse(doc)
    const styled = []
    highlightTree(tree, highlightStyle, (from, to) => styled.push([from, to]))
    for (const word of ['.server', 'node', '{', 'FontSize', '2', ';', 'LineColor', 'red', '}']) {
      const from = doc.indexOf(word, '<style>'.length)
      expect(styled, word).toContainEqual([from, from + word.length])
    }
  })

  // Dr K: `<style …>` read as a comment. Tags take the one hue left, maroon.
  it('colours tags maroon, apart from comments and punctuation', () => {
    const colour = (tag) => highlightStyle.specs.find((spec) => [spec.tag].flat().includes(tag))?.color
    expect(colour(tags.tagName)).toBe('color-mix(in srgb, var(--color-element-error) 75%, var(--color-main-text))')
    expect(colour(tags.tagName)).not.toBe(colour(tags.comment))
    expect(colour(tags.tagName)).not.toBe(colour(tags.punctuation))
  })

  // They modify the text they sit in, a label's violet included, so they set no colour.
  it('marks bold, italic, monospace and underline Creole by the font alone', () => {
    for (const tag of [tags.strong, tags.emphasis, tags.monospace, underline]) {
      const spec = highlightStyle.specs.find((candidate) => candidate.tag === tag)
      expect(spec, String(tag)).toBeDefined()
      expect(spec.color).toBeUndefined()
    }
  })

  it('takes every colour from Nextcloud theme variables, never a literal', () => {
    for (const spec of highlightStyle.specs) {
      const colours = Object.entries(spec).filter(([property]) => /color|background|decoration/i.test(property))
      if (spec.color === undefined) {
        expect([tags.strong, tags.emphasis, tags.monospace, underline]).toContain(spec.tag)
      } else {
        expect(spec.color).toMatch(/var\(--color-[a-z-]+\)/)
      }
      for (const [property, value] of colours) {
        expect(value, property).not.toMatch(LITERAL)
      }
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
    ['the fold chevrons and the folded placeholder', ['.cm-foldGutter span', '.cm-foldGutter span:hover', '.cm-foldPlaceholder']],
    ['snippet fields and a disabled popup', ['.cm-snippetField', '.cm-snippetFieldPosition', '.cm-tooltip-autocomplete-disabled']],
    ["the colour picker's swatch and its input", ['span[data-color]', 'span[data-color] input[type="color"]']],
    ["the value chooser and stepper, their hover included", ['.cm-plantuml-chooser', '.cm-plantuml-chooser:hover', '.cm-plantuml-stepper', '.cm-plantuml-stepper button:hover']],
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
