// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The mode is read the way CodeMirror reads it: the language's parser runs over
// a Text and each token is a named node in the tree.
import { describe, expect, it } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { toggleComment } from '@codemirror/commands'
import { closeBrackets, insertBracket } from '@codemirror/autocomplete'
import { plantumlMode } from '../../src/editor/plantuml-mode.js'

/** [text, token class] for every highlighted span of `lines`. */
function tokens(...lines) {
  const doc = Text.of(lines)
  const out = []
  plantumlMode.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('plantumlMode', () => {
  it('names the start and end of a diagram as keywords', () => {
    expect(tokens('@startuml', '@enduml')).toEqual([['@startuml', 'keyword'], ['@enduml', 'keyword']])
  })

  it('names a participant declaration as a keyword and leaves the name plain', () => {
    expect(tokens('participant Shop')).toEqual([['participant', 'keyword']])
  })

  it('names `as` inside a line as a keyword', () => {
    expect(tokens('actor "Big Customer" as C')).toEqual([
      ['actor', 'keyword'],
      ['"Big Customer"', 'string'],
      ['as', 'keyword'],
    ])
  })

  it('names a message arrow as an operator and its label as a label', () => {
    expect(tokens('Customer -> Shop : place order')).toEqual([['->', 'operator'], ['place order', 'labelName']])
  })

  it.each(['-->', '<-', '->>', '-[#red]->', '..>', 'o->', '==>', '~~>'])('names %s as an operator', (arrow) => {
    expect(tokens(`A ${arrow} B`)).toEqual([[arrow, 'operator']])
  })

  it.each(['--', '..', '~~', '==', '---', '-up-', '-[hidden]-', '.left.'])('names the headless link %s as an operator too', (link) => {
    expect(tokens(`node1 ${link} node2`)).toEqual([[link, 'operator']])
  })

  it('labels a headless link, a quoted end, and a label with no spaces round the colon', () => {
    expect(tokens('node1 -- node2 : label1')).toEqual([['--', 'operator'], ['label1', 'labelName']])
    expect(tokens('A ~~ "Big B" : waves')).toEqual([['~~', 'operator'], ['waves', 'labelName']])
    expect(tokens('A->B:hi')).toEqual([['->', 'operator'], ['hi', 'labelName']])
  })

  it('leaves a lone dash, a member type and an activity action unlabelled', () => {
    expect(tokens('- item')).toEqual([])
    expect(tokens('class A', '-field : int')).toEqual([['class', 'keyword']])
    expect(tokens(':pay the bill;')).toEqual([])
  })

  it('names a separator or a delay as a heading, not as links', () => {
    expect(tokens('== Checkout ==')).toEqual([['== Checkout ==', 'heading']])
    expect(tokens('... 5 minutes later ...')).toEqual([['... 5 minutes later ...', 'heading']])
    expect(tokens('...')).toEqual([['...', 'heading']])
  })

  it('names a quote-led line as a comment', () => {
    expect(tokens("' a comment")).toEqual([["' a comment", 'comment']])
  })

  it('names a block comment across lines as a comment', () => {
    expect(tokens("/' one", "two '/", 'actor A')).toEqual([
      ["/' one", 'comment'],
      ["two '/", 'comment'],
      ['actor', 'keyword'],
    ])
  })

  it('names a preprocessor line as meta', () => {
    expect(tokens('!include x.puml')).toEqual([['!include x.puml', 'meta']])
  })

  it('keeps indentation out of a keyword', () => {
    expect(tokens('  note left of A')).toEqual([['note', 'keyword']])
  })
})

describe('plantumlMode language data', () => {
  const state = (doc) => EditorState.create({ doc, extensions: [plantumlMode, closeBrackets()] })

  it("toggles a line comment with PlantUML's quote", () => {
    let current = state('A -> B')
    toggleComment({ state: current, dispatch: (tr) => { current = tr.state } })

    expect(current.doc.toString()).toBe("' A -> B")
  })

  it('closes brackets and double quotes, but never the quote that starts a comment', () => {
    for (const [open, pair] of [['(', '()'], ['[', '[]'], ['{', '{}'], ['"', '""']]) {
      expect(insertBracket(state(''), open).state.doc.toString()).toBe(pair)
    }
    expect(insertBracket(state(''), "'")).toBeNull()
  })
})
