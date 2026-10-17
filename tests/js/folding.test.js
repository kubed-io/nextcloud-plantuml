// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each @start line folds its block, @end excluded, and each <style> line its
// style block; the keys are B6's, fold and unfold at the cursor only.
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { defaultKeymap } from '@codemirror/commands'
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view'
import { foldable, foldedRanges } from '@codemirror/language'
import { plantumlFolding } from '../../src/editor/folding.js'

const DOC = '@startuml a\nA -> B\nB -> C\n@enduml\ntext\n@startjson b\n{}\n'
const stateOf = (doc) => EditorState.create({ doc, extensions: [plantumlFolding] })
const lineStart = (state, n) => state.doc.line(n).from

describe('folding', () => {
  it('folds a block from the end of its start line to the end of the line before its end', () => {
    const state = stateOf(DOC)

    expect(foldable(state, lineStart(state, 1), state.doc.line(1).to)).toEqual({ from: '@startuml a'.length, to: '@startuml a\nA -> B\nB -> C'.length })
  })

  it('folds each version of the document as it reads', () => {
    const state = stateOf(DOC)
    const { state: next } = state.update({ changes: { from: lineStart(state, 3), insert: '@enduml\n' } })

    expect(foldable(next, lineStart(next, 1), next.doc.line(1).to)).toEqual({ from: '@startuml a'.length, to: '@startuml a\nA -> B'.length })
    expect(foldable(state, lineStart(state, 1), state.doc.line(1).to)).toEqual({ from: '@startuml a'.length, to: '@startuml a\nA -> B\nB -> C'.length })
  })

  it('has no fold for an unclosed block, an empty one, or any other line', () => {
    const state = stateOf(DOC + '@startyaml c\n@endyaml\n')
    const at = (n) => foldable(state, lineStart(state, n), state.doc.line(n).to)

    expect(at(6)).toBeNull()
    expect(at(8)).toBeNull()
    for (const n of [2, 3, 4, 5, 7]) {
      expect(at(n)).toBeNull()
    }
  })

  it('folds a style block from its <style> line to the line before </style>', () => {
    const state = stateOf('@startuml\n  <style>\n  note {\n  }\n  </style>\n<style>\n</style>\n<style>a {}</style>\n<style>\nx\n@enduml\n')
    const at = (n) => foldable(state, lineStart(state, n), state.doc.line(n).to)

    expect(at(2)).toEqual({ from: state.doc.line(2).to, to: state.doc.line(4).to })
    expect(at(1)).toEqual({ from: state.doc.line(1).to, to: state.doc.line(10).to })
    for (const n of [3, 5, 6, 8, 9]) {
      expect(at(n)).toBeNull()
    }
  })

  describe('keys', () => {
    let view
    afterEach(() => view.destroy())
    const press = (init) => runScopeHandlers(view, new KeyboardEvent('keydown', init), 'editor')
    const open = () => {
      view = new EditorView({ state: stateOf(DOC + '@startyaml c\nx\n@endyaml\n'), parent: document.body })
    }

    it('fold and unfold the block at the cursor on Ctrl-Shift-[ and ]', () => {
      open()
      view.dispatch({ selection: { anchor: 3 } })

      expect(press({ key: '{', code: 'BracketLeft', keyCode: 219, ctrlKey: true, shiftKey: true })).toBe(true)
      expect(foldedRanges(view.state).size).toBe(1)
      expect(press({ key: '}', code: 'BracketRight', keyCode: 221, ctrlKey: true, shiftKey: true })).toBe(true)
      expect(foldedRanges(view.state).size).toBe(0)
    })

    // AltGr is Ctrl-Alt to the browser, and AltGr+8 / 9 type [ and ] on German and Nordic layouts.
    it('leave Ctrl-Alt-[ and ] to type, folding nothing', () => {
      open()

      expect(press({ key: '[', code: 'Digit8', keyCode: 56, ctrlKey: true, altKey: true })).toBe(false)
      expect(press({ key: '[', code: 'BracketLeft', keyCode: 219, ctrlKey: true, altKey: true })).toBe(false)
      expect(foldedRanges(view.state).size).toBe(0)
      view.dispatch({ selection: { anchor: 3 } })
      press({ key: '{', code: 'BracketLeft', keyCode: 219, ctrlKey: true, shiftKey: true })
      expect(press({ key: ']', code: 'Digit9', keyCode: 57, ctrlKey: true, altKey: true })).toBe(false)
      expect(press({ key: ']', code: 'BracketRight', keyCode: 221, ctrlKey: true, altKey: true })).toBe(false)
      expect(foldedRanges(view.state).size).toBe(1)
    })

    // The platform is read once, when @codemirror/view loads: macOS is checked on the bindings.
    it('are Cmd-Alt-[ and ] on macOS, and no key folds or unfolds every block', () => {
      const bindings = stateOf('').facet(keymap).flat()

      expect(bindings.map(({ key, mac }) => [key, mac])).toEqual([
        ['Ctrl-Shift-[', 'Cmd-Alt-['],
        ['Ctrl-Shift-]', 'Cmd-Alt-]'],
      ])
    })
  })

  it('leaves Ctrl-[ and Ctrl-] to indent', () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'x', extensions: [plantumlFolding, keymap.of(defaultKeymap)] }), parent: document.body })
    const press = (key, keyCode) => runScopeHandlers(view, new KeyboardEvent('keydown', { key, code: key === '[' ? 'BracketLeft' : 'BracketRight', keyCode, ctrlKey: true }), 'editor')

    expect(press(']', 221)).toBe(true)
    expect(view.state.doc.toString()).toBe('  x')
    expect(press('[', 219)).toBe(true)
    expect(view.state.doc.toString()).toBe('x')
    view.destroy()
  })
})
