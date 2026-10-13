/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The editor's right pane: source text to an SVG through POST /render. The
 * route keeps core's CSRF check, so the request token rides along. A failure
 * rejects with the one line to show: the route's `{"problem": …}`, else the
 * body's first line, else the status.
 */
import { APP_ID } from '../files-helpers.js'

const DELAY_MS = 300

/**
 * @param {string} source
 * @return {Promise<Blob>} the SVG
 */
export async function render(source) {
  const res = await fetch(OC.generateUrl(`/apps/${APP_ID}/render`), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', requesttoken: OC.requestToken },
    body: JSON.stringify({ source }),
  })
  if (res.ok) {
    return res.blob()
  }
  const body = await res.text()
  throw new Error(problemOf(body) || body.split('\n')[0].trim() || res.statusText || String(res.status))
}

function problemOf(body) {
  try {
    const problem = JSON.parse(body)?.problem
    return typeof problem === 'string' ? problem : ''
  } catch {
    return ''
  }
}

let timer = null
let latest = 0

/**
 * Renders `source` once it has been still for 300 ms and calls `cb(error, blob)`.
 * Only the newest source reaches `cb`, however the answers arrive.
 *
 * @param {string} source
 * @param {(error: Error|null, blob?: Blob) => void} cb
 */
export function debouncedRender(source, cb) {
  clearTimeout(timer)
  const call = ++latest
  timer = setTimeout(() => {
    render(source).then(
      (blob) => call === latest && cb(null, blob),
      (error) => call === latest && cb(error),
    )
  }, DELAY_MS)
}
