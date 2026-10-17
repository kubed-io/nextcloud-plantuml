// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The board and git profiles: what their modes name inside `@startboard` and
// `@startgit` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { scan } from '../../src/editor/blocks.js'
import { core } from './helpers/core.js'
import { needed } from '../../src/editor/profiles/index.js'
import boardProfile from '../../src/editor/profiles/board.js'
import gitProfile from '../../src/editor/profiles/git.js'
import { blockTokens } from './helpers/tokens.js'

const board = boardProfile(core)
const git = gitProfile(core)
const language = plantumlLanguage({ board: board.mode, git: git.mode })

/** [text, token class] for every highlighted span of the lines in a block of `type`. */
const tokens = (type, ...lines) => blockTokens(language, type, lines)
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
    expect(boardTokens('Legend', '+ not a card', 'End Legend', '+Card')).toEqual([['Legend', 'keyword'], ['End Legend', 'keyword'], ['+', 'list']])
  })

  it('names an activity, a line with no plus, a heading', () => {
    expect(boardTokens('Editor')).toEqual([['Editor', 'heading']])
    expect(boardTokens('Activity 2 : with colon')).toEqual([['Activity 2 : with colon', 'heading']])
  })

  it('names the plus run a list marker', () => {
    expect(boardTokens('+Completion')).toEqual([['+', 'list']])
    expect(boardTokens('++Directives')).toEqual([['++', 'list']])
    expect(boardTokens('+++ Task a1')).toEqual([['+++', 'list']])
  })

  it("reads a card's text as Creole after the plus run (G5)", () => {
    expect(boardTokens('+ a **card**')).toEqual([['+', 'list'], ['**card**', 'strong']])
    expect(boardTokens('++ <b>x</b>', 'Editor')).toEqual([['++', 'list'], ['<b>', 'tagName'], ['</b>', 'tagName'], ['Editor', 'heading']])
    // A tag left open ends with its card's line.
    expect(boardTokens('+ <font size=1', 'Editor').slice(-1)).toEqual([['Editor', 'heading']])
    // An inline formula's closer comes back to the card's Creole.
    expect(boardTokens('+ a <math>x</math> **b**', 'Editor')).toEqual([['+', 'list'], ['<math>', 'tagName'], ['</math>', 'tagName'], ['**b**', 'strong'], ['Editor', 'heading']])
    expect(boardTokens('+ <math>x</math>', 'Editor').slice(-1)).toEqual([['Editor', 'heading']])
  })

  it('reads a title as a keyword and its text as Creole, the common lines with it (G4)', () => {
    expect(boardTokens('title My board')).toEqual([['title', 'keyword']])
    expect(boardTokens('title My **board**')).toEqual([['title', 'keyword'], ['**board**', 'strong']])
    expect(boardTokens('legend', '**l**', 'end legend', 'Editor')).toEqual([['legend', 'keyword'], ['**l**', 'strong'], ['end legend', 'keyword'], ['Editor', 'heading']])
    expect(boardTokens('scale 2')).toEqual([['scale', 'keyword'], ['2', 'number']])
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
      ['*', 'LinkOperator'],
      ['a1b2c3', 'number'],
      ['Merge feature', 'comment'],
    ])
  })

  it('names the refs group a type name, and the message after it a comment', () => {
    expect(gitTokens('* d4e5 (HEAD -> main, tag: v1) Add')).toEqual([
      ['*', 'LinkOperator'],
      ['d4e5', 'number'],
      ['(', 'paren'], ['HEAD -> main, tag: v1', 'typeName'], [')', 'paren'],
      ['Add', 'comment'],
    ])
  })

  it('names the graph characters link operators, on a commit line or alone', () => {
    expect(gitTokens('|\\')).toEqual([['|\\', 'LinkOperator']])
    expect(gitTokens('|/')).toEqual([['|/', 'LinkOperator']])
    expect(gitTokens('| * d4e5f6 Add stdlib')).toEqual([
      ['|', 'LinkOperator'],
      ['*', 'LinkOperator'],
      ['d4e5f6', 'number'],
      ['Add stdlib', 'comment'],
    ])
    expect(gitTokens('* | 2c1d0e9 fix z')).toEqual([
      ['*', 'LinkOperator'],
      ['|', 'LinkOperator'],
      ['2c1d0e9', 'number'],
      ['fix z', 'comment'],
    ])
  })

  it('reads an octopus merge, whose marker has a tail', () => {
    expect(gitTokens('*-.   e5 octo', '|\\ \\')).toEqual([
      ['*-.', 'LinkOperator'],
      ['e5', 'number'],
      ['octo', 'comment'],
      ['|\\', 'LinkOperator'],
      ['\\', 'LinkOperator'],
    ])
  })

  it('names a commit with no message, and one with refs only', () => {
    expect(gitTokens('* a1')).toEqual([['*', 'LinkOperator'], ['a1', 'number']])
    expect(gitTokens('* a1 (main)')).toEqual([['*', 'LinkOperator'], ['a1', 'number'], ['(', 'paren'], ['main', 'typeName'], [')', 'paren']])
  })

  it('leaves a refs group that never closes to the message', () => {
    expect(gitTokens('* a1 (main msg')).toEqual([['*', 'LinkOperator'], ['a1', 'number'], ['(main msg', 'comment']])
  })

  it('leaves a line with neither a commit nor a graph plain, and a comment a comment', () => {
    expect(gitTokens('title Log')).toEqual([])
    expect(gitTokens("' log")).toEqual([["' log", 'comment']])
  })

  it('starts each line afresh', () => {
    expect(gitTokens('* a1 (main) msg', '* a2')).toEqual([
      ['*', 'LinkOperator'], ['a1', 'number'], ['(', 'paren'], ['main', 'typeName'], [')', 'paren'], ['msg', 'comment'],
      ['*', 'LinkOperator'], ['a2', 'number'],
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
