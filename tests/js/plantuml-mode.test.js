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

  it('names every @start<type> and @end<type> line as a keyword, and the name after a start a DiagramName', () => {
    expect(tokens('@startsalt login', '@endsalt', '@startmindmap', '@endgantt', '@startwire x')).toEqual([
      ['@startsalt', 'keyword'], ['login', 'DiagramName'], ['@endsalt', 'keyword'], ['@startmindmap', 'keyword'], ['@endgantt', 'keyword'],
      ['@startwire', 'keyword'], ['x', 'DiagramName'],
    ])
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
    expect(tokens('Customer -> Shop : place order')).toEqual([['->', 'LinkOperator'], ['place order', 'labelName']])
  })

  it.each(['-->', '<-', '->>', '..>', 'o->', '==>', '~~>'])('names %s as an operator', (arrow) => {
    expect(tokens(`A ${arrow} B`)).toEqual([[arrow, 'LinkOperator']])
  })

  it.each(['--', '..', '~~', '==', '---', '-up-', '.left.'])('names the headless link %s as an operator too', (link) => {
    expect(tokens(`node1 ${link} node2`)).toEqual([[link, 'LinkOperator']])
  })

  it('names a styled link in pieces: the strokes and brackets operators, a colour a colour, the rest attributes', () => {
    expect(tokens('A -[#red]-> B')).toEqual([['-[', 'LinkOperator'], ['#red', 'ColorLiteral'], [']->', 'LinkOperator']])
    expect(tokens('node1 -[hidden]- node2')).toEqual([['-[', 'LinkOperator'], ['hidden', 'attributeName'], [']-', 'LinkOperator']])
    expect(tokens('api -[#FF6F61,bold]-> jobs : deploys')).toEqual([
      ['-[', 'LinkOperator'],
      ['#FF6F61', 'ColorLiteral'],
      ['bold', 'attributeName'],
      [']->', 'LinkOperator'],
      ['deploys', 'labelName'],
    ])
    expect(tokens('A .[#00F, dashed, thickness=2]..> B')).toEqual([
      ['.[', 'LinkOperator'],
      ['#00F', 'ColorLiteral'],
      ['dashed', 'attributeName'],
      ['thickness=2', 'attributeName'],
      [']..>', 'LinkOperator'],
    ])
    expect(tokens('A <-[#red]- B')).toEqual([['<-[', 'LinkOperator'], ['#red', 'ColorLiteral'], [']-', 'LinkOperator']])
  })

  it('never carries a label, a styled link or a note line into the next line', () => {
    expect(tokens('A -> B : hi', 'participant C')).toEqual([['->', 'LinkOperator'], ['hi', 'labelName'], ['participant', 'keyword']])
    expect(tokens('A -> B', 'participant C : x')).toEqual([['->', 'LinkOperator'], ['participant', 'keyword']])
    expect(tokens('note left of A : hi', 'actor B')).toEqual([['note', 'keyword'], ['actor', 'keyword']])
    expect(tokens('title A **b**', 'actor B')).toEqual([['title', 'keyword'], ['**b**', 'strong'], ['actor', 'keyword']])
  })

  it('labels a headless link, a quoted end, and a label with no spaces round the colon', () => {
    expect(tokens('node1 -- node2 : label1')).toEqual([['--', 'LinkOperator'], ['label1', 'labelName']])
    expect(tokens('A ~~ "Big B" : waves')).toEqual([['~~', 'LinkOperator'], ['waves', 'labelName']])
    expect(tokens('A->B:hi')).toEqual([['->', 'LinkOperator'], ['hi', 'labelName']])
  })

  it('finds no arrow inside a word or a URL, but keeps o and x heads', () => {
    expect(tokens('database db [[https://www.postgresql.org/docs/ Postgres docs]]')).toEqual([
      ['database', 'keyword'],
      ['[[https://www.postgresql.org/docs/ Postgres docs]]', 'link'],
    ])
    expect(tokens('A --o B')).toEqual([['--o', 'LinkOperator']])
    expect(tokens('A ..x B')).toEqual([['..x', 'LinkOperator']])
    expect(tokens('A-->B')).toEqual([['-->', 'LinkOperator']])
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

  it('keeps indentation out of a keyword', () => {
    expect(tokens('  note left of A')).toEqual([['note', 'keyword']])
  })
})

