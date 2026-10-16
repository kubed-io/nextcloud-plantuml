/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startebnf` blocks (T8), a table of the lexicon's (`core.lex`), hand-written: CodeMirror's EBNF
 * mode reads a yacc flavour, not PlantUML's ISO one (`EbnfExpression`, 1.2026.8). A rule is
 * `name = body ;` and runs on to a line ending `;`, so the body state carries across lines, as
 * `(* … *)` and `(** … **)` do; the outer grammar drops both at the block's `@end`. A name is a
 * classifier only at a line's start before `=` (or a comment); in a body it is plain. `-` with
 * space after it is the exception, `}-` closes a one-or-more, `N *` repeats; strings have no
 * escapes. G4's common lines win at a line's start.
 */
export default (core) => {
  const { common, table } = core.lex
  const lines = common()
  // A name: letters, digits and `_`, and `-` after the first character.
  const word = /[\p{L}\p{N}_][-\p{L}\p{N}_]*/u.source
  const operators = (end) => [
    { regex: /\(\*/, token: 'comment', push: 'comment' },
    { regex: /"[^"]*"|'[^']*'|\?[^?]*\?/, token: 'string' },
    { regex: /(\})(-)/, token: ['brace', 'Quantifier'] },
    { regex: /\{|\}/, token: 'brace' },
    { regex: /[()]/, token: 'paren' },
    { regex: /[[\]]/, token: 'squareBracket' },
    { regex: /=/, token: 'definitionOperator' },
    { regex: /\|/, token: 'logicOperator' },
    { regex: /-(?=[ \t]|$)/, token: 'arithmeticOperator' },
    { regex: /\d+(?=[ \t]*\*)/, token: 'number' },
    { regex: /\*/, token: 'Quantifier' },
    // A rule ends at a line ending `;`, not at one in its middle.
    { regex: /;(?=[ \t]*$)/, token: 'separator', ...end },
    { regex: /[,;]/, token: 'separator' },
    { regex: /[-\p{L}\p{N}_]+/u, token: null },
  ]
  const mode = table({
    start: [
      ...lines.rules,
      { regex: new RegExp(`([ \\t]*)(${word})(?=[ \\t]*(?:=|\\(\\*))`, 'u'), sol: true, token: [null, 'typeName'], next: 'body' },
      ...operators({}),
    ],
    body: operators({ next: 'start' }),
    comment: [
      { regex: /\*\)/, token: 'comment', pop: true },
      { regex: /[^*]+|\*/, token: 'comment' },
    ],
    ...lines.states,
  })
  return { type: 'ebnf', mode, completions: [], lints: [], values: [] }
}
