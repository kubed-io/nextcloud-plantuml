/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Validation for the source pane: one module per rule, each a pure function
 * of an EditorState returning CodeMirror diagnostics. A new rule is a file
 * beside these and a line in `rules`; a rule for one diagram type belongs to
 * its profile, which provides it through `profileRules`.
 */
import { Facet } from '@codemirror/state'
import { linter, lintGutter } from '@codemirror/lint'
import { fileName, serverError } from './state.js'
import { unnamedStart } from './unnamed-start.js'
import { serverMistake } from './server-error.js'
import { blocksLint } from './blocks.js'
import { creoleColour } from './creole-colour.js'

export const rules = [unnamedStart, blocksLint, serverMistake, creoleColour]

/** The loaded profiles' rules, run beside `rules`. */
export const profileRules = Facet.define({ combine: (values) => values.flat() })

/** Run again when the file is renamed, the server answers or a profile arrives, not only on an edit. */
function needsRefresh(update) {
  return update.startState.facet(fileName) !== update.state.facet(fileName)
    || update.startState.field(serverError) !== update.state.field(serverError)
    || update.startState.facet(profileRules) !== update.state.facet(profileRules)
}

export const plantumlLint = [
  serverError,
  linter((view) => [...rules, ...view.state.facet(profileRules)].flatMap((rule) => rule(view.state)), { needsRefresh }),
  lintGutter(),
]
