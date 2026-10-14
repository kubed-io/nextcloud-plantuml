/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The emoji after `<:`, anywhere in a line, as the configured PlantUML server
 * lists them (GET /apps/plantuml/emoji). Picking one closes the tag.
 */
import { serverList } from './server-list.js'

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function emoji(context) {
  const typed = context.matchBefore(/<:[\w+-]*/)
  if (!typed) {
    return null
  }
  const options = (await serverList('emoji')).map((label) => ({ label, type: 'constant', apply: `${label}:>` }))
  return { from: typed.from + 2, options, validFor: /^[\w+-]*$/ }
}
