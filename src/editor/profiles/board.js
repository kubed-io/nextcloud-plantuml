/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startboard` blocks (a story map). A line is an activity, a column: its
 * text a heading. After `+` at column 0 it is a card, `++` one level in, and
 * so on: the run of `+` an operator, the card's text left plain (Creole is
 * the editor's, which a profile does not import). An indented `+` is part of
 * an activity's name, as PlantUML reads it, and so is a `+` with nothing
 * after it. `'` comments are the editor's; `title`, `skinparam` and the other
 * commands the board shares with every diagram are keywords.
 */
// The run of plus is taken whole (the lookahead's group), so `++ ` alone is no card.
const CARD = /(?=(\++))\1(?![ \t]*$)/
const COMMAND = /[ \t]*(?:title|header|footer|caption|legend|skinparam|scale)\b/
const END_LEGEND = /[ \t]*end[ \t]*legend\b/

const mode = {
  startState: () => ({ legend: false }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (!stream.sol()) {
      stream.skipToEnd()
      return null
    }
    if (state.legend) {
      if (stream.match(END_LEGEND)) {
        state.legend = false
        return 'keyword'
      }
      stream.skipToEnd()
      return null
    }
    if (stream.match(CARD)) {
      return 'operator'
    }
    if (stream.match(COMMAND)) {
      state.legend = stream.current().trim() === 'legend'
      return 'keyword'
    }
    stream.skipToEnd()
    return 'heading'
  },
}

export default () => ({ type: 'board', mode, completions: [], lints: [], values: [] })
