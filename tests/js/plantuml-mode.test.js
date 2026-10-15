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

  it('names a styled link in pieces: the strokes and brackets operators, a colour a colour, the rest attributes', () => {
    expect(tokens('A -[#red]-> B')).toEqual([['-[', 'operator'], ['#red', 'ColorLiteral'], [']->', 'operator']])
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
    expect(tokens('A <-[#red]- B')).toEqual([['<-[', 'operator'], ['#red', 'ColorLiteral'], [']-', 'operator']])
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

  it.each(['#ABCDE', '#ABCDEFA', '#line:red', '#line.dashed', '#back:red'])('takes %s for something other than a colour', (word) => {
    expect(tokens(`node foo ${word}`)).toEqual([['node', 'keyword']])
  })

  it.each(['#Red', '#AliceBlue', '#APPLICATION', '#lightblue'])('takes the named colour %s as a colour', (word) => {
    expect(tokens(`node foo ${word}`)).toEqual([['node', 'keyword'], [word, 'ColorLiteral']])
  })

  it('takes a named colour where a colour goes: an element style, a note, a styled link, a Creole tag', () => {
    expect(tokens('node foo #Red;line:blue;line.dashed')).toEqual([['node', 'keyword'], ['#Red', 'ColorLiteral']])
    expect(tokens('note left of A #pink', 'x', 'end note').slice(0, 2)).toEqual([['note', 'keyword'], ['#pink', 'ColorLiteral']])
    expect(tokens('A -[#Red,bold]-> B')).toEqual([['-[', 'operator'], ['#Red', 'ColorLiteral'], ['bold', 'attributeName'], [']->', 'operator']])
    expect(tokens('A -> B : <color:#Red>hot</color>').slice(1, 5)).toEqual([['<color', 'tagName'], [':', 'punctuation'], ['#Red', 'ColorLiteral'], ['>', 'tagName']])
  })

  it('takes no word after a # at the start of a line for a colour', () => {
    expect(tokens('#highlight "a" / "b"')).toEqual([['"a"', 'string'], ['"b"', 'string']])
    expect(tokens('  #HotPink:action;')).toEqual([])
  })

  it.each(['/', '|', '-', '\\'])('takes each part of a %s gradient for a colour of its own', (stroke) => {
    expect(tokens(`node foo #Red${stroke}Yellow`)).toEqual([['node', 'keyword'], ['#Red', 'ColorLiteral'], [stroke, 'punctuation'], ['Yellow', 'ColorLiteral']])
  })

  it('takes a gradient\'s second hex without its #', () => {
    expect(tokens('rectangle A #FF0000/FFFF00')).toEqual([['rectangle', 'keyword'], ['#FF0000', 'ColorLiteral'], ['/', 'punctuation'], ['FFFF00', 'ColorLiteral']])
    expect(tokens('rectangle A #Red/FFF')).toEqual([['rectangle', 'keyword'], ['#Red', 'ColorLiteral'], ['/', 'punctuation'], ['FFF', 'ColorLiteral']])
  })

  it('takes both colours of an automatic text colour', () => {
    expect(tokens('skinparam rectangleFontColor #?black:white')).toEqual([
      ['skinparam', 'keyword'],
      ['#?', 'punctuation'],
      ['black', 'ColorLiteral'],
      [':', 'punctuation'],
      ['white', 'ColorLiteral'],
    ])
  })

  it('takes Gantt\'s `is colored in` colours', () => {
    expect(tokens('[Task] is colored in White/Red')).toEqual([['is', 'keyword'], ['White', 'ColorLiteral'], ['/', 'punctuation'], ['Red', 'ColorLiteral']])
    expect(tokens('[Task] is colored in #00ff00')).toEqual([['is', 'keyword'], ['#00ff00', 'ColorLiteral']])
    expect(tokens('[Task] is 2 days')).toEqual([['is', 'keyword']])
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
      ['<size', 'tagName'],
      [':', 'punctuation'],
      ['20', 'string'],
      ['>', 'tagName'],
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
      ['<img', 'tagName'],
      [':', 'punctuation'],
      ['logo.png', 'string'],
      ['>', 'tagName'],
    ])
    expect(label('<color:#FF6F61>hot</color> <back:#2B3E50>x</back> <color:red>y</color>')).toEqual([
      ['<color', 'tagName'],
      [':', 'punctuation'],
      ['#FF6F61', 'ColorLiteral'],
      ['>', 'tagName'],
      ['hot', 'labelName'],
      ['</color>', 'tagName'],
      [' ', 'labelName'],
      ['<back', 'tagName'],
      [':', 'punctuation'],
      ['#2B3E50', 'ColorLiteral'],
      ['>', 'tagName'],
      ['x', 'labelName'],
      ['</back>', 'tagName'],
      [' ', 'labelName'],
      ['<color', 'tagName'],
      [':', 'punctuation'],
      ['red', 'ColorLiteral'],
      ['>', 'tagName'],
      ['y', 'labelName'],
      ['</color>', 'tagName'],
    ])
  })

  // H10: a tag is read in parts, as VS Code reads HTML.
  describe('a tag\'s parts', () => {
    const note = (text) => tokens(`note: ${text}`).slice(1)
    const attr = (name, value, token = 'string') => [[name, 'attributeName'], ['=', 'punctuation'], [value, token]]

    it('reads attributes of font, img and text', () => {
      expect(note('<font size=12 color=red>big</font>')).toEqual([
        ['<font', 'tagName'], ...attr('size', '12'), ...attr('color', 'red', 'ColorLiteral'), ['>', 'tagName'], ['</font>', 'tagName'],
      ])
      expect(note('<img src="a b.png" valign=top>')).toEqual([
        ['<img', 'tagName'], ...attr('src', '"a b.png"'), ...attr('valign', 'top'), ['>', 'tagName'],
      ])
      expect(note('<text fill=blue>')).toEqual([['<text', 'tagName'], ...attr('fill', 'blue'), ['>', 'tagName']])
      expect(note('<img src=a/b.png/>')).toEqual([['<img', 'tagName'], ...attr('src', 'a/b.png/'), ['>', 'tagName']])
    })

    it('keeps a quoted colour\'s swatch, its quotes a string', () => {
      for (const [quote, colour] of [['"', '#FF0000'], ['"', 'red'], ["'", 'red']]) {
        expect(note(`<font color=${quote}${colour}${quote}>`)).toEqual([
          ['<font', 'tagName'], ...attr('color', quote), [colour, 'ColorLiteral'], [quote, 'string'], ['>', 'tagName'],
        ])
      }
      expect(note('<&star{color="red"}>').slice(4, 7)).toEqual([['"', 'string'], ['red', 'ColorLiteral'], ['"', 'string']])
    })

    it('reads the colon forms', () => {
      expect(note('<color:#FF0000>')).toEqual([['<color', 'tagName'], [':', 'punctuation'], ['#FF0000', 'ColorLiteral'], ['>', 'tagName']])
      expect(note('<color:red>')).toEqual([['<color', 'tagName'], [':', 'punctuation'], ['red', 'ColorLiteral'], ['>', 'tagName']])
      expect(note('<font:Trebuchet MS>')).toEqual([['<font', 'tagName'], [':', 'punctuation'], ['Trebuchet MS', 'string'], ['>', 'tagName']])
      expect(note('<u:red>')).toEqual([['<u', 'tagName'], [':', 'punctuation'], ['red', 'ColorLiteral'], ['>', 'tagName']])
    })

    it('reads the braces after an icon, an emoji and an image', () => {
      expect(note('<&star{scale=2,color=red}>')).toEqual([
        ['<&star', 'tagName'], ['{', 'punctuation'], ...attr('scale', '2'), [',', 'punctuation'], ...attr('color', 'red', 'ColorLiteral'), ['}', 'punctuation'], ['>', 'tagName'],
      ])
      expect(note('<:sunny:{scale=0.5}>')).toEqual([
        ['<:sunny:', 'tagName'], ['{', 'punctuation'], ...attr('scale', '0.5'), ['}', 'punctuation'], ['>', 'tagName'],
      ])
      expect(note('<img:x.png{scale=0.5}>')).toEqual([
        ['<img', 'tagName'], [':', 'punctuation'], ['x.png', 'string'], ['{', 'punctuation'], ...attr('scale', '0.5'), ['}', 'punctuation'], ['>', 'tagName'],
      ])
    })

    it('ends an open tag with its line', () => {
      expect(tokens('note: <font size=12', 'A -> B').slice(-1)).toEqual(tokens('A -> B'))
      expect(tokens('A -> B : <&star{scale=2', 'A -> B').slice(-1)).toEqual(tokens('A -> B'))
    })

    it('finds no attribute in arrows, stereotypes and comparisons', () => {
      for (const line of ['A <- B : x', 'class A <<entity>>', 'note: a < b']) {
        expect(tokens(line).filter(([, token]) => token === 'attributeName'), line).toEqual([])
      }
    })
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

describe('plantumlMode @startcreole', () => {
  it('reads every line of the block as Creole, and PlantUML again after it', () => {
    expect(tokens('@startcreole page', '**b** //i//', '<color:#F00>red</color>', '[[https://x.org]]', '----', 'note {', '@endcreole', 'actor B')).toEqual([
      ['@startcreole', 'keyword'],
      ['**b**', 'strong'],
      ['//i//', 'emphasis'],
      ['<color', 'tagName'],
      [':', 'punctuation'],
      ['#F00', 'ColorLiteral'],
      ['>', 'tagName'],
      ['</color>', 'tagName'],
      ['[[https://x.org]]', 'link'],
      ['----', 'heading'],
      ['@endcreole', 'keyword'],
      ['actor', 'keyword'],
    ])
  })
})

describe('plantumlMode @startfiles', () => {
  it('reads a path with its slashes as punctuation and Creole in its segments', () => {
    expect(tokens('@startfiles', '/src/example.py', '/**creole_test**/""monospaced""', '@endfiles', 'actor B')).toEqual([
      ['@startfiles', 'keyword'],
      ['/', 'punctuation'],
      ['/', 'punctuation'],
      ['/', 'punctuation'],
      ['**creole_test**', 'strong'],
      ['/', 'punctuation'],
      ['""monospaced""', 'monospace'],
      ['@endfiles', 'keyword'],
      ['actor', 'keyword'],
    ])
  })

  it('reads <note> and </note> as tags and the lines between them as Creole', () => {
    expect(tokens('@startfiles x', '/a/b', '<note>', 'a **bold** word', '</note>', '/c', '@endfiles')).toEqual([
      ['@startfiles', 'keyword'],
      ['/', 'punctuation'],
      ['/', 'punctuation'],
      ['<note>', 'tagName'],
      ['**bold**', 'strong'],
      ['</note>', 'tagName'],
      ['/', 'punctuation'],
      ['@endfiles', 'keyword'],
    ])
  })

  it('ends an unclosed <code> at the </note> of its note', () => {
    expect(tokens('@startfiles', '<note>', '<code>', 'x', '</note>', '/c', '@endfiles')).toEqual([
      ['@startfiles', 'keyword'],
      ['<note>', 'tagName'],
      ['<code>', 'tagName'],
      ['x', 'monospace'],
      ['</note>', 'tagName'],
      ['/', 'punctuation'],
      ['@endfiles', 'keyword'],
    ])
  })

  it('leaves a <style> region and the notes of uml as before', () => {
    expect(tokens('@startfiles', '/a', '@endfiles', '<style>', 'note {', '</style>', 'note left of A', '**b**', 'end note')).toEqual([
      ['@startfiles', 'keyword'],
      ['/', 'punctuation'],
      ['@endfiles', 'keyword'],
      ['<style>', 'tagName'],
      ['</style>', 'tagName'],
      ['note', 'keyword'],
      ['**b**', 'strong'],
      ['end note', 'keyword'],
    ])
  })
})

describe('plantumlMode style blocks', () => {
  it('leaves the lines between <style> and </style> plain without a style mode, and reads PlantUML after them', () => {
    expect(tokens('<style>', 'note {', '  BackgroundColor #FFF', '}', 'legend {', 'title {', 'node {', '</style>', 'note left of A', '**b**', 'end note')).toEqual([
      ['<style>', 'tagName'],
      ['</style>', 'tagName'],
      ['note', 'keyword'],
      ['**b**', 'strong'],
      ['end note', 'keyword'],
    ])
  })

  it('finds indented tags inside a uml block, and keeps the indentation plain', () => {
    expect(tokens('@startuml', '  <style>  ', '  note {', '  </style>', 'actor A', '@enduml')).toEqual([
      ['@startuml', 'keyword'],
      ['<style>', 'tagName'],
      ['</style>', 'tagName'],
      ['actor', 'keyword'],
      ['@enduml', 'keyword'],
    ])
  })

  it('reads a one-line block as its tags around plain text, and an imported style sheet as a tag with its attribute', () => {
    expect(tokens('<style>note { BackgroundColor red }</style>', 'note left', 'x', 'end note')).toEqual([
      ['<style>', 'tagName'],
      ['</style>', 'tagName'],
      ['note', 'keyword'],
      ['end note', 'keyword'],
    ])
    expect(tokens('  <style file=my.css>', 'actor A')).toEqual([
      ['<style', 'tagName'],
      ['file', 'attributeName'],
      ['=', 'punctuation'],
      ['my.css', 'string'],
      ['>', 'tagName'],
      ['actor', 'keyword'],
    ])
  })

  it('ends a block left open at @end, as PlantUML does', () => {
    expect(tokens('@startuml', '<style>', 'note {', '@enduml', 'actor A')).toEqual([
      ['@startuml', 'keyword'],
      ['<style>', 'tagName'],
      ['@enduml', 'keyword'],
      ['actor', 'keyword'],
    ])
  })

  it('takes no <style> inside a note, or after text on the line', () => {
    expect(tokens('note left', '<style>', 'end note', 'actor A')).toEqual([['note', 'keyword'], ['end note', 'keyword'], ['actor', 'keyword']])
    expect(tokens('A -> B : <style>')).toEqual([['->', 'operator'], ['<style>', 'labelName']])
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

  it("hands a style block's lines to the style mode, at top level and inside a uml block", () => {
    const styled = (...lines) => tokensOf(plantumlLanguage({ style: whole('atom') }), lines)

    expect(styled('@startuml', '<style>', 'note {', '}', '</style>', 'actor A', '@enduml')).toEqual([
      ['@startuml', 'keyword'],
      ['<style>', 'tagName'],
      ['note {', 'atom'],
      ['}', 'atom'],
      ['</style>', 'tagName'],
      ['actor', 'keyword'],
      ['@enduml', 'keyword'],
    ])
    expect(styled('<style>', "' a note", '  !$x = 1', 'a {', '</style>')).toEqual([
      ['<style>', 'tagName'],
      ["' a note", 'comment'],
      ['!$x = 1', 'meta'],
      ['a {', 'atom'],
      ['</style>', 'tagName'],
    ])
    expect(styled('@startstyle', 'a {', '@endstyle')).toEqual([])
  })

  it('hands the middle of a one-line block to the style mode, never its tags, at top level and in a nested mode', () => {
    const styled = (...lines) => tokensOf(plantumlLanguage({ style: whole('atom'), yaml: whole('string') }), lines)

    expect(styled('  <style>a { b }</style>  ', 'actor A')).toEqual([
      ['<style>', 'tagName'],
      ['a { b }', 'atom'],
      ['</style>', 'tagName'],
      ['actor', 'keyword'],
    ])
    // Two tokens of one name side by side are one node.
    expect(styled('<style></style>', '<style>a</style>x</style>')).toEqual([
      ['<style></style>', 'tagName'],
      ['<style>', 'tagName'],
      ['a</style>x', 'atom'],
      ['</style>', 'tagName'],
    ])
    expect(styled('@startyaml', '<style>a {}</style>', 'b: 1', '@endyaml')).toEqual([
      ['@startyaml', 'keyword'],
      ['<style>', 'tagName'],
      ['a {}', 'atom'],
      ['</style>', 'tagName'],
      ['b: 1', 'string'],
      ['@endyaml', 'keyword'],
    ])
  })

  it('reads a style block inside a yaml block as style, and yaml again after it', () => {
    const language = plantumlLanguage({ yaml: whole('atom'), style: whole('string') })

    expect(tokensOf(language, ['@startyaml', 'a: 1', '  <style>', 'node {', '  </style>', 'b: 2', '@endyaml', 'actor A'])).toEqual([
      ['@startyaml', 'keyword'],
      ['a: 1', 'atom'],
      ['<style>', 'tagName'],
      ['node {', 'string'],
      ['</style>', 'tagName'],
      ['b: 2', 'atom'],
      ['@endyaml', 'keyword'],
      ['actor', 'keyword'],
    ])
    expect(tokensOf(language, ['@startyaml', '<style>', 'node {', '@endyaml', 'actor A']).slice(-2)).toEqual([['@endyaml', 'keyword'], ['actor', 'keyword']])
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

  it("copies the style state with the style mode's own copyState, and passes it blank lines", () => {
    const style = {
      startState: () => ({ blanks: 0 }),
      copyState: (state) => ({ ...state, copied: true }),
      blankLine: (state) => { state.blanks++ },
      token: (stream) => { stream.skipToEnd(); return 'atom' },
    }
    const { streamParser } = plantumlLanguage({ style })
    const state = stateAfter(streamParser, ['<style>', '', 'a {'])

    expect(state.style.state).toEqual({ blanks: 1 })
    expect(streamParser.copyState(state).style.state).toEqual({ blanks: 1, copied: true })
  })

  it('builds a new language on every call', () => {
    expect(plantumlLanguage({})).not.toBe(plantumlLanguage({}))
  })
})

describe('plantumlMode Creole, complete (X19)', () => {
  const note = (...lines) => tokens('note left of A', ...lines, 'end note')
  const inner = (...lines) => note(...lines).slice(1, -1)
  const P = (text) => [text, 'punctuation']

  it.each([
    ['a note body', (...lines) => inner(...lines)],
    ['a @startcreole block', (...lines) => tokens('@startcreole', ...lines, '@endcreole').slice(1, -1)],
  ])('reads headings, list markers and tree lines at the start of a line in %s', (_, read) => {
    expect(read('== Large heading')).toEqual([['== Large heading', 'heading']])
    expect(read('=== Third', '= First')).toEqual([['=== Third', 'heading'], ['= First', 'heading']])
    expect(read('** Sub item', '# one', '  ## two')).toEqual([P('**'), P('#'), P('##')])
    expect(read('  |_ Level 2a')).toEqual([P('|_')])
    expect(read('..My title..', '==Title==', '--Another title--', '____', '----')).toEqual([
      ['..My title..', 'heading'],
      ['==Title==', 'heading'],
      ['--Another title--', 'heading'],
      ['____', 'heading'],
      ['----', 'heading'],
    ])
  })

  it('leaves a bold run at the start of a line bold, not a list item', () => {
    expect(inner('**b** x')).toEqual([['**b**', 'strong']])
  })

  it('reads no heading or list marker in a one-line label, where # is a colour', () => {
    expect(tokens('A -> B : == x')).toEqual([['->', 'operator'], ['== x', 'labelName']])
    expect(tokens('A -> B : * x')).toEqual([['->', 'operator'], ['* x', 'labelName']])
    expect(tokens('note right of A : * x')).toEqual([['note', 'keyword']])
    expect(tokens('note right of A : # x')).toEqual([['note', 'keyword']])
  })

  it('dims a ~ escape and leaves the next character plain', () => {
    expect(inner('~**not bold~**')).toEqual([P('~'), P('~')])
    expect(tokens('A -> B : ~**x~** **y**').slice(1)).toEqual([
      ['~', 'punctuation'],
      ['**x', 'labelName'],
      ['~', 'punctuation'],
      ['** ', 'labelName'],
      ['**y**', 'strong_labelName'],
    ])
  })

  it('keeps ~~wave~~ plain', () => {
    expect(tokens('A -> B : ~~wavy~~')).toEqual([['->', 'operator'], ['~~wavy~~', 'labelName']])
  })

  it('reads Unicode and numeric character tags', () => {
    expect(inner('<U+221E> and &#8734;')).toEqual([['<U+221E>', 'tagName'], ['&#8734;', 'tagName']])
  })

  it('reads table row and cell colours as tags with colour literals, and a coloured emoji', () => {
    expect(inner('<#lightblue,#red>|=  Step  |', '|<#FF8080> red |', '<#green:sunny:>')).toEqual([
      ['<', 'tagName'], ['#lightblue', 'ColorLiteral'], [',', 'tagName'], ['#red', 'ColorLiteral'], ['>', 'tagName'],
      P('|='), P('|'),
      P('|'), ['<', 'tagName'], ['#FF8080', 'ColorLiteral'], ['>', 'tagName'], P('|'),
      ['<', 'tagName'], ['#green', 'ColorLiteral'], [':sunny:>', 'tagName'],
    ])
    expect(inner('<#00FF00,#FF0000>|=')[1]).toEqual(['#00FF00', 'ColorLiteral'])
  })

  it('reads <r> as a tag', () => {
    expect(inner('|<r> x |')).toEqual([P('|'), ['<r>', 'tagName'], P('|')])
  })

  it('reads the lines between <code> and </code> as monospace, and keeps going after', () => {
    expect(inner('<code>', '**not bold**', '</code>', '**bold**')).toEqual([
      ['<code>', 'tagName'],
      ['**not bold**', 'monospace'],
      ['</code>', 'tagName'],
      ['**bold**', 'strong'],
    ])
    expect(tokens('@startcreole', '<code>', 'x', '</code>', '@endcreole', 'actor B').map(([, t]) => t)).toEqual(['keyword', 'tagName', 'monospace', 'tagName', 'keyword', 'keyword'])
  })

  it('ends a note at its closer even inside an unclosed <code>', () => {
    expect(tokens('note left of A', '<code>', 'x', 'end note', 'actor B').map(([, t]) => t)).toEqual(['keyword', 'tagName', 'monospace', 'keyword', 'keyword'])
  })
})
