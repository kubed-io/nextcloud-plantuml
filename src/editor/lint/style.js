/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Style blocks: a property PlantUML does not know is a warning, with the
 * nearest one it does as the fix; PlantUML matches them whatever their case.
 * Selectors are never checked, as stereotype classes are free-form. A
 * `<style>` no `</style>` closes is an error. The style profile's rule, so it
 * imports no core module, nor @nextcloud/l10n: a library the editor shares
 * with a chunk becomes a chunk the editor imports statically.
 */
import vocabulary from '../data/vocabulary.json'
import { readStyle, styleBlocks } from '../profiles/style-grammar.js'

const { properties } = vocabulary.style
const KNOWN = new Set(properties.map((name) => name.toLowerCase()))

/** Edit distance, case aside. */
function distance(a, b) {
  a = a.toLowerCase()
  b = b.toLowerCase()
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[b.length]
}

const nearest = (name) => properties.reduce((best, candidate) => (distance(name, candidate) < distance(name, best) ? candidate : best))

/** @param {import('@codemirror/state').EditorState} state */
export function styleLint(state) {
  const { doc } = state
  const found = []
  for (const block of styleBlocks(doc.toString().split('\n'))) {
    if (!block.closed) {
      const open = doc.line(block.open)
      const from = open.from + open.text.indexOf('<style>')
      found.push({
        from,
        to: from + '<style>'.length,
        severity: 'error',
        message: 'No </style> for this style block',
      })
    }
    readStyle(block.body, (token, line, start, end, name) => {
      if (token !== 'propertyName' || KNOWN.has(name.toLowerCase())) {
        return
      }
      const fix = nearest(name)
      const from = doc.line(line.line).from + start
      found.push({
        from,
        to: from + (end - start),
        severity: 'warning',
        message: `Unknown style property ${name}`,
        actions: [{
          name: fix,
          apply(view, from, to) {
            view.dispatch({ changes: { from, to, insert: fix } })
          },
        }],
      })
    })
  }
  return found.sort((a, b) => a.from - b.from)
}
