/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The built-in themes after `!theme `, as the configured PlantUML server lists
 * them (GET /apps/plantuml/themes): a value with a list in the registry
 * (values/index.js), so completion and the chooser both offer it. An empty
 * name still has a place, for the list to open on right after the space.
 */
import { serverList } from './server-list.js'

const THEME = /^(\s*!theme\s+)([\w-]*)/

/** @type {import('../values/index.js').ValueEntry} */
export const themeValue = {
  match(lineText, state, lineFrom) {
    const found = THEME.exec(lineText)
    if (!found) {
      return []
    }
    const from = lineFrom + found[1].length
    return [{ from, to: from + found[2].length, kind: 'list', doc: 'theme', options: () => serverList('themes') }]
  },
}
