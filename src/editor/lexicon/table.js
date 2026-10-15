/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A simple-mode rule table whose states can end with their line. Simple-mode
 * carries a state on from one line to the next; PlantUML's lines mostly stand
 * alone, so a label or a styled link left open would run on into the next.
 */
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'

/**
 * `simpleMode(states)`, its token at the start of a line first popping every
 * state in `lineStates` (pushed states that end with their line) and then
 * moving a state in `nextLine` on to its successor, the state the next line
 * starts in.
 *
 * The mode's `startLine(state)` is that step alone, for a language that wraps
 * the mode and looks at a line before handing it the token; taken twice at
 * one line start it does nothing more, as long as no successor in `nextLine`
 * is itself a key there.
 *
 * @param {object} states simple-mode's states, `start` among them
 * @param {object} [options]
 * @param {Record<string, string>} [options.nextLine] a state → the state the next line starts in
 * @param {string[]} [options.lineStates] the pushed states that end with their line
 */
export function table(states, { nextLine = {}, lineStates = [] } = {}) {
  const mode = simpleMode(states)
  const startLine = (state) => {
    while (lineStates.includes(state.state) && state.stack?.length) state.state = state.stack.pop()
    if (Object.hasOwn(nextLine, state.state)) state.state = nextLine[state.state]
  }
  const { token } = mode
  return {
    ...mode,
    startLine,
    token(stream, state) {
      // A rule matched at the start of a line hands back its groups one at a
      // time (`pending`), all still at the start: they belong to the state it set.
      if (!state.pending && stream.sol()) startLine(state)
      return token(stream, state)
    },
  }
}
