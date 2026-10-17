/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * One home for what a completion says about its word (I4, I8): a source marks
 * an option with a `docKey`, and once the docs index has loaded the option
 * gets the entry's summary as its detail and its card as the info box.
 * Until then, or if the chunk fails to load, the options are the source's own.
 */
import { diagramAt, diagramsOf } from '../blocks.js'
import { loadDocs } from '../docs/index.js'
import { renderDoc } from '../docs/card.js'

/** The kinds whose entry follows the block's type (`docs/index.js`). */
const TYPED = /^(?:keyword|connector):/

/** `options` with a detail and an info for each that has a `docKey` and an entry; the source's own options are not changed. */
function described(options, docs, type) {
  return options.map((option) => {
    const entry = option.docKey && docs.get(option.docKey, TYPED.test(option.docKey) ? type : undefined)
    return entry ? { ...option, detail: option.detail ?? entry.summary, info: () => renderDoc(entry) } : option
  })
}

// Mapped once per options array and block type: most sources answer with a module constant.
const mapped = new WeakMap() // options → Map<type, described options>

function describedOnce(options, docs, type) {
  if (!mapped.has(options)) {
    mapped.set(options, new Map())
  }
  const byType = mapped.get(options)
  if (!byType.has(type)) {
    byType.set(type, described(options, docs, type))
  }
  return byType.get(type)
}

const wrapped = new WeakMap()

/**
 * @param {import('@codemirror/autocomplete').CompletionSource} source
 * @return {import('@codemirror/autocomplete').CompletionSource}
 */
export function withDocs(source) {
  if (!wrapped.has(source)) {
    wrapped.set(source, async (context) => {
      const [result, docs] = await Promise.all([source(context), loadDocs().catch(() => null)])
      if (!result?.options || !docs) {
        return result
      }
      const type = diagramAt(diagramsOf(context.state.doc), context.state.doc.lineAt(context.pos).number)?.type ?? 'uml'
      return { ...result, options: describedOnce(result.options, docs, type) }
    })
  }
  return wrapped.get(source)
}
