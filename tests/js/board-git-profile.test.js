// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The board and git profiles: what their modes name inside `@startboard` and
// `@startgit` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import { needed } from '../../src/editor/profiles/index.js'
import boardProfile from '../../src/editor/profiles/board.js'
import gitProfile from '../../src/editor/profiles/git.js'

const board = boardProfile({ scan })
const git = gitProfile({ scan })
const language = plantumlLanguage({ board: board.mode, git: git.mode })

/** [text, token class] for every highlighted span of the lines in a block of `type`. */
function tokens(type, ...lines) {
  const doc = Text.of([`@start${type}`, ...lines, `@end${type}`])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}
const boardTokens = (...lines) => tokens('board', ...lines)
const gitTokens = (...lines) => tokens('git', ...lines)

describe('the board profile', () => {
  it('is the board type with no completions or lints', () => {
    expect(board).toMatchObject({ type: 'board', completions: [], lints: [], values: [] })
  })

  it('reads the shared commands in any case, hide and show with them', () => {
    expect(boardTokens('Title x')).toEqual([['Title', 'keyword']])
    expect(boardTokens('hide footbox')).toEqual([['hide', 'keyword']])
    expect(boardTokens('SHOW x')).toEqual([['SHOW', 'keyword']])
    expect(boardTokens('Legend', '+ not a card', 'End Legend', '+Card')).toEqual([['Legend', 'keyword'], ['End Legend', 'keyword'], ['+', 'operator']])
  })

  it('names an activity, a line with no plus, a heading', () => {
    expect(boardTokens('Editor')).toEqual([['Editor', 'heading']])
    expect(boardTokens('Activity 2 : with colon')).toEqual([['Activity 2 : with colon', 'heading']])
  })

  it('names the plus run an operator and leaves a card plain', () => {
    expect(boardTokens('+Completion')).toEqual([['+', 'operator']])
    expect(boardTokens('++Directives')).toEqual([['++', 'operator']])
    expect(boardTokens('+++ Task a1')).toEqual([['+++', 'operator']])
  })

  it('reads a plus that is not at column 0 as an activity named with it', () => {
    expect(boardTokens('  + x')).toEqual([['  + x', 'heading']])
  })

  it('reads a bare plus as an activity, as PlantUML does', () => {
    expect(boardTokens('+')).toEqual([['+', 'heading']])
    expect(boardTokens('++ ')).toEqual([['++ ', 'heading']])
  })

  it('names a comment', () => {
    expect(boardTokens("' note")).toEqual([["' note", 'comment']])
  })

  it('names the common commands keywords and their text plain', () => {
    expect(boardTokens('title Stories')).toEqual([['title', 'keyword']])
    expect(boardTokens('skinparam shadowing false')).toEqual([['skinparam', 'keyword']])
  })

  it('reads a legend as text, to its end', () => {
    expect(boardTokens('legend', 'Not a column', 'end legend', 'Editor')).toEqual([
      ['legend', 'keyword'],
      ['end legend', 'keyword'],
      ['Editor', 'heading'],
    ])
  })

  it('does not take a word that starts with a command for it', () => {
    expect(boardTokens('titles')).toEqual([['titles', 'heading']])
  })
})

describe('the git profile', () => {
  it('is the git type with no completions or lints', () => {
    expect(git).toMatchObject({ type: 'git', completions: [], lints: [], values: [] })
  })

  it('names the marker, the commit name and the message that is not drawn', () => {
    expect(gitTokens('* a1b2c3 Merge feature')).toEqual([
      ['*', 'operator'],
      ['a1b2c3', 'number'],
      ['Merge feature', 'comment'],
    ])
  })

  it('names the refs group a type name, and the message after it a comment', () => {
    expect(gitTokens('* d4e5 (HEAD -> main, tag: v1) Add')).toEqual([
      ['*', 'operator'],
      ['d4e5', 'number'],
      ['(HEAD -> main, tag: v1)', 'typeName'],
      ['Add', 'comment'],
    ])
  })

  it('names the graph characters operators, on a commit line or alone', () => {
    expect(gitTokens('|\\')).toEqual([['|\\', 'operator']])
    expect(gitTokens('|/')).toEqual([['|/', 'operator']])
    expect(gitTokens('| * d4e5f6 Add stdlib')).toEqual([
      ['|', 'operator'],
      ['*', 'operator'],
      ['d4e5f6', 'number'],
      ['Add stdlib', 'comment'],
    ])
    expect(gitTokens('* | 2c1d0e9 fix z')).toEqual([
      ['*', 'operator'],
      ['|', 'operator'],
      ['2c1d0e9', 'number'],
      ['fix z', 'comment'],
    ])
  })

  it('reads an octopus merge, whose marker has a tail', () => {
    expect(gitTokens('*-.   e5 octo', '|\\ \\')).toEqual([
      ['*-.', 'operator'],
      ['e5', 'number'],
      ['octo', 'comment'],
      ['|\\', 'operator'],
      ['\\', 'operator'],
    ])
  })

  it('names a commit with no message, and one with refs only', () => {
    expect(gitTokens('* a1')).toEqual([['*', 'operator'], ['a1', 'number']])
    expect(gitTokens('* a1 (main)')).toEqual([['*', 'operator'], ['a1', 'number'], ['(main)', 'typeName']])
  })

  it('leaves a refs group that never closes to the message', () => {
    expect(gitTokens('* a1 (main msg')).toEqual([['*', 'operator'], ['a1', 'number'], ['(main msg', 'comment']])
  })

  it('leaves a line with neither a commit nor a graph plain, and a comment a comment', () => {
    expect(gitTokens('title Log')).toEqual([])
    expect(gitTokens("' log")).toEqual([["' log", 'comment']])
  })

  it('starts each line afresh', () => {
    expect(gitTokens('* a1 (main) msg', '* a2')).toEqual([
      ['*', 'operator'], ['a1', 'number'], ['(main)', 'typeName'], ['msg', 'comment'],
      ['*', 'operator'], ['a2', 'number'],
    ])
  })
})

describe('the profiles a file with these blocks needs', () => {
  const neededFor = (text) => needed(scan(text), text)

  it('are board and git, only for a file holding such a block', () => {
    expect(neededFor('@startboard\nEditor\n@endboard\n')).toEqual(new Set(['board']))
    expect(neededFor('@startgit\n* a\n@endgit\n')).toEqual(new Set(['git']))
    expect(neededFor('@startuml\nA -> B\n@enduml\n')).toEqual(new Set())
  })
})
