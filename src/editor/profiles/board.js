/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startboard` blocks (a story map). A line is an activity, a column: its
 * text a heading. After `+` at column 0 it is a card, `++` one level in, and
 * so on: the run of `+` a list marker, the card's text left plain (Creole is
 * the editor's, which a profile does not import). An indented `+` is part of
 * an activity's name, as PlantUML reads it, and so is a `+` with nothing
 * after it. `'` comments are the editor's; `title`, `skinparam`, `hide` and the other
 * commands the board shares with every diagram are keywords, in any case.
 */
// The run of plus is taken whole (the lookahead's group), so `++ ` alone is no card.
const CARD = /(?=(\++))\1(?![ \t]*$)/
const COMMAND = /[ \t]*(?:title|header|footer|caption|legend|skinparam|scale|hide|show)\b/i
const END_LEGEND = /[ \t]*end[ \t]*legend\b/i

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
      return 'list'
    }
    if (stream.match(COMMAND)) {
      state.legend = stream.current().trim().toLowerCase() === 'legend'
      return 'keyword'
    }
    stream.skipToEnd()
    return 'heading'
  },
}

export default () => ({ type: 'board', mode, completions: [], lints: [], values: [] })
