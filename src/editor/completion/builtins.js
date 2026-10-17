/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML's built-in functions after a `%`, anywhere in a line but a `'`
 * comment (the docs index gives each its detail and card). The list is its own chunk, loaded the first time a `%` is typed
 * (a dynamic import: the entry must never import a chunk statically).
 */
import { once } from '../once.js'

const loaded = new Map()

function option({ name }) {
  return {
    label: name,
    type: 'function',
    docKey: `function:${name}`,
    apply: (view, completion, from, to) => {
      const insert = `${name}()`
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length - 1 }, userEvent: 'input.complete' })
    },
  }
}

/** The list, loaded once; a failed load is forgotten, so the next `%` tries again. */
function options() {
  return once(loaded, 'list', () => import('../data/builtins.json').then(({ default: list }) => list.map(option)))
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function builtins(context) {
  const typed = context.matchBefore(/%\w*/)
  if (!typed || /^\s*'/.test(context.state.doc.lineAt(context.pos).text)) {
    return null
  }
  try {
    return { from: typed.from, options: await options(), validFor: /^%\w*$/ }
  } catch {
    return null
  }
}
