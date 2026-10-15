/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * LaTeX, in `@startlatex` blocks and, through the PlantUML mode, the middle of an inline
 * `<latex>…</latex>` and the lines of a `<latex>` block (T15). There is no list of names: any
 * `\name` is a command, as JLaTeXMath, which draws an unknown one as text, reads it, and the
 * name in `\begin{…}` and `\end{…}` is an environment. `{ }` and `[ ]` are brackets, `^`,
 * `_`, `&` and `\\` operators, `%` starts a comment to the line's end and `$` and `( )` are grey.
 * A block's line starting `color`, `backgroundcolor`, `scale` or `dpi` and a space is a setting,
 * a keyword and its value, as in the math profile.
 */
const SETTING = /^[ \t]*(?:(?:background)?color|scale|dpi)[ \t]/i

// What `\begin` or `\end` expects next: its brace, the name, the closing brace.
const ENVIRONMENT = ['{', 'name', '}']

const mode = {
  // environment: where in a `\begin{…}` the line is; value: what of a setting line comes next
  // ('keyword', 'colour', 'number', null for the rest).
  startState: () => ({ environment: null, value: null }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol()) {
      state.value = SETTING.test(stream.string) ? 'keyword' : null
    }
    if (stream.eatSpace()) {
      return null
    }
    if (state.value !== null) {
      return setting(stream, state)
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
    if ('{}[]()$'.includes(ch)) {
      return 'punctuation'
    }
    return '^_&=+-*/<>|'.includes(ch) ? 'operator' : null
  },
}

/** A setting's keyword, then a colour or a number, the rest plain; the line's end ends it. */
function setting(stream, state) {
  if (state.value === 'keyword') {
    stream.match(/\w+/)
    state.value = /color$/i.test(stream.current()) ? 'colour' : 'number'
    return 'keyword'
  }
  if (state.value === 'colour' && stream.match(/#?\w+/)) {
    state.value = 'rest'
    return 'ColorLiteral'
  }
  if (state.value === 'number' && stream.match(/\d+(?:\.\d+)?(?!\w)/)) {
    state.value = 'rest'
    return 'number'
  }
  stream.match(/\S+/)
  state.value = 'rest'
  return null
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
