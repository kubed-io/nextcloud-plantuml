// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The links to plantuml.com's sections: the page reader and the key builder run
// on a small hand-written page in the site's markup, never the network.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildLinks, connectorWords, headingWords, linkFor, pageTitle, quotedHeads, sectionsOf, tagWords } from '../../scripts/doclinks.mjs'
import { CONNECTORS } from '../../src/editor/completion/connectors.js'
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
      { anchor: '5e1f0c2d9a7b4e36', title: 'Builtin functions', level: 2 },
      { anchor: 'a4c97e0b13d6f852', title: 'Escapes [%dollar]', level: 3 },
      { anchor: 'c2b8e5f1d0a39476', title: '%size builtin function', level: 2 },
      { anchor: '9d3e6a1f0b7c2584', title: 'Quoting function', level: 2 },
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

  // connectors.js lists plain names; reading it for rows dropped every connector link.
  it('reads the connectors as connectors.js lists them, brackets and all', () => {
    const file = readFileSync(new URL('../../src/editor/completion/connectors.js', import.meta.url), 'utf8')
    expect(connectorWords(file)).toEqual(CONNECTORS)
    expect(connectorWords(file)).toContain('-[hidden]-')
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
    builtins: [{ name: '%strlen' }, { name: '%parse' }, { name: '%dollar' }, { name: '%size' }, { name: '%quote' }],
    vocabulary: { style: { selectors: ['Delta'], properties: ['BackGroundColor'] } },
    source: { themes: { cerulean: {} }, libraries: { C4: {} } },
    connectors: ['-->'],
    tags: ['back'],
  }
  const built = buildLinks(pages, source)

  it('keys each kind the way the docs index does', () => {
    expect(built['directive:!if'].section).toBe('Conditions')
    expect(built['keyword:beta'].section).toBe('First Section')
    expect(built['function:%strlen']).toEqual({ page: 'preprocessing', anchor: '5e1f0c2d9a7b4e36', section: 'Builtin functions' })
    expect(built['skinparam:alpha'].page).toBe('skinparam')
    expect(built['selector:delta'].page).toBe('style')
    expect(built['property:backgroundcolor'].page).toBe('style')
    expect(built['theme:cerulean'].page).toBe('theme')
    expect(built['library:c4'].page).toBe('stdlib')
    expect(built['tag:back'].section).toBe('Second Section')
    expect(built['connector:-->'].section).toBe('First Section')
    expect(built['diagram:yaml']).toEqual({ page: 'yaml', section: 'Sample Page' })
  })

  // %str2json linked the first section whose code used it, which was not about the function.
  it('links a function no heading names to the builtin functions, before a section not about a function whose code shows it', () => {
    expect(built['function:%parse']).toEqual({ page: 'preprocessing', anchor: '5e1f0c2d9a7b4e36', section: 'Builtin functions' })
    expect(built['function:%dollar']).toEqual({ page: 'preprocessing', anchor: 'a4c97e0b13d6f852', section: 'Escapes' })
    expect(built['function:%size']).toEqual({ page: 'preprocessing', anchor: 'c2b8e5f1d0a39476', section: '%size builtin function' })
  })

  // The escape functions link "Escape function", the section about them, not the generic list.
  it('links a function to the first section about a function whose code shows it, before the builtin functions', () => {
    expect(built['function:%quote']).toEqual({ page: 'preprocessing', anchor: '9d3e6a1f0b7c2584', section: 'Quoting function' })
  })

  it('links a function to the preprocessing page alone when it has no builtin functions section', () => {
    const bare = buildLinks({ ...pages, preprocessing: sections.filter((s) => s.title !== 'Builtin functions') }, source)
    expect(bare['function:%strlen']).toEqual({ page: 'preprocessing', section: 'Sample Page' })
    // Never a section that merely uses it.
    expect(bare['function:%parse']).toEqual({ page: 'preprocessing', section: 'Sample Page' })
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
    expect(links.links['function:%str2json'].section).toBe('Builtin functions')
    expect(links.links['function:%dollar'].section).toBe('Escape function')
    expect(Object.keys(links.links).filter((key) => key.startsWith('connector:'))).toHaveLength(22)
  })
})
