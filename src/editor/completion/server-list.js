/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What the configured PlantUML server knows, from the app's route for it
 * (GET /apps/plantuml/<name> answers {"<name>": …}). Asked once per page: a
 * failed answer is an empty one for the rest of it rather than a request on
 * every key.
 */
import { APP_ID } from '../../files-helpers.js'

const asked = new Map()
const resolved = new Map()
const HEX = /^#[\dA-Fa-f]{6}$/

/** The route's answer under `name`, as `read` keeps it (given the whole body too); `empty` when there is none. */
function ask(name, read, empty) {
  if (!asked.has(name)) {
    asked.set(name, Promise.resolve()
      .then(() => fetch(OC.generateUrl(`/apps/${APP_ID}/${name}`), { credentials: 'same-origin' }))
      .then((res) => (res.ok ? res.json() : {}))
      .then((body) => read(body?.[name], body))
      .catch(() => empty)
      .then((answer) => {
        resolved.set(name, answer)
        return answer
      }))
  }
  return asked.get(name)
}

/** @param {'themes'|'icons'|'emoji'|'fonts'} name */
export function serverList(name) {
  return ask(name, (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []), [])
}

/**
 * The list `serverList(name)` resolved to, or undefined while it is pending
 * (or was never asked): for a caller that cannot wait, such as a widget.
 *
 * @param {'themes'|'icons'|'emoji'|'fonts'} name
 * @return {string[]|undefined}
 */
export function serverListNow(name) {
  return resolved.get(name)
}

/**
 * The server's named colours (X14): name → `#RRGGBB`, or null for one it
 * names but draws no swatch for.
 *
 * @return {Promise<Record<string, string|null>>}
 */
export function serverColors() {
  return ask('colors', (map) => (map && typeof map === 'object' && !Array.isArray(map)
    ? Object.fromEntries(Object.entries(map).filter(([, hex]) => hex === null || (typeof hex === 'string' && HEX.test(hex))))
    : {}), {})
}

/**
 * The server's element types (`help types`) and keywords (`help keywords`),
 * strings only; both empty while it does not answer (X11).
 *
 * @return {Promise<{types: string[], keywords: string[]}>}
 */
export function serverKeywords() {
  const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [])
  return ask('keywords', (_ignored, body) => ({ types: strings(body?.types), keywords: strings(body?.keywords) }), { types: [], keywords: [] })
}

/**
 * The server's standard library (X5), from its `stdlib` command, in its
 * order: each library's name, version and source, the well-formed ones only.
 *
 * @return {Promise<{name: string, version: string, source: string}[]>}
 */
export function serverStdlib() {
  const library = (entry) => ['name', 'version', 'source'].every((key) => typeof entry?.[key] === 'string')
  return ask('stdlib', (list) => (Array.isArray(list)
    ? list.filter(library).map(({ name, version, source }) => ({ name, version, source }))
    : []), [])
}
