// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each lint rule against a real EditorState: what is asserted is what the
// editor would underline, and what a diagnostic's action writes.
import { describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { rules } from '../../src/editor/lint/index.js'
import { fileName, serverError, setServerError } from '../../src/editor/lint/state.js'
import { diagramName, unnamedStart } from '../../src/editor/lint/unnamed-start.js'
import { creoleColour } from '../../src/editor/lint/creole-colour.js'
import { blocksLint } from '../../src/editor/lint/blocks.js'
import { serverMistake } from '../../src/editor/lint/server-error.js'
import { yamlLint as yamlRule } from '../../src/editor/lint/yaml.js'
import { styleLint as styleRule } from '../../src/editor/lint/style.js'
import { translate } from '@nextcloud/l10n'
import { scan } from '../../src/editor/blocks.js'

const yamlLint = yamlRule({ scan })
const stateOf = (doc, name = 'Order flow.puml') => EditorState.create({ doc, extensions: [fileName.of(name), serverError] })

describe('the lint rules', () => {
  it('are listed in order', () => {
    expect(rules).toEqual([unnamedStart, blocksLint, serverMistake, creoleColour])
  })
})

describe('unnamed-start', () => {
  it('warns on a diagram opened without a name', () => {
    const [diagnostic, ...rest] = unnamedStart(stateOf('@startuml\nA -> B\n@enduml\n'))

    expect(rest).toEqual([])
    expect(diagnostic).toMatchObject({ from: 0, to: '@startuml'.length, severity: 'warning', message: 'Name the diagram: @startuml <name>' })
    expect(diagnostic.actions.map((action) => action.name)).toEqual(['Add name'])
  })

  it('knows every diagram the directives complete, after any indentation and before trailing space', () => {
    const doc = "' notes\n  @startmindmap  \n* root\n@endmindmap\n"
    const [diagnostic] = unnamedStart(stateOf(doc))

    expect(diagnostic.from).toBe(doc.indexOf('@startmindmap'))
    expect(diagnostic.to).toBe(doc.indexOf('@startmindmap') + '@startmindmap'.length)
    expect(diagnostic.message).toBe('Name the diagram: @startmindmap <name>')
  })

  it('leaves a named diagram, an end line and other text alone', () => {
    expect(unnamedStart(stateOf('@startuml Order_flow\nA -> B\n@enduml\n'))).toEqual([])
    expect(unnamedStart(stateOf('@startuml(id=flow)\n@enduml\n'))).toEqual([])
    expect(unnamedStart(stateOf("A -> B : @startuml\n' @startuml\n"))).toEqual([])
  })

  it('names it after the file when its action is taken', () => {
    const view = new EditorView({ state: stateOf('  @startuml   \nA -> B\n@enduml\n', 'Order flow (copy).puml'), parent: document.body })
    const [diagnostic] = unnamedStart(view.state)

    diagnostic.actions[0].apply(view, diagnostic.from, diagnostic.to)

    expect(view.state.doc.toString()).toBe('  @startuml Order_flow_copy\nA -> B\n@enduml\n')
    expect(unnamedStart(view.state)).toEqual([])
    view.destroy()
  })

  it.each([
    ['Order flow.puml', 'Order_flow'],
    ['Order flow (copy).puml', 'Order_flow_copy'],
    ['Ünïcode flow.plantuml', 'Ünïcode_flow'],
    ['v1.2 plan.puml', 'v1.2_plan'],
    ['no-extension', 'no-extension'],
    ['.puml', 'diagram'],
    ['', 'diagram'],
  ])('makes %j into the name %j', (file, name) => {
    expect(diagramName(file)).toBe(name)
  })
})

describe('server-error', () => {
  const doc = '@startuml\nA -> B\nthis is (( bad\n@enduml\n'
  const reported = (state, mistake) => state.update({ effects: setServerError.of(mistake) }).state

  it('says nothing until the server names a mistake', () => {
    expect(serverMistake(stateOf(doc))).toEqual([])
  })

  it('marks the whole line the server named as an error, in its words', () => {
    const state = reported(stateOf(doc), { message: 'Syntax Error? (Assumed diagram type: sequence)', line: 3 })

    expect(serverMistake(state)).toEqual([{
      from: doc.indexOf('this'),
      to: doc.indexOf('this') + 'this is (( bad'.length,
      severity: 'error',
      message: 'Syntax Error? (Assumed diagram type: sequence)',
    }])
  })

  it('follows the line as lines are added above it, until the next answer', () => {
    let state = reported(stateOf(doc), { message: 'Syntax Error?', line: 3 })
    state = state.update({ changes: { from: 0, insert: "' a comment\n" } }).state

    expect(state.sliceDoc(serverMistake(state)[0].from, serverMistake(state)[0].to)).toBe('this is (( bad')
  })

  it('names the last line when the source has since grown shorter', () => {
    const state = reported(stateOf('@startuml\n@enduml'), { message: 'Syntax Error?', line: 9 })

    expect(state.sliceDoc(serverMistake(state)[0].from, serverMistake(state)[0].to)).toBe('@enduml')
  })

  it('clears when a render comes back clean', () => {
    const state = reported(reported(stateOf(doc), { message: 'Syntax Error?', line: 3 }), null)

    expect(serverMistake(state)).toEqual([])
  })
})

describe('yaml', () => {
  const bad = '@startyaml\na: [1,\nb: : :\n@endyaml\n'

  it('reports the line and column the parser does, in document positions', () => {
    const doc = `@startuml\nA -> B\n@enduml\n${bad}`
    const found = yamlLint(stateOf(doc))
    const first = doc.indexOf('a: [1,')

    expect(found.length).toBeGreaterThan(0)
    expect(found[0]).toMatchObject({ severity: 'error' })
    expect(found[0].message).not.toContain('\n')
    expect(found.every((d) => d.from >= first && d.to <= doc.indexOf('@endyaml') && d.to >= d.from)).toBe(true)
    expect(found.some((d) => d.from >= doc.indexOf('b: : :'))).toBe(true)
  })

  it('marks each error from its position to the end of its line, in a block that starts below line 1', () => {
    const doc = '@startuml\nA -> B\n@enduml\n@startyaml\nb: : :\n@endyaml\n'
    const at = doc.indexOf('b: : :')
    const found = yamlLint(stateOf(doc))

    expect(found).toEqual([
      { from: at + 3, to: at + 6, severity: 'error', message: 'Nested mappings are not allowed in compact mappings' },
      { from: at + 5, to: at + 6, severity: 'error', message: 'Nested mappings are not allowed in compact mappings' },
    ])
    expect(found.every((d) => !d.message.includes('at line'))).toBe(true)
  })

  it('reads a block that is never closed to the end of the file', () => {
    expect(yamlLint(stateOf('@startyaml\nb: : :\n')).length).toBeGreaterThan(0)
  })

  it('leaves valid yaml alone', () => {
    expect(yamlLint(stateOf('@startyaml\na:\n- 1\n- 2\nb: x\n@endyaml\n'))).toEqual([])
  })

  it('leaves another diagram type alone, whatever its text', () => {
    expect(yamlLint(stateOf(bad.replace('yaml', 'uml')))).toEqual([])
  })

  it('marks to the parser\'s end when it lies past the end of the line, without the library\'s advice', () => {
    const doc = '@startyaml\na: 1\n---\nb: 2\n@endyaml\n'

    expect(yamlLint(stateOf(doc))).toEqual([{
      from: doc.indexOf('---'),
      to: doc.indexOf('b: 2') + 'b: 2'.length,
      severity: 'error',
      message: 'Source contains multiple documents',
    }])
  })

  it.each([
    ['a \' comment', "' the value comes later"],
    ['a /\' comment \'/ on one line', "/' it's a note '/"],
    ['a /\' comment \'/ over lines', "/' it's\nb: : :\n'/"],
    ['a ! line', '!theme spacelab'],
    ['a <style> block', "<style>\nyamlDiagram {\n  node { BackGroundColor 'red' }\n}\n</style>"],
  ])('leaves %s in valid yaml alone', (_what, lines) => {
    expect(yamlLint(stateOf(`@startyaml\n${lines}\na: 1\n@endyaml\n`))).toEqual([])
  })

  it('keeps the lines after a blanked range where they were', () => {
    const doc = "@startyaml\n/' a\nnote '/\n<style>\n</style>\n' c\nb: : :\n@endyaml\n"

    expect(yamlLint(stateOf(doc))[0].from).toBe(doc.indexOf('b: : :') + 3)
  })

  it('skips #highlight lines without moving the lines after them', () => {
    const doc = '@startyaml\n#highlight "a" / "b"\na: 1\nb: : :\n@endyaml\n'
    const found = yamlLint(stateOf(doc))

    expect(found.length).toBeGreaterThan(0)
    expect(found.every((d) => d.from >= doc.indexOf('b: : :'))).toBe(true)
    expect(yamlLint(stateOf('@startyaml\n#highlight "a" / "b"\na: 1\n@endyaml\n'))).toEqual([])
  })
})

describe('blocks', () => {
  const run = (doc) => blocksLint(stateOf(doc))
  const apply = (doc, diagnostic) => {
    const view = new EditorView({ state: stateOf(doc), parent: document.body })
    diagnostic.actions[0].apply(view, diagnostic.from, diagnostic.to)
    const result = view.state.doc.toString()
    view.destroy()
    return result
  }

  it('leaves closed diagrams alone', () => {
    expect(run('@startuml a\nA -> B\n@enduml\n@startjson b\n{}\n@endjson\n')).toEqual([])
    expect(run('A -> B\n')).toEqual([])
  })

  it('errors on a start nothing closes, and adds the end at the end of the file', () => {
    const doc = '@startuml a\nA -> B\n'
    const [diagnostic, ...rest] = run(doc)

    expect(rest).toEqual([])
    expect(diagnostic).toMatchObject({ from: 0, to: '@startuml'.length, severity: 'error', message: 'No @enduml for this diagram' })
    expect(diagnostic.actions.map((action) => action.name)).toEqual(['Add @enduml'])
    expect(apply(doc, diagnostic)).toBe('@startuml a\nA -> B\n@enduml\n')
  })

  it('adds the end on a line of its own when the file has no final newline', () => {
    const doc = '@startuml a\nA -> B'
    expect(apply(doc, run(doc)[0])).toBe('@startuml a\nA -> B\n@enduml\n')
  })

  it('adds the end before the next start', () => {
    const doc = '@startjson a\n{}\n@startuml b\nA -> B\n@enduml\n'
    const diagnostics = run(doc)

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].message).toBe('No @endjson for this diagram')
    expect(apply(doc, diagnostics[0])).toBe('@startjson a\n{}\n@endjson\n@startuml b\nA -> B\n@enduml\n')
  })

  it('errors on an end of another type, and changes it', () => {
    const doc = '@startjson a\n{}\n  @endyaml  \n'
    const [diagnostic, ...rest] = run(doc)

    expect(rest).toEqual([])
    expect(diagnostic).toMatchObject({ severity: 'error', message: 'This closes @startjson', from: doc.indexOf('@endyaml'), to: doc.indexOf('@endyaml') + '@endyaml'.length })
    expect(diagnostic.actions.map((action) => action.name)).toEqual(['Change to @endjson'])
    expect(apply(doc, diagnostic)).toBe('@startjson a\n{}\n  @endjson  \n')
  })

  // CodeMirror maps a diagnostic through the edits made after the lint ran, and hands its action where it now is.
  describe('after an edit above the block, before the click', () => {
    const NOTE = "' a note\n"
    const applyAfterEdit = (doc, diagnostic) => {
      const view = new EditorView({ state: stateOf(doc), parent: document.body })
      const edit = view.state.update({ changes: { from: 0, insert: NOTE } })
      view.dispatch(edit)
      diagnostic.actions[0].apply(view, edit.changes.mapPos(diagnostic.from, 1), edit.changes.mapPos(diagnostic.to, -1))
      const result = view.state.doc.toString()
      view.destroy()
      return result
    }

    it('still adds the end before the next start', () => {
      const doc = '@startjson a\n{}\n@startuml b\nA -> B\n@enduml\n'

      expect(applyAfterEdit(doc, run(doc)[0])).toBe(`${NOTE}@startjson a\n{}\n@endjson\n@startuml b\nA -> B\n@enduml\n`)
    })

    it('still changes the end it marked', () => {
      const doc = '@startjson a\n{}\n  @endyaml  \n'

      expect(applyAfterEdit(doc, run(doc)[0])).toBe(`${NOTE}@startjson a\n{}\n  @endjson  \n`)
    })
  })

  it('warns on an end outside every diagram', () => {
    const doc = '@enduml\n@startuml a\n@enduml\n  @endjson\n'
    const found = run(doc)

    expect(found.map((d) => [d.severity, d.message, d.from])).toEqual([
      ['warning', 'No diagram to end', 0],
      ['warning', 'No diagram to end', doc.indexOf('@endjson')],
    ])
    expect(found[0].to).toBe('@enduml'.length)
  })
})

