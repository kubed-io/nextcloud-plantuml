// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The mode is read the way CodeMirror reads it: the language's parser runs over
// a Text and each token is a named node in the tree.
import { describe, expect, it } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { toggleComment } from '@codemirror/commands'
import { closeBrackets, insertBracket } from '@codemirror/autocomplete'
import { StringStream } from '@codemirror/language'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'
import { plantumlLanguage, plantumlMode, underline } from '../../src/editor/plantuml-mode.js'

/** [text, token class] for every highlighted span of `lines`. */
function tokens(...lines) {
  return tokensOf(plantumlMode, lines)
}

/** The same, read by `language`. */
function tokensOf(language, lines) {
  const doc = Text.of(lines)
  const out = []
  language.parser.parse(doc.toString()).iterate({
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

  it.each(['-->', '<-', '->>', '..>', 'o->', '==>', '~~>'])('names %s as an operator', (arrow) => {
    expect(tokens(`A ${arrow} B`)).toEqual([[arrow, 'operator']])
  })

  it.each(['--', '..', '~~', '==', '---', '-up-', '.left.'])('names the headless link %s as an operator too', (link) => {
    expect(tokens(`node1 ${link} node2`)).toEqual([[link, 'operator']])
  })

  it('names a styled link in pieces: the strokes and brackets operators, a hex colour a colour, the rest attributes', () => {
    expect(tokens('A -[#red]-> B')).toEqual([['-[', 'operator'], ['#red', 'attributeName'], [']->', 'operator']])
    expect(tokens('node1 -[hidden]- node2')).toEqual([['-[', 'operator'], ['hidden', 'attributeName'], [']-', 'operator']])
    expect(tokens('api -[#FF6F61,bold]-> jobs : deploys')).toEqual([
      ['-[', 'operator'],
      ['#FF6F61', 'ColorLiteral'],
      ['bold', 'attributeName'],
      [']->', 'operator'],
      ['deploys', 'labelName'],
    ])
    expect(tokens('A .[#00F, dashed, thickness=2]..> B')).toEqual([
      ['.[', 'operator'],
      ['#00F', 'ColorLiteral'],
      ['dashed', 'attributeName'],
      ['thickness=2', 'attributeName'],
      [']..>', 'operator'],
    ])
    expect(tokens('A <-[#red]- B')).toEqual([['<-[', 'operator'], ['#red', 'attributeName'], [']-', 'operator']])
  })

  it('never carries a label, a styled link or a note line into the next line', () => {
    expect(tokens('A -> B : hi', 'participant C')).toEqual([['->', 'operator'], ['hi', 'labelName'], ['participant', 'keyword']])
    expect(tokens('A -> B', 'participant C : x')).toEqual([['->', 'operator'], ['participant', 'keyword']])
    expect(tokens('note left of A : hi', 'actor B')).toEqual([['note', 'keyword'], ['actor', 'keyword']])
    expect(tokens('title A **b**', 'actor B')).toEqual([['title', 'keyword'], ['**b**', 'strong'], ['actor', 'keyword']])
  })

  it('labels a headless link, a quoted end, and a label with no spaces round the colon', () => {
    expect(tokens('node1 -- node2 : label1')).toEqual([['--', 'operator'], ['label1', 'labelName']])
    expect(tokens('A ~~ "Big B" : waves')).toEqual([['~~', 'operator'], ['waves', 'labelName']])
    expect(tokens('A->B:hi')).toEqual([['->', 'operator'], ['hi', 'labelName']])
  })

  it('finds no arrow inside a word or a URL, but keeps o and x heads', () => {
    expect(tokens('database db [[https://www.postgresql.org/docs/ Postgres docs]]')).toEqual([
      ['database', 'keyword'],
      ['[[https://www.postgresql.org/docs/ Postgres docs]]', 'link'],
    ])
    expect(tokens('A --o B')).toEqual([['--o', 'operator']])
    expect(tokens('A ..x B')).toEqual([['..x', 'operator']])
    expect(tokens('A-->B')).toEqual([['-->', 'operator']])
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

describe('plantumlMode colours', () => {
  it('names a hex colour a ColorLiteral, the node the colour picker looks for', () => {
    expect(tokens('skinparam backgroundColor #2B3E50')).toEqual([['skinparam', 'keyword'], ['#2B3E50', 'ColorLiteral']])
    expect(tokens('participant Shop #99FF99')).toEqual([['participant', 'keyword'], ['#99FF99', 'ColorLiteral']])
  })

  it.each(['#ABC', '#abcd', '#A1B2C3', '#A1B2C3D4'])('takes %s as a colour', (hex) => {
    expect(tokens(`node foo ${hex}`)).toEqual([['node', 'keyword'], [hex, 'ColorLiteral']])
  })

  it.each(['#Red', '#ABCDE', '#ABCDEFA', '#line:red', '#line.dashed'])('takes %s for something other than a hex colour', (word) => {
    expect(tokens(`node foo ${word}`)).toEqual([['node', 'keyword']])
  })

  it('takes the colour out of an element style, and leaves its line and text parts', () => {
    expect(tokens('node foo #FF0000;line:red;line.dashed;text:blue')).toEqual([['node', 'keyword'], ['#FF0000', 'ColorLiteral']])
  })

  it('highlights a ColorLiteral as a colour', () => {
    const tree = plantumlMode.parser.parse('skinparam backgroundColor #2B3E50')
    const styled = []
    highlightTree(tree, tagHighlighter([{ tag: tags.color, class: 'colour' }]), (from, to, cls) => styled.push([from, to, cls]))
    expect(styled).toEqual([[26, 33, 'colour']])
  })
})

describe('plantumlMode Creole', () => {
  /** The tokens of a link's label, after the link. */
  const label = (text) => tokens(`A -> B : ${text}`).slice(1)

  it('marks up a link label: bold, italic, monospace, underline and a link', () => {
    expect(label('a **b** //c// ""d"" __e__ [[https://x.org/ y]]')).toEqual([
      ['a ', 'labelName'],
      ['**b**', 'strong_labelName'],
      [' ', 'labelName'],
      ['//c//', 'emphasis_labelName'],
      [' ', 'labelName'],
      ['""d""', 'monospace_labelName'],
      [' ', 'labelName'],
      ['__e__', 'underline_labelName'],
      [' ', 'labelName'],
      ['[[https://x.org/ y]]', 'link'],
    ])
  })

  it('names Creole tags as tags, and a colour inside one as a colour', () => {
    expect(label('<size:20>big</size> <b>x</b> <&clock> <:sunny:> <img:logo.png>')).toEqual([
      ['<size:20>', 'tagName'],
      ['big', 'labelName'],
      ['</size>', 'tagName'],
      [' ', 'labelName'],
      ['<b>', 'tagName'],
      ['x', 'labelName'],
      ['</b>', 'tagName'],
      [' ', 'labelName'],
      ['<&clock>', 'tagName'],
      [' ', 'labelName'],
      ['<:sunny:>', 'tagName'],
      [' ', 'labelName'],
      ['<img:logo.png>', 'tagName'],
    ])
    expect(label('<color:#FF6F61>hot</color> <back:#2B3E50>x</back> <color:red>y</color>')).toEqual([
      ['<color:', 'tagName'],
      ['#FF6F61', 'ColorLiteral'],
      ['>', 'tagName'],
      ['hot', 'labelName'],
      ['</color>', 'tagName'],
      [' ', 'labelName'],
      ['<back:', 'tagName'],
      ['#2B3E50', 'ColorLiteral'],
      ['>', 'tagName'],
      ['x', 'labelName'],
      ['</back>', 'tagName'],
      [' ', 'labelName'],
      ['<color:red>', 'tagName'],
      ['y', 'labelName'],
      ['</color>', 'tagName'],
    ])
  })

  it('reads a URL in a label as text, not as the start of italics', () => {
    expect(label('see https://x.org/a//b and //this//')).toEqual([
      ['see https://x.org/a//b and ', 'labelName'],
      ['//this//', 'emphasis_labelName'],
    ])
  })

  it('leaves --strike-- and ~~wave~~ alone, as they would read as links', () => {
    expect(label('--gone-- and ~~wavy~~')).toEqual([['--gone-- and ~~wavy~~', 'labelName']])
  })

  it('keeps Creole out of names and keywords', () => {
    expect(tokens('participant **A**')).toEqual([['participant', 'keyword']])
  })

  it('marks up a note body down to its end, with table bars and rules', () => {
    expect(tokens('note left of A', '**b** <i>x</i>', '|= h |= h2 |', '| a | b |', '----', 'end note', 'actor B')).toEqual([
      ['note', 'keyword'],
      ['**b**', 'strong'],
      ['<i>', 'tagName'],
      ['</i>', 'tagName'],
      ['|=', 'punctuation'],
      ['|=', 'punctuation'],
      ['|', 'punctuation'],
      ['|', 'punctuation'],
      ['|', 'punctuation'],
      ['|', 'punctuation'],
      ['----', 'heading'],
      ['end note', 'keyword'],
      ['actor', 'keyword'],
    ])
  })

  it('marks up a single-line note after its colon, and an hnote or rnote body', () => {
    expect(tokens('note right of A : **b**')).toEqual([['note', 'keyword'], ['**b**', 'strong']])
    expect(tokens('hnote over A', '//idle//', 'endhnote')).toEqual([['hnote', 'keyword'], ['//idle//', 'emphasis'], ['endhnote', 'keyword']])
    expect(tokens('note as N1 #FFAAAA', '""x""', 'end note')).toEqual([
      ['note', 'keyword'],
      ['as', 'keyword'],
      ['#FFAAAA', 'ColorLiteral'],
      ['""x""', 'monospace'],
      ['end note', 'keyword'],
    ])
  })

  it('marks up a legend and a description body down to their ends', () => {
    expect(tokens('legend right', '__u__', '....', 'endlegend', 'actor B')).toEqual([
      ['legend', 'keyword'],
      ['__u__', 'underline'],
      ['....', 'heading'],
      ['endlegend', 'keyword'],
      ['actor', 'keyword'],
    ])
    expect(tokens('node web [', '//front// end', '====', ']', 'node db')).toEqual([
      ['node', 'keyword'],
      ['//front//', 'emphasis'],
      ['====', 'heading'],
      ['node', 'keyword'],
    ])
  })

  it('marks up a title, header, footer and caption, on one line or down to the end', () => {
    expect(tokens('title The **big** one')).toEqual([['title', 'keyword'], ['**big**', 'strong']])
    expect(tokens('caption <&clock> 2026-10-14')).toEqual([['caption', 'keyword'], ['<&clock>', 'tagName']])
    expect(tokens('title', '""x""', 'end title', 'actor B')).toEqual([
      ['title', 'keyword'],
      ['""x""', 'monospace'],
      ['end title', 'keyword'],
      ['actor', 'keyword'],
    ])
    expect(tokens('header', '<b>h</b>', 'endheader')).toEqual([['header', 'keyword'], ['<b>', 'tagName'], ['</b>', 'tagName'], ['endheader', 'keyword']])
    expect(tokens('footer page **1**')).toEqual([['footer', 'keyword'], ['**1**', 'strong']])
  })

  it('gives underline a tag of its own', () => {
    const tree = plantumlMode.parser.parse('note left\n__u__\nend note')
    const styled = []
    highlightTree(tree, tagHighlighter([{ tag: underline, class: 'u' }]), (from, to, cls) => styled.push([from, to, cls]))
    expect(styled).toEqual([[10, 15, 'u']])
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

describe('plantumlLanguage with an inner mode', () => {
  const whole = (token) => ({ token: (stream) => { stream.skipToEnd(); return token }, startState: () => ({}) })
  const nested = (...lines) => tokensOf(plantumlLanguage({ yaml: whole('atom') }), lines)

  it("hands the lines between @start<type> and @end<type> to the type's mode", () => {
    expect(nested('@startyaml', 'fruits:', '  - apple', '@endyaml')).toEqual([
      ['@startyaml', 'keyword'],
      ['fruits:', 'atom'],
      ['  - apple', 'atom'],
      ['@endyaml', 'keyword'],
    ])
  })

  it('ends the block at an indented @end, and keeps the indentation plain', () => {
    expect(nested('@startyaml', 'a: 1', '  @endyaml')).toEqual([['@startyaml', 'keyword'], ['a: 1', 'atom'], ['@endyaml', 'keyword']])
  })

  it('reads a quote-led line and a preprocessor line inside the block as PlantUML', () => {
    expect(nested('@startyaml', "' a note", '  !include x.puml', 'a: 1', '@endyaml')).toEqual([
      ['@startyaml', 'keyword'],
      ["' a note", 'comment'],
      ['!include x.puml', 'meta'],
      ['a: 1', 'atom'],
      ['@endyaml', 'keyword'],
    ])
  })

  it('reads PlantUML again after the block', () => {
    expect(nested('@startyaml', 'a: 1', '@endyaml', 'actor A').slice(3)).toEqual([['actor', 'keyword']])
  })

  it('keeps the inner mode to the end of the file when the block is never closed', () => {
    expect(nested('@startyaml', 'a: 1', 'actor A')).toEqual([['@startyaml', 'keyword'], ['a: 1', 'atom'], ['actor A', 'atom']])
  })

  it('reads a block of a type it has no mode for as it always has', () => {
    const lines = ['@startyaml', 'fruits:', '  - "apple"', "' a note", '@endyaml', 'actor A']
    const expected = [['"apple"', 'string'], ["' a note", 'comment'], ['actor', 'keyword']]
    expect(tokensOf(plantumlLanguage({}), lines)).toEqual(expected)
    expect(tokensOf(plantumlLanguage({ json: whole('atom') }), lines)).toEqual(expected)
  })

  it('leaves the text an inner mode names nothing plain, with or without a start state', () => {
    const plain = { token: (stream) => { stream.next(); return null } }
    expect(tokensOf(plantumlLanguage({ yaml: plain }), ['@startyaml', 'a: 1', '@endyaml'])).toEqual([['@startyaml', 'keyword'], ['@endyaml', 'keyword']])
  })

  it("passes a blank line inside the block to the inner mode's blankLine", () => {
    const counting = {
      startState: () => ({ blanks: 0 }),
      blankLine: (state) => { state.blanks++ },
      token: (stream, state) => { stream.skipToEnd(); return state.blanks ? 'number' : 'atom' },
    }
    expect(tokensOf(plantumlLanguage({ yaml: counting }), ['@startyaml', 'a', '', 'b', '@endyaml'])).toEqual([
      ['@startyaml', 'keyword'],
      ['a', 'atom'],
      ['b', 'number'],
      ['@endyaml', 'keyword'],
    ])
  })

  /** The parser's state after reading `lines`. */
  function stateAfter(parser, lines) {
    const state = parser.startState(2)
    for (const line of lines) {
      const stream = new StringStream(line, 4, 2)
      if (stream.eol()) parser.blankLine(state, 2)
      while (!stream.eol()) {
        stream.start = stream.pos
        parser.token(stream, state)
      }
    }
    return state
  }

  it('copies the inner state, so a copy read on leaves the original where it was', () => {
    const { streamParser } = plantumlLanguage({ yaml: whole('atom') })
    const state = stateAfter(streamParser, ['@startyaml', 'a: 1'])
    const copy = streamParser.copyState(state)

    expect(copy.inner).toEqual(state.inner)
    copy.inner.state.mark = 1
    expect(state.inner.state.mark).toBeUndefined()
  })

  it("copies the inner state with the inner mode's own copyState when it has one", () => {
    const mode = { ...whole('atom'), startState: () => ({ depth: 1 }), copyState: (state) => ({ depth: state.depth, copied: true }) }
    const { streamParser } = plantumlLanguage({ yaml: mode })
    const state = stateAfter(streamParser, ['@startyaml', 'a: 1'])

    expect(streamParser.copyState(state).inner.state).toEqual({ depth: 1, copied: true })
  })

  it('builds a new language on every call', () => {
    expect(plantumlLanguage({})).not.toBe(plantumlLanguage({}))
  })
})
