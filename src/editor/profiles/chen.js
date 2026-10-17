/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startchen` blocks (T22), a table of the lexicon's (`core.lex`), as
 * `cheneer/command/*.java` of 1.2026.8 reads them. `entity` and `relationship` open a body at
 * their `{`; a composite attribute's `{` nests another. A line in a body is an attribute: its
 * name a property (it may hold spaces), a `:` splitting it from its type, so `Name : TYPE` is a
 * property, a separator and a classifier. The body persists across lines by design, ends at its `}` and at the block's
 * `@end` (the outer grammar resets there), and an attribute named `note`, `state` or `class` is
 * only an attribute. A connector is a single `-` or `=`, an optional cardinality between, never
 * a run; `->-`, `-<-`, `=>=`, `=<=` are subclass links, `d`, `o`, `U` and `{ A, B }` their
 * list. The common lines, `left to right direction` among them, are the lexicon's (G4).
 */
export default (core) => {
  const { colours, comma, common, paren, stereotypeState, stereotypes, string, table, tagStates } = core.lex
  const lines = common()
  const code = /[\w.%]+/
  const number = { regex: /\w+/, token: 'number' }
  // An attribute: `"Display" as` then the name, then `: TYPE`, a stereotype, a colour, a `{`.
  const attribute = [
    { regex: /\}/, token: 'brace', pop: true },
    { regex: /(")([^"]*)(")(\s+)(as)(?=\s)/, token: ['string', 'string', 'string', null, 'keyword'] },
    string,
    ...stereotypes,
    ...colours,
    { regex: /\{/, token: 'brace', push: 'body' },
    { regex: /(:)([ \t]*)([^\s<#{}":][^<#{}]*?)(?=[ \t]*(?:<<|#|\{|$))/, token: ['separator', null, 'typeName'] },
    { regex: /:/, token: 'separator' },
    { regex: /[^\s:<#{}"][^:<#{}]*?(?=[ \t]*(?::|<<|#|\{|$))/, token: 'propertyName' },
  ]
  const mode = table({
    start: [
      { regex: /([ \t]*)(entity|relationship)(?![\w.%])/, sol: true, token: [null, 'keyword'], push: 'header' },
      ...lines.rules,
      // A connector: the strokes, and between them a cardinality; `--` is two strokes, never a run.
      // A subclass link may be followed by the list's symbol and its `{ A, B }`.
      { regex: /[-=][<>][-=](?=\s)/, token: 'LinkOperator', push: 'subclass' },
      { regex: /[-=](?=(?:\(\s*\w+\s*,\s*\w+\s*\)|\w+)?[-=](?:\s|$))/, token: 'LinkOperator', push: 'cardinality' },
      ...colours,
      { regex: /[^\s{},<#="-][^\s{},<#=]*/, token: null },
    ],
    // `entity "Display" as CODE <<stereotype>> #colour {`, the code a classifier.
    header: [
      { regex: /\{/, token: 'brace', next: 'body' },
      string,
      { regex: /as(?=\s)/, token: 'keyword' },
      ...stereotypes,
      ...colours,
      { regex: code, token: 'typeName' },
    ],
    body: attribute,
    cardinality: [
      { regex: /[-=]/, token: 'LinkOperator', pop: true },
      paren,
      comma,
      number,
    ],
    subclass: [
      { regex: /\s+/, token: null },
      { regex: /[dUo](?=[ \t]*\{)/, token: 'modifier' },
      { regex: /\{/, token: 'brace', next: 'subclasses' },
      { regex: /(?=\S)/, token: null, pop: true },
    ],
    subclasses: [
      { regex: /\}/, token: 'brace', pop: true },
      comma,
      { regex: /[^\s,}]+/, token: null },
    ],
    stereotype: stereotypeState,
    // A stereotype's `{` pushes `tagBraces`; chen reads no Creole of its own (the common lines'
    // is theirs), so nothing pushes an inline formula.
    ...tagStates,
    ...lines.states,
  }, { lineStates: ['header', 'cardinality', 'subclass', 'subclasses', 'stereotype', 'tagAttrs', 'tagBraces'] })
  return { type: 'chen', mode, completions: [], lints: [], values: [] }
}
