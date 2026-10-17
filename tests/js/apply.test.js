// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// reopen(): insert the label and a suffix, then open the list again.
import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { autocompletion, completionStatus } from '@codemirror/autocomplete'
import { ELEMENT_KINDS, WEB_SCHEMES, reopen } from '../../src/editor/completion/apply.js'

let view
afterEach(() => view?.destroy())

describe('reopen', () => {
  it.each([
    [undefined, 'dir/'],
    ['!', 'dir/!'],
  ])('inserts the label and the suffix %s, then the list is open again', (suffix, inserted) => {
    const source = () => ({ from: 0, options: [{ label: 'x' }] })
    view = new EditorView({
      state: EditorState.create({ doc: 'ab', extensions: [autocompletion({ override: [source] })] }),
      parent: document.body,
    })
    const apply = reopen(suffix)
    apply(view, { label: 'dir/' }, 0, 2)
    expect(view.state.doc.toString()).toBe(inserted)
    expect(view.state.selection.main.head).toBe(inserted.length)
    expect(completionStatus(view.state)).not.toBeNull()
  })
})

describe('shared options', () => {
  it('offers the two web schemes', () => {
    expect(WEB_SCHEMES.map((o) => o.label)).toEqual(['https://', 'http://'])
  })

  it('lists the element kinds as pattern sources, abstract with its optional class', () => {
    expect(ELEMENT_KINDS).toContain('abstract(?:[ \\t]+class)?')
    expect(ELEMENT_KINDS).toContain('actor')
  })
})
