/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * LaTeX, in `@startlatex` blocks and, through the PlantUML mode, the middle of an inline
 * `<latex>…</latex>` and the lines of a `<latex>` block (T15). There is no list of names: any
 * `\name` is a command, as JLaTeXMath, which draws an unknown one as text, reads it, and the
 * name in `\begin{…}` and `\end{…}` is an environment. `{ }` and `[ ]` are brackets, `^`,
 * `_`, `&` and `\\` operators, `%` starts a comment to the line's end and `$` is grey.
 */

// What `\begin` or `\end` expects next: its brace, the name, the closing brace.
const ENVIRONMENT = ['{', 'name', '}']

const mode = {
  startState: () => ({ environment: null }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.eatSpace()) {
      return null
    }
    if (state.environment !== null) {
      return environment(stream, state)
    }
    if (stream.eat('%')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.eat('\\')) {
      if (stream.match('\\')) {
        return 'operator'
      }
      if (stream.match(/[A-Za-z@]+/)) {
        if (/^\\(?:begin|end)$/.test(stream.current()) && stream.match(/(?=\{[^}]+\})/)) {
          state.environment = 0
        }
        return 'FunctionName'
      }
      stream.next()
      return 'FunctionName'
    }
    if (stream.match(/\d+(?:\.\d+)?/)) {
      return 'number'
    }
    if (stream.match(/[A-Za-z]+/)) {
      return null
    }
    const ch = stream.next()
    if ('{}[]$'.includes(ch)) {
      return 'punctuation'
    }
    return '^_&=+-*/<>|'.includes(ch) ? 'operator' : null
  },
}

/** The braces and the name of a `\begin{…}` or `\end{…}`, the name a type. */
function environment(stream, state) {
  const part = ENVIRONMENT[state.environment]
  state.environment = state.environment === 2 ? null : state.environment + 1
  if (part === 'name') {
    stream.match(/[^}]+/)
    return 'typeName'
  }
  stream.next()
  return 'punctuation'
}

export default () => ({ type: 'latex', mode, completions: [], lints: [], values: [] })
