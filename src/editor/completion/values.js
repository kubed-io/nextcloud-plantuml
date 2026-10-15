/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A value's list, from the registry (values/index.js): a theme, a style
 * property's value. The result spans the whole value, so a pick replaces it
 * wherever the cursor is in it. Asked for (Ctrl-Space, the chooser), the
 * whole list shows with the current value first, and so selected; typing
 * then filters it again.
 */
import { valueAt } from '../values/index.js'

const WORD = /^[\w-]*$/

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function values(context) {
  const value = valueAt(context.state, context.pos)
  if (value?.kind !== 'list') {
    return null
  }
  const labels = await value.options()
  const filtered = (now) => ({ from: now.from, to: now.to, options: labels.map((label) => ({ label, type: 'constant' })), validFor: WORD })
  if (!context.explicit) {
    return filtered(value)
  }
  const current = context.state.sliceDoc(value.from, value.to)
  const ordered = labels.includes(current) ? [current, ...labels.filter((label) => label !== current)] : labels
  return {
    from: value.from,
    to: value.to,
    options: ordered.map((label) => ({ label, type: 'constant' })),
    filter: false,
    // No validFor, so the first change asks `update`, which filters by what was typed.
    update: (result, from, to, next) => {
      const now = valueAt(next.state, next.pos)
      return now?.kind === 'list' && now.from === value.from ? filtered(now) : null
    },
  }
}
