/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startwire` blocks (T17), a table of the lexicon's (`core.lex`), as `wire/Command*.java` of
 * 1.2026.8 reads them. A component is `* name [WxH] #colour`, nested by one tab or four spaces. A
 * `spot` and a link start at column 0 (an indented one is a server error, so it is read plain); a
 * link joins two names, a dotted path allowed, with a style of one or two `-` or `=` and an
 * optional `<` and `>`, then a colour and `: label`. `goto(`, `move(` and `print(` are functions. A
 * line of `-` alone is a column break, never a link. A uml keyword used as a name stays plain. The
 * common lines are the lexicon's (G4).
 */
export default (core) => {
  const { atLineStart, atNextLine, colours, comma, common, creole, table, tagStates } = core.lex
  const lines = common()
  const coordinate = { regex: /-?\d+(?:%(?:[+-]\d+)?)?(?![\w.])/, token: 'number' }
  // A spot's or a link's `(x, y)`.
  const coordinates = [
    { regex: /[()]/, token: 'paren' },
    comma,
    coordinate,
  ]
  const name = /\w[.\w]*/
  const style = /<?[-=]{1,2}>?/
  const mode = table({
    start: [
      // A column break: hyphens alone on the line, any length.
      atLineStart(/-+(?=[ \t]*$)/, 'heading'),
      // A link, from column 0: the first name (plain, so a uml keyword is only a name) and its style.
      // The server tries the common commands first, so the ones that take text are not links.
      { regex: new RegExp(`(?!(?:title|header|footer|caption|mainframe)(?=\\s)|legend\\b)(${name.source})(?=(?:\\([^()]*\\))?[ \\t]*${style.source}[ \\t]*${name.source})`, 'i'), sol: true, token: null, next: 'linkFrom' },
      { regex: new RegExp(`(spot)([ \\t]+)(${name.source})`), sol: true, token: ['keyword', null, 'typeName'], next: 'spot' },
      atLineStart(/\*(?=[ \t]*\w)/, 'list', { next: 'componentName' }),
      { regex: /([ \t]*)(goto|move|print)(\()/, sol: true, token: [null, 'FunctionName', 'paren'], push: 'args' },
      ...lines.rules,
    ],
    componentName: [
      { regex: /[ \t]+/, token: null },
      { regex: /\w+/, token: 'typeName', next: 'component' },
    ],
    component: [
      atNextLine({ next: 'start' }),
      { regex: /(\[)((?:\d+|\*)[x*](?:\d+|\*))(\])/, token: ['squareBracket', 'number', 'squareBracket'] },
      ...colours,
      { regex: /[^#[]+|./, token: null },
    ],
    spot: [
      atNextLine({ next: 'start' }),
      ...coordinates,
      ...colours,
      { regex: /[^#(),\d-]+|./, token: null },
    ],
    linkFrom: [
      atNextLine({ next: 'start' }),
      { regex: /\(/, token: 'paren', push: 'coordsIn' },
      { regex: style, token: 'LinkOperator', next: 'linkTo' },
      { regex: /\s+/, token: null },
    ],
    // A link's `(x, y)`: the signs belong to the numbers here, not to a style.
    coordsIn: [
      { regex: /\)/, token: 'paren', pop: true },
      comma,
      coordinate,
      { regex: /[^)\d,-]+|./, token: null },
    ],
    linkTo: [
      atNextLine({ next: 'start' }),
      { regex: /\s*:\s*/, token: null, next: 'label' },
      ...colours,
      { regex: /[^:#]+|./, token: null },
    ],
    label: [atNextLine({ next: 'start' }), ...creole('labelName')],
    // `goto(`, `move(` and `print(`: wire has no arithmetic, so a sign is part of a number.
    args: [
      { regex: /\)/, token: 'paren', pop: true },
      comma,
      { regex: /"[^"]*"/, token: 'string' },
      coordinate,
      { regex: /[^)\d",-]+|./, token: null },
    ],
    ...tagStates,
    math: [],
    latex: [],
    ...lines.states,
  }, { lineStates: ['args', 'coordsIn', 'tagAttrs', 'tagBraces', 'math', 'latex'] })
  return { type: 'wire', mode, completions: [], lints: [], values: [] }
}
