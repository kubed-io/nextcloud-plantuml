/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML's style sheets: a stream mode for what sits between `<style>` and
 * `</style>`, and the mode run over a block's body (the core's `styleBlocks`
 * says where those are), so completion and lint read a block exactly as it is
 * highlighted. A profile's module, so it lands in the style chunk and never in
 * the editor's.
 */
const HEX = /^#(?:[\dA-Fa-f]{8}|[\dA-Fa-f]{6}|[\dA-Fa-f]{3,4})(?!\w)/

/**
 * A value: a hex colour, a number, a string, or a word (`bold`, `true`, …). A
 * word of a property whose name ends in `Color` is a named colour, which the
 * swatches look up by name: an unknown one simply gets none.
 */
function value(stream, property) {
  if (stream.match(HEX)) return 'ColorLiteral'
  if (stream.match(/^-?\d+(?:\.\d+)?(?![\w.])/)) return 'StyleNumber'
  if (stream.match(/^"[^"]*"?/)) return 'string'
  // As the PlantUML mode: a name is never all hex digits (`#ABCDE` is a broken hex).
  if (/color$/i.test(property ?? '') && stream.match(/^#?(?![\dA-Fa-f]+(?!\w))[A-Za-z]\w*(?![\w-])/)) return 'ColorLiteral'
  if (stream.match(/^#?[\w-]+/)) return 'atom'
  stream.next()
  return null
}

/**
 * Selectors, `{ }`, and inside them declarations, `Property value`, ended by
 * `;` or the line's end, except inside a `LineStyle` dash pattern, `8.0;3.0` or
 * `8-3`, whose separator is a `separator` between two numbers. A word inside braces with a `{` after it on its
 * declaration is a nested selector; any other is a property. `property` is
 * the last property read, for its values. `/' … '/` is a comment, over as many
 * lines as it takes.
 */
export const styleMode = {
  name: 'plantuml-style',
  startState: () => ({ depth: 0, at: 'name', property: null, dash: false, comment: false }),
  blankLine(state) {
    state.at = 'name'
  },
  token(stream, state) {
    if (state.comment || stream.match(/^\/'/)) {
      state.comment = !stream.match(/^.*?'\//)
      if (state.comment) stream.skipToEnd()
      return 'comment'
    }
    if (stream.sol() && state.at === 'value') state.at = 'name'
    const dash = state.dash && !stream.sol()
    state.dash = false
    if (dash && /^[;-]\d/.test(stream.string.slice(stream.pos))) {
      stream.next()
      return 'separator'
    }
    if (stream.eatSpace()) return null
    if (stream.peek() === "'" && !stream.string.slice(0, stream.pos).trim()) {
      stream.skipToEnd()
      return 'comment'
    }
    const ch = stream.peek()
    if (ch === '{' || ch === '}') {
      stream.next()
      state.depth = Math.max(0, state.depth + (ch === '{' ? 1 : -1))
      state.at = 'name'
      return 'brace'
    }
    if (ch === ';') {
      stream.next()
      state.at = 'name'
      return 'separator'
    }
    if (state.at === 'value') {
      const token = value(stream, state.property)
      state.dash = token === 'StyleNumber' && /^linestyle$/i.test(state.property)
      return token
    }
    if (stream.match(/^\.[^\s{},;.:]+/) || stream.match(/^:[\w-]+(?:\([^)]*\))?/)) return 'attributeName'
    const word = stream.match(/^[A-Za-z_][\w-]*/)
    if (word) {
      if (state.depth === 0 || /^[^;}]*\{/.test(stream.string.slice(stream.pos))) return 'typeName'
      state.at = 'value'
      state.property = word[0]
      return 'propertyName'
    }
    stream.next()
    return null
  },
}

/**
 * The StringStream methods the mode uses, for reading a block outside the
 * editor. CodeMirror's own would put @codemirror/language in a chunk the
 * editor imports statically, as a library shared with a profile becomes.
 */
class LineStream {
  constructor(string, pos) {
    this.string = string
    this.pos = pos
    this.start = pos
  }

  sol() { return this.pos === 0 }
  eol() { return this.pos >= this.string.length }
  peek() { return this.string.charAt(this.pos) || undefined }
  next() { return this.pos < this.string.length ? this.string.charAt(this.pos++) : undefined }
  skipToEnd() { this.pos = this.string.length }
  current() { return this.string.slice(this.start, this.pos) }

  eatSpace() {
    const start = this.pos
    while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) this.pos++
    return this.pos > start
  }

  match(pattern) {
    const found = this.string.slice(this.pos).match(pattern)
    if (!found || found.index > 0) return null
    this.pos += found[0].length
    return found
  }
}

/**
 * Runs the mode over `body`, handing `each` every token it names, and gives
 * back the mode's state after the last line.
 *
 * @param {import('../regions.js').StyleLine[]} body
 * @param {(token: string, line: import('../regions.js').StyleLine, from: number, to: number, text: string) => void} [each]
 */
export function readStyle(body, each = () => {}) {
  const state = styleMode.startState()
  for (const line of body) {
    if (!line.text.slice(line.from).trim()) {
      styleMode.blankLine(state)
      continue
    }
    const stream = new LineStream(line.text, line.from)
    while (!stream.eol()) {
      stream.start = stream.pos
      const token = styleMode.token(stream, state)
      if (token) each(token, line, stream.start, stream.pos, stream.current())
    }
  }
  return state
}
