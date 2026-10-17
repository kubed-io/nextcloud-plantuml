/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Whether a line starts at a diagram's top level (the hover's one use of the
 * grammar's state), read by running the PlantUML stream parser over the lines
 * before it.
 */
import { StringStream, getIndentUnit, language } from '@codemirror/language'

/** Each language `plantumlLanguage` made → its stream parser, for `atTopLevel`. */
const parsers = new WeakMap()

/** Called by `plantumlLanguage` for each language it defines. */
export function registerParser(lang, parser) {
  parsers.set(lang, parser)
}

/**
 * One token, as CodeMirror reads it: a rule that only switched state is tried again in place.
 * Copied from `@codemirror/language`'s internal `readToken` (6.13.1), which it does not export.
 */
function readToken(parser, stream, state) {
  stream.start = stream.pos
  for (let i = 0; i < 10; i++) {
    parser.token(stream, state)
    if (stream.pos > stream.start) return
  }
  throw new Error('Stream parser failed to advance stream.')
}

/**
 * Whether the line at `pos` starts at a diagram's top level, outside any body the grammar
 * reads: a note, legend or title's text, a class's `{ … }`, an activity box's `:` … `;`, a
 * `/' … '/` comment, a nested block. The grammar's own state at the line's start says so,
 * read from `fromLine` (the block's `@start` line, where PlantUML begins afresh).
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {number} [fromLine] 1-based
 */
export function atTopLevel(state, pos, fromLine = 1) {
  const parser = parsers.get(state.facet(language))
  if (!parser) {
    return false
  }
  const unit = getIndentUnit(state)
  const read = parser.startState(unit)
  for (let number = fromLine; number < state.doc.lineAt(pos).number; number++) {
    const text = state.doc.line(number).text
    if (!text) {
      parser.blankLine(read, unit)
      continue
    }
    const stream = new StringStream(text, state.tabSize, unit)
    while (!stream.eol()) readToken(parser, stream, read)
  }
  // A line starts in the state its last line hands on, once that line's own states are done.
  parser.startLine(read)
  return read.state === 'start' && !read.stack?.length && !read.pending && !read.inner && !read.style && !read.sub && !read.math && !read.latex
}
