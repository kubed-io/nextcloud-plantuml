// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The token reader the language suites share: what a mode names, as
// [text, token class], read the way CodeMirror reads it.
import { Text } from '@codemirror/state'

/** [text, token class] for every highlighted span of `lines`, read by `language`. */
export function tokensOf(language, lines) {
  const doc = Text.of(lines)
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out
}

/** The same for the lines of a `@start<type>` block, without its first and last span (the markers). */
export function blockTokens(language, type, lines) {
  return tokensOf(language, [`@start${type}`, ...lines, `@end${type}`]).slice(1, -1)
}
