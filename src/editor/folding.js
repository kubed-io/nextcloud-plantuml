/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Each `@start` line folds its block, down to the line before `@end` so the
 * `@end` stays visible, each `<style>` line its style block, down to the line
 * before `</style>`, and each sub-diagram's `{{` line down to the line before
 * its `}}`. The stream mode has no syntax tree, so the ranges come from
 * blocks.js, sub-diagrams.js and a scan for the style lines; a sub-diagram's
 * folds only where the grammar read both its lines as one's (a `{{` or `}}`
 * `brace`), which a rescan cannot tell without the bodies. The keys are
 * CodeMirror's own `foldKeymap`, less fold-all and unfold-all: their Ctrl-Alt-[
 * and ] are AltGr+8 and 9, which type [ and ] on German and Nordic layouts.
 */
import { ensureSyntaxTree, foldAll, foldGutter, foldKeymap, foldService, unfoldAll } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { blocksOf, scan } from './blocks.js'
import { subDiagramsOf } from './sub-diagrams.js'

const STYLE_OPEN = /^\s*<style>\s*$/
const STYLE_CLOSE = /^\s*<\/style>\s*$/

/** Style blocks as { start, end } line numbers; one left open ends nowhere, as PlantUML reads it to `@end`. */
function stylesOf(doc) {
  const styles = []
  let open = null
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (open === null && STYLE_OPEN.test(text)) {
      open = n
    } else if (open !== null && (STYLE_CLOSE.test(text) || /^\s*@end/.test(text))) {
      styles.push({ start: open, end: STYLE_CLOSE.test(text) ? n : null })
      open = null
    }
  }
  return styles
}

// The gutter asks for every visible line; the ranges are read once per document.
const cache = new WeakMap()

function rangesIn(doc) {
  if (!cache.has(doc)) {
    const text = doc.toString()
    cache.set(doc, [...blocksOf(scan(text)), ...stylesOf(doc), ...subDiagramsOf(text).map((sub) => ({ ...sub, sub: true }))])
  }
  return cache.get(doc)
}

/** Whether the grammar read line `n` as a sub-diagram's edge: its `{{` or `}}` a `brace` of its own. */
function edgeRead(state, tree, n) {
  const line = state.doc.line(n)
  const at = line.from + line.text.length - line.text.trimStart().length
  const node = tree.resolveInner(at, 1)
  return node.name === 'brace' && node.from === at && node.to === at + 2
}

/** @param {import('@codemirror/state').EditorState} state */
function foldRange(state, lineStart) {
  const line = state.doc.lineAt(lineStart)
  const range = rangesIn(state.doc).find((candidate) => candidate.start === line.number)
  if (!range || range.end === null || range.end - 1 <= range.start) {
    return null
  }
  if (range.sub) {
    const tree = ensureSyntaxTree(state, state.doc.line(range.end).to, 50)
    if (!tree || !edgeRead(state, tree, range.start) || !edgeRead(state, tree, range.end)) {
      return null
    }
  }
  return { from: line.to, to: state.doc.line(range.end - 1).to }
}

export const plantumlFolding = [
  foldService.of(foldRange),
  foldGutter(),
  keymap.of(foldKeymap.filter((binding) => binding.run !== foldAll && binding.run !== unfoldAll)),
]
