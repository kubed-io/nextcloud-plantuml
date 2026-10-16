// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The docs index (I1): what each key's entry holds once the source's text,
// our own lines and the plantuml.com links are merged, and how it loads.
import { describe, expect, it, vi } from 'vitest'
import { buildDocs, loadDocs } from '../../src/editor/docs/index.js'

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
    'function:%strlen': { summary: 'ours', example: 'ours', signature: '%strlen(text)' },
    'function:%now': { summary: 'The time' },
    'theme:cerulean': { summary: 'ours' },
    'selector:node': { example: 'node, ours' },
    'tag:back': { summary: 'Background colour', kind: 'Creole tag, paired' },
    'property:backgroundcolor': { summary: 'Fills the background' },
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
    expect(docs.get('library:C4')).toMatchObject({ name: 'C4', kind: 'library', look: 'library', summary: 'The C4 library' })
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
