/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startbpm` blocks (T20), a table of the lexicon's (`core.lex`), as `bpm/Command*.java` of
 * 1.2026.8 reads them. An event is `:text;` on one line, a box (H18) whose text is Creole. A merge is
 * `id<+>` or `id:<+>`, the id a classifier, `:` a separator, `<+>` a connector; the id and `<+>` are
 * glued. `resume id` and `goto id` are keywords with a plain reference; `new branch`, `else` and
 * `end branch` are keywords. The common lines are syntax errors here (G4), so `title` stays plain.
 */
export default (core) => {
  const { box, creoleStates, table } = core.lex
  const closer = /;(?=\s*$)/
  const boxes = box(closer)
  const id = '[\\p{L}\\p{N}_.@]+'
  const mode = table({
    start: [
      // An event is one line: a `:` with no closer to its end is no event.
      { regex: new RegExp(`([ \\t]*)(:)(?=.*${closer.source})`, 'u'), sol: true, token: [null, 'bracket'], next: 'boxLast' },
      { regex: new RegExp(`([ \\t]*)(${id})(?:(:)|(?=<\\+>))(<\\+>)(?=[ \\t]*$)`, 'u'), sol: true, token: [null, 'typeName', 'separator', 'LinkOperator'] },
      { regex: new RegExp(`([ \\t]*)(resume|goto)([ \\t]+)(?=${id}[ \\t]*$)`, 'u'), sol: true, token: [null, 'keyword', null] },
      { regex: /([ \t]*)(new[ \t]+branch|else|end[ \t]+branch)(?=[ \t]*$)/, sol: true, token: [null, 'keyword'] },
    ],
    boxLast: boxes.boxLast,
    ...creoleStates.states,
    // Comments are the editor's, but a box's rules name the state that a comment pushes.
    blockComment: [],
  }, { nextLine: { boxLast: 'start' }, lineStates: creoleStates.lineStates })
  return { type: 'bpm', mode, completions: [], lints: [], values: [] }
}
