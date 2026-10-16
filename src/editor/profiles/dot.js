/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startdot` blocks (T21), a table of the lexicon's (`core.lex`). PlantUML hands the body to
 * Graphviz as written (`directdot/` of 1.2026.8), so this is the DOT language and no common
 * line applies (G4). `strict`, `graph`, `digraph`, `subgraph`, `node` and `edge` are keywords in
 * any case, a graph's or subgraph's id a classifier. In `[ … ]` a key is an attribute; on a
 * statement of its own (`rankdir=LR`) a property. The value of a key ending `color` is a
 * `ColorLiteral` when it is a name, quoted or not (the swatch looks a name up itself), or a hex
 * quoted. A `#` outside a string, an HTML label or a block comment is a comment to the line's end,
 * as Graphviz's scanner reads it: an unquoted `#hex` is one (and a server error), never a swatch.
 * A block comment and an HTML label run across lines, an attribute list too; the editor's `@end`
 * ends them all. An unfinished string ends with its line.
 */
export default (core) => {
  const { patterns, table } = core.lex
  const { hexDigits, colourName } = patterns
  const quoted = `#${hexDigits}|${colourName}`
  // Strings, HTML labels and block comments are taken where they start, so a `#` in one is theirs.
  const hash = { regex: /#.*/, token: 'comment' }

  // A key ending `color` and its colour value, then any other key, as `token` names a key here.
  const key = (token) => [
    { regex: new RegExp(`(\\w*color)(\\s*)(=)(\\s*)(${colourName})(?=[\\s,;\\]}]|$)`, 'i'), token: [token, null, 'definitionOperator', null, 'ColorLiteral'] },
    { regex: new RegExp(`(\\w*color)(\\s*)(=)(\\s*)(")(${quoted})(")`, 'i'), token: [token, null, 'definitionOperator', null, 'string', 'ColorLiteral', 'string'] },
    { regex: /\w+(?=\s*=(?!=))/, token },
  ]
  // What both the statements and the attribute lists read.
  const shared = [
    { regex: /\/\/.*/, token: 'comment' },
    { regex: /\/\*.*?\*\//, token: 'comment' },
    { regex: /\/\*.*/, token: 'comment', push: 'blockComment' },
    { regex: /"[^"\\]*"/, token: 'string' },
    { regex: /"/, token: 'string', push: 'string' },
    { regex: /</, token: 'angleBracket', push: 'html' },
    { regex: /->|--/, token: 'LinkOperator' },
    { regex: /=/, token: 'definitionOperator' },
    { regex: /[,;]/, token: 'separator' },
    { regex: /:/, token: 'separator' },
    { regex: /-?(?:\.\d+|\d+(?:\.\d*)?)(?![\w.])/, token: 'number' },
    { regex: /\w+/, token: null },
    { regex: /./, token: null },
  ]
  const mode = table({
    start: [
      hash,
      { regex: /(graph|digraph|subgraph)(\s+)(\w+|"[^"\\]*")/i, token: ['keyword', null, 'typeName'] },
      { regex: /(?:strict|graph|digraph|subgraph|node|edge)\b/i, token: 'keyword' },
      ...key('propertyName'),
      { regex: /\[/, token: 'squareBracket', push: 'attrs' },
      { regex: /[{}]/, token: 'brace' },
      ...shared,
    ],
    attrs: [
      hash,
      { regex: /\]/, token: 'squareBracket', pop: true },
      ...key('attributeName'),
      ...shared,
    ],
    blockComment: [
      { regex: /.*?\*\//, token: 'comment', pop: true },
      { regex: /.+/, token: 'comment' },
    ],
    string: [
      { regex: /\\./, token: 'escape' },
      { regex: /[^"\\]+/, token: 'string' },
      { regex: /"/, token: 'string', pop: true },
    ],
    // An HTML string: its tags H10's, its entities escapes, the closing `>` its bracket.
    html: [
      { regex: /<\/?[A-Za-z][^<>]*>|<!--.*?-->/, token: 'tagName' },
      { regex: /&(?:#\d+|#x[\dA-Fa-f]+|\w+);/, token: 'escape' },
      { regex: />/, token: 'angleBracket', pop: true },
      { regex: /[^<>&]+|./, token: null },
    ],
  }, { lineStates: ['string'] })
  return { type: 'dot', mode, completions: [], lints: [], values: [] }
}