// X7: the directive word is meta; variables and functions are coloured as editors colour them.
describe('plantumlMode preprocessor', () => {
  it('names the directive word meta, a variable a variable and its value a string', () => {
    expect(tokens('!$app = "Nextcloud"')).toEqual([['!', 'meta'], ['$app', 'VariableName'], ['=', 'definitionOperator'], ['"Nextcloud"', 'string']])
  })

  it('names a procedure where it is declared a function, and its parameters variables', () => {
    expect(tokens('!procedure $ask($from, $to, $what)')).toEqual([
      ['!procedure', 'meta'],
      ['$ask', 'FunctionName'],
      ['(', 'paren'],
      ['$from', 'VariableName'],
      [',', 'separator'],
      ['$to', 'VariableName'],
      [',', 'separator'],
      ['$what', 'VariableName'],
      [')', 'paren'],
    ])
  })

  it('names variables on a body line too, a label and a note included', () => {
    expect(tokens('  $from -> $to : $what')).toEqual([['$from', 'VariableName'], ['->', 'LinkOperator'], ['$to', 'VariableName'], ['$what', 'VariableName']])
    expect(tokens('note over $to : sent by $from')).toEqual([['note', 'keyword'], ['$to', 'VariableName'], ['$from', 'VariableName']])
    expect(tokens('note left of $to', 'by $from', 'end note')).toEqual([['note', 'keyword'], ['$to', 'VariableName'], ['$from', 'VariableName'], ['end note', 'keyword']])
  })

  it('names a built-in and a call functions, strings strings and numbers numbers', () => {
    expect(tokens('!if %strlen("stdlib") > 3', '$ask(nc, db, "x")', '!endif')).toEqual([
      ['!if', 'meta'],
      ['%strlen', 'FunctionName'],
      ['(', 'paren'],
      ['"stdlib"', 'string'],
      [')', 'paren'],
      ['>', 'compareOperator'],
      ['3', 'number'],
      ['$ask', 'FunctionName'],
      ['"x"', 'string'],
      ['!endif', 'meta'],
    ])
  })

  it('names the <…> after an include brackets and a path, a path a path, and leaves a theme\'s name plain', () => {
    expect(tokens('!include <C4/C4_Container>')).toEqual([['!include', 'meta'], ['<', 'angleBracket'], ['C4/C4_Container', 'url'], ['>', 'angleBracket']])
    expect(tokens('  !theme sunlust')).toEqual([['!theme', 'meta']])
    expect(tokens('!include x.puml')).toEqual([['!include', 'meta'], ['x.puml', 'url']])
  })

  it('ends with its line', () => {
    expect(tokens('!$x = 1', 'actor A : 2')).toEqual([['!', 'meta'], ['$x', 'VariableName'], ['=', 'definitionOperator'], ['1', 'number'], ['actor', 'keyword']])
  })

  it('leaves a price, a sprite, a string, a link and a comment as they were', () => {
    expect(tokens('A -> B : costs $5 or 50%')).toEqual([['->', 'LinkOperator'], ['costs $5 or 50%', 'labelName']])
    expect(tokens('note right of A : costs $5')).toEqual([['note', 'keyword']])
    expect(tokens('A -> B : <$foo>')).toEqual([['->', 'LinkOperator'], ['<$foo>', 'tagName']])
    expect(tokens('participant "a $b"')).toEqual([['participant', 'keyword'], ['"a $b"', 'string']])
    expect(tokens('A -> B : [[http://x/$y $z]]')).toEqual([['->', 'LinkOperator'], ['[[http://x/$y $z]]', 'link']])
    expect(tokens("' $x and %f(1)")).toEqual([["' $x and %f(1)", 'comment']])
  })

  it('names a sprite a keyword and a name where it is declared and a tag where it is used', () => {
    expect(tokens('sprite $foo [16x16/16] {')[0]).toEqual(['sprite', 'keyword'])
    expect(tokens('sprite $foo [16x16/16] {')[1]).toEqual(['$foo', 'VariableName'])
    expect(tokens('  sprite foo <svg/>').slice(0, 2)).toEqual([['sprite', 'keyword'], ['foo', 'VariableName']])
    expect(tokens('rectangle <$foo> as r')).toEqual([['rectangle', 'keyword'], ['<$foo>', 'tagName'], ['as', 'keyword']])
  })

  it('names a variable before a spaced bracket a variable, not a call', () => {
    expect(tokens('A -> $b (x)')).toEqual([['->', 'LinkOperator'], ['$b', 'VariableName']])
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
    expect(tokens('A -[#Red,bold]-> B')).toEqual([['-[', 'LinkOperator'], ['#Red', 'ColorLiteral'], ['bold', 'attributeName'], [']->', 'LinkOperator']])
    expect(tokens('A -> B : <color:#Red>hot</color>').slice(1, 5)).toEqual([['<color', 'tagName'], [':', 'separator'], ['#Red', 'ColorLiteral'], ['>', 'tagName']])
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

// H22, R5: a path where a path goes, a URL where words are read.
describe('plantumlMode paths and protocols', () => {
  const include = (rest) => [['!include', 'meta'], ...rest]

  it('reads an include\'s path, its selector a separator and then an id or a number', () => {
    expect(tokens('!include ./parts.puml!ACTORS')).toEqual(include([['./parts.puml', 'url'], ['!', 'separator'], ['ACTORS', 'typeName']]))
    expect(tokens('!include parts.puml!2')).toEqual(include([['parts.puml', 'url'], ['!', 'separator'], ['2', 'number']]))
    expect(tokens('!include https://x.org/a.puml')).toEqual(include([['https://x.org/a.puml', 'url']]))
    expect(tokens('!include <C4/C4>')).toEqual(include([['<', 'angleBracket'], ['C4/C4', 'url'], ['>', 'angleBracket']]))
  })

  it.each(['!include_many', '!include_once', '!includesub', '!import'])('reads the path after %s', (word) => {
    expect(tokens(`${word} ../lib/a.puml`)).toEqual([[word, 'meta'], ['../lib/a.puml', 'url']])
  })

  it('reads a theme\'s path after from, and its name plain', () => {
    expect(tokens('!theme mars from ./themes')).toEqual([['!theme', 'meta'], ['./themes', 'url']])
    expect(tokens('!theme mars from https://x.org/t')).toEqual([['!theme', 'meta'], ['https://x.org/t', 'url']])
    expect(tokens('!import lib.zip')).toEqual([['!import', 'meta'], ['lib.zip', 'url']])
  })

  // R5: the arithmetic rule does not see a path's `/` and `-`, or a theme's `-`.
  it.each(['!include dir/foo-bar.puml', '!include https://x.org/a-b/c.puml', '!theme my-theme', '!theme my-theme from ./a-b/c'])('colours no operator in %s', (line) => {
    expect(tokens(line).map(([, token]) => token)).not.toContain('arithmeticOperator')
  })

  it('leaves a computed or quoted include to the preprocessor', () => {
    expect(tokens('!include "a b.puml"')).toEqual(include([['"a b.puml"', 'string']]))
    expect(tokens('!include %get_json_attribute($a, "b")')).toEqual(include([['%get_json_attribute', 'FunctionName'], ['(', 'paren'], ['$a', 'VariableName'], [',', 'separator'], ['"b"', 'string'], [')', 'paren']]))
    expect(tokens('!include', 'actor A')).toEqual([['!include', 'meta'], ['actor', 'keyword']])
    expect(tokens('!include   ', 'actor A')).toEqual([['!include', 'meta'], ['actor', 'keyword']])
  })

  it('reads a URL in a label, and the rest of the label as a label', () => {
    expect(tokens('A -> B : see https://plantuml.com/x')).toEqual([['->', 'LinkOperator'], ['see ', 'labelName'], ['https://plantuml.com/x', 'url']])
    expect(tokens('A -> B : //a// file://out/d')).toEqual([['->', 'LinkOperator'], ['//a//', 'emphasis_labelName'], [' ', 'labelName'], ['file://out/d', 'url']])
  })

  it('starts no italics at a URL\'s //', () => {
    expect(tokens('note : http://a.org/x and http://b.org/y')).toEqual([['note', 'keyword'], ['http://a.org/x', 'url'], ['http://b.org/y', 'url']])
    const kinds = tokens('A -> B : http://a.org/x and http://b.org/y').map(([, kind]) => kind)
    expect(kinds).not.toContain('emphasis_labelName')
    expect(kinds.filter((kind) => kind === 'url')).toHaveLength(2)
  })

  it('leaves a word with a slash and no scheme plain', () => {
    expect(tokens('A -> B : and/or')).toEqual([['->', 'LinkOperator'], ['and/or', 'labelName']])
    expect(tokens('note : and/or')).toEqual([['note', 'keyword']])
  })

  it('reads <img:…>, <img src=…> and <style file=…> as paths', () => {
    expect(tokens('A -> B : <img:icons/a.png>').slice(1)).toEqual([['<img', 'tagName'], [':', 'separator'], ['icons/a.png', 'url'], ['>', 'tagName']])
    expect(tokens('note : <img src=./a.png>').slice(1)).toEqual([['<img', 'tagName'], ['src', 'attributeName'], ['=', 'definitionOperator'], ['./a.png', 'url'], ['>', 'tagName']])
    expect(tokens('<style file=./a.css>').map(([text, token]) => `${text}:${token}`)).toContain('./a.css:url')
  })

  it('keeps a [[link]] a link and a quoted string a string', () => {
    expect(tokens('A -> B : [[https://x label]]')).toEqual([['->', 'LinkOperator'], ['[[https://x label]]', 'link']])
    expect(tokens('participant "https://x"')).toEqual([['participant', 'keyword'], ['"https://x"', 'string']])
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
      [':', 'separator'],
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
      [':', 'separator'],
      ['logo.png', 'url'],
      ['>', 'tagName'],
    ])
    expect(label('<color:#FF6F61>hot</color> <back:#2B3E50>x</back> <color:red>y</color>')).toEqual([
      ['<color', 'tagName'],
      [':', 'separator'],
      ['#FF6F61', 'ColorLiteral'],
      ['>', 'tagName'],
      ['hot', 'labelName'],
      ['</color>', 'tagName'],
      [' ', 'labelName'],
      ['<back', 'tagName'],
      [':', 'separator'],
      ['#2B3E50', 'ColorLiteral'],
      ['>', 'tagName'],
      ['x', 'labelName'],
      ['</back>', 'tagName'],
      [' ', 'labelName'],
      ['<color', 'tagName'],
      [':', 'separator'],
      ['red', 'ColorLiteral'],
      ['>', 'tagName'],
      ['y', 'labelName'],
      ['</color>', 'tagName'],
    ])
  })

  // H10: a tag is read in parts, as VS Code reads HTML.
  describe('a tag\'s parts', () => {
    const note = (text) => tokens(`note: ${text}`).slice(1)
    const attr = (name, value, token = 'string') => [[name, 'attributeName'], ['=', 'definitionOperator'], [value, token]]

    it('reads attributes of font, img and text', () => {
      expect(note('<font size=12 color=red>big</font>')).toEqual([
        ['<font', 'tagName'], ...attr('size', '12'), ...attr('color', 'red', 'ColorLiteral'), ['>', 'tagName'], ['</font>', 'tagName'],
      ])
      expect(note('<img src="a b.png" valign=top>')).toEqual([
        ['<img', 'tagName'], ...attr('src', '"a b.png"'), ...attr('valign', 'top'), ['>', 'tagName'],
      ])
      expect(note('<text fill=blue>')).toEqual([['<text', 'tagName'], ...attr('fill', 'blue'), ['>', 'tagName']])
      expect(note('<img src=a/b.png/>')).toEqual([['<img', 'tagName'], ...attr('src', 'a/b.png/', 'url'), ['>', 'tagName']])
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
      expect(note('<color:#FF0000>')).toEqual([['<color', 'tagName'], [':', 'separator'], ['#FF0000', 'ColorLiteral'], ['>', 'tagName']])
      expect(note('<color:red>')).toEqual([['<color', 'tagName'], [':', 'separator'], ['red', 'ColorLiteral'], ['>', 'tagName']])
      expect(note('<font:Trebuchet MS>')).toEqual([['<font', 'tagName'], [':', 'separator'], ['Trebuchet MS', 'string'], ['>', 'tagName']])
      expect(note('<u:red>')).toEqual([['<u', 'tagName'], [':', 'separator'], ['red', 'ColorLiteral'], ['>', 'tagName']])
    })

    it('reads the braces after an icon, an emoji and an image', () => {
      expect(note('<&star{scale=2,color=red}>')).toEqual([
        ['<&star', 'tagName'], ['{', 'brace'], ...attr('scale', '2'), [',', 'separator'], ...attr('color', 'red', 'ColorLiteral'), ['}', 'brace'], ['>', 'tagName'],
      ])
      expect(note('<:sunny:{scale=0.5}>')).toEqual([
        ['<:sunny:', 'tagName'], ['{', 'brace'], ...attr('scale', '0.5'), ['}', 'brace'], ['>', 'tagName'],
      ])
      expect(note('<img:x.png{scale=0.5}>')).toEqual([
        ['<img', 'tagName'], [':', 'separator'], ['x.png', 'url'], ['{', 'brace'], ...attr('scale', '0.5'), ['}', 'brace'], ['>', 'tagName'],
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
      ['see ', 'labelName'],
      ['https://x.org/a//b', 'url'],
      [' and ', 'labelName'],
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
      ['|=', 'separator'],
      ['|=', 'separator'],
      ['|', 'separator'],
      ['|', 'separator'],
      ['|', 'separator'],
      ['|', 'separator'],
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

  it('reads an inline <math> as its tags around plain text before the math profile, and the next line as ever', () => {
    expect(tokens('note: area <math>pi r^2</math>', 'actor A')).toEqual([
      ['note', 'keyword'],
      ['<math>', 'tagName'],
      ['</math>', 'tagName'],
      ['actor', 'keyword'],
    ])
    expect(label('<math>x</math> y')).toEqual([['<math>', 'tagName'], ['</math>', 'tagName'], [' y', 'labelName']])
  })

  it('takes no <math> in capitals, without its </math> on the line, or with nothing in it', () => {
    expect(label('<MATH>x</MATH>')).toEqual([['<MATH>x</MATH>', 'labelName']])
    expect(label('<math>x')).toEqual([['<math>x', 'labelName']])
    expect(label('<math></math>')).toEqual([['<math></math>', 'labelName']])
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
      ['page', 'DiagramName'],
      ['**b**', 'strong'],
      ['//i//', 'emphasis'],
      ['<color', 'tagName'],
      [':', 'separator'],
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
      ['x', 'DiagramName'],
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
      ['=', 'definitionOperator'],
      ['my.css', 'url'],
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
    expect(tokens('A -> B : <style>')).toEqual([['->', 'LinkOperator'], ['<style>', 'labelName']])
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
      ['!include', 'meta'],
      ['x.puml', 'url'],
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

  it('reads the body of a block of a type it has no mode for as before, its @start and @end lines keywords', () => {
    const lines = ['@startyaml', 'fruits:', '  - "apple"', "' a note", '@endyaml', 'actor A']
    const expected = [['@startyaml', 'keyword'], ['"apple"', 'string'], ["' a note", 'comment'], ['@endyaml', 'keyword'], ['actor', 'keyword']]
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
      ['!', 'meta'],
      ['$x', 'VariableName'],
      ['=', 'definitionOperator'],
      ['1', 'number'],
      ['a {', 'atom'],
      ['</style>', 'tagName'],
    ])
    expect(styled('@startstyle', 'a {', '@endstyle')).toEqual([['@startstyle', 'keyword'], ['@endstyle', 'keyword']])
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

  it('hands the middle of an inline <math> to the math mode, never past its </math>', () => {
    const mathy = (...lines) => tokensOf(plantumlLanguage({ math: whole('atom') }), lines)

    expect(mathy('note: area <math>pi r^2</math> m', 'actor A')).toEqual([
      ['note', 'keyword'],
      ['<math>', 'tagName'],
      ['pi r^2', 'atom'],
      ['</math>', 'tagName'],
      ['actor', 'keyword'],
    ])
    expect(mathy('A -> B : <math>a</math>b</math>')).toEqual([
      ['->', 'LinkOperator'],
      ['<math>', 'tagName'],
      ['a', 'atom'],
      ['</math>', 'tagName'],
      ['b</math>', 'labelName'],
    ])
  })

  it('hands the middle of an inline <latex> to the latex mode, never past its </latex>', () => {
    const texy = (...lines) => tokensOf(plantumlLanguage({ latex: whole('atom') }), lines)

    expect(texy('note: area <latex>\\pi r^2</latex> m', 'actor A')).toEqual([
      ['note', 'keyword'],
      ['<latex>', 'tagName'],
      ['\\pi r^2', 'atom'],
      ['</latex>', 'tagName'],
      ['actor', 'keyword'],
    ])
    expect(texy('A -> B : <latex>a</latex>b</latex>')).toEqual([
      ['->', 'LinkOperator'],
      ['<latex>', 'tagName'],
      ['a', 'atom'],
      ['</latex>', 'tagName'],
      ['b</latex>', 'labelName'],
    ])
  })

  it('hands the lines of a <latex> block to the latex mode, to the line </latex> or the body end', () => {
    const texy = (...lines) => tokensOf(plantumlLanguage({ latex: whole('atom') }), lines)

    expect(texy('note left', '<latex>', '\\a', '', '\\b', '</latex>', 'x', 'end note', 'actor A')).toEqual([
      ['note', 'keyword'],
      ['<latex>', 'tagName'],
      ['\\a', 'atom'],
      ['\\b', 'atom'],
      ['</latex>', 'tagName'],
      ['end note', 'keyword'],
      ['actor', 'keyword'],
    ])
    expect(texy('title', '<latex>', '\\a', 'end title', 'actor A')).toEqual([
      ['title', 'keyword'],
      ['<latex>', 'tagName'],
      ['\\a', 'atom'],
      ['end title', 'keyword'],
      ['actor', 'keyword'],
    ])
  })

  it('ends an unclosed <latex> block at the </note> of a files note and the ] of a description', () => {
    const texy = (...lines) => tokensOf(plantumlLanguage({ latex: whole('atom') }), lines)

    expect(texy('@startfiles', '<note>', '<latex>', '\\a', '</note>', 'b', '@endfiles').slice(1, -1)).toEqual([
      ['<note>', 'tagName'],
      ['<latex>', 'tagName'],
      ['\\a', 'atom'],
      ['</note>', 'tagName'],
    ])
    expect(texy('node web [', '<latex>', '\\a', ']', 'node db')).toEqual([
      ['node', 'keyword'],
      ['<latex>', 'tagName'],
      ['\\a', 'atom'],
      ['node', 'keyword'],
    ])
    // Elsewhere neither ends it: a note's LaTeX may hold a line starting `]`.
    expect(texy('note left', '<latex>', ']', '\\b', 'end note')).toContainEqual(['\\b', 'atom'])
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
  const List = (text) => [text, 'list']
  const Bar = (text) => [text, 'separator']

  it.each([
    ['a note body', (...lines) => inner(...lines)],
    ['a @startcreole block', (...lines) => tokens('@startcreole', ...lines, '@endcreole').slice(1, -1)],
  ])('reads headings, list markers and tree lines at the start of a line in %s', (_, read) => {
    expect(read('== Large heading')).toEqual([['== Large heading', 'heading']])
    expect(read('=== Third', '= First')).toEqual([['=== Third', 'heading'], ['= First', 'heading']])
    expect(read('** Sub item', '# one', '  ## two')).toEqual([List('**'), List('#'), List('##')])
    expect(read('  |_ Level 2a')).toEqual([List('|_')])
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
    expect(tokens('A -> B : == x')).toEqual([['->', 'LinkOperator'], ['== x', 'labelName']])
    expect(tokens('A -> B : * x')).toEqual([['->', 'LinkOperator'], ['* x', 'labelName']])
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
    expect(tokens('A -> B : ~~wavy~~')).toEqual([['->', 'LinkOperator'], ['~~wavy~~', 'labelName']])
  })

  it('reads Unicode and numeric character tags', () => {
    expect(inner('<U+221E> and &#8734;')).toEqual([['<U+221E>', 'tagName'], ['&#8734;', 'tagName']])
  })

  it('reads table row and cell colours as tags with colour literals, and a coloured emoji', () => {
    expect(inner('<#lightblue,#red>|=  Step  |', '|<#FF8080> red |', '<#green:sunny:>')).toEqual([
      ['<', 'tagName'], ['#lightblue', 'ColorLiteral'], [',', 'tagName'], ['#red', 'ColorLiteral'], ['>', 'tagName'],
      Bar('|='), Bar('|'),
      Bar('|'), ['<', 'tagName'], ['#FF8080', 'ColorLiteral'], ['>', 'tagName'], Bar('|'),
      ['<', 'tagName'], ['#green', 'ColorLiteral'], [':sunny:>', 'tagName'],
    ])
    expect(inner('<#00FF00,#FF0000>|=')[1]).toEqual(['#00FF00', 'ColorLiteral'])
  })

  it('reads <r> as a tag', () => {
    expect(inner('|<r> x |')).toEqual([Bar('|'), ['<r>', 'tagName'], Bar('|')])
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

// The dictionary's categories (Y22-Y31) for the constructs the core reads.
describe('plantumlMode, by dictionary category', () => {
  const note = (...lines) => tokens('note left of A', ...lines, 'end note').slice(1, -1)

  it('names a link LinkOperator, a styled one in pieces', () => {
    expect(tokens('A -> B')).toEqual([['->', 'LinkOperator']])
    expect(tokens('A -[#red,dashed]-> B')).toEqual([['-[', 'LinkOperator'], ['#red', 'ColorLiteral'], ['dashed', 'attributeName'], [']->', 'LinkOperator']])
  })

  it('names a tag by its parts: name, separator, string and brace', () => {
    expect(tokens('A -> B : <size:12>x</size>').slice(1, 5)).toEqual([['<size', 'tagName'], [':', 'separator'], ['12', 'string'], ['>', 'tagName']])
    expect(tokens('A -> B : <&star{scale=2}>').slice(1)).toEqual([
      ['<&star', 'tagName'], ['{', 'brace'], ['scale', 'attributeName'], ['=', 'definitionOperator'], ['2', 'string'], ['}', 'brace'], ['>', 'tagName'],
    ])
    expect(tokens('A -> B : <font size=12 color=red>').slice(1).filter(([, t]) => t === 'definitionOperator')).toHaveLength(2)
  })

  it('names list and tree markers list, and table bars separators', () => {
    expect(note('* item')[0]).toEqual(['*', 'list'])
    expect(note('## two')[0]).toEqual(['##', 'list'])
    expect(note('|_ leaf')[0]).toEqual(['|_', 'list'])
    expect(note('| a | b |').filter(([text]) => text === '|').map(([, t]) => t)).toEqual(['separator', 'separator', 'separator'])
  })

  it('splits the preprocessor operators by kind', () => {
    expect(tokens('!if $a == 1 && $b != 2').filter(([, t]) => /Operator$/.test(t))).toEqual([
      ['==', 'compareOperator'], ['&&', 'logicOperator'], ['!=', 'compareOperator'],
    ])
    expect(tokens('!$x = $a + 1').slice(2)).toEqual([['=', 'definitionOperator'], ['$a', 'VariableName'], ['+', 'arithmeticOperator'], ['1', 'number']])
    expect(tokens('!$y ?= 2')[2]).toEqual(['?=', 'definitionOperator'])
    expect(tokens('!$z = $f(1, 2)').slice(4)).toEqual([['(', 'paren'], ['1', 'number'], [',', 'separator'], ['2', 'number'], [')', 'paren']])
  })

  it('names a sprite head by its brackets and separators', () => {
    expect(tokens('sprite $s [16x16/16] {', '}').slice(2)).toEqual([
      ['[', 'squareBracket'], ['16', 'number'], ['x', 'separator'], ['16', 'number'], ['/', 'separator'], ['16', 'number'], [']', 'squareBracket'], ['{', 'brace'], ['}', 'brace'],
    ])
  })
})

describe('plantumlMode a diagram\'s name (H12)', () => {
  const whole = (token) => ({ token: (stream) => { stream.skipToEnd(); return token }, startState: () => ({}) })
  const nested = (...lines) => tokensOf(plantumlLanguage({ chart: whole('atom'), yaml: whole('atom') }), lines)

  it('underlines the name after the type', () => {
    expect(tokens('@startuml My Fun Diagram')).toEqual([['@startuml', 'keyword'], ['My Fun Diagram', 'DiagramName']])
  })

  it('reads the name of a type with a mode of its own the same way', () => {
    expect(nested('@startchart revenue', 'a', '@endchart')).toEqual([
      ['@startchart', 'keyword'], ['revenue', 'DiagramName'], ['a', 'atom'], ['@endchart', 'keyword'],
    ])
    expect(nested('@startyaml config', 'a', '@endyaml').slice(0, 2)).toEqual([['@startyaml', 'keyword'], ['config', 'DiagramName']])
  })

  it('leaves the quotes around a name as punctuation', () => {
    expect(tokens('@startuml "quoted name"')).toEqual([
      ['@startuml', 'keyword'], ['"', 'punctuation'], ['quoted name', 'DiagramName'], ['"', 'punctuation'],
    ])
  })

  it('leaves the braces around a name as braces', () => {
    expect(tokens('@startuml{fun_file.png}')).toEqual([
      ['@startuml', 'keyword'], ['{', 'brace'], ['fun_file.png', 'DiagramName'], ['}', 'brace'],
    ])
  })

  it('reads (…) straight after the type as a call, and a name after it as the name', () => {
    expect(tokens('@startuml(id=fun) Fun name')).toEqual([
      ['@startuml', 'FunctionName'], ['(', 'paren'], ['id', 'attributeName'], ['=', 'definitionOperator'], [')', 'paren'], ['Fun name', 'DiagramName'],
    ])
    expect(tokens('@startjcckit(300,200)')).toEqual([
      ['@startjcckit', 'FunctionName'], ['(', 'paren'], ['300', 'number'], [',', 'separator'], ['200', 'number'], [')', 'paren'],
    ])
  })

  it('makes a file:// name a url too', () => {
    expect(tokens('@startuml file://out/diagram')).toEqual([['@startuml', 'keyword'], ['file://out/diagram', 'DiagramName_url']])
  })

  it('leaves @end alone, and a title is Creole, not a name', () => {
    expect(tokens('@enduml')).toEqual([['@enduml', 'keyword']])
    expect(tokens('title My **diagram**')).toEqual([['title', 'keyword'], ['**diagram**', 'strong']])
  })

  it('reads mainframe as caption does', () => {
    expect(tokens('mainframe **activity** x')).toEqual([['mainframe', 'keyword'], ['**activity**', 'strong']])
  })

  it('still opens a creole or files body on the next line', () => {
    expect(tokens('@startcreole page', '**b**', '@endcreole')).toEqual([
      ['@startcreole', 'keyword'], ['page', 'DiagramName'], ['**b**', 'strong'], ['@endcreole', 'keyword'],
    ])
  })
})
