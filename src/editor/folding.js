/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Each `@start` line folds its block, down to the line before `@end` so the
 * `@end` stays visible. The stream mode has no syntax tree, so the ranges
 * come from blocks.js. The keys are CodeMirror's own `foldKeymap`, less
 * fold-all and unfold-all: their Ctrl-Alt-[ and ] are AltGr+8 and 9, which
 * type [ and ] on German and Nordic layouts.
 */
import { foldAll, foldGutter, foldKeymap, foldService, unfoldAll } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { blocksOf, scan } from './blocks.js'

// The gutter asks for every visible line; the blocks are read once per document.
const cache = new WeakMap()

function blocksIn(doc) {
  if (!cache.has(doc)) {
    cache.set(doc, blocksOf(scan(doc.toString())))
  }
  return cache.get(doc)
}

/** @param {import('@codemirror/state').EditorState} state */
function foldRange(state, lineStart) {
  const line = state.doc.lineAt(lineStart)
  const block = blocksIn(state.doc).find((candidate) => candidate.start === line.number)
  if (!block || block.end === null || block.end - 1 <= block.start) {
    return null
  }
  return { from: line.to, to: state.doc.line(block.end - 1).to }
}

export const plantumlFolding = [
  foldService.of(foldRange),
  foldGutter(),
  keymap.of(foldKeymap.filter((binding) => binding.run !== foldAll && binding.run !== unfoldAll)),
]
