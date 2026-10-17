/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What several completion sources share: an `apply` that opens the list again,
 * the web-scheme options and the element kinds a line can start with.
 */
import { insertCompletionText, pickedCompletion, startCompletion } from '@codemirror/autocomplete'
import { PARTICIPANTS, STRUCTURES } from './keywords.js'

/**
 * An `apply` that inserts the label and `suffix` at every cursor, then opens the list again for the
 * next level. (Every source gets multi-cursor completion this way, which only local-files, stdlib and
 * tag-attributes lacked.)
 *
 * @param {string} suffix
 */
export function reopen(suffix = '') {
  return (view, completion, from, to) => {
    const insert = completion.label + suffix
    view.dispatch({ ...insertCompletionText(view.state, insert, from, to), annotations: pickedCompletion.of(completion) })
    startCompletion(view)
  }
}

export const WEB_SCHEMES = Object.freeze([
  Object.freeze({ label: 'https://', detail: 'web address', type: 'text', boost: 2 }),
  Object.freeze({ label: 'http://', detail: 'web address', type: 'text', boost: 2 }),
])

/** `reopen()` made once, for the sources that add no suffix. */
export const reopenPlain = reopen()

/** The keywords that declare an element, as regex sources for a declaration pattern. */
export const ELEMENT_KINDS = Object.freeze([...PARTICIPANTS, ...STRUCTURES]
  .map((kind) => (kind === 'abstract' ? 'abstract(?:[ \\t]+class)?' : kind)))
