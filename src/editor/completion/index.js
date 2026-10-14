/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Autocomplete for the source pane: one module per completion source, each a
 * pure function of a CompletionContext, registered through the PlantUML
 * language's data. A new source is a file beside these and a line in
 * `sources`.
 */
import { autocompletion } from '@codemirror/autocomplete'
import { plantumlMode } from '../plantuml-mode.js'
import { directives } from './directives.js'
import { keywords } from './keywords.js'
import { names } from './names.js'
import { snippets } from './snippets.js'
import { themes } from './themes.js'
import { connectors } from './connectors.js'
import { creole } from './creole.js'
import { icons } from './icons.js'
import { emoji } from './emoji.js'

export const sources = [directives, keywords, names, snippets, themes, connectors, creole, icons, emoji]

// One data entry per source: an array under `autocomplete` is read as a list
// of completions, not of sources. autocompletion() binds completionKeymap
// (Ctrl-Space, arrows, Enter, Escape) and leaves Tab alone.
export const plantumlCompletion = [
  ...sources.map((source) => plantumlMode.data.of({ autocomplete: source })),
  autocompletion(),
]
