// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The app's server routes, stubbed: `OC` and `fetch` as the editor finds them.
import { vi } from 'vitest'

/** A fetch mock answering 200 with `body` as JSON to any route, as `GET /apps/plantuml/<name>` does ({"<name>": …}). */
export function answering(body) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

/** A fetch for a server that answers 503. */
export const serverDown = async () => new Response('{}', { status: 503 })

/**
 * Stubs `OC` and `fetch` so the routes answer `routes` (`{ themes: […], colors: {…} }`) and returns the
 * `fetch` mock, to count its calls or re-answer. Undo it with `vi.unstubAllGlobals()`.
 *
 * @param {Record<string, unknown>} routes
 */
export function serverAnswering(routes) {
  const fetch = answering(routes)
  vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
