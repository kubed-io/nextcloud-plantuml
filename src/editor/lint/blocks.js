/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A diagram's block must close with its own `@end`: a `@start` nothing closes
 * is an error, so is an `@end` of another type, and an `@end` with no block
 * to close is a warning. An unknown type is left to the server.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { blocksOf, diagramsOf } from '../blocks.js'

const END = /^(\s*)@end(\w*)\s*$/

/** @param {import('@codemirror/state').EditorState} state */
export function blocksLint(state) {
  const blocks = blocksOf(diagramsOf(state.doc))
  const found = []

  blocks.forEach((block) => {
    const open = state.doc.line(block.start)
    const from = open.from + open.text.indexOf('@start')
    const to = from + '@start'.length + block.type.length
    const type = block.type
    if (block.end === null) {
      found.push({
        from,
        to,
        severity: 'error',
        message: t(APP_ID, 'No @end{type} for this diagram', { type }),
        actions: [{
          name: t(APP_ID, 'Add @end{type}', { type }),
          // Read at click time: an edit since the lint ran moves the lines.
          apply(view, from) {
            const doc = view.state.doc
            const line = doc.lineAt(from).number
            const next = blocksOf(diagramsOf(doc)).find((candidate) => candidate.start > line)
            const at = next ? doc.line(next.start).from : doc.length
            const lead = !next && doc.length && doc.sliceString(doc.length - 1) !== '\n' ? '\n' : ''
            view.dispatch({ changes: { from: at, insert: `${lead}@end${type}\n` } })
          },
        }],
      })
      return
    }
    const close = state.doc.line(block.end)
    const written = END.exec(close.text)[2]
    if (written !== type) {
      const start = close.from + close.text.indexOf('@end')
      found.push({
        from: start,
        to: start + '@end'.length + written.length,
        severity: 'error',
        message: t(APP_ID, 'This closes @start{type}', { type }),
        actions: [{
          name: t(APP_ID, 'Change to @end{type}', { type }),
          apply(view, from, to) {
            view.dispatch({ changes: { from, to, insert: `@end${type}` } })
          },
        }],
      })
    }
  })

  // An `@end` closes any open block, so one outside every block's lines has none to close.
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const stray = END.exec(line.text)
    if (!stray || blocks.some((block) => n >= block.start && n <= (block.end ?? block.start))) {
      continue
    }
    const from = line.from + stray[1].length
    found.push({
      from,
      to: line.to - (line.text.length - line.text.trimEnd().length),
      severity: 'warning',
      message: t(APP_ID, 'No diagram to end'),
    })
  }
  return found
}
