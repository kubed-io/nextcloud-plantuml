// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The links to plantuml.com's sections: the page reader and the key builder run
// on a small hand-written page in the site's markup, never the network.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildLinks, headingWords, linkFor, pageTitle, quotedHeads, sectionsOf, tagWords } from '../../scripts/doclinks.mjs'
import links from '../../src/editor/data/docs/links.json'

const html = readFileSync(new URL('./fixtures/doclinks/page.html', import.meta.url), 'utf8')
const sections = sectionsOf(html)

describe('sectionsOf', () => {
  it('reads each heading with its anchor, level and code', () => {
    expect(sections.map(({ anchor, title, level }) => ({ anchor, title, level }))).toEqual([
      { anchor: 'f40a89533e778bb5', title: 'Sample Page', level: 1 },
      { anchor: 'c8d20ebb1cbc2253', title: 'First Section', level: 2 },
      { anchor: '3b6d1ebcab5b3aa9', title: 'Second Section', level: 2 },
      { anchor: '08651da588e5990f', title: 'Conditions [!if, !else]', level: 3 },
    ])
  })

  it('collects code and pre text with entities decoded and no tags', () => {
    expect(sections[1].codes).toEqual(['alpha one', '@startuml\nalpha one\nbeta --> gamma\n@enduml'])
    expect(sections[2].codes).toContain('<back:red>')
  })

  it('reads the page title from the h1', () => {
    expect(pageTitle(html)).toBe('Sample Page')
  })
})

describe('headingWords', () => {
  it('reads the words in the brackets', () => {
    expect(headingWords('Conditions [!if, !else, !elseif, !endif]')).toEqual(['!if', '!else', '!elseif', '!endif'])
  })

  it('has none for a plain heading', () => {
    expect(headingWords('Basic Examples')).toEqual([])
  })
})

describe('linkFor', () => {
  it('prefers a heading that names the word', () => {
    expect(linkFor('!else', 'preprocessing', sections)).toEqual({ page: 'preprocessing', anchor: '08651da588e5990f', section: 'Conditions' })
  })

  it('then the first section whose code holds it', () => {
    expect(linkFor('beta', 'p', sections)).toEqual({ page: 'p', anchor: 'c8d20ebb1cbc2253', section: 'First Section' })
  })

  it('matches a whole word, not a part of one', () => {
    expect(linkFor('!if', 'p', sections).section).toBe('Conditions')
    expect(linkFor('alph', 'p', sections)).toEqual({ page: 'p', section: 'Sample Page' })
  })

  it('falls back to the page title', () => {
    expect(linkFor('missing', 'p', sections)).toEqual({ page: 'p', section: 'Sample Page' })
  })
})

describe('word lists from the editor source', () => {
  it('reads the first string of each row', () => {
    expect(quotedHeads("const C = [\n  ['-->', 'dashed'],\n  ['-up->', 'up'],\n]")).toEqual(['-->', '-up->'])
  })

  it('reads the bare tag word', () => {
    expect(tagWords("  ['<b>', '<b>', 'bold'],\n  ['<size:12>', 'x', 'size'],\n  ['<img:url>', 'x', 'image'],")).toEqual(['b', 'size', 'img'])
  })
})

describe('buildLinks', () => {
  const pages = {
    'sequence-diagram': sections,
    'gantt-diagram': sectionsOf(html.replace('alpha one', 'lasts one')),
    preprocessing: sections,
    skinparam: sections,
    style: sections,
    theme: sections,
    stdlib: sections,
    creole: sections,
    'sitemap-language-specification': sections,
    yaml: sections,
  }
  const source = {
    language: { keywords: ['beta', 'lasts', '@startyaml', '@endyaml'], types: ['gamma'], skinparameters: ['Alpha'] },
    directives: { directives: ['!if'] },
    builtins: [{ name: '%strlen' }],
    vocabulary: { style: { selectors: ['Delta'], properties: ['BackGroundColor'] } },
    source: { themes: { cerulean: {} }, libraries: { C4: {} } },
    connectors: ['-->'],
    tags: ['back'],
  }
  const built = buildLinks(pages, source)

  it('keys each kind the way the docs index does', () => {
    expect(built['directive:!if'].section).toBe('Conditions')
    expect(built['keyword:beta'].section).toBe('First Section')
    expect(built['function:%strlen']).toEqual({ page: 'preprocessing', section: 'Sample Page' })
    expect(built['skinparam:alpha'].page).toBe('skinparam')
    expect(built['selector:delta'].page).toBe('style')
    expect(built['property:backgroundcolor'].page).toBe('style')
    expect(built['theme:cerulean'].page).toBe('theme')
    expect(built['library:C4'].page).toBe('stdlib')
    expect(built['tag:back'].section).toBe('Second Section')
    expect(built['connector:-->'].section).toBe('First Section')
    expect(built['diagram:yaml']).toEqual({ page: 'yaml', section: 'Sample Page' })
  })

  it('keys a word on a page of another diagram type with the type', () => {
    expect(built['keyword:lasts@gantt'].page).toBe('gantt-diagram')
    expect(built['keyword:lasts']).toBeUndefined()
  })
})

describe('links.json', () => {
  it('links every kind', () => {
    expect(links.read).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(links.links['directive:!if'].section).toBe('Conditions')
    expect(links.links['keyword:alt'].section).toBe('Grouping message')
    expect(links.links['diagram:yaml'].section).toBe('Display YAML Data')
    expect(Object.entries(links.links).filter(([key]) => key.endsWith('@gantt')).length).toBeGreaterThan(0)
    expect(links.links['diagram:uml'].page).toBe('sitemap-language-specification')
    expect(links.links['tag:back']).toBeDefined()
    expect(links.links['connector:-->']).toBeDefined()
    expect(links.links['function:%strlen']).toBeDefined()
  })
})
