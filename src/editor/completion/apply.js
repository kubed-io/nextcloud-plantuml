/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What several completion sources share: an `apply` that opens the list again,
 * the web-scheme options and the element kinds a line can start with.
 */
import { pickedCompletion, startCompletion } from '@codemirror/autocomplete'
import { PARTICIPANTS, STRUCTURES } from './keywords.js'

/**
 * An `apply` that inserts the label and `suffix`, then opens the list again for the next level.
 *
 * @param {string} suffix
 */
export function reopen(suffix = '') {
  return (view, completion, from, to) => {
    const insert = completion.label + suffix
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input.complete',
      annotations: pickedCompletion.of(completion),
    })
    startCompletion(view)
  }
}

export const WEB_SCHEMES = [
  { label: 'https://', detail: 'web address', type: 'text', boost: 2 },
  { label: 'http://', detail: 'web address', type: 'text', boost: 2 },
]

/** The keywords that declare an element, as regex sources for a declaration pattern. */
export const ELEMENT_KINDS = [...PARTICIPANTS, ...STRUCTURES]
  .map((kind) => (kind === 'abstract' ? 'abstract(?:[ \\t]+class)?' : kind))
