// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The docs index (I1): what each key's entry holds once the source's text,
// our own lines and the plantuml.com links are merged, and how it loads.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { CONNECTORS } from '../../src/editor/completion/connectors.js'
import { buildDocs, loadDocs } from '../../src/editor/docs/index.js'
import { HELPERS, KEYWORDS } from '../../src/editor/completion/keywords.js'

// The first import of own.json fails, as a chunk does offline; every later one answers.
const own = vi.hoisted(() => ({ failures: 1 }))
vi.mock('../../src/editor/data/docs/own.json', () => {
  if (own.failures-- > 0) {
    throw new Error('offline')
  }
  return { default: {} }
})

const inputs = {
  own: {
    'keyword:alt': { summary: 'Alternatives, one drawn per else', example: 'alt paid\nend', home: 'sequence' },
    'keyword:start': { summary: 'Starts an activity' },
    'keyword:start@gantt': { summary: 'When a task starts' },
    'keyword:note': { summary: 'A note', home: 'any' },
    'keyword:skinparam': { summary: 'Sets a skin parameter', home: 'any', anywhere: true },
    'keyword:node': { summary: 'A node', home: 'deployment' },
    'function:%strlen': { summary: 'ours', example: 'ours', signature: '%strlen(text)' },
    'function:%now': { summary: 'The time' },
    'theme:cerulean': { summary: 'ours' },
    'selector:node': { example: 'node, ours' },
    'tag:back': { summary: 'Background colour', kind: 'Creole tag, paired' },
    'property:backgroundcolor': { summary: 'Fills the background' },
    'connector:-->': { summary: 'Dashed arrow' },
  },
  links: {
    read: '2026-10-16',
    links: {
      'keyword:alt': { page: 'sequence-diagram', anchor: 'abc', section: 'Grouping message' },
      'skinparam:backgroundcolor': { page: 'skinparam', section: 'Skinparam' },
      'diagram:yaml': { page: 'yaml', anchor: 'y1', section: 'Display YAML Data' },
    },
  },
  source: {
    plantuml: '1.2026.8',
    stdlib: '7167ca0',
    themes: { cerulean: { title: 'Cerulean', summary: 'Cerulean theme based off of the bootstrap theme' } },
    libraries: { C4: { title: 'C4 (C4-PlantUML)', summary: 'The C4 library', source: 'https://github.com/plantuml-stdlib/C4-PlantUML' }, aws: { title: 'Aws' } },
  },
  builtins: [
    { name: '%strlen', args: 1, min: 1, max: 1, description: 'Calculate the length of a String', example: '%strlen("foo")' },
    { name: '%now', args: 0, min: 0, max: 0, description: '', example: '' },
  ],
  language: { plantuml: '1.2026.8', types: ['actor'], keywords: ['alt'], skinparameters: ['BackgroundColor'] },
  vocabulary: { style: { selectors: ['node', 'activityBar'], properties: ['BackgroundColor'], fontStyles: [] } },
}

