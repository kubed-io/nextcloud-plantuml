/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Named colours after a `#` where a colour goes (X14): an element's colour
 * after its declaration, a styled link's brackets, `<color:#` and `<back:#`,
 * and a skinparam's or a style's `…Color` value. The names are the configured
 * server's (GET /apps/plantuml/colors), each shown with its swatch. Not after
 * a `#` that starts a line (`#highlight`, a Creole list), in a style part
 * (`#line.dashed`), a comment, a string or a label.
 */
import { PARTICIPANTS, STRUCTURES } from './keywords.js'
import { serverColors } from './server-list.js'

const KINDS = [...PARTICIPANTS, ...STRUCTURES, 'agent', 'archimate', 'artifact', 'box', 'card', 'circle', 'diamond', 'file', 'hexagon', 'label', 'legend', 'map', 'note', 'person', 'stack', 'storage']
  .map((kind) => (kind === 'abstract' ? 'abstract(?:[ \\t]+class)?' : kind))

// Each ends at the name being typed, the group after the `#`.
const PLACES = [
  // `actor Bob #`, `[Web] #`, `note left of A #`: a declaration, before any label.
  new RegExp(`^[ \\t]*(?:(?:${KINDS.join('|')})(?![\\w-])|\\[[^\\]]*\\]|\\([^)]*\\)|:[^:]+:)(?:[ \\t](?:"[^"]*"|[^:"'])*)?[ \\t]#(\\w*)$`),
  /[-.]\[(?:[^\]]*[,;])?#(\w*)$/,
  /<(?:color|back):#(\w*)$/,
  /(?:^|[\s{;])\w*colou?r[ \t]+#(\w*)$/i,
]

/**
 * The swatch before a colour in the list, drawn by the rules for the picker's
 * own (`span[data-color]`, theme.js).
 *
 * @type {import('@codemirror/autocomplete').CompletionConfig['addToOptions'][number]}
 */
export const swatchOption = {
  position: 20,
  render(completion) {
    if (!completion.swatch) {
      return null
    }
    const swatch = document.createElement('span')
    swatch.dataset.color = completion.swatch
    swatch.style.backgroundColor = completion.swatch
    return swatch
  },
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function colors(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = context.state.sliceDoc(line.from, context.pos)
  if (/^\s*'/.test(before) || before.split('"').length % 2 === 0) {
    return null
  }
  const typed = PLACES.map((place) => place.exec(before)).find(Boolean)
  if (!typed) {
    return null
  }
  const options = Object.entries(await serverColors()).map(([label, swatch]) => ({ label, swatch }))
  return { from: context.pos - typed[1].length, options, validFor: /^\w*$/ }
}
