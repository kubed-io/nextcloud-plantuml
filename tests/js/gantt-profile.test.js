// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The gantt profile, for `@startgantt` and its alias `@startproject`: what its
// mode names inside those blocks, read the way CodeMirror reads them.
import { describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import { loadProfile, needed, profileExtension } from '../../src/editor/profiles/index.js'
import { valuesOn } from '../../src/editor/values/index.js'
import { serverColors } from '../../src/editor/completion/server-list.js'

vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ colors: { lavender: '#E6E6FA' } }), { status: 200 }))
import ganttProfile, { project as projectProfile } from '../../src/editor/profiles/gantt.js'
import styleProfile from '../../src/editor/profiles/style.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'

const gantt = ganttProfile({ scan })
const project = projectProfile({ scan })
const language = plantumlLanguage({
  gantt: gantt.mode,
  project: project.mode,
  yaml: yamlProfile({ scan }).mode,
  style: styleProfile({ scan, t: (app, text) => text }).mode,
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

  it('names the project start a keyword and its date a number', () => {
    expect(read('Project starts 2026-10-13')).toEqual([['Project starts', 'keyword'], ['2026-10-13', 'number']])
    expect(read('project starts the 5th of October 2026')).toEqual([['project starts the', 'keyword'], ['5th of October 2026', 'number']])
    expect(read('Project starts October 5, 2026')).toEqual([['Project starts', 'keyword'], ['October 5, 2026', 'number']])
  })

  it('names a task moss, its verb a keyword and its duration a number', () => {
    expect(read('[Build] lasts 3 days')).toEqual([['[Build]', 'typeName'], ['lasts', 'keyword'], ['3 days', 'number']])
    expect(read('[T] requires 2 weeks and 3 days')).toEqual([
      ['[T]', 'typeName'], ['requires', 'keyword'], ['2 weeks', 'number'], ['and', 'keyword'], ['3 days', 'number'],
    ])
  })

  it("names a start after another task's end", () => {
    expect(read("[Build] starts at [Spec]'s end")).toEqual([
      ['[Build]', 'typeName'], ['starts at', 'keyword'], ['[Spec]', 'typeName'], ["'s end", 'keyword'],
    ])
    expect(read("[Test] starts 3 working days after [Build]'s start")).toEqual([
      ['[Test]', 'typeName'], ['starts', 'keyword'], ['3 working days', 'number'], ['after', 'keyword'], ['[Build]', 'typeName'], ["'s start", 'keyword'],
    ])
  })

  it('reads an apostrophe inside a task as part of its name, not a comment', () => {
    expect(read("[End's committee] requires 2 days")).toEqual([
      ["[End's committee]", 'typeName'], ['requires', 'keyword'], ['2 days', 'number'],
    ])
  })

  it('names a resource slate, a percentage with it', () => {
    expect(read('{Alice:50%} is off on 2026-10-20')).toEqual([
      ['{Alice:50%}', 'VariableName'], ['is off on', 'keyword'], ['2026-10-20', 'number'],
    ])
    expect(read('[Design] on {Alice} {Bob:50%} lasts 5 days and is 40% complete')).toEqual([
      ['[Design]', 'typeName'], ['on', 'keyword'], ['{Alice}', 'VariableName'], ['{Bob:50%}', 'VariableName'],
      ['lasts', 'keyword'], ['5 days', 'number'], ['and is', 'keyword'], ['40%', 'number'], ['complete', 'keyword'],
    ])
  })

  it('names the colours after colored in, a name or a hex, each a ColorLiteral', () => {
    expect(read('[A] is colored in Lavender/LightBlue')).toEqual([
      ['[A]', 'typeName'], ['is colored in', 'keyword'], ['Lavender', 'ColorLiteral'], ['/', 'punctuation'], ['LightBlue', 'ColorLiteral'],
    ])
    expect(read('[A] is coloured in #fa0 for completion from #red to blue')).toEqual([
      ['[A]', 'typeName'], ['is coloured in', 'keyword'], ['#fa0', 'ColorLiteral'], ['for completion from', 'keyword'],
      ['#red', 'ColorLiteral'], ['to', 'keyword'], ['blue', 'ColorLiteral'],
    ])
    expect(read('2026-10-14 to 2026-10-16 are colored in salmon and')).toEqual([
      ['2026-10-14', 'number'], ['to', 'keyword'], ['2026-10-16', 'number'], ['are colored in', 'keyword'], ['salmon', 'ColorLiteral'], ['and', 'keyword'],
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
    expect(read('[Task] #red/#blue')).toEqual([['[Task]', 'typeName'], ['#red', 'ColorLiteral'], ['/', 'punctuation'], ['#blue', 'ColorLiteral']])
    expect(read("[T] starts at [B]'s end with blue dotted link")).toEqual([
      ['[T]', 'typeName'], ['starts at', 'keyword'], ['[B]', 'typeName'], ["'s end", 'keyword'],
      ['with', 'keyword'], ['blue', 'ColorLiteral'], ['dotted', 'attributeName'], ['link', 'keyword'],
    ])
  })

  it('names a separator a heading', () => {
    expect(read('-- Phase 2 --')).toEqual([['-- Phase 2 --', 'heading']])
    expect(read('--')).toEqual([['--', 'heading']])
  })

  it('names a link arrow an operator, and a styled one in parts', () => {
    expect(read('[A] -> [B]')).toEqual([['[A]', 'typeName'], ['->', 'operator'], ['[B]', 'typeName']])
    expect(read('[A] -[#FF0000,dashed]-> [B]')).toEqual([
      ['[A]', 'typeName'], ['-[', 'operator'], ['#FF0000', 'ColorLiteral'], [',', 'punctuation'], ['dashed', 'attributeName'], [']->', 'operator'], ['[B]', 'typeName'],
    ])
  })

  it('names the scale and display commands keywords', () => {
    expect(read('printscale weekly')).toEqual([['printscale weekly', 'keyword']])
    expect(read('projectscale monthly with calendar date zoom 2')).toEqual([['projectscale monthly with calendar date zoom', 'keyword'], ['2', 'number']])
    expect(read('saturday are closed')).toEqual([['saturday are closed', 'keyword']])
  })

  it('names relative dates and times numbers', () => {
    expect(read('[A] starts D+5')).toEqual([['[A]', 'typeName'], ['starts', 'keyword'], ['D+5', 'number']])
    expect(read('from 08:00 to 12:00 are working hours')).toEqual([
      ['from', 'keyword'], ['08:00', 'number'], ['to', 'keyword'], ['12:00', 'number'], ['are working hours', 'keyword'],
    ])
  })

  it('names a link, a display name and a stereotype', () => {
    expect(read('[D] links to [[http://example.com]]')).toEqual([['[D]', 'typeName'], ['links to', 'keyword'], ['[[http://example.com]]', 'link']])
    expect(read('[Build] is displayed as "Building"')).toEqual([['[Build]', 'typeName'], ['is displayed as', 'keyword'], ['"Building"', 'string']])
    expect(read('[A] <<s>> lasts 2 days')).toEqual([['[A]', 'typeName'], ['<<s>>', 'tagName'], ['lasts', 'keyword'], ['2 days', 'number']])
  })

  it('leaves words it does not know plain', () => {
    expect(read('language de')).toEqual([['language', 'keyword']])
    expect(read('A -> B')).toEqual([['->', 'operator']])
  })

  it('names comments, line and block', () => {
    expect(read("' note")).toEqual([["' note", 'comment']])
    expect(read("/' one '/")).toEqual([["/' one '/", 'comment']])
    expect(read("/' two", "[A] lasts", "'/", '[A] lasts 1 day')).toEqual([
      ["/' two", 'comment'], ['[A] lasts', 'comment'], ["'/", 'comment'],
      ['[A]', 'typeName'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
  })

  it('reads the rest of a line after a comment as a line of its own', () => {
    expect(read("title My plan", "/' x '/ [A] lasts 1 day")).toEqual([
      ['title', 'keyword'], ["/' x '/", 'comment'], ['[A]', 'typeName'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
    expect(read("title My plan", "/' a", "x '/ [A] lasts 1 day")).toEqual([
      ['title', 'keyword'], ["/' a", 'comment'], ["x '/", 'comment'], ['[A]', 'typeName'], ['lasts', 'keyword'], ['1 day', 'number'],
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
      ['!', 'meta'], ['$start', 'VariableName'], ['=', 'punctuation'], ['"2026-10-13"', 'string'],
      ['Project starts', 'keyword'], ['$start', 'VariableName'],
    ])
    expect(read('[A] lasts $days($n) days')).toEqual([
      ['[A]', 'typeName'], ['lasts', 'keyword'], ['$days', 'FunctionName'], ['$n', 'VariableName'],
    ])
  })

  it('reads a note, a legend and a title down to their ends, the text plain', () => {
    expect(read('note bottom', '[A] lasts 2 days', 'end note', '[A] lasts 1 day')).toEqual([
      ['note bottom', 'keyword'], ['end note', 'keyword'], ['[A]', 'typeName'], ['lasts', 'keyword'], ['1 day', 'number'],
    ])
    expect(read('legend right', 'starts', 'endlegend')).toEqual([['legend right', 'keyword'], ['endlegend', 'keyword']])
    expect(read('title', 'Plan', 'end title')).toEqual([['title', 'keyword'], ['end title', 'keyword']])
    expect(read('title Plan for the project')).toEqual([['title', 'keyword']])
  })

  it('reads a group around its tasks', () => {
    expect(read('group [Phase]', '[A] lasts 1 day', 'end group')).toEqual([
      ['group', 'keyword'], ['[Phase]', 'typeName'], ['[A]', 'typeName'], ['lasts', 'keyword'], ['1 day', 'number'], ['end group', 'keyword'],
    ])
  })

  it('hands a style block to the style mode and ends at @end', () => {
    const out = tokens(type, '<style>', 'ganttDiagram { }', '</style>', '[A] lasts 1 day')
    expect(out[0]).toEqual(['<style>', 'tagName'])
    expect(out).toContainEqual(['</style>', 'tagName'])
    expect(out.slice(-3)).toEqual([['[A]', 'typeName'], ['lasts', 'keyword'], ['1 day', 'number']])
  })
})