describe('buildDocs', () => {
  const docs = buildDocs(inputs)

  it('lets the source’s text win, and our own lines fill the rest', () => {
    expect(docs.get('function:%strlen')).toMatchObject({ summary: 'Calculate the length of a String', example: '%strlen("foo")', signature: '%strlen(text)' })
    expect(docs.get('function:%now')).toMatchObject({ name: '%now', summary: 'The time' })
    expect(docs.get('theme:cerulean').summary).toBe('Cerulean theme based off of the bootstrap theme')
    expect(docs.get('library:c4')).toMatchObject({ name: 'C4', kind: 'library', look: 'library', summary: 'The C4 library' })
  })

  it('leaves out what nothing gives, and a function with no signature shows its bare name', () => {
    expect(docs.get('function:%now')).not.toHaveProperty('signature')
    expect(docs.get('function:%now')).not.toHaveProperty('example')
    expect(docs.get('library:aws')).toEqual({ name: 'aws', kind: 'library', look: 'library' })
  })

  it('tries the block type’s entry before the plain one', () => {
    expect(docs.get('keyword:start', 'gantt').summary).toBe('When a task starts')
    expect(docs.get('keyword:start', 'uml').summary).toBe('Starts an activity')
    expect(docs.get('keyword:start').summary).toBe('Starts an activity')
  })

  it('reads a keyword or a connector outside uml only from its block type’s entry', () => {
    expect(docs.get('keyword:start', 'dot')).toBeUndefined()
    expect(docs.get('keyword:alt', 'yaml')).toBeUndefined()
    expect(docs.get('connector:-->', 'dot')).toBeUndefined()
    expect(docs.get('connector:-->', 'uml')).toMatchObject({ name: '-->' })
  })

  it('reads an anywhere keyword in every block type, and any other only from its own entry', () => {
    expect(docs.get('keyword:skinparam', 'mindmap')).toMatchObject({ name: 'skinparam', summary: 'Sets a skin parameter' })
    expect(docs.get('keyword:skinparam', 'dot')).toMatchObject({ name: 'skinparam' })
    expect(docs.get('keyword:node', 'dot')).toBeUndefined()
  })

  it('reads a project block as gantt, PlantUML’s alias', () => {
    expect(docs.get('keyword:start', 'project').summary).toBe('When a task starts')
  })

  it('reads every other kind whatever the block type', () => {
    expect(docs.get('function:%strlen', 'gantt').name).toBe('%strlen')
    expect(docs.get('theme:cerulean', 'yaml').kind).toBe('theme')
    expect(docs.get('library:c4', 'dot').kind).toBe('library')
    expect(docs.get('diagram:yaml', 'yaml').kind).toBe('diagram')
  })

  it('labels each kind, a keyword with its home', () => {
    expect(docs.get('keyword:alt')).toMatchObject({ name: 'alt', kind: 'keyword · sequence', look: 'keyword' })
    expect(docs.get('keyword:note').kind).toBe('keyword')
    expect(docs.get('keyword:start').kind).toBe('keyword')
    expect(docs.get('diagram:yaml')).toMatchObject({ name: '@startyaml', kind: 'diagram', look: 'diagram' })
    expect(docs.get('function:%strlen').kind).toBe('function')
    expect(docs.get('selector:node').kind).toBe('style selector')
    expect(docs.get('property:backgroundcolor')).toMatchObject({ name: 'BackgroundColor', kind: 'style property', look: 'property' })
    expect(docs.get('skinparam:backgroundcolor')).toMatchObject({ name: 'BackgroundColor', kind: 'skin parameter', look: 'skinparam' })
    expect(docs.get('theme:cerulean').kind).toBe('theme')
  })

  it('takes our own kind over the label', () => {
    expect(docs.get('tag:back')).toMatchObject({ name: '<back>', kind: 'Creole tag, paired', look: 'tag' })
  })

  it('generates a selector’s entry, keyed lower-cased and named as written', () => {
    expect(docs.get('selector:activitybar')).toEqual({
      name: 'activityBar',
      kind: 'style selector',
      look: 'selector',
      summary: 'Styles every activityBar in a <style> block',
      example: '<style>\nactivityBar {\n  BackgroundColor LightBlue\n}\n</style>',
    })
    expect(docs.get('selector:node')).toMatchObject({ summary: 'Styles every node in a <style> block', example: 'node, ours' })
  })

  it('keys a library lower-cased, as the server names it, and names it as its folder is written', () => {
    expect(docs.get('library:C4')).toBeUndefined()
    expect(docs.get('library:c4').name).toBe('C4')
  })

  it('generates a skin parameter’s entry', () => {
    expect(docs.get('skinparam:backgroundcolor').summary).toBe('Skin parameter, replaced by <style>')
  })

  it('attaches the plantuml.com link', () => {
    expect(docs.get('keyword:alt').link).toEqual({ page: 'sequence-diagram', anchor: 'abc', section: 'Grouping message' })
    expect(docs.get('skinparam:backgroundcolor').link).toEqual({ page: 'skinparam', section: 'Skinparam' })
    expect(docs.get('diagram:yaml').link.section).toBe('Display YAML Data')
    expect(docs.get('keyword:start')).not.toHaveProperty('link')
  })

  it('has no entry for an unknown key', () => {
    expect(docs.get('keyword:nonsense')).toBeUndefined()
    expect(docs.get('keyword:nonsense', 'gantt')).toBeUndefined()
    expect(docs.get('label:alt')).toBeUndefined()
  })
})

