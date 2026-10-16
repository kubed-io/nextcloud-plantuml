// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// G1: a grammar emits only dictionary tokens. Every fixture, read with every
// profile loaded, names its nodes with the dictionary's tokens and no others.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { DICTIONARY, DICTIONARY_TOKENS } from '../../src/editor/lexicon/dictionary.js'
import { Tag, tags } from '@lezer/highlight'
import { tokenTable } from '../../src/editor/lexicon/tags.js'
import { core } from './helpers/core.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'
import styleProfile from '../../src/editor/profiles/style.js'
import boardProfile from '../../src/editor/profiles/board.js'
import gitProfile from '../../src/editor/profiles/git.js'
import spritesProfile from '../../src/editor/profiles/sprites.js'
import ganttProfile, { project } from '../../src/editor/profiles/gantt.js'
import mathProfile from '../../src/editor/profiles/math.js'
import latexProfile from '../../src/editor/profiles/latex.js'
import mindmapProfile, { wbs } from '../../src/editor/profiles/tree.js'

const DIR = new URL('./fixtures/grammars/', import.meta.url)

const modes = Object.fromEntries([
  ['yaml', yamlProfile], ['style', styleProfile], ['board', boardProfile], ['git', gitProfile],
  ['sprites', spritesProfile], ['gantt', ganttProfile], ['project', project], ['math', mathProfile], ['latex', latexProfile],
  ['mindmap', mindmapProfile], ['wbs', wbs],
].map(([type, factory]) => [type, factory(core).mode]))

/** The YAML legacy mode's own tokens, which the dictionary does not hold it to. */
const YAML_OWN = new Set(['atom', 'def', 'meta', 'string', 'number', 'comment', 'keyword', 'variable-2', 'operator', 'punctuation', 'variable', 'property'])

/** R1: a name with `_` is valid when every part is a dictionary token. */
const known = (name) => DICTIONARY_TOKENS.has(name.replace(/_/g, ' ')) || name.split('_').every((part) => DICTIONARY_TOKENS.has(part))

/** [name, text, inYaml] for every named node of `text`. */
function nodes(text) {
  const out = []
  const lines = text.split('\n')
  const yamlLines = new Set()
  let inYaml = false
  lines.forEach((line, i) => {
    if (/^@startyaml/.test(line)) inYaml = true
    if (inYaml) yamlLines.add(i + 1)
    if (/^@endyaml/.test(line)) inYaml = false
  })
  const doc = plantumlLanguage(modes).parser.parse(text)
  doc.iterate({
    enter(node) {
      if (node.type.isTop || !node.type.name) return
      const line = text.slice(0, node.from).split('\n').length
      out.push([node.type.name, text.slice(node.from, node.to), yamlLines.has(line)])
    },
  })
  return out
}

describe('the styling dictionary', () => {
  it('lists Y1 to Y38 once each', () => {
    expect(DICTIONARY.map((row) => row.id)).toEqual(Array.from({ length: 38 }, (_, i) => `Y${i + 1}`))
  })

  it('holds the pairs a text style makes with a base, and a diagram name that is a link', () => {
    for (const pair of ['strong labelName', 'emphasis string', 'underline tagName', 'DiagramName url']) {
      expect(DICTIONARY_TOKENS.has(pair), pair).toBe(true)
    }
    expect(DICTIONARY_TOKENS.has('labelName strong')).toBe(false)
  })

  // StreamLanguage takes each space-joined part as a tag of its own, from the language's table or
  // @lezer/highlight's tags; an unknown name, or a modifier alone, is only a console warning.
  const unresolved = (names) => [...names].filter((name) => name.split(' ').some((part) => !((tokenTable[part] || tags[part]) instanceof Tag)))

  it('resolves every token to a highlight tag', () => {
    expect(unresolved(['labelNmae', 'strong labelNmae', 'function'])).toEqual(['labelNmae', 'strong labelNmae', 'function'])
    expect(unresolved(DICTIONARY_TOKENS)).toEqual([])
  })

  const fixtures = readdirSync(DIR).filter((name) => name.endsWith('.puml'))

  it('has a fixture for every type with a grammar', () => {
    expect(fixtures.map((name) => name.replace('.puml', '')).sort()).toEqual(
      ['board', 'chart', 'chen', 'creole', 'ebnf', 'files', 'gantt', 'git', 'latex', 'math', 'mindmap', 'project', 'regex', 'sprites', 'style', 'uml', 'wbs', 'wire', 'yaml'])
  })

  it.each(fixtures)('%s: every token is a dictionary token', (name) => {
    const found = nodes(readFileSync(new URL(name, DIR), 'utf8'))
    expect(found.length).toBeGreaterThan(0)
    const bad = found.filter(([token, , inYaml]) => !(inYaml && YAML_OWN.has(token)) && !known(token))
    expect([...new Set(bad.map(([token, text]) => `${token} ${JSON.stringify(text)}`))]).toEqual([])
  })
})
