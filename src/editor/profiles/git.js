/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startgit` blocks, a `git log --graph` PlantUML draws. On a line holding
 * `*`, the graph characters are link operators, the first word after them, the
 * commit's name, a number, a `(refs)` group right after it parens round a type name, and
 * the rest of the line, which PlantUML does not draw, a comment. A line of
 * graph characters alone is link operators; any other line is plain.
 */
const GRAPH = /[*|\\/_.-]+/

const mode = {
  startState: () => ({ phase: 'plain' }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    // Inside `(refs)`: the names, then the closing paren.
    if (state.phase === 'refs-body') {
      if (stream.match(/[^)]+/)) {
        state.phase = 'refs-close'
        return 'typeName'
      }
      state.phase = 'refs-close'
    }
    if (state.phase === 'refs-close') {
      stream.next()
      state.phase = 'rest'
      return 'paren'
    }
    if (stream.sol()) {
      state.phase = stream.string.includes('*') || /^[ *|\\/_.-]*$/.test(stream.string) ? 'graph' : 'plain'
    }
    if (state.phase === 'plain') {
      stream.skipToEnd()
      return null
    }
    if (state.phase === 'graph') {
      if (stream.match(GRAPH)) {
        return 'LinkOperator'
      }
      if (stream.eatSpace()) {
        return null
      }
      state.phase = 'name'
    }
    if (state.phase === 'name') {
      stream.match(/\S+/)
      state.phase = 'refs'
      return 'number'
    }
    if (stream.eatSpace()) {
      return null
    }
    if (state.phase === 'refs') {
      state.phase = 'rest'
      if (stream.match(/\((?=[^)]*\))/)) {
        state.phase = 'refs-body'
        return 'paren'
      }
    }
    stream.skipToEnd()
    return 'comment'
  },
}

export default () => ({ type: 'git', mode, completions: [], lints: [], values: [] })
