/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML 1.2026.8 draws `<back:#Red>`, `<u:#Red>`, `<s:#Red>` and `<w:#Red>`
 * as text, tag and all: a name there is written without the `#` (W6). A `#`
 * before a hex stays. A `'` comment line is not checked.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'

const TAG = /<(?:back|u|s|w):(#)(\w+)/g
const HEX = /^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** @param {import('@codemirror/state').EditorState} state */
export function creoleColour(state) {
  const found = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (/^\s*'/.test(line.text) || !line.text.includes('<')) {
      continue
    }
    for (const match of line.text.matchAll(TAG)) {
      if (HEX.test(match[2])) {
        continue
      }
      const from = line.from + match.index + match[0].indexOf('#')
      found.push({
        from,
        to: from + 1 + match[2].length,
        severity: 'error',
        message: t(APP_ID, 'PlantUML draws this tag as text: write the colour name without #'),
        actions: [{
          name: t(APP_ID, 'Remove #'),
          apply(view, from) {
            view.dispatch({ changes: { from, to: from + 1 } })
          },
        }],
      })
    }
  }
  return found
}
