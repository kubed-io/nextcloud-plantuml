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
import { linter, lintGutter, lintKeymap } from '@codemirror/lint'
import { fileName, serverError } from './state.js'
import { unnamedStart } from './unnamed-start.js'
import { serverMistake } from './server-error.js'
import { blocksLint } from './blocks.js'
import { creoleColour } from './creole-colour.js'
import { docPinned, onCard } from '../docs/hover.js'

export const rules = [unnamedStart, blocksLint, serverMistake, creoleColour]

/** The loaded profiles' rules, run beside `rules`. */
export const profileRules = Facet.define({ combine: (values) => values.flat() })

/** Run again when the file is renamed, the server answers or a profile arrives, not only on an edit. */
function needsRefresh(update) {
  return update.startState.facet(fileName) !== update.state.facet(fileName)
    || update.startState.field(serverError) !== update.state.field(serverError)
    || update.startState.facet(profileRules) !== update.state.facet(profileRules)
}

/** Set while lint's keys (F8, Mod-Shift-m) run: F8 opens the message it moves to, not the pointer's. */
let unfiltered = false

/**
 * Lint's own hover leaves a carded word's messages to the doc card, which
 * draws them above itself at 500 ms, below the word (I2); while a card is
 * pinned (I3) it opens none, so nothing joins the pinned box. An empty list
 * would still draw an empty section; null draws none.
 */
export function tooltipFilter(diagnostics, state) {
  if (unfiltered) {
    return diagnostics
  }
  const left = state.field(docPinned, false) ? [] : diagnostics.filter(({ from, to }) => !onCard(state, from, to))
  return left.length ? left : null
}

/** lintKeymap, its F8 showing a carded word's message too. */
export const plantumlLintKeymap = lintKeymap.map((binding) => ({
  ...binding,
  run(view) {
    unfiltered = true
    try {
      return binding.run(view)
    } finally {
      unfiltered = false
    }
  },
}))

export const plantumlLint = [
  serverError,
  linter((view) => [...rules, ...view.state.facet(profileRules)].flatMap((rule) => rule(view.state)), { needsRefresh, tooltipFilter }),
  lintGutter(),
]
