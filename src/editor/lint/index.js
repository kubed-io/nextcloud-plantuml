/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Validation for the source pane: one module per rule, each a pure function
 * of an EditorState returning CodeMirror diagnostics. A new rule is a file
 * beside these and a line in `rules`.
 */
import { linter, lintGutter } from '@codemirror/lint'
import { fileName, serverError } from './state.js'
import { unnamedStart } from './unnamed-start.js'
import { serverMistake } from './server-error.js'

export const rules = [unnamedStart, serverMistake]

/** Run again when the file is renamed or the server answers, not only on an edit. */
function needsRefresh(update) {
  return update.startState.facet(fileName) !== update.state.facet(fileName)
    || update.startState.field(serverError) !== update.state.field(serverError)
}

export const plantumlLint = [
  serverError,
  linter((view) => rules.flatMap((rule) => rule(view.state)), { needsRefresh }),
  lintGutter(),
]
