// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The source pane follows Nextcloud's theme: every colour is a theme variable,
// so a dark theme never gets CodeMirror's dark-on-white defaults.
import { describe, expect, it } from 'vitest'
import { highlightTree, tags } from '@lezer/highlight'
import { highlightStyle, surfaceRules } from '../../src/editor/theme.js'
import { plantumlLanguage, spriteData, underline, variable } from '../../src/editor/plantuml-mode.js'
import { diagramName, date, linkOperator, quantifier, inactive } from '../../src/editor/lexicon/tags.js'
import { scan } from '../../src/editor/blocks.js'
import styleProfile from '../../src/editor/profiles/style.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'

const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black)\b/i

// The palette's mixes (H11, X7), as the theme must spell them.
const MOSS = 'color-mix(in srgb, color-mix(in srgb, var(--color-element-success) 55%, var(--color-element-warning)) 72%, var(--color-main-text))'
const SLATE = 'color-mix(in srgb, var(--color-primary-element) 55%, var(--color-main-text))'
const ORANGE = 'color-mix(in srgb, color-mix(in srgb, var(--color-element-warning) 75%, var(--color-element-error)) 75%, var(--color-main-text))'
const GREEN = 'color-mix(in srgb, var(--color-element-success) 75%, var(--color-main-text))'
const MAROON = 'color-mix(in srgb, var(--color-element-error) 75%, var(--color-main-text))'
const OCHRE = 'color-mix(in srgb, var(--color-favorite) 55%, var(--color-text-maxcontrast))'

/** The colour each word of `doc` is drawn in, found by the class the highlighter gives it. */
function colours(doc, profiles) {
  const out = {}
  // A rule's first tag stands for it: the highlighter's class belongs to the whole rule.
  const classes = new Map(highlightStyle.specs.map((spec) => [highlightStyle.style([[spec.tag].flat()[0]]), spec.color]))
  highlightTree(plantumlLanguage(profiles).parser.parse(doc), highlightStyle, (from, to, cls) => {
    out[doc.slice(from, to)] = classes.get(cls)
  })
  return out
}

describe('the editor highlight style', () => {
  const styled = highlightStyle.specs.flatMap((spec) => spec.tag)

  it('colours every token the PlantUML mode emits', () => {
    for (const tag of [tags.meta, tags.keyword, tags.string, tags.operator, tags.comment, tags.labelName, tags.heading, tags.color, tags.attributeName, tags.link, tags.tagName, tags.punctuation, spriteData, variable, tags.function(tags.variableName)]) {
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
        expect([tags.strong, tags.emphasis, tags.monospace, underline, diagramName]).toContain(spec.tag)
      } else {
        expect(spec.color).toMatch(/var\(--color-[a-z-]+\)/)
      }
      for (const [property, value] of colours) {
        expect(value, property).not.toMatch(LITERAL)
      }
    }
  })
})

// Y1-Y38: the looks of the dictionary's new categories.
describe('the looks of the dictionary', () => {
  const rule = (tag) => highlightStyle.specs.find((spec) => [spec.tag].flat().includes(tag))
  const AMBER = 'color-mix(in srgb, var(--color-element-warning) 75%, var(--color-main-text))'
  const LINK = 'color-mix(in srgb, var(--color-primary-element) 75%, var(--color-main-text))'

  it('draws a stereotype in the attribute orange, plain', () => {
    expect(rule(tags.annotation)).toMatchObject({ color: ORANGE, fontStyle: 'normal', fontWeight: 'normal' })
  })

  it('draws a list marker in amber', () => {
    expect(rule(tags.list).color).toBe(AMBER)
  })

  it('draws every bracket shape in grey, bold', () => {
    expect(rule(tags.bracket)).toMatchObject({ color: 'var(--color-text-maxcontrast)', fontWeight: 'bold' })
    for (const tag of [tags.paren, tags.squareBracket, tags.brace, tags.angleBracket]) {
      expect(highlightStyle.style([tag])).toBe(highlightStyle.style([tags.bracket]))
    }
  })

  it('draws an assignment grey and a logical operator amber, bold', () => {
    expect(rule(tags.definitionOperator).color).toBe('var(--color-text-maxcontrast)')
    expect(rule(tags.logicOperator)).toMatchObject({ color: AMBER, fontWeight: 'bold' })
  })

  it('draws an escape in the ochre', () => {
    expect(rule(tags.escape).color).toBe(OCHRE)
  })

  it('underlines a diagram name and sets no colour', () => {
    const spec = rule(diagramName)
    expect(spec.textDecoration).toBe('underline')
    expect(spec.color).toBeUndefined()
  })

  it('draws a url in the link colour, not underlined', () => {
    const spec = rule(tags.url)
    expect(spec.color).toBe(LINK)
    expect(spec.textDecoration).toBeUndefined()
  })

  it('draws an inactive body grey, plain', () => {
    expect(rule(inactive)).toMatchObject({ color: 'var(--color-text-maxcontrast)', fontStyle: 'normal' })
  })

  it.each([
    ['date', date, tags.number], ['linkOperator', linkOperator, tags.operator], ['quantifier', quantifier, tags.operator],
    ['arithmeticOperator', tags.arithmeticOperator, tags.operator], ['compareOperator', tags.compareOperator, tags.operator],
    ['separator', tags.separator, tags.punctuation], ['modifier', tags.modifier, tags.keyword],
  ])('gives %s no rule of its own, so it takes its parent\'s', (_name, tag, parent) => {
    expect(rule(tag)).toBeUndefined()
    expect(highlightStyle.style([tag])).toBe(highlightStyle.style([parent]))
  })
})

