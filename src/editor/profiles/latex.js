/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * LaTeX, in `@startlatex` blocks and, through the PlantUML mode, the middle of an inline
 * `<latex>…</latex>` and the lines of a `<latex>` block (T15). There is no list of names: any
 * `\name` is a command, as JLaTeXMath, which draws an unknown one as text, reads it, and the
 * name in `\begin{…}` and `\end{…}` is an environment. `{ }` are braces, `[ ]` square brackets, `( )` parens, `^`,
 * `_`, `&` and `\\` operators, `%` starts a comment to the line's end and `$` is punctuation.
 * A block's line starting `color`, `backgroundcolor`, `scale` or `dpi` and a space is a setting,
 * a keyword and its value, read by the lexicon's `setting`, as in the math profile.
 */
const BRACKETS = { '{': 'brace', '}': 'brace', '[': 'squareBracket', ']': 'squareBracket', '(': 'paren', ')': 'paren' }

// What `\begin` or `\end` expects next: its brace, the name, the closing brace.
const ENVIRONMENT = ['{', 'name', '}']

/** The mode, its setting lines found and read by the lexicon's `settingLine` and `setting`. */
const modeWith = ({ setting, settingLine }) => ({
  // environment: where in a `\begin{…}` the line is; value: what of a setting line comes next
  // (`setting`'s 'keyword', 'colour', 'number' or 'rest'), null on any other line.
  startState: () => ({ environment: null, value: null }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol()) {
      state.value = settingLine.test(stream.string) ? 'keyword' : null
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
    if (BRACKETS[ch]) {
      return BRACKETS[ch]
    }
    if (ch === '$') {
      return 'punctuation'
    }
    // Operators by kind (Y23): arithmetic, comparison, and the rest (scripts, `&`, `|`).
    if ('+-*/'.includes(ch)) {
      return 'arithmeticOperator'
    }
    if ('=<>'.includes(ch)) {
      return 'compareOperator'
    }
    return '^_&|'.includes(ch) ? 'operator' : null
  },
})

/** The braces and the name of a `\begin{…}` or `\end{…}`, the name a type. */
function environment(stream, state) {
  const part = ENVIRONMENT[state.environment]
  state.environment = state.environment === 2 ? null : state.environment + 1
  if (part === 'name') {
    stream.match(/[^}]+/)
    return 'typeName'
  }
  stream.next()
  return 'brace'
}

export default (core) => ({ type: 'latex', mode: modeWith(core.lex), completions: [], lints: [], values: [] })