const WORD_WRAP = `<style>
node {
    Padding 12
    Margin 3
    HorizontalAlignment center
    LineColor blue
    LineThickness 3.0
    BackgroundColor gold
    RoundCorner 40
    MaximumWidth 100
}

rootNode {
    LineStyle 8.0;3.0
    LineColor red
    BackgroundColor white
    LineThickness 1.0
    RoundCorner 0
    Shadowing 0.0
}

leafNode {
    LineColor gold
    RoundCorner 0
    Padding 3
}

arrow {
    LineStyle 4
    LineThickness 0.5
    LineColor green
}
</style>`

describe('style', () => {
  // The real translator: its sanitizing would strip a `</style>` from a message.
  const run = (doc) => styleRule({ t: translate })(stateOf(doc))
  const apply = (doc, diagnostic, action = 0) => {
    const view = new EditorView({ state: stateOf(doc), parent: document.body })
    diagnostic.actions[action].apply(view, diagnostic.from, diagnostic.to)
    const result = view.state.doc.toString()
    view.destroy()
    return result
  }

  it('has nothing to say of the Word Wrap block of plantuml.com/mindmap-diagram', () => {
    expect(run(`@startmindmap\n${WORD_WRAP}\n* a\n@endmindmap\n`)).toEqual([])
  })

  it('warns on an unknown property, and changes it to the nearest known one', () => {
    const doc = '@startuml\n<style>\nnode {\n  FontSise 12\n}\n</style>\n@enduml\n'
    const [diagnostic, ...rest] = run(doc)

    expect(rest).toEqual([])
    expect(diagnostic).toMatchObject({ severity: 'warning', message: 'Unknown style property FontSise', from: doc.indexOf('FontSise'), to: doc.indexOf('FontSise') + 'FontSise'.length })
    expect(diagnostic.actions.map((action) => action.name)).toEqual(['FontSize'])
    expect(apply(doc, diagnostic)).toBe(doc.replace('FontSise', 'FontSize'))
    expect(run(apply(doc, diagnostic))).toEqual([])
  })

  it('matches a property whatever its case', () => {
    expect(run('<style>\nnode {\n  fontsize 12\n  BACKGROUNDCOLOR red; linecolor #FFF\n}\n</style>\n')).toEqual([])
  })

  it('never checks a selector, a stereotype class or a depth', () => {
    expect(run('<style>\nwhatever {\n  .my-class {\n    nested:depth(2) {\n      FontSize 1\n    }\n  }\n}\n</style>\n')).toEqual([])
  })

  it('checks the middle of a one-line block, and leaves an imported sheet alone', () => {
    const doc = '<style>node { Colour red }</style>\n<style file=my.css>\n'
    const found = run(doc)

    expect(found.map((d) => [d.severity, d.message, d.from, d.to])).toEqual([['warning', 'Unknown style property Colour', doc.indexOf('Colour'), doc.indexOf('Colour') + 6]])
  })

  it("skips PlantUML's own comment and preprocessor lines inside a block", () => {
    expect(run("<style>\nnode {\n  ' FontSise 12\n  !$x = 1\n}\n</style>\n")).toEqual([])
  })

  it("skips /' … '/ comments inside a block, on one line or several", () => {
    expect(run("<style>\nnode {\n  /' FontSise 12 '/\n  /' Colour red\n  FontSise 1 '/ FontSize 2\n}\n</style>\n")).toEqual([])
  })

  it('errors on a <style> no </style> closes, before the diagram ends or at the end of the file', () => {
    const doc = '@startuml\n  <style>\nnode {\n@enduml\n<style>\n'
    const found = run(doc)

    expect(found.map((d) => [d.severity, d.message, d.from, d.to])).toEqual([
      ['error', 'No </style> for this style block', doc.indexOf('<style>'), doc.indexOf('<style>') + '<style>'.length],
      ['error', 'No </style> for this style block', doc.lastIndexOf('<style>'), doc.lastIndexOf('<style>') + '<style>'.length],
    ])
  })

  it('translates its messages under the app id, the tag in them kept as text', () => {
    const t = vi.fn((_app, text, vars) => text.replace('{name}', vars?.name))
    const found = styleRule({ t })(stateOf('<style>\nnode {\n  FontSise 1\n'))

    expect(found.map((d) => d.message)).toEqual(['No </style> for this style block', 'Unknown style property FontSise'])
    expect(t.mock.calls).toEqual([
      ['plantuml', 'No </style> for this style block', undefined, undefined, { escape: false, sanitize: false }],
      ['plantuml', 'Unknown style property {name}', { name: 'FontSise' }, undefined, { escape: false, sanitize: false }],
    ])
  })

  it('says nothing outside a style block', () => {
    expect(run('@startuml\nnode {\n  FontSise 12\n}\n@enduml\n')).toEqual([])
  })
})

