// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The gantt profile, for `@startgantt` and its alias `@startproject`: what its
// mode names inside those blocks, read the way CodeMirror reads them.
import { describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import { core } from './helpers/core.js'
import { loadProfile, needed, profileExtension } from '../../src/editor/profiles/index.js'
import { valuesOn } from '../../src/editor/values/index.js'
import { serverColors } from '../../src/editor/completion/server-list.js'

vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ colors: { lavender: '#E6E6FA' } }), { status: 200 }))
import ganttProfile, { project as projectProfile } from '../../src/editor/profiles/gantt.js'
import styleProfile from '../../src/editor/profiles/style.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'

const gantt = ganttProfile(core)
const project = projectProfile(core)
const language = plantumlLanguage({
  gantt: gantt.mode,
  project: project.mode,
  yaml: yamlProfile(core).mode,
  style: styleProfile(core).mode,
})

/** [text, token class] for every highlighted span of the lines in a block of `type`. */
const tokens = (type, ...lines) => readDoc([`@start${type}`, ...lines, `@end${type}`]).slice(1, -1)

/** [text, token class] for every highlighted span of `lines`. */
function readDoc(lines) {
  const doc = Text.of(lines)
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('the gantt and project profiles', () => {
  it('are one profile under two types', () => {
    expect(gantt).toMatchObject({ type: 'gantt', completions: [], lints: [], values: [] })
    expect(project).toMatchObject({ type: 'project', completions: [], lints: [], values: [] })
    expect(project.mode).toBe(gantt.mode)
  })

  it('loads project from the gantt module, as the project type', async () => {
    const loaded = await loadProfile('project')
    expect(loaded.type).toBe('project')
    expect(loaded.mode).toBe(gantt.mode)
    expect((await loadProfile('gantt')).type).toBe('gantt')
  })

  it('is needed only for gantt and project blocks', () => {
    const neededFor = (text) => needed(scan(text), text)
    expect(neededFor('@startgantt\n[A] lasts 1 day\n@endgantt\n')).toEqual(new Set(['gantt']))
    expect(neededFor('@startproject\n[A] lasts 1 day\n@endproject\n')).toEqual(new Set(['project']))
    expect(neededFor('@startuml\nA -> B\n@enduml\n')).toEqual(new Set())
  })
})

describe.each(['gantt', 'project'])('a @start%s block', (type) => {
  const readAll = (...lines) => readDoc(lines)
  const read = (...lines) => tokens(type, ...lines)

  it('names the project start a keyword and its date a Date (Y17)', () => {
    expect(read('Project starts 2026-10-13')).toEqual([['Project starts', 'keyword'], ['2026-10-13', 'Date']])
    expect(read('project starts the 5th of October 2026')).toEqual([['project starts the', 'keyword'], ['5th of October 2026', 'Date']])
    expect(read('Project starts October 5, 2026')).toEqual([['Project starts', 'keyword'], ['October 5, 2026', 'Date']])
  })

  it('names a task moss, its verb a keyword and its duration a number', () => {
    expect(read('[Build] lasts 3 days')).toEqual([['[', 'squareBracket'], ['Build', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['3 days', 'number']])
    expect(read('[T] requires 2 weeks and 3 days')).toEqual([
      ['[', 'squareBracket'], ['T', 'typeName'], [']', 'squareBracket'], ['requires', 'keyword'], ['2 weeks', 'number'], ['and', 'keyword'], ['3 days', 'number'],
    ])
  })

  it("names a start after another task's end", () => {
    expect(read("[Build] starts at [Spec]'s end")).toEqual([
      ['[', 'squareBracket'], ['Build', 'typeName'], [']', 'squareBracket'], ['starts at', 'keyword'], ['[', 'squareBracket'], ['Spec', 'typeName'], [']', 'squareBracket'], ["'s end", 'keyword'],
    ])
    expect(read("[Test] starts 3 working days after [Build]'s start")).toEqual([
      ['[', 'squareBracket'], ['Test', 'typeName'], [']', 'squareBracket'], ['starts', 'keyword'], ['3 working days', 'number'], ['after', 'keyword'], ['[', 'squareBracket'], ['Build', 'typeName'], [']', 'squareBracket'], ["'s start", 'keyword'],
    ])
  })

  it('reads an apostrophe inside a task as part of its name, not a comment', () => {
    expect(read("[End's committee] requires 2 days")).toEqual([
      ['[', 'squareBracket'], ["End's committee", 'typeName'], [']', 'squareBracket'], ['requires', 'keyword'], ['2 days', 'number'],
    ])
  })

  it('names a resource slate, a percentage with it', () => {
    expect(read('{Alice:50%} is off on 2026-10-20')).toEqual([
      ['{', 'brace'], ['Alice:50%', 'propertyName'], ['}', 'brace'], ['is off on', 'keyword'], ['2026-10-20', 'Date'],
    ])
    expect(read('[Design] on {Alice} {Bob:50%} lasts 5 days and is 40% complete')).toEqual([
      ['[', 'squareBracket'], ['Design', 'typeName'], [']', 'squareBracket'], ['on', 'keyword'], ['{', 'brace'], ['Alice', 'propertyName'], ['}', 'brace'], ['{', 'brace'], ['Bob:50%', 'propertyName'], ['}', 'brace'],
      ['lasts', 'keyword'], ['5 days', 'number'], ['and is', 'keyword'], ['40%', 'number'], ['complete', 'keyword'],
    ])
  })

  it('names the colours after colored in, a name or a hex, each a ColorLiteral', () => {
    expect(read('[A] is colored in Lavender/LightBlue')).toEqual([
      ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['is colored in', 'keyword'], ['Lavender', 'ColorLiteral'], ['/', 'separator'], ['LightBlue', 'ColorLiteral'],
    ])
    expect(read('[A] is coloured in #fa0 for completion from #red to blue')).toEqual([
      ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['is coloured in', 'keyword'], ['#fa0', 'ColorLiteral'], ['for completion from', 'keyword'],
      ['#red', 'ColorLiteral'], ['to', 'keyword'], ['blue', 'ColorLiteral'],
    ])
    expect(read('2026-10-14 to 2026-10-16 are colored in salmon and')).toEqual([
      ['2026-10-14', 'Date'], ['to', 'keyword'], ['2026-10-16', 'Date'], ['are colored in', 'keyword'], ['salmon', 'ColorLiteral'], ['and', 'keyword'],
    ])
  })

  it('gives the colour pencil each colour after colored in (C6, W5)', async () => {
    await serverColors()
    const doc = `@start${type}\n[A] is colored in Lavender/#FFF3B0\n@end${type}`
    const state = EditorState.create({ doc, extensions: [profileExtension([type === 'gantt' ? gantt : project])] })
    const colours = valuesOn(state, 2).filter((value) => value.colours).map((value) => state.sliceDoc(value.from, value.to))
    expect(colours).toEqual(['Lavender', 'FFF3B0'])
  })

  it('names a colour after a task, and a coloured link', () => {
    expect(read('[Task] #red/#blue')).toEqual([['[', 'squareBracket'], ['Task', 'typeName'], [']', 'squareBracket'], ['#red', 'ColorLiteral'], ['/', 'separator'], ['#blue', 'ColorLiteral']])
    expect(read("[T] starts at [B]'s end with blue dotted link")).toEqual([
      ['[', 'squareBracket'], ['T', 'typeName'], [']', 'squareBracket'], ['starts at', 'keyword'], ['[', 'squareBracket'], ['B', 'typeName'], [']', 'squareBracket'], ["'s end", 'keyword'],
      ['with', 'keyword'], ['blue', 'ColorLiteral'], ['dotted', 'attributeName'], ['link', 'keyword'],
    ])
  })

  it('names a separator a heading', () => {
    expect(read('-- Phase 2 --')).toEqual([['-- Phase 2 --', 'heading']])
    expect(read('--')).toEqual([['--', 'heading']])
  })

  it('names a link arrow a link operator, and a styled one in parts', () => {
    expect(read('[A] -> [B]')).toEqual([['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['->', 'LinkOperator'], ['[', 'squareBracket'], ['B', 'typeName'], [']', 'squareBracket']])
    expect(read('[A] -[#FF0000,dashed]-> [B]')).toEqual([
      ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['-[', 'LinkOperator'], ['#FF0000', 'ColorLiteral'], [',', 'separator'], ['dashed', 'attributeName'], [']->', 'LinkOperator'], ['[', 'squareBracket'], ['B', 'typeName'], [']', 'squareBracket'],
    ])
  })

  it('names the scale and display commands keywords', () => {
    expect(read('printscale weekly')).toEqual([['printscale weekly', 'keyword']])
    expect(read('projectscale monthly with calendar date zoom 2')).toEqual([['projectscale monthly with calendar date zoom', 'keyword'], ['2', 'number']])
    expect(read('saturday are closed')).toEqual([['saturday are closed', 'keyword']])
  })

  it('names relative dates and times Dates, a duration and a percentage numbers (Y17)', () => {
    expect(read('[A] starts D+5')).toEqual([['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['starts', 'keyword'], ['D+5', 'Date']])
    expect(read('from 08:00 to 12:00 are working hours')).toEqual([
      ['from', 'keyword'], ['08:00', 'Date'], ['to', 'keyword'], ['12:00', 'Date'], ['are working hours', 'keyword'],
    ])
    expect(read('[A] lasts 2 days and is 40% complete').slice(-4)).toEqual([['2 days', 'number'], ['and is', 'keyword'], ['40%', 'number'], ['complete', 'keyword']])
  })

  it('names a link, a display name and a stereotype', () => {
    expect(read('[D] links to [[http://example.com]]')).toEqual([['[', 'squareBracket'], ['D', 'typeName'], [']', 'squareBracket'], ['links to', 'keyword'], ['[[http://example.com]]', 'link']])
    expect(read('[Build] is displayed as "Building"')).toEqual([['[', 'squareBracket'], ['Build', 'typeName'], [']', 'squareBracket'], ['is displayed as', 'keyword'], ['"Building"', 'string']])
    expect(read('[A] <<s>> lasts 2 days')).toEqual([['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['<<', 'angleBracket'], ['s', 'annotation'], ['>>', 'angleBracket'], ['lasts', 'keyword'], ['2 days', 'number']])
  })

  it('leaves words it does not know plain', () => {
    expect(read('language de')).toEqual([['language', 'keyword']])
    expect(read('A -> B')).toEqual([['->', 'LinkOperator']])
  })

  it('names comments, line and block', () => {
    expect(read("' note")).toEqual([["' note", 'comment']])
    expect(read("/' one '/")).toEqual([["/' one '/", 'comment']])
    expect(read("/' two", "[A] lasts", "'/", '[A] lasts 1 day')).toEqual([
      ["/' two", 'comment'], ['[A] lasts', 'comment'], ["'/", 'comment'],
      ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
  })

  it('reads the rest of a line after a comment as a line of its own', () => {
    expect(read("title My plan", "/' x '/ [A] lasts 1 day")).toEqual([
      ['title', 'keyword'], ["/' x '/", 'comment'], ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
    expect(read("title My plan", "/' a", "x '/ [A] lasts 1 day")).toEqual([
      ['title', 'keyword'], ["/' a", 'comment'], ["x '/", 'comment'], ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
  })

  it('ends a comment left open at its block\'s end, and reads the next block as its own', () => {
    expect(readAll(`@start${type}`, "/' open", '[A] lasts 1 day', `@end${type}`, '@startyaml', 'key: v', '@endyaml')).toEqual([
      [`@start${type}`, 'keyword'], ["/' open", 'comment'], ['[A] lasts 1 day', 'comment'], [`@end${type}`, 'keyword'],
      ['@startyaml', 'keyword'], ['key', 'atom'], [': ', 'meta'], ['@endyaml', 'keyword'],
    ])
    const style = readAll(`@start${type}`, "/' open", `@end${type}`, '<style>', 'node { }', '</style>')
    expect(style.slice(0, 4)).toEqual([[`@start${type}`, 'keyword'], ["/' open", 'comment'], [`@end${type}`, 'keyword'], ['<style>', 'tagName']])
    expect(style).toContainEqual(['node', 'typeName'])
    expect(style.at(-1)).toEqual(['</style>', 'tagName'])
  })

  it('reads the preprocessor as everywhere (X7)', () => {
    expect(read('!$start = "2026-10-13"', 'Project starts $start')).toEqual([
      ['!', 'meta'], ['$start', 'VariableName'], ['=', 'definitionOperator'], ['"2026-10-13"', 'string'],
      ['Project starts', 'keyword'], ['$start', 'VariableName'],
    ])
    expect(read('[A] lasts $days($n) days')).toEqual([
      ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['$days', 'FunctionName'], ['$n', 'VariableName'],
    ])
  })

  it('reads a note, a legend and a title down to their ends', () => {
    expect(read('note bottom', '[A] lasts 2 days', 'end note', '[A] lasts 1 day')).toEqual([
      ['note bottom', 'keyword'], ['end note', 'keyword'], ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
    expect(read('legend right', 'starts', 'endlegend')).toEqual([['legend right', 'keyword'], ['endlegend', 'keyword']])
    expect(read('title', 'Plan', 'end title')).toEqual([['title', 'keyword'], ['end title', 'keyword']])
    expect(read('title Plan for the project')).toEqual([['title', 'keyword']])
  })

  it('reads Creole in a note, a legend and a title (G5)', () => {
    expect(read('note bottom', '**n**', 'end note')).toEqual([['note bottom', 'keyword'], ['**n**', 'strong'], ['end note', 'keyword']])
    expect(read('legend', '<b>l</b>', 'end legend')).toEqual([['legend', 'keyword'], ['<b>', 'tagName'], ['</b>', 'tagName'], ['end legend', 'keyword']])
    expect(read('title', '//Plan//', 'end title')).toEqual([['title', 'keyword'], ['//Plan//', 'emphasis'], ['end title', 'keyword']])
    expect(read('title **Rounds**')).toEqual([['title', 'keyword'], ['**Rounds**', 'strong']])
    expect(read('caption a **b**', '[A] lasts 1 day').slice(0, 3)).toEqual([['caption', 'keyword'], ['**b**', 'strong'], ['[', 'squareBracket']])
  })

  it("reads H8's body lines in a note: rules, list markers, code (G5)", () => {
    expect(read('note bottom', '----', '* item', '<code>', 'x', '</code>', 'end note', '[A] lasts 1 day')).toEqual([
      ['note bottom', 'keyword'], ['----', 'heading'], ['*', 'list'], ['<code>', 'tagName'], ['x', 'monospace'], ['</code>', 'tagName'],
      ['end note', 'keyword'], ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
    // A `<code>` or `<latex>` block left open ends with its body.
    expect(read('legend', '<code>', '**x**', 'end legend', '[A] lasts 1 day').slice(2, 4)).toEqual([['**x**', 'monospace'], ['end legend', 'keyword']])
    expect(read('note bottom', '<latex>', 'x', 'end note', 'note bottom', '**n**', 'end note').slice(-3)).toEqual([['note bottom', 'keyword'], ['**n**', 'strong'], ['end note', 'keyword']])
  })

  it('ends a tag left open in a note or a title with its line', () => {
    expect(read('note bottom', '<font size=1', '**n**', 'end note').slice(-2)).toEqual([['**n**', 'strong'], ['end note', 'keyword']])
    expect(read('title <font size=1', 'caption **c**').slice(-2)).toEqual([['caption', 'keyword'], ['**c**', 'strong']])
  })

  it('colours the text after an inline formula in a note', () => {
    expect(read('note bottom', 'a <math>x</math> **b**', 'end note')).toEqual([
      ['note bottom', 'keyword'], ['<math>', 'tagName'], ['</math>', 'tagName'], ['**b**', 'strong'], ['end note', 'keyword'],
    ])
  })

  it('reads a group around its tasks', () => {
    expect(read('group [Phase]', '[A] lasts 1 day', 'end group')).toEqual([
      ['group', 'keyword'], ['[', 'squareBracket'], ['Phase', 'typeName'], [']', 'squareBracket'], ['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number'], ['end group', 'keyword'],
    ])
  })

  it('hands a style block to the style mode and ends at @end', () => {
    const out = tokens(type, '<style>', 'ganttDiagram { }', '</style>', '[A] lasts 1 day')
    expect(out[0]).toEqual(['<style>', 'tagName'])
    expect(out).toContainEqual(['</style>', 'tagName'])
    expect(out.slice(-5)).toEqual([['[', 'squareBracket'], ['A', 'typeName'], [']', 'squareBracket'], ['lasts', 'keyword'], ['1 day', 'number']])
  })
})
