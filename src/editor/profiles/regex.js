/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startregex` blocks (T7), a table of the lexicon's (`core.lex`). Each line is a regex on its
 * own (PlantUML draws the last), read by `RegexExpression.parse` of 1.2026.8; the commands every
 * diagram shares win at a line's start (G4), so `title My regex` is a title. A regex line holds
 * no string, no colour and no Creole, and a `/' ... '/` inside it is no comment. `\Q ... \E` is
 * no literal on 1.2026.8: both are escapes and the text between is regex. A class ends with its
 * line, as everything here does.
 */
export default (core) => {
  const { common, table } = core.lex
  const lines = common()
  const mode = table({
    start: [
      ...lines.rules,
      { regex: /\(\?#[^)]*\)?/, token: 'comment' },
      { regex: /\(\?<(?=[A-Za-z]+>)/, token: 'paren', next: 'groupName' },
      { regex: /\(\?(?:<[=!]|[:=!])|[()]/, token: 'paren' },
      // `[[:` opens a POSIX class inside the brackets (the class state reads its name).
      { regex: /\[/, token: 'squareBracket', push: 'classFirst' },
      { regex: /\|/, token: 'logicOperator' },
      { regex: /\^|\$|\\[AZzGbB]/, token: 'keyword' },
      // The braced forms take no lazy `?`; the others do.
      { regex: /\{(?:\d+(?:,\d*)?|,\d+)\}|[*+?]\??/, token: 'Quantifier' },
      { regex: /\.|\\(?:0\d{3}|u.{4}|[px]\{[^}]*\}|.)/, token: 'escape' },
    ],
    groupName: [{ regex: /[A-Za-z]+/, token: 'typeName' }, { regex: />/, token: 'paren', next: 'start' }],
    // A leading caret negates the class; anything else is the class itself.
    classFirst: [
      { regex: /\^/, token: 'logicOperator', next: 'class' },
      { regex: /(?=)/, token: null, next: 'class' },
    ],
    class: [
      { regex: /\]/, token: 'squareBracket', pop: true },
      { regex: /\[:\w*:\]/, token: 'escape' },
      { regex: /-/, token: 'separator' },
      { regex: /\\(?:0\d{3}|u.{4}|[px]\{[^}]*\}|.)/, token: 'escape' },
    ],
    ...lines.states,
  }, { lineStates: ['classFirst', 'class', 'groupName'] })
  return { type: 'regex', mode, completions: [], lints: [], values: [] }
}
