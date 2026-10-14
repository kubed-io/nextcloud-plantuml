/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A diagram opened without a name (`@startuml` and nothing after it) is a
 * warning, with an action that names it after the file.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { STARTS } from '../completion/directives.js'
import { fileName } from './state.js'

const UNNAMED = new RegExp(`^\\s*(${STARTS.join('|')})\\s*$`)

/**
 * The file's base name without its extension, as a diagram name: PlantUML's
 * command line names its output file after it, so letters, digits, `_`, `-`
 * and `.` only, anything else (spaces included) one `_`.
 */
export function diagramName(file) {
  const name = file.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^_+|_+$/g, '')
  return name || 'diagram'
}

/** @param {import('@codemirror/state').EditorState} state */
export function unnamedStart(state) {
  const name = diagramName(state.facet(fileName))
  const found = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const directive = UNNAMED.exec(line.text)?.[1]
    if (!directive) {
      continue
    }
    const from = line.from + line.text.indexOf(directive)
    found.push({
      from,
      to: from + directive.length,
      severity: 'warning',
      // `<name>` is text, not markup: CodeMirror shows the message as text.
      message: t(APP_ID, 'Name the diagram: {directive} <name>', { directive }, undefined, { escape: false, sanitize: false }),
      actions: [{
        name: t(APP_ID, 'Add name'),
        apply(view, _from, to) {
          view.dispatch({ changes: { from: to, to: view.state.doc.lineAt(to).to, insert: ` ${name}` } })
        },
      }],
    })
  }
  return found
}
