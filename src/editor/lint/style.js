/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Style blocks: a property PlantUML does not know is a warning, with the
 * nearest one it does as the fix; PlantUML matches them whatever their case.
 * Selectors are never checked, as stereotype classes are free-form. A
 * `<style>` no `</style>` closes is an error. The style profile's rule, made
 * from the core it is given, `replaceAction` among it (`lint/actions.js` is
 * the blocks rule's too, so a core module): importing a core module, or a library the editor
 * also uses (@nextcloud/l10n), would make it a chunk the editor imports
 * statically. `t` is called with the app id written out, for the string
 * extractor, and without sanitizing, which would strip `</style>`.
 */
import vocabulary from '../data/vocabulary.json'
import { readStyle } from '../profiles/style-grammar.js'

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

const AS_TEXT = { escape: false, sanitize: false }

/** @param {{ t: typeof import('@nextcloud/l10n').translate, styleBlocks: typeof import('../regions.js').styleRegions, replaceAction: typeof import('./actions.js').replaceAction }} core */
export const styleLint = ({ t, styleBlocks, replaceAction }) => (state) => {
  const { doc } = state
  const found = []
  for (const block of styleBlocks(doc)) {
    if (!block.closed) {
      const open = doc.line(block.open)
      const from = open.from + open.text.indexOf('<style>')
      found.push({
        from,
        to: from + '<style>'.length,
        severity: 'error',
        message: t('plantuml', 'No </style> for this style block', undefined, undefined, AS_TEXT),
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
        message: t('plantuml', 'Unknown style property {name}', { name }, undefined, AS_TEXT),
        actions: [replaceAction(fix, fix)],
      })
    })
  }
  return found.sort((a, b) => a.from - b.from)
}
