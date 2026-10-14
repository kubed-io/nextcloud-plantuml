/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What the rules know beyond the text, fed in by the editor: the file's name,
 * which changes after Save as copy, and the last mistake the server named.
 */
import { Facet, StateEffect, StateField } from '@codemirror/state'

/** The file's base name, such as `Order flow.puml`. */
export const fileName = Facet.define({ combine: (values) => values[0] ?? '' })

/** `{ message, line }` (1-based) from the latest render, or null when it came back clean. */
export const setServerError = StateEffect.define()

/**
 * The mistake as `{ message, pos }`, pos the start of its line, carried through
 * edits until the next render answers, so the mark stays on the line it named.
 */
export const serverError = StateField.define({
  create: () => null,
  update(value, tr) {
    let next = value && tr.docChanged ? { ...value, pos: tr.changes.mapPos(value.pos) } : value
    for (const effect of tr.effects) {
      if (effect.is(setServerError)) {
        const { doc } = tr.state
        next = effect.value && { message: effect.value.message, pos: doc.line(Math.min(Math.max(effect.value.line, 1), doc.lines)).from }
      }
    }
    return next
  },
})
