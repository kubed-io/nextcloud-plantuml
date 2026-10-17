/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The editor's right pane: source text to SVG text through POST /render. The
 * route keeps core's CSRF check, so the request token rides along. A failure
 * rejects with the one line to show: the route's `{"problem": …}`, else one
 * fixed line, since anything else (a proxy's error page, an expired session)
 * is no diagram's problem. A mistake in the diagram is still an image, and
 * the route passes on PlantUML's line about it and where it is.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'

const DELAY_MS = 300

/**
 * @param {string} source
 * @param {number} [index] which diagram of the file to draw, from 0
 * @param {string} [path] the file whose folder its includes resolve against (R4); none, they go as written
 * @param {Object<string, string>|null} [overrides] R13: a linked file's text in place of the file, keyed by the path as its line writes it
 * @return {Promise<string>} the SVG
 */
export async function render(source, index = 0, path = '', overrides = null) {
  return (await request(source, index, path, overrides)).svg
}

/** @return {Promise<{svg: string, mistake: {message: string, line: number}|null}>} */
async function request(source, index, path, overrides) {
  const res = await fetch(OC.generateUrl(`/apps/${APP_ID}/render`), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', requesttoken: OC.requestToken },
    body: JSON.stringify(overrides ? { source, index, path, overrides } : { source, index, path }),
  })
  if (res.ok && res.headers.get('Content-Type')?.startsWith('image/')) {
    return { svg: await res.text(), mistake: mistakeOf(res.headers) }
  }
  const problem = res.ok ? '' : problemOf(await res.text())
  throw new Error(problem || t(APP_ID, 'Could not draw the diagram'))
}

/**
 * PlantUML counts the line from 0 at the top of the source it was sent, blank
 * lines and comments before `@startuml` included; the editor counts from 1.
 * The routes percent-encode the message past ASCII, and its `%`.
 */
function mistakeOf(headers) {
  const message = decoded(headers.get('X-PlantUML-Diagram-Error'))
  const line = headers.get('X-PlantUML-Diagram-Error-Line') ?? ''
  return message && /^\d+$/.test(line) ? { message, line: Number(line) + 1 } : null
}

function decoded(text) {
  try {
    return text && decodeURIComponent(text)
  } catch {
    return text
  }
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
 * Renders `source` once it has been still for 300 ms and calls
 * `cb(error, svg, mistake)`, `svg` being the SVG's text and `mistake`
 * `{message, line}` or null.
 *
 * One render at a time: each POST holds a PHP worker for as long as the
 * PlantUML server takes, so a burst of typing against a slow server must not
 * become a burst of workers. A source that comes due while a render is out is
 * parked, the newest replacing any before it, and is sent when the answer
 * lands; that answer is then stale and dropped.
 *
 * @param {string} source
 * @param {number} index which diagram of the file to draw, from 0
 * @param {string} path the file whose folder its includes resolve against
 * @param {(error: Error|null, svg?: string, mistake?: {message: string, line: number}|null) => void} cb
 * @param {Object<string, string>|null} [overrides] as render's
 */
export function debouncedRender(source, index, path, cb, overrides = null) {
  clearTimeout(timer)
  timer = setTimeout(() => send(source, index, path, cb, overrides), DELAY_MS)
}

/** Drops the waiting source and the parked one; an answer already out still arrives. */
export function cancel() {
  clearTimeout(timer)
  parked = null
}

function send(source, index, path, cb, overrides) {
  if (inFlight) {
    parked = { source, index, path, cb, overrides }
    return
  }
  inFlight = true
  request(source, index, path, overrides)
    .then(({ svg, mistake }) => [null, svg, mistake], (error) => [error])
    .then(([error, svg, mistake]) => {
      inFlight = false
      if (parked) {
        const next = parked
        parked = null
        send(next.source, next.index, next.path, next.cb, next.overrides)
      } else {
        cb(error, svg, mistake)
      }
    })
}
