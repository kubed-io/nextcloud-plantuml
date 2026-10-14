/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The editor's right pane: source text to an SVG through POST /render. The
 * route keeps core's CSRF check, so the request token rides along. A failure
 * rejects with the one line to show: the route's `{"problem": …}`, else one
 * fixed line, since anything else (a proxy's error page, an expired session)
 * is no diagram's problem.
 */
import { translate as t } from '@nextcloud/l10n'
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
  if (res.ok && res.headers.get('Content-Type')?.startsWith('image/')) {
    return res.blob()
  }
  const problem = res.ok ? '' : problemOf(await res.text())
  throw new Error(problem || t(APP_ID, 'Could not draw the diagram'))
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
let inFlight = false
let parked = null

/**
 * Renders `source` once it has been still for 300 ms and calls `cb(error, blob)`.
 *
 * One render at a time: each POST holds a PHP worker for as long as the
 * PlantUML server takes, so a burst of typing against a slow server must not
 * become a burst of workers. A source that comes due while a render is out is
 * parked, the newest replacing any before it, and is sent when the answer
 * lands; that answer is then stale and dropped.
 *
 * @param {string} source
 * @param {(error: Error|null, blob?: Blob) => void} cb
 */
export function debouncedRender(source, cb) {
  clearTimeout(timer)
  timer = setTimeout(() => send(source, cb), DELAY_MS)
}

/** Drops the waiting source and the parked one; an answer already out still arrives. */
export function cancel() {
  clearTimeout(timer)
  parked = null
}

function send(source, cb) {
  if (inFlight) {
    parked = { source, cb }
    return
  }
  inFlight = true
  render(source)
    .then((blob) => [null, blob], (error) => [error])
    .then(([error, blob]) => {
      inFlight = false
      if (parked) {
        const next = parked
        parked = null
        send(next.source, next.cb)
      } else {
        cb(error, blob)
      }
    })
}
