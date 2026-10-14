// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each completion source against a real EditorState: `|` in a document marks
// the cursor, and what is asserted is what the popup would offer from where.
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext } from '@codemirror/autocomplete'
import { plantumlMode } from '../../src/editor/plantuml-mode.js'
import { plantumlCompletion, sources } from '../../src/editor/completion/index.js'
import { directives } from '../../src/editor/completion/directives.js'
import { keywords } from '../../src/editor/completion/keywords.js'
import { names } from '../../src/editor/completion/names.js'
import { snippets } from '../../src/editor/completion/snippets.js'

function stateAt(marked) {
  const pos = marked.indexOf('|')
  return { pos, state: EditorState.create({ doc: marked.replace('|', ''), extensions: [plantumlMode, plantumlCompletion] }) }
}

function complete(source, marked, explicit = false) {
  const { state, pos } = stateAt(marked)
  return source(new CompletionContext(state, pos, explicit))
}

const labels = (result) => result.options.map((option) => option.label)

describe('the completion sources', () => {
  it('are each registered through the PlantUML language data, in order', () => {
    const { state, pos } = stateAt('|')
    expect(state.languageDataAt('autocomplete', pos)).toEqual(sources)
    expect(sources).toEqual([directives, keywords, names, snippets])
  })
})

describe('directives', () => {
  it('offers the @start and @end lines after an @ at the start of a line', () => {
    const result = complete(directives, '  @st|')

    expect(result.from).toBe(2)
    expect(labels(result)).toEqual(expect.arrayContaining(['@startuml', '@enduml', '@startmindmap', '@endgantt', '@startjson', '@endyaml', '@startwbs']))
    expect(result.options.every((option) => option.type === 'keyword')).toBe(true)
  })

  it('offers nothing after an @ anywhere else on the line', () => {
    expect(complete(directives, 'A -> B : mail @|')).toBeNull()
  })
})

describe('keywords', () => {
  it('offers the keywords at the start of a line, after any indentation', () => {
    const result = complete(keywords, '  part|')

    expect(result.from).toBe(2)
    expect(result.options).toContainEqual(expect.objectContaining({ label: 'participant', type: 'keyword' }))
    expect(labels(result)).toEqual(expect.arrayContaining(['database', 'class', 'alt', 'autonumber', 'skinparam', 'endwhile', 'end fork']))
  })

  it('offers nothing past the first word of a line', () => {
    expect(complete(keywords, 'A -> part|')).toBeNull()
  })

  it('waits for a letter on an empty line unless asked', () => {
    expect(complete(keywords, '|')).toBeNull()
    expect(labels(complete(keywords, '|', true))).toContain('participant')
  })
})

describe('names', () => {
  const diagram = [
    'participant Customer',
    'actor "Big Shop" as Shop',
    'abstract class Order',
    'Customer -> Warehouse : ship',
    'Warehouse -right-> Courier',
    '',
  ].join('\n')

  it('offers the participants, classes and arrow ends the diagram already names', () => {
    const result = complete(names, diagram + 'Cus|')

    expect(result.from).toBe(diagram.length)
    expect(labels(result)).toEqual(expect.arrayContaining(['Customer', 'Shop', 'Order', 'Warehouse', 'Courier']))
    expect(labels(result)).not.toContain('Big')
    expect(result.options.every((option) => option.type === 'variable')).toBe(true)
  })

  it('does not offer the word being typed back as a name', () => {
    expect(labels(complete(names, diagram + 'Wanderer -> Cus|'))).not.toContain('Cus')
    expect(labels(complete(names, 'Cus| -> Shop'))).not.toContain('Cus')
  })

  it('offers anywhere on a line, and nothing in a comment', () => {
    expect(labels(complete(names, diagram + 'Shop -> Ware|'))).toContain('Warehouse')
    expect(complete(names, diagram + "' Ware|")).toBeNull()
  })
})

describe('snippets', () => {
  it('offers blocks to fill in at the start of a line', () => {
    const result = complete(snippets, 'al|')

    expect(result.options).toContainEqual(expect.objectContaining({ label: 'alt', type: 'text' }))
    expect(labels(result)).toEqual(expect.arrayContaining(['note', 'alt', 'loop', 'class', 'if']))
    expect(complete(snippets, 'A -> al|')).toBeNull()
  })

  it('inserts the block with its first field selected', () => {
    const { state, pos } = stateAt('al|')
    const view = new EditorView({ state, parent: document.body })
    const result = snippets(new CompletionContext(view.state, pos, false))
    const alt = result.options.find((option) => option.label === 'alt')

    alt.apply(view, alt, result.from, pos)

    expect(view.state.doc.toString()).toBe('alt condition\n  \nelse otherwise\n  \nend')
    const { from, to } = view.state.selection.main
    expect(view.state.sliceDoc(from, to)).toBe('condition')
    view.destroy()
  })
})
