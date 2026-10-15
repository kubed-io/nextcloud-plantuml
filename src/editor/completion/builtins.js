/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML's built-in functions after a `%`, anywhere in a line but a `'`
 * comment. The list is its own chunk, loaded the first time a `%` is typed
 * (a dynamic import: the entry must never import a chunk statically).
 */
let loaded = null

function options() {
  loaded ??= import('../data/builtins.json').then(({ default: list }) =>
    list.map(({ name, description, example }) => ({
      label: name,
      type: 'function',
      detail: description,
      ...(example && { info: example }),
      apply: (view, completion, from, to) => {
        const insert = `${name}()`
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length - 1 }, userEvent: 'input.complete' })
      },
    })))
  return loaded
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function builtins(context) {
  const typed = context.matchBefore(/%\w*/)
  if (!typed || /^\s*'/.test(context.state.doc.lineAt(context.pos).text)) {
    return null
  }
  return { from: typed.from, options: await options(), validFor: /^%\w*$/ }
}
