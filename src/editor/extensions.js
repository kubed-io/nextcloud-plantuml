/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What the source pane is made of, for each file it shows: the editor's own
 * chrome for any file, and the PlantUML language with its profiles, completion,
 * hover cards, lint and folding for a diagram file (the main one, or a linked
 * `.puml`). A linked style file takes the chrome beside sheet.js instead.
 */
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { closeLintPanel } from '@codemirror/lint'
import { profileExtension, profileLoader } from './profiles/index.js'
import { plantumlTheme } from './theme.js'
import { plantumlCompletion } from './completion/index.js'
import { valueWidgets } from './values/widgets.js'
import { colorSwatches } from './swatches.js'
import { plantumlLint, plantumlLintKeymap } from './lint/index.js'
import { plantumlDocs } from './docs/hover.js'
import { plantumlFolding } from './folding.js'
import { fileName, filePath } from './lint/state.js'
import { fromFile } from './file-session.js'

/**
 * Every file's: line numbers, the active line, undo, search, the theme, the
 * colour swatches and value choosers, and the keys.
 *
 * @param {{save: () => void, onUpdate: (update: import('@codemirror/view').ViewUpdate) => void}} options
 * @return {import('@codemirror/state').Extension[]}
 */
export function editorChrome({ save, onUpdate }) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    bracketMatching(),
    closeBrackets(),
    highlightSelectionMatches(),
    search({ top: true }),
    history(),
    plantumlTheme,
    // A swatch before each ColorLiteral, named ones too; picking a colour writes it back as #rrggbb.
    colorSwatches,
    // A chooser after each value with a list, a stepper after each number, on the cursor's line.
    valueWidgets,
    // Long lines wrap, so the source pane never scrolls sideways.
    EditorView.lineWrapping,
    // Mod-s would otherwise be the browser's "Save page as". defaultKeymap
    // carries Mod-/ for comments; Ctrl-M (Shift-Alt-M on macOS) makes Tab
    // move focus again instead of indenting. plantumlLintKeymap (lint's own)
    // opens the diagnostics panel on Mod-Shift-m and steps through them on F8.
    keymap.of([
      { key: 'Mod-s', run: () => { save(); return true } },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...plantumlLintKeymap,
      // An open diagnostics panel takes Escape before the editor does.
      { key: 'Escape', run: closeLintPanel },
      indentWithTab,
    ]),
    EditorView.updateListener.of(onUpdate),
  ]
}

/**
 * A diagram file's: the chrome, plus the PlantUML language and what its loaded
 * profiles add, its completion, hover cards, lint, folding and name.
 *
 * @param {object} options
 * @param {string} options.name the file's name, for the lint
 * @param {string} options.path the file's path, which its relative paths resolve against
 * @param {() => void} options.save
 * @param {(update: import('@codemirror/view').ViewUpdate) => void} options.onUpdate
 * @param {import('@codemirror/state').Extension} options.chips linkedChips(open) for the main file, [] for a linked one (R14)
 * @param {(effects: import('@codemirror/state').StateEffect<unknown>) => void} options.apply sends a profile
 *   reconfiguration to the state that owns this compartment, shown or parked
 */
export function sourceExtensions({ name, path, save, onUpdate, chips, apply }) {
  const nameConfig = new Compartment()
  const profilesConfig = new Compartment()
  const wantProfiles = profileLoader((extension) => apply(profilesConfig.reconfigure(extension)))
  const extensions = [
    ...editorChrome({ save, onUpdate }),
    // The PlantUML language, and what the loaded profiles add to it.
    profilesConfig.of(profileExtension([])),
    plantumlCompletion,
    // After the completion, whose Escape closes its list first; it draws a carded word's lint messages.
    plantumlDocs,
    plantumlLint,
    plantumlFolding,
    nameConfig.of([fileName.of(name), filePath.of(path)]),
    chips,
  ]
  return { extensions, nameConfig, profilesConfig, wantProfiles }
}

/** R17: a file the user may only read. A change from the file itself (fromFile) still lands. */
export const readOnlyFile = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorState.transactionFilter.of((tr) => (tr.docChanged && !tr.annotation(fromFile) ? [] : tr)),
]