describe('loadDocs', () => {
  it('forgets a failed load, so the next call tries again, and then keeps the index', async () => {
    await expect(loadDocs()).rejects.toThrow()
    const docs = await loadDocs()
    expect(docs.get('function:%strlen')).toMatchObject({ name: '%strlen', summary: 'Calculate the length of a String' })
    expect(docs.get('diagram:yaml').link.section).toBe('Display YAML Data')
    expect(await loadDocs()).toBe(docs)
  })
})

// Our own lines (I8): read from disk, as the mock above empties the import.
const data = (name) => JSON.parse(readFileSync(new URL(`../../src/editor/data/${name}.json`, import.meta.url), 'utf8'))

describe('our own lines for diagram types, directives and functions', () => {
  const ownLines = data('docs/own')
  const language = data('language')
  const builtins = data('builtins')
  const real = buildDocs({
    own: ownLines,
    links: data('docs/links'),
    source: data('docs/source'),
    builtins,
    language,
    vocabulary: data('vocabulary'),
  })
  const types = language.keywords.filter((word) => word.startsWith('@start')).map((word) => `diagram:${word.slice(6)}`)
  const directives = data('directives').directives.map((word) => `directive:${word}`)
  const functions = builtins.map(({ name }) => `function:${name}`)
  const missing = (keys, fields) => keys.filter((key) => fields.some((field) => !real.get(key)?.[field]))

  it('gives every diagram type a summary and an example', () => {
    expect(types).toHaveLength(30)
    expect(missing(types, ['summary', 'example'])).toEqual([])
  })

  it('gives every directive a summary and an example', () => {
    expect(directives).toHaveLength(38)
    expect(missing(directives, ['summary', 'example'])).toEqual([])
  })

  it('gives every function a summary, an example and a signature', () => {
    expect(functions).toHaveLength(74)
    expect(missing(functions, ['summary', 'example', 'signature'])).toEqual([])
  })

  it('writes each signature to fit the function’s min and max', () => {
    const wrong = builtins.filter(({ name, min, max }) => {
      const signature = real.get(`function:${name}`)?.signature ?? ''
      const [, list] = /^[^(]+\((.*)\)$/.exec(signature) ?? []
      if (list === undefined || !signature.startsWith(`${name}(`)) {
        return true
      }
      const count = (text) => text.split(',').map((part) => part.replace(/[[\]]/g, '').trim()).filter((part) => part && part !== '...').length
      const open = list.includes('...')
      const low = count(list.split('[')[0])
      const high = count(list)
      return low !== min || (max === null ? !open : open || high !== max)
    })
    expect(wrong.map(({ name }) => name)).toEqual([])
  })

  it('keeps our summaries to one clause of at most 80 characters, no full stop', () => {
    const long = Object.entries(ownLines).filter(([, { summary }]) => summary && (summary.length > 80 || summary.endsWith('.') || summary.includes('. '))).map(([key]) => key)
    expect(long).toEqual([])
  })

  it('keeps every example to 6 lines', () => {
    const tall = Object.entries(ownLines).filter(([, { example }]) => example && example.split('\n').length > 6).map(([key]) => key)
    expect(tall).toEqual([])
  })

  const HOMES = ['sequence', 'activity', 'class', 'component', 'state', 'usecase', 'timing', 'object', 'deployment', 'any']
  const words = [...new Set([...KEYWORDS, ...language.keywords.filter((word) => !word.startsWith('@'))])]

  it('gives every keyword a summary and an example, plain or for a block type', () => {
    expect(words.length).toBeGreaterThan(150)
    const lacking = words.filter((word) => {
      const bare = `keyword:${word.toLowerCase()}`
      const keys = [bare, ...Object.keys(ownLines).filter((key) => key.startsWith(`${bare}@`))]
      return !keys.some((key) => {
        const [plain, type] = key.split('@')
        const entry = real.get(plain, type ?? 'uml')
        return entry?.summary && entry.example
      })
    })
    expect(lacking).toEqual([])
  })

  it('gives every plain keyword a home, and a typed one none', () => {
    const wrong = Object.entries(ownLines).filter(([key, line]) => key.startsWith('keyword:') && (key.includes('@') ? line.home : !HOMES.includes(line.home))).map(([key]) => key)
    expect(wrong).toEqual([])
  })

  it('flags anywhere only on a plain keyword', () => {
    const wrong = Object.entries(ownLines).filter(([key, line]) => line.anywhere && !/^keyword:[^@]+$/.test(key)).map(([key]) => key)
    expect(wrong).toEqual([])
  })

  it('reads in json only the keywords the json block reads, so legend is not there', () => {
    expect(real.get('keyword:legend', 'json')).toBeUndefined()
    expect(real.get('keyword:header', 'yaml')).toBeUndefined()
    for (const word of ['title', 'scale', 'skinparam', 'skin', 'hide']) {
      expect(real.get(`keyword:${word}`, 'json')?.summary).toBeTruthy()
    }
    expect(real.get('keyword:skinparam', 'salt')).toMatchObject({ name: 'skinparam' })
  })

  it('reads the preprocessor’s true, false and not in uml only: a yaml or json value is data', () => {
    for (const word of ['true', 'false', 'not']) {
      expect(real.get(`keyword:${word}`)?.summary).toBeTruthy()
      for (const type of ['yaml', 'json', 'hcl']) {
        expect(real.get(`keyword:${word}`, type)).toBeUndefined()
      }
    }
  })

  it('describes every library the server names, in its case (`c4`, `domainstory`)', () => {
    const named = Object.keys(data('docs/source').libraries).map((name) => name.toLowerCase())
    expect(named).toEqual(expect.arrayContaining(['c4', 'domainstory']))
    expect(named.filter((name) => !real.get(`library:${name}`)?.link)).toEqual([])
    expect(real.get('library:c4')).toMatchObject({ name: 'C4', kind: 'library' })
  })

  it('writes alt as the brief says', () => {
    expect(ownLines['keyword:alt']).toEqual({
      summary: 'Alternatives, one drawn per else',
      home: 'sequence',
      example: 'alt paid\n  Shop -> Customer : receipt\nelse declined\n  Shop -> Customer : retry\nend',
    })
  })
})

describe('our own lines for types, tags, connectors, commands and style properties', () => {
  const real = buildDocs({
    own: data('docs/own'),
    links: data('docs/links'),
    source: data('docs/source'),
    builtins: data('builtins'),
    language: data('language'),
    vocabulary: data('vocabulary'),
  })
  const ownLines = data('docs/own')
  const missing = (keys) => keys.filter((key) => !real.get(key)?.summary || !real.get(key)?.example)
  // A type that only one block knows, such as `network`, is described by its `@<type>` entry.
  const lacking = (words) => words.filter((word) => {
    const keys = [word, ...Object.keys(ownLines).filter((key) => key.startsWith(`${word}@`))]
    return !keys.some((key) => {
      const [plain, type] = key.split('@')
      const entry = real.get(plain, type ?? 'uml')
      return entry?.summary && entry.example
    })
  })
  const creole = readFileSync(new URL('../../src/editor/completion/creole.js', import.meta.url), 'utf8')
  const tags = [...creole.matchAll(/^ {2}\['<(\w+)/gm)].map(([, tag]) => `tag:${tag}`)

  it('gives every element type a summary and an example', () => {
    const types = data('language').types.map((word) => `keyword:${word}`)
    expect(types).toHaveLength(53)
    expect(lacking(types)).toEqual([])
  })

  it('gives every Creole tag, and the style block, a summary and an example', () => {
    expect(tags).toHaveLength(15)
    expect(missing([...tags, 'tag:style'])).toEqual([])
    expect(real.get('tag:style').kind).toBe('style block')
    expect(real.get('tag:back').example).toBe('<back:LightBlue>paid</back>')
  })

  it('gives every connector a summary and an example', () => {
    expect(CONNECTORS).toHaveLength(19)
    expect(missing(CONNECTORS.map((name) => `connector:${name}`))).toEqual([])
  })

  it('gives every helper command a summary and an example', () => {
    expect(HELPERS).toHaveLength(17)
    expect(missing(HELPERS.map((name) => `helper:${name}`))).toEqual([])
  })

  it('gives every style property a summary and an example', () => {
    const properties = data('vocabulary').style.properties
    expect(properties).toHaveLength(30)
    expect(missing(properties.map((name) => `property:${name.toLowerCase()}`))).toEqual([])
  })
})
