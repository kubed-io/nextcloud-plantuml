// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each lint rule against a real EditorState: what is asserted is what the
// editor would underline, and what a diagnostic's action writes.
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { rules } from '../../src/editor/lint/index.js'
import { fileName, serverError, setServerError } from '../../src/editor/lint/state.js'
import { diagramName, unnamedStart } from '../../src/editor/lint/unnamed-start.js'
import { blocksLint } from '../../src/editor/lint/blocks.js'
import { serverMistake } from '../../src/editor/lint/server-error.js'
import { yamlLint as yamlRule } from '../../src/editor/lint/yaml.js'
import { scan } from '../../src/editor/blocks.js'

const yamlLint = yamlRule({ scan })
const stateOf = (doc, name = 'Order flow.puml') => EditorState.create({ doc, extensions: [fileName.of(name), serverError] })

describe('the lint rules', () => {
  it('are listed in order', () => {
    expect(rules).toEqual([unnamedStart, blocksLint, serverMistake])
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
