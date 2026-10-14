/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The built-in themes after `!theme `, as the configured PlantUML server lists
 * them (GET /apps/plantuml/themes).
 */
import { serverList } from './server-list.js'

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function themes(context) {
  const typed = context.matchBefore(/^\s*!theme\s+[\w-]*/)
  if (!typed) {
    return null
  }
  const name = typed.text.match(/[\w-]*$/)[0]
  const options = (await serverList('themes')).map((label) => ({ label, type: 'constant' }))
  return { from: typed.to - name.length, options, validFor: /^[\w-]*$/ }
}
