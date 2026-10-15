/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A value's list, from the registry (values/index.js): a theme, a style
 * property's value. The result spans the whole value, so a pick replaces it
 * wherever the cursor is in it. Asked for (Ctrl-Space, the chooser), the
 * whole list shows with the current value first, and so selected; typing
 * then filters it again. A colour's list (W5) is the server's names, each with
 * its swatch, and only asked for: typing a colour's name is colors.js's.
 */
import { colourOf } from '../swatches.js'
import { serverColors } from './server-list.js'
import { valueAt } from '../values/index.js'

const WORD = /^[\w-]*$/

/** The label of `swatches` that `text` (a name, or a hex) is, null when none is. */
function currentColour(text, labels, swatches) {
  const bare = text.replace(/^#/, '')
  const named = labels.find((label) => label.toLowerCase() === bare.toLowerCase())
  if (named) {
    return named
  }
  const hex = colourOf(`#${bare}`, null)
  return hex ? labels.find((label) => swatches[label]?.toLowerCase() === hex) ?? null : null
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function values(context) {
  const value = valueAt(context.state, context.pos)
  if (value?.kind !== 'list' || (value.colours && !context.explicit)) {
    return null
  }
  const labels = await value.options()
  const swatches = value.colours ? await serverColors() : null
  const option = (close) => (label) => {
    const made = close ? { label, type: 'constant', apply: label + close } : { label, type: 'constant' }
    return swatches?.[label] ? { ...made, swatch: swatches[label] } : made
  }
  const filtered = (now) => ({ from: now.from, to: now.to, options: labels.map(option(now.close)), validFor: WORD })
  if (!context.explicit) {
    return filtered(value)
  }
  const text = context.state.sliceDoc(value.from, value.to)
  const current = swatches ? currentColour(text, labels, swatches) : text
  const ordered = labels.includes(current) ? [current, ...labels.filter((label) => label !== current)] : labels
  return {
    from: value.from,
    to: value.to,
    options: ordered.map(option(value.close)),
    filter: false,
    // No validFor, so the first change asks `update`, which filters by what was typed.
    update: (result, from, to, next) => {
      const now = valueAt(next.state, next.pos)
      return now?.kind === 'list' && now.from === value.from ? filtered(now) : null
    },
  }
}
