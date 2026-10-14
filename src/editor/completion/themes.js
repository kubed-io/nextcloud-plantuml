/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The built-in themes after `!theme `, as the configured PlantUML server lists
 * them (GET /apps/plantuml/themes). Asked once per page: a failed answer
 * offers nothing for the rest of it rather than asking again on every key.
 */
import { APP_ID } from '../../files-helpers.js'

let asked = null

function serverThemes() {
  asked ??= fetch(OC.generateUrl(`/apps/${APP_ID}/themes`), { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : {}))
    .then((body) => (Array.isArray(body?.themes) ? body.themes.filter((name) => typeof name === 'string') : []))
    .catch(() => [])
  return asked
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function themes(context) {
  const typed = context.matchBefore(/^\s*!theme\s+[\w-]*/)
  if (!typed) {
    return null
  }
  const name = typed.text.match(/[\w-]*$/)[0]
  const options = (await serverThemes()).map((label) => ({ label, type: 'constant' }))
  return { from: typed.to - name.length, options, validFor: /^[\w-]*$/ }
}
