/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startyaml` blocks, read by CodeMirror's legacy yaml stream mode, which
 * takes every `#` for a comment: `#highlight` lines are PlantUML's, so they
 * are caught first.
 */
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { yamlLint } from '../lint/yaml.js'

const HIGHLIGHT = /^\s*#highlight\b/

const mode = {
  ...yaml,
  token(stream, state) {
    if (stream.sol() && stream.match(HIGHLIGHT)) {
      stream.skipToEnd()
      return 'meta'
    }
    return yaml.token(stream, state)
  },
}

export default { type: 'yaml', mode, completions: [], lints: [yamlLint] }
