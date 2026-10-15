/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startgit` blocks, a `git log --graph` PlantUML draws. On a line holding
 * `*`, the graph characters are operators, the first word after them, the
 * commit's name, a number, a `(refs)` group right after it a type name, and
 * the rest of the line, which PlantUML does not draw, a comment. A line of
 * graph characters alone is operators; any other line is plain.
 */
const GRAPH = /[*|\\/_.-]+/

const mode = {
  startState: () => ({ phase: 'plain' }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol()) {
      state.phase = stream.string.includes('*') || /^[ *|\\/_.-]*$/.test(stream.string) ? 'graph' : 'plain'
    }
    if (state.phase === 'plain') {
      stream.skipToEnd()
      return null
    }
    if (state.phase === 'graph') {
      if (stream.match(GRAPH)) {
        return 'operator'
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
      if (stream.match(/\([^)]*\)/)) {
        return 'typeName'
      }
    }
    stream.skipToEnd()
    return 'comment'
  },
}

export default () => ({ type: 'git', mode, completions: [], lints: [], values: [] })
