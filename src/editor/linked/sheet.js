/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `<style file=…>` target in the source pane (R12): the style grammar, its
 * completion, its lint, its values and its hover cards, and nothing of `@start` blocks. The
 * editor's own chrome is added beside it (extensions.js).
 */
import { autocompletion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { plantumlLanguage } from '../plantuml-mode.js'
import { styleSheet } from '../regions.js'
import { colors, swatchOption } from '../completion/colors.js'
import { values } from '../completion/values.js'
import { withDocs } from '../completion/docs.js'
import { plantumlDocs } from '../docs/hover.js'
import { profileRules, sheetLint } from '../lint/index.js'
import { serverError } from '../lint/state.js'
import { valuesFacet } from '../values/index.js'

/** @param {import('../profiles/index.js').Profile|null} profile the style profile on sheetRegions; null when it would not load */
export function sheetExtension(profile) {
  // serverError is there for the linter's needsRefresh, which reads it on every update.
  const base = [plantumlLanguage(profile ? { style: profile.mode } : {}, { sheet: true }), styleSheet.of(true), serverError]
  if (!profile) return base
  return [
    ...base,
    ...[...profile.completions, colors, values].map((source) => EditorState.languageData.of(() => [{ autocomplete: withDocs(source) }])),
    autocompletion({ addToOptions: [swatchOption] }),
    // After the completion, whose Escape closes its list first, as in a diagram.
    plantumlDocs,
    profileRules.of(profile.lints),
    sheetLint,
    valuesFacet.of(profile.values ?? []),
  ]
}