// H11: a style block has colours of its own; nothing else may move with them.
describe('the colours of a style block', () => {

  const style = { style: styleProfile({ scan }).mode }
  const sheet = colours('<style>\n.server mindmapDiagram {\n  node:depth(1) { BackgroundColor #FFF3B0; FontSize 14; FontStyle bold }\n  arrow { LineColor red }\n}\n</style>', style)

  it('draws selectors in moss, property names in slate and every value in the string green', () => {
    for (const word of ['mindmapDiagram', 'node', 'arrow']) {
      expect(sheet[word], word).toBe(MOSS)
    }
    expect(sheet.BackgroundColor).toBe(SLATE)
    expect(sheet.FontSize).toBe(SLATE)
    for (const word of ['14', 'bold']) {
      expect(sheet[word], word).toBe(GREEN)
    }
  })

  it('draws .class and :depth(n) in the attribute orange, and a colour as a swatch value', () => {
    expect(sheet['.server']).toBe(ORANGE)
    expect(sheet[':depth(1)']).toBe(ORANGE)
    expect(sheet['#FFF3B0']).toBe(GREEN)
  })

  it('keeps <style> and <b> maroon, and tag attributes the attribute orange', () => {
    const plain = colours('@startuml\n<style>\n</style>\nA -> B : <b>x</b> <font color=red>y</font>\n@enduml', style)
    expect(plain['<style>']).toBe(MAROON)
    expect(plain['<b>']).toBe(MAROON)
    expect(plain.color).toBe(ORANGE)
  })

  it('leaves a YAML block as it was: keys green, numbers info blue, list markers the directive blue', () => {
    const yaml = colours('@startyaml\nkey: value\ncount: 5\n- item\n@endyaml', { yaml: yamlProfile({ scan }).mode })
    expect(yaml.key).toBe(GREEN)
    expect(yaml['5']).toBe('var(--color-info-text)')
    expect(yaml['- ']).toBe('var(--color-primary-element)')
  })

  it('keeps arrows on their own warning colour', () => {
    const arrow = highlightStyle.specs.find((spec) => [spec.tag].flat().includes(tags.operator))
    expect(arrow.color).toBe('color-mix(in srgb, var(--color-element-warning) 75%, var(--color-main-text))')
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

// X7: a preprocessor line's directive keeps its bold blue; its names are coloured as editors colour them.
describe('the colours of the preprocessor', () => {
  const pre = colours('!procedure $ask($to)\n  A -> $to : $ask(1)\n!endprocedure\n!if %strlen("a") > 3\n!endif', {})

  it('draws variables in slate and functions, declared, called or built in, in the muted ochre', () => {
    expect(pre.$to).toBe(SLATE)
    expect(pre.$ask).toBe(OCHRE)
    expect(pre['%strlen']).toBe(OCHRE)
  })

  it('keeps the directive word bold blue, strings green and numbers info blue', () => {
    const directive = highlightStyle.specs.find((spec) => [spec.tag].flat().includes(tags.meta))
    expect(directive.fontWeight).toBe('bold')
    for (const word of ['!procedure', '!endprocedure', '!if', '!endif']) {
      expect(pre[word], word).toBe('var(--color-primary-element)')
    }
    expect(pre['"a"']).toBe(GREEN)
    expect(pre['3']).toBe('var(--color-info-text)')
  })

  // A YAML anchor and alias are the legacy `variable`; the slate is the preprocessor's alone.
  it('leaves a YAML anchor and alias uncoloured, as they were', () => {
    const yaml = colours('@startyaml\na: &x 1\nb: *x\n@endyaml', { yaml: yamlProfile({ scan }).mode })
    expect(yaml['&x']).toBeUndefined()
    expect(yaml['*x']).toBeUndefined()
  })
})
