/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Named colours after a `#` where a colour goes (X14): an element's colour
 * after its declaration, a styled link's brackets, `<color:#` and `<back:#`,
 * and a skinparam's `…Color` value, on its line or in its block. In a style
 * block, a `…Color` property's value, with its `#` or without (X9), and on a
 * uml line of its own, after `colors` (X13). The names are the configured
 * server's (GET /apps/plantuml/colors), each shown with its swatch. Not after
 * a `#` that starts a line (`#highlight`, a Creole list), in a style part
 * (`#line.dashed`), a comment, a string, a label or a note's text.
 */
import { PARTICIPANTS, STRUCTURES, inUml } from './keywords.js'
import { serverColors } from './server-list.js'
import { inStyleBody } from '../plantuml-mode.js'
import { inSkinparamBlock } from '../values/index.js'

const KINDS = [...PARTICIPANTS, ...STRUCTURES, 'agent', 'archimate', 'artifact', 'box', 'card', 'circle', 'diamond', 'file', 'hexagon', 'label', 'legend', 'map', 'note', 'person', 'stack', 'storage']
  .map((kind) => (kind === 'abstract' ? 'abstract(?:[ \\t]+class)?' : kind))

// Each ends at the name being typed, the group after the `#`.
const PLACES = [
  // `actor Bob #`, `[Web] #`, `note left of A #`: a declaration, before any label.
  new RegExp(`^[ \\t]*(?:(?:${KINDS.join('|')})(?![\\w-])|\\[[^\\]]*\\]|\\([^)]*\\)|:[^:]+:)(?:[ \\t](?:"[^"]*"|[^:"'])*)?[ \\t]#(\\w*)$`),
  /[-.]\[(?:[^\]]*[,;])?#(\w*)$/,
  /<(?:color|back):#(\w*)$/,
  /^[ \t]*skinparam[ \t]+\S*colou?r\S*[ \t]+#(\w*)$/i,
]
// A line of a `skinparam … {` block, and a style declaration, which may follow a `{` or `;`.
const SKINPARAM_LINE = /^[ \t]*\S*colou?r\S*[ \t]+#(\w*)$/i
const STYLE = /(?:^|[{;])[ \t]*[\w-]*colou?r[ \t]+#?(\w*)$/i
const HELPER = /^[ \t]*colors[ \t]+(\w*)$/

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

/** The name typed so far where a colour goes, null where none does. */
function typedAt(state, pos, line, before) {
  if (inStyleBody(state, pos)) {
    return STYLE.exec(before)?.[1] ?? null
  }
  const helper = HELPER.exec(before)
  if (helper) {
    return !line.text.slice(pos - line.from).trim() && inUml(state, line.number) ? helper[1] : null
  }
  const place = PLACES.map((candidate) => candidate.exec(before)).find(Boolean)
  if (place) {
    return place[1]
  }
  const inner = SKINPARAM_LINE.exec(before)
  return inner && inSkinparamBlock(state, line.number) ? inner[1] : null
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function colors(context) {
  const { state, pos } = context
  const line = state.doc.lineAt(pos)
  const before = state.sliceDoc(line.from, pos)
  if (/^\s*'/.test(before) || before.split('"').length % 2 === 0) {
    return null
  }
  const typed = typedAt(state, pos, line, before)
  if (typed === null) {
    return null
  }
  const options = Object.entries(await serverColors()).map(([label, swatch]) => ({ label, swatch }))
  return { from: pos - typed.length, options, validFor: /^\w*$/ }
}
