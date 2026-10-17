// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A `<style file=…>` target (R12): the whole file is one style body, read with the style
// grammar, completion, lint and values, and nothing of `@start` blocks.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CompletionContext } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { forEachDiagnostic, forceLinting } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { loadSheetProfile } from '../../src/editor/profiles/index.js'
import { sheetExtension } from '../../src/editor/linked/sheet.js'
import { docSource } from '../../src/editor/docs/hover.js'
import { loadDocs } from '../../src/editor/docs/index.js'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { blocksLint } from '../../src/editor/lint/blocks.js'
import { unnamedStart } from '../../src/editor/lint/unnamed-start.js'
import { tokensOf } from './helpers/tokens.js'
import { serverAnswering } from './helpers/server.js'

// The style file on the Penpot board `screens / linked-style`, verbatim.
const SHEET = 'participant {\n  BackgroundColor   #FFE08A\n  LineColor   #8A6D00\n  FontStyle bold\n}\narrow {\n  LineColor   #8A6D00\n}'

beforeAll(() => serverAnswering({ colors: { Red: '#FF0000' } }))
afterAll(() => vi.unstubAllGlobals())

async function sheet(doc) {
  return EditorState.create({ doc, extensions: sheetExtension(await loadSheetProfile()) })
}

async function labels(state, pos) {
  const sources = state.languageDataAt('autocomplete', pos)
  const results = await Promise.all(sources.map((source) => source(new CompletionContext(state, pos, true))))
  return results.filter(Boolean).flatMap((result) => result.options.map((option) => option.label))
}

/** The messages of a forced lint run. */
async function linted(view) {
  forceLinting(view)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const messages = []
  forEachDiagnostic(view.state, (diagnostic) => messages.push(diagnostic.message))
  return messages
}

/** The highlighted spans of a state's tree, as [text, token class]. */
function spans(state) {
  const out = []
  ensureSyntaxTree(state, state.doc.length, 5000).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([state.sliceDoc(node.from, node.to), node.type.name])
    },
  })
  return out
}

describe('a style file', () => {
  it('gives a @startuml line and a skinparam line no card: nothing of a diagram leaks in', async () => {
    const doc = '@startuml\nskinparam shadowing false\n' + SHEET
    const view = new EditorView({ parent: document.body, state: await sheet(doc) })
    await loadDocs()
    try {
      expect(docSource(view, doc.indexOf('@startuml') + 2, 1)).toBeNull()
      expect(docSource(view, doc.indexOf('skinparam') + 2, 1)).toBeNull()
    } finally {
      view.destroy()
    }
  })

  it('has no hover source without its profile, and does not throw', async () => {
    await loadDocs()
    const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: SHEET, extensions: sheetExtension(null) }) })
    try {
      expect(() => docSource(view, 1, 1)).not.toThrow()
      expect(docSource(view, 1, 1)).toBeNull()
    } finally {
      view.destroy()
    }
  })

  it('opens the hover cards the same lines open inside <style>: its selectors and properties', async () => {
    const view = new EditorView({ parent: document.body, state: await sheet(SHEET) })
    // The view asks for the docs as it opens; they are in once loadDocs answers.
    await loadDocs()
    const at = (word) => SHEET.indexOf(word)
    try {
      expect(docSource(view, at('participant') + 1, 1)).toMatchObject({ pos: 0, end: 'participant'.length })
      expect(docSource(view, at('BackgroundColor') + 1, 1)).toMatchObject({ pos: at('BackgroundColor'), end: at('BackgroundColor') + 'BackgroundColor'.length })
    } finally {
      view.destroy()
    }
  })

  it('is highlighted as the same lines inside <style> are', async () => {
    const { mode } = await loadSheetProfile()
    const lines = SHEET.split('\n')

    const asSheet = tokensOf(plantumlLanguage({ style: mode }, { sheet: true }), lines)
    const inBlock = tokensOf(plantumlLanguage({ style: mode }), ['<style>', ...lines, '</style>'])

    // inBlock's first and last spans are the `<style>` and `</style>` tags.
    expect(asSheet).toEqual(inBlock.slice(1, -1))
  })

  it('opens and closes nothing on a @startuml or </style> line', async () => {
    const { mode } = await loadSheetProfile()

    const tokens = tokensOf(plantumlLanguage({ style: mode }, { sheet: true }), ['@startuml', '</style>', 'arrow {', '  LineColor #8A6D00', '}'])

    expect(tokens).toContainEqual(['#8A6D00', 'ColorLiteral'])
  })

  it('is still one style body when an edit is read again from a kept line', async () => {
    // Long enough that the parse keeps its state part-way, and resumes from a copy of it.
    const head = Array.from({ length: 200 }, () => 'arrow {\n  LineColor #8A6D00\n}').join('\n')
    const state = await sheet(`${head}\n</style>\n@enduml\narrow {\n  LineColor #8A6D00\n}`)
    spans(state)

    const edited = state.update({ changes: { from: state.doc.length, insert: '\n' } }).state

    expect(spans(edited).filter(([, token]) => token === 'tagName')).toEqual([])
  })

  it('completes a property', async () => {
    const state = await sheet('arrow {\n  FontSt\n}')

    expect(await labels(state, 'arrow {\n  FontSt'.length)).toContain('FontStyle')
  })

  it('completes a named colour', async () => {
    const state = await sheet('arrow {\n  BackGroundColor Re\n}')

    expect(await labels(state, 'arrow {\n  BackGroundColor Re'.length)).toContain('Red')
  })

  it('runs the style lint, and no block lint', async () => {
    // An unnamed `@startuml` no `@end` closes: the block rules would warn twice.
    const view = new EditorView({ parent: document.body, state: await sheet('@startuml\narrow {\n  LineColour #8A6D00\n}') })
    expect([unnamedStart, blocksLint].flatMap((rule) => rule(view.state))).not.toEqual([])

    expect(await linted(view)).toEqual(['Unknown style property LineColour'])
    view.destroy()
  })

  it('takes a selection change in a view, and is linted after it', async () => {
    const view = new EditorView({ parent: document.body, state: await sheet('arrow {\n  LineColour #8A6D00\n}') })

    expect(() => view.dispatch({ selection: { anchor: 5 } })).not.toThrow()
    // A linter whose refresh check threw is dropped by the view (logged, not thrown), and lints no more.
    expect(await linted(view)).toEqual(['Unknown style property LineColour'])
    view.destroy()
  })

  it('is plain text, still a sheet, when the style profile will not load', () => {
    const state = EditorState.create({ doc: SHEET, extensions: sheetExtension(null) })

    expect(state.languageDataAt('autocomplete', 5)).toEqual([])
  })
})
