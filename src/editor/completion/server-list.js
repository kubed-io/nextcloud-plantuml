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
const HEX = /^#[\dA-Fa-f]{6}$/

/** The route's answer under `name`, as `read` keeps it; `empty` when there is none. */
function ask(name, read, empty) {
  if (!asked.has(name)) {
    asked.set(name, Promise.resolve()
      .then(() => fetch(OC.generateUrl(`/apps/${APP_ID}/${name}`), { credentials: 'same-origin' }))
      .then((res) => (res.ok ? res.json() : {}))
      .then((body) => read(body?.[name]))
      .catch(() => empty))
  }
  return asked.get(name)
}

/** @param {'themes'|'icons'|'emoji'} name */
export function serverList(name) {
  return ask(name, (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : []), [])
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
