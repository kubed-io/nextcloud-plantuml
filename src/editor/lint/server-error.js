/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The mistake the PlantUML server named when it last drew the source, as an
 * error on the line it named, in the server's own words.
 */
import { serverError } from './state.js'

/** @param {import('@codemirror/state').EditorState} state */
export function serverMistake(state) {
  const mistake = state.field(serverError, false)
  if (!mistake) {
    return []
  }
  const line = state.doc.lineAt(mistake.pos)
  return [{ from: line.from, to: line.to, severity: 'error', message: mistake.message }]
}
