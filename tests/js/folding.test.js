// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each @start line folds its block, @end excluded; the keys are B6's.
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, runScopeHandlers } from '@codemirror/view'
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

  it('has no fold for an unclosed block, an empty one, or any other line', () => {
    const state = stateOf(DOC + '@startyaml c\n@endyaml\n')
    const at = (n) => foldable(state, lineStart(state, n), state.doc.line(n).to)

    expect(at(6)).toBeNull()
    expect(at(8)).toBeNull()
    for (const n of [2, 3, 4, 5, 7]) {
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

    it('fold and unfold the block at the cursor on Ctrl+Shift+[ and ]', () => {
      open()
      view.dispatch({ selection: { anchor: 3 } })

      expect(press({ key: '{', code: 'BracketLeft', keyCode: 219, ctrlKey: true, shiftKey: true })).toBe(true)
      expect(foldedRanges(view.state).size).toBe(1)
      expect(press({ key: '}', code: 'BracketRight', keyCode: 221, ctrlKey: true, shiftKey: true })).toBe(true)
      expect(foldedRanges(view.state).size).toBe(0)
    })

    it('fold and unfold every block on Ctrl+Alt+[ and ]', () => {
      open()

      expect(press({ key: '[', code: 'BracketLeft', keyCode: 219, ctrlKey: true, altKey: true })).toBe(true)
      expect(foldedRanges(view.state).size).toBe(2)
      expect(press({ key: ']', code: 'BracketRight', keyCode: 221, ctrlKey: true, altKey: true })).toBe(true)
      expect(foldedRanges(view.state).size).toBe(0)
    })
  })
})
