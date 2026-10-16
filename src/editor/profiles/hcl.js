/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@starthcl` blocks (T23), a table of the lexicon's (`core.lex`), read as `HclParser` of
 * 1.2026.8 does: a narrow subset. Only `title` is a common line (G4). A `#` at a line's start
 * (after spaces) is a comment, in an array or a call too, and nowhere else; `//` and C-style
 * block comments are plain (the server refuses them), and so are heredocs (`<<EOF`: the subset
 * has none). Outside braces a block's header words are classifiers and its `"labels"` strings; in a
 * `{ }` (which spans lines, nested objects too) a key, bare or quoted, is a property, so a word
 * UML would call a keyword (`map`, `file`) is never one. `=` and `:` are both assignment. A value
 * is a string (a `\` escapes the next character), a number, `true`/`false`, or a bare word
 * (plain); `name(` is a function. An unfinished string ends with its line, an unclosed brace
 * with the block's `@end`. A nested labelled block (`process "main" {`) is not classified: the
 * server refuses it.
 */
export default (core) => {
  const { common, table } = core.lex
  const lines = common({ all: false, title: true })
  const word = /[^\s{}[\]()=,:"]+/
  const comment = { regex: /([ \t]*)(#.*)/, sol: true, token: [null, 'comment'] }
  // What a value is, in an object, an array or a call's arguments.
  const values = [
    { regex: /"[^"\\]*"/, token: 'string' },
    { regex: /"/, token: 'string', push: 'string' },
    { regex: /[=:]/, token: 'definitionOperator' },
    { regex: /,/, token: 'separator' },
    { regex: /\{/, token: 'brace', push: 'object' },
    { regex: /\[/, token: 'squareBracket', push: 'array' },
    { regex: /\(/, token: 'paren', push: 'args' },
    { regex: new RegExp(`${word.source}(?=\\()`), token: 'FunctionName' },
    { regex: /-?\d+(?:\.\d+)?(?![^\s{}[\]()=,:"])/, token: 'number' },
    { regex: /(?:true|false)(?![^\s{}[\]()=,:"])/, token: 'atom' },
    { regex: word, token: null },
    { regex: /./, token: null },
  ]
  const mode = table({
    start: [
      comment,
      ...lines.rules,
      { regex: /"[^"\\]*"/, token: 'string' },
      { regex: /"/, token: 'string', push: 'string' },
      { regex: /\{/, token: 'brace', push: 'object' },
      { regex: word, token: 'typeName' },
      { regex: /./, token: null },
    ],
    object: [
      comment,
      { regex: /\}/, token: 'brace', pop: true },
      { regex: /"(?:[^"\\]|\\.)*"(?=\s*[=:])/, token: 'propertyName' },
      { regex: new RegExp(`${word.source}(?=\\s*[=:])`), token: 'propertyName' },
      ...values,
    ],
    array: [comment, { regex: /\]/, token: 'squareBracket', pop: true }, ...values],
    args: [comment, { regex: /\)/, token: 'paren', pop: true }, ...values],
    string: [
      { regex: /\\./, token: 'escape' },
      { regex: /[^"\\]+/, token: 'string' },
      { regex: /"/, token: 'string', pop: true },
    ],
    ...lines.states,
  }, { lineStates: ['string'] })
  return { type: 'hcl', mode, completions: [], lints: [], values: [] }
}
