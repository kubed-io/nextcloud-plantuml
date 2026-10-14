/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A list the configured PlantUML server knows, from the app's route for it
 * (GET /apps/plantuml/<name> answers {"<name>": [...]}). Asked once per page:
 * a failed answer is an empty list for the rest of it rather than a request
 * on every key.
 */
import { APP_ID } from '../../files-helpers.js'

const asked = new Map()

/** @param {'themes'|'icons'|'emoji'} name */
export function serverList(name) {
  if (!asked.has(name)) {
    asked.set(name, fetch(OC.generateUrl(`/apps/${APP_ID}/${name}`), { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((body) => (Array.isArray(body?.[name]) ? body[name].filter((item) => typeof item === 'string') : []))
      .catch(() => []))
  }
  return asked.get(name)
}
