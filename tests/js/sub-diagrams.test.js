// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Sub-diagrams (X17): a `{{type` … `}}` region in a note, legend, description or class body,
// read with its type's grammar, the body underneath it back after every way out; its shape, the
// profiles it needs, its fold and the completion after `{{`.
import { describe, expect, it } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext } from '@codemirror/autocomplete'
import { ensureSyntaxTree, foldable } from '@codemirror/language'
import { plantumlLanguage, plantumlMode } from '../../src/editor/plantuml-mode.js'
import { SUB_TYPES, subDiagramsOf } from '../../src/editor/sub-diagrams.js'
import { subDiagrams } from '../../src/editor/completion/sub-diagrams.js'
import { sources } from '../../src/editor/completion/index.js'
import { needed } from '../../src/editor/profiles/index.js'
import { plantumlFolding } from '../../src/editor/folding.js'
import { scan } from '../../src/editor/blocks.js'
import { core } from './helpers/core.js'
import saltProfile from '../../src/editor/profiles/salt.js'
import jsonProfile from '../../src/editor/profiles/json.js'

const salt = saltProfile(core).mode
const json = jsonProfile(core).mode
const language = plantumlLanguage({ salt, json })

/** [text, token class] for every highlighted span of `lines`, in a uml block read by `with`. */
function tokens(...lines) {
  return read(language, ...lines)
}
function read(with_, ...lines) {
  const doc = Text.of(['@startuml', ...lines, '@enduml'])
  const out = []
  with_.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('subDiagramsOf', () => {
  it('finds a sub-diagram with its type and lines', () => {
    expect(subDiagramsOf('note right\n{{salt\n{\n}\n}}\nend note')).toEqual([{ start: 2, end: 5, type: 'salt' }])
  })

  it('counts nesting, a bare {{ being uml', () => {
    expect(subDiagramsOf('{{\n{{json\n}}\n}}')).toEqual([{ start: 1, end: 4, type: 'uml' }, { start: 2, end: 3, type: 'json' }])
  })

  it('leaves one left open with no end', () => {
    expect(subDiagramsOf('{{salt')).toEqual([{ start: 1, end: null, type: 'salt' }])
  })
})

describe('the grammar', () => {
  it('reads a salt sub-diagram in a note with the salt grammar, the note after it', () => {
    expect(tokens('note right', '{{salt', '{+', '[OK]', '}', '}}', 'end note', 'A -> B')).toEqual([
      ['note', 'keyword'], ['{{', 'brace'], ['salt', 'keyword'], ['{', 'brace'], ['+', 'modifier'],
      ['[', 'squareBracket'], [']', 'squareBracket'], ['}', 'brace'], ['}}', 'brace'],
      ['end note', 'keyword'], ['->', 'LinkOperator'],
    ])
  })

  it('never lets a salt brace in a class body open or close the class (Review Focus 1)', () => {
    const found = tokens('class C {', '{{salt', '{', '[OK]', '}', '}}', '+ field : int', '}', 'A -> B')
    const today = tokens('class C {', '+ field : int', '}', 'A -> B')
    expect(found).toEqual([
      ...today.slice(0, 3),
      ['{{', 'brace'], ['salt', 'keyword'], ['{', 'brace'], ['[', 'squareBracket'], [']', 'squareBracket'], ['}', 'brace'], ['}}', 'brace'],
      ...today.slice(3),
    ])
    expect(today.slice(3)).toEqual([[':', 'separator'], ['int', 'typeName'], ['}', 'brace'], ['->', 'LinkOperator']])
  })

  it('reads a bare {{ in a legend as uml, a nested {{ counted', () => {
    expect(tokens('legend', '{{', 'A -> B', '}}', 'end legend')).toContainEqual(['->', 'LinkOperator'])
    const nested = tokens('legend', '{{', '{{salt', '}}', 'A -> B', '}}', 'end legend')
    expect(nested).toContainEqual(['->', 'LinkOperator'])
    expect(nested.filter(([text]) => text === '}}')).toEqual([['}}', 'brace']])
    expect(nested.at(-1)).toEqual(['end legend', 'keyword'])
  })

  it('gives a uml sub-diagram a state of its own, so its class never closes the body', () => {
    expect(tokens('note right', '{{', 'class X {', '}}', 'end note', 'A -> B').slice(-2)).toEqual([['end note', 'keyword'], ['->', 'LinkOperator']])
  })

  it('ends one left open at end note, which is read as ever (Review Focus 2)', () => {
    expect(tokens('note right', '{{salt', '{', 'end note', 'A -> B').slice(-2)).toEqual([['end note', 'keyword'], ['->', 'LinkOperator']])
    expect(tokens('legend', '{{salt', '{', 'end legend', 'A -> B').slice(-2)).toEqual([['end legend', 'keyword'], ['->', 'LinkOperator']])
  })

  it('leaves a uml sub-diagram\'s own note its end note, the outer note\'s end after }}', () => {
    const found = tokens('note right', '{{', 'X -> Y', 'note left', 'inner text', 'end note', '}}', 'OUTERTAIL', 'end note', 'A -> B')
    expect(found).toEqual([
      ['note', 'keyword'], ['{{', 'brace'], ['->', 'LinkOperator'], ['note', 'keyword'], ['end note', 'keyword'], ['}}', 'brace'],
      ['end note', 'keyword'], ['->', 'LinkOperator'],
    ])
  })

  it('leaves a uml sub-diagram\'s own legend its end legend, the outer legend\'s end after }}', () => {
    const found = tokens('legend', '{{', 'legend', 'inner text', 'end legend', '}}', 'OUTERTAIL', 'end legend', 'A -> B')
    expect(found).toEqual([
      ['legend', 'keyword'], ['{{', 'brace'], ['legend', 'keyword'], ['end legend', 'keyword'], ['}}', 'brace'],
      ['end legend', 'keyword'], ['->', 'LinkOperator'],
    ])
  })

  it('still ends a uml one left open at end note when it is in no note of its own', () => {
    expect(tokens('note right', '{{', 'X -> Y', 'end note', 'A -> B').slice(-2)).toEqual([['end note', 'keyword'], ['->', 'LinkOperator']])
  })

  it('ends one left open at @enduml, the next diagram read as ever (Review Focus 2)', () => {
    const found = tokens('note right', '{{salt', '{', '@enduml', '@startuml', 'A -> B')
    expect(found).toContainEqual(['@enduml', 'keyword'])
    expect(found.at(-1)).toEqual(['->', 'LinkOperator'])
  })

  it('reads a json sub-diagram in a legend with the json grammar, or plain with none loaded', () => {
    expect(tokens('legend', '{{json', '{"a": 1}', '}}', 'end legend')).toContainEqual(['"a"', 'propertyName'])
    const bare = read(plantumlLanguage({ salt }), 'legend', '{{json', '{"a": 1}', '}}', 'end legend')
    expect(bare).toEqual([['legend', 'keyword'], ['{{', 'brace'], ['json', 'keyword'], ['}}', 'brace'], ['end legend', 'keyword']])
  })

  it('reads chronology as inactive and an unknown type plain', () => {
    expect(tokens('note right', '{{chronology', 'A happens on 2026-01-01', '}}', 'end note')).toContainEqual(['A happens on 2026-01-01', 'Inactive'])
    expect(tokens('note right', '{{foo', 'A -> B', '}}', 'end note')).toEqual([
      ['note', 'keyword'], ['{{', 'brace'], ['foo', 'keyword'], ['}}', 'brace'], ['end note', 'keyword'],
    ])
  })

  it('keeps comments and ! lines PlantUML\'s inside one', () => {
    const found = tokens('note right', '{{salt', "' a comment", '!$x = 1', '{', '}', '}}', 'end note')
    expect(found).toContainEqual(["' a comment", 'comment'])
    expect(found).toContainEqual(['!', 'meta'])
    expect(found).toContainEqual(['$x', 'VariableName'])
    expect(found.at(-1)).toEqual(['end note', 'keyword'])
  })

  it('reads a sub-diagram in a description, its ] after }} closing it', () => {
    const found = tokens('node web [', '{{salt', '{', '}', '}}', ']', 'A -> B')
    expect(found).toContainEqual(['{{', 'brace'])
    expect(found.slice(-2)).toEqual([['}}', 'brace'], ['->', 'LinkOperator']])
  })

  it('reads the {{ and }} lines whole, trailing spaces and all', () => {
    const doc = '@startuml\nnote right\n  {{salt  \n{\n}\n  }}  \nend note\n@enduml'
    const spans = []
    language.parser.parse(doc).iterate({ enter(node) { if (!node.type.isTop) spans.push([node.from, node.to]) } })
    const line = (n) => doc.split('\n').slice(0, n - 1).join('\n').length + 1
    expect(spans).toContainEqual([line(3) + 2, line(3) + 4])
    expect(spans).toContainEqual([line(6) + 2, line(6) + 4])
    expect(tokens('note right', '  {{salt  ', '{', '}', '  }}  ', 'end note', 'A -> B').slice(-2)).toEqual([['end note', 'keyword'], ['->', 'LinkOperator']])
  })

  it('opens none at the top level of a uml block', () => {
    expect(tokens('{{salt', 'A -> B', '}}')).not.toContainEqual(['{{', 'brace'])
  })

  it('copies a sub-diagram\'s state with the language\'s, as an edit below it reads on from', () => {
    const before = EditorState.create({ doc: '@startuml\nnote right\n{{salt\n{\n}\n}}\nend note\nA -> B\n@enduml', extensions: [language] })
    ensureSyntaxTree(before, before.doc.length, 5000)
    const at = before.doc.line(5).from
    const { state } = before.update({ changes: { from: at, insert: '[OK]\n' } })
    const tree = ensureSyntaxTree(state, state.doc.length, 5000)
    const found = []
    tree.iterate({ enter(node) { if (!node.type.isTop) found.push([state.sliceDoc(node.from, node.to), node.type.name]) } })
    expect(found.slice(5)).toEqual([
      ['[', 'squareBracket'], [']', 'squareBracket'], ['}', 'brace'], ['}}', 'brace'], ['end note', 'keyword'], ['->', 'LinkOperator'], ['@enduml', 'keyword'],
    ])
  })
})

describe('needed', () => {
  const of = (text) => needed(scan(text), text)
  it('adds each sub-diagram type a uml block holds', () => {
    expect(of('@startuml\nnote right\n{{salt\n}}\nend note\n@enduml')).toContain('salt')
    expect(of('@startuml\nlegend\n{{json\n}}\nend legend\n@enduml')).toContain('json')
    expect([...of('@startuml\nlegend\n{{\n}}\nend legend\n@enduml')]).toEqual([])
  })
})

describe('folding', () => {
  const stateOf = (doc) => EditorState.create({ doc, extensions: [language, plantumlFolding] })
  const at = (state, n) => foldable(state, state.doc.line(n).from, state.doc.line(n).to)

  it('folds a sub-diagram from its {{ line to the line before }}', () => {
    const state = stateOf('note right\n{{salt\n{\n}\n}}\nend note')
    expect(at(state, 2)).toEqual({ from: state.doc.line(2).to, to: state.doc.line(4).to })
  })

  it('folds only what the grammar reads as one', () => {
    // At the top level, and nested in a uml sub-diagram's own note, a {{ line opens none.
    const state = stateOf('@startuml\n{{salt\n{\n}\n}}\nnote right\n{{\nnote left\n{{json\n{}\n}}\nend note\n}}\nend note\n@enduml')
    expect(at(state, 2)).toBeNull()
    expect(at(state, 9)).toBeNull()
    expect(at(state, 7)).toEqual({ from: state.doc.line(7).to, to: state.doc.line(12).to })
  })
})

describe('completion', () => {
  const contextAt = (marked) => {
    const pos = marked.indexOf('|')
    const state = EditorState.create({ doc: marked.replace('|', ''), extensions: [plantumlMode] })
    return { state, pos, context: new CompletionContext(state, pos, false) }
  }

  it('is a registered source', () => {
    expect(sources).toContain(subDiagrams)
  })

  it('offers the sub-diagram types after {{ in a uml block', () => {
    const result = subDiagrams(contextAt('@startuml\nnote right\n  {{|\nend note\n@enduml').context)
    expect(result.options.map((option) => option.label)).toEqual(SUB_TYPES)
    expect(result.validFor).toEqual(/^\w*$/)
  })

  it('starts after {{ while a type is typed', () => {
    const { context, pos } = contextAt('@startuml\nnote right\n{{sa|\nend note\n@enduml')
    expect(subDiagrams(context).from).toBe(pos - 2)
  })

  it('offers nothing outside a uml block', () => {
    expect(subDiagrams(contextAt('@startjson\n{{|\n@endjson').context)).toBeNull()
  })

  it('inserts the type, a body line with the cursor and a }} line', () => {
    const { state, pos } = contextAt('@startuml\nnote right\n  {{|\nend note\n@enduml')
    const view = new EditorView({ state, parent: document.body })
    const result = subDiagrams(new CompletionContext(view.state, pos, false))
    const option = result.options.find((candidate) => candidate.label === 'salt')
    option.apply(view, option, result.from, pos)
    expect(view.state.doc.toString()).toBe('@startuml\nnote right\n  {{salt\n    \n  }}\nend note\n@enduml')
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(4)
    expect(view.state.selection.main.head).toBe(view.state.doc.line(4).to)
    view.destroy()
  })
})
