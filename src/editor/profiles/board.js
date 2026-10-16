/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startboard` blocks (a story map), a table of the lexicon's (`core.lex`). A
 * line is an activity, a column: its text a heading. After `+` at column 0 it is
 * a card, `++` one level in, and so on: the run of `+` a list marker, the card's
 * text Creole (G5). An indented `+` is part of an activity's name, as PlantUML
 * reads it, and so is a `+` with nothing after it. `'` comments are the
 * editor's; `title`, `skinparam`, `legend` and the other commands every diagram
 * shares are the lexicon's common lines (G4), in any case.
 */
export default (core) => {
  const { atNextLine, common, creole, table } = core.lex
  const lines = common()
  const mode = table({
    start: [
      // The run of plus is taken whole (the lookahead's group), so `++ ` alone is no card.
      { regex: /(?=(\++))\1(?![ \t]*$)/, sol: true, token: 'list', next: 'card' },
      ...lines.rules,
      { regex: /.+/, token: 'heading' },
    ],
    card: [atNextLine({ next: 'start' }), ...creole(null)],
    ...lines.states,
  })
  return { type: 'board', mode, completions: [], lints: [], values: [] }
}
