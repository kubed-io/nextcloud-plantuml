// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Editor states built from a text with its cursor marked `|`, and the wait for a completion popup.
import { completionStatus } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { expect, vi } from 'vitest'

/** The state of `marked` without its `|`, the cursor there (none when unmarked), and that position. */
export function stateAt(marked, extensions = []) {
  const pos = marked.indexOf('|')
  const selection = pos < 0 ? undefined : { anchor: pos }
  return { pos, state: EditorState.create({ doc: marked.replace('|', ''), selection, extensions }) }
}

/**
 * Resolves once `view`'s completion popup is open, or once `check` (an assertion) passes: polled every 5 ms,
 * where `vi.waitFor` defaults to 50.
 */
export function waitForCompletion(view, check = () => expect(completionStatus(view.state)).toBe('active')) {
  return vi.waitFor(check, { interval: 5 })
}