describe('creole-colour (W6)', () => {
  const MESSAGE = 'PlantUML draws this tag as text: write the colour name without #'

  it('marks #Red in a back tag, from the # to the name, and Remove # leaves the bare name', () => {
    const doc = 'A -> B : <back:#Red>x</back>'
    const [diagnostic, ...rest] = creoleColour(stateOf(doc))

    expect(rest).toEqual([])
    const from = doc.indexOf('#')
    expect(diagnostic).toMatchObject({ from, to: from + '#Red'.length, severity: 'error', message: MESSAGE })
    expect(diagnostic.actions.map((action) => action.name)).toEqual(['Remove #'])
    const view = new EditorView({ state: stateOf(doc) })
    diagnostic.actions[0].apply(view, diagnostic.from, diagnostic.to)
    expect(view.state.doc.toString()).toBe('A -> B : <back:Red>x</back>')
  })

  it.each(['<back:#BUSINESS>x</back>', '<s:#Red>x</s>', '<w:#Red>x</w>', '<u:#Red>x</u>'])('marks %s', (tag) => {
    expect(creoleColour(stateOf(`A -> B : ${tag}`))).toHaveLength(1)
  })

  it.each(['<back:#ff0000>x</back>', '<back:#FFF>x</back>', '<color:#Red>x</color>', '<back:Red>x</back>', "' <back:#Red>x</back>"])('leaves %s', (text) => {
    expect(creoleColour(stateOf(text))).toHaveLength(0)
  })
})
