/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Autocomplete for the source pane: one module per completion source, each a
 * pure function of a CompletionContext, registered as the editor's language
 * data rather than one PlantUML language's, so the sources outlive a swap to a
 * language with a profile's inner mode. A new source is a file beside these
 * and a line in `sources`.
 */
import { autocompletion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { directives } from './directives.js'
import { keywords } from './keywords.js'
import { names } from './names.js'
import { snippets } from './snippets.js'
import { values } from './values.js'
import { connectors } from './connectors.js'
import { styleTag } from './style-tag.js'
import { filesNote } from './files-note.js'
import { creole } from './creole.js'
import { icons } from './icons.js'
import { emoji } from './emoji.js'
import { colors, swatchOption } from './colors.js'
import { builtins } from './builtins.js'
import { localFiles } from './local-files.js'

export const sources = [directives, keywords, names, snippets, values, connectors, styleTag, filesNote, creole, icons, emoji, colors, builtins, localFiles]

// One data entry per source: an array under `autocomplete` is read as a list
// of completions, not of sources. autocompletion() binds completionKeymap
// (Ctrl-Space, arrows, Enter, Escape) and leaves Tab alone. A named colour
// shows its swatch in the list.
export const plantumlCompletion = [
  ...sources.map((source) => EditorState.languageData.of(() => [{ autocomplete: source }])),
  autocompletion({ addToOptions: [swatchOption] }),
]
