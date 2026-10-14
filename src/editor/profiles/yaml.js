/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startyaml` blocks, read by CodeMirror's legacy yaml stream mode.
 */
import { yaml } from '@codemirror/legacy-modes/mode/yaml'

export default { type: 'yaml', mode: yaml, completions: [], lints: [] }
