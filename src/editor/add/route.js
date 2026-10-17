/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The template files the server offers (GET /apps/plantuml/templates, app spec
 * TP3). A failure leaves the built-ins alone (A5), so it answers nothing.
 * In the add chunk, so the app id is written out rather than imported (index.js).
 */
const APP_ID = 'plantuml'

/** @returns {Promise<{ source: 'shared'|'yours', path: string, text: string }[]>} */
export async function fetchTemplates() {
  try {
    const res = await fetch(OC.generateUrl(`/apps/${APP_ID}/templates`), { credentials: 'same-origin' })
    const body = res.ok ? await res.json() : null
    if (Array.isArray(body?.files)) {
      return body.files
    }
    console.error(`[${APP_ID}] could not list the templates`, res.status)
  } catch (e) {
    console.error(`[${APP_ID}] could not list the templates`, e)
  }
  return []
}
