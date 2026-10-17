/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Sub-diagrams (X17): in a uml note, legend, `[ … ]` description or class body, a line `{{` or
 * `{{<type>` opens a diagram drawn in place, down to a line `}}`; a `{{` line inside counts one
 * deeper. The shapes of those lines, read by the grammar, `needed()`, folding and completion.
 */

import { directiveLine } from './lexicon/rules.js'

/** A sub-diagram's first line: its indentation, `{{` and its type, empty for uml. */
export const SUB_OPEN = /^([ \t]*)(\{\{)(\w*)[ \t]*$/

/** A sub-diagram's last line. */
export const SUB_CLOSE = /^([ \t]*)(\}\})[ \t]*$/

/** The types the live server drew inside a note (2026-10-15), besides uml. */
export const SUB_TYPES = ['salt', 'json', 'yaml', 'wbs', 'mindmap', 'gantt', 'regex', 'ebnf', 'chronology']

const START = /^[ \t]*@start(\w+)/
/** A line that starts or ends a diagram. */
export const EDGE = /^[ \t]*@(?:start|end)\w+/

/**
 * Whether a `/' … '/` comment is open after `line`, given whether it was before: a line holding
 * `'/` closes one, and a `/'` with no `'/` after it opens one, but not on a `'` line.
 */
const commentAfter = (line, before) => {
  const opens = line.lastIndexOf("/'")
  const closes = line.lastIndexOf("'/")
  if (before && closes === -1) {
    return true
  }
  return opens > closes && (before || !/^[ \t]*'/.test(line))
}

/**
 * The sub-diagrams of `text` in its uml blocks (lines before any `@start` count as uml), by their
 * 1-based `{{` and `}}` lines; `type` is `uml` for a bare `{{`. One left open at its diagram's
 * edge, or at the end, has `end` null. A line in a `/' … '/` comment is skipped, as the server
 * drops it before reading the rest.
 *
 * @param {string} text
 * @return {{ start: number, end: number|null, type: string }[]}
 */
export function subDiagramsOf(text) {
  const found = []
  const open = []
  let uml = true
  let comment = false
  text.split('\n').forEach((line, i) => {
    if (EDGE.test(line)) {
      open.length = 0
      comment = false
      uml = START.exec(line)?.[1] === 'uml'
      return
    }
    const commented = comment
    comment = commentAfter(line, comment)
    if (!uml || commented) {
      return
    }
    const opened = SUB_OPEN.exec(line)
    if (opened) {
      const sub = { start: i + 1, end: null, type: opened[3] || 'uml' }
      found.push(sub)
      open.push(sub)
    } else if (open.length && SUB_CLOSE.test(line)) {
      open.pop().end = i + 1
    }
  })
  return found
}

// The bodies a sub-diagram opens in, each with the end line that ends one left open there: a
// note's or legend's; a class's or description's closer is in `subClosers`.
export const subBodies = { noteBody: /^[ \t]*end\s*[hr]?note\b/, legendBody: /^[ \t]*end\s*legend\b/, descBody: null, classBody: null }
// A class's or description's own closer, which ends one left open when indented less than its `{{`
// and the sub-diagram's lines have closed every bracket of that kind they opened (`nest`).
const subClosers = { classBody: /^([ \t]*)\}[ \t]*$/, descBody: /^([ \t]*)\]/ }
// The brackets a sub-diagram's lines are counted by, in the body it opened in.
const subBrackets = { classBody: ['{', '}'], descBody: ['[', ']'] }

/** The `open` brackets of `line` less its `close` ones, outside `"…"` strings (`\\"` stays in one). */
function netBrackets(line, [open, close]) {
  let net = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted && char === '\\') i++
    else if (char === '"') quoted = !quoted
    else if (!quoted && char === open) net++
    else if (!quoted && char === close) net--
  }
  return net
}

// A uml sub-diagram's own note or legend, whose end line is its own.
const ownBodies = {
  noteBody: new Set(['noteHead', 'noteBody', 'noteBodyCode']),
  legendBody: new Set(['legendHead', 'legendBody', 'legendBodyCode']),
}

/**
 * The sub-diagram reader of one language, which hands it what it closes over: `base` (the uml
 * table), `subMode` and `umlSub` (the modes a type is read by), `emit`, the three region readers
 * of the mode (`styleBody`, `styleStart`, `innerToken`) and `bangStates`.
 */
export function subReader({ base, subMode, umlSub, emit, styleBody, styleStart, innerToken, bangStates }) {
  /**
   * A line of a sub-diagram, its `{{` and `}}` lines counting the depth and its other lines the
   * body's brackets (`nest`, see `subEnds`); a `'`, `/'` or `!` line, or one in a `/' … '/` comment,
   * counts neither, as the server drops it first. A comment or `!` line is PlantUML's (`plant`, a
   * state of its own so the body underneath stays as it was), and so is a `<style>` block in a
   * type's own grammar, read as in a block of that type. The mode gets each line with its
   * indentation cut, as the server hands it over.
   */
  function subToken(stream, state) {
    const sub = state.sub
    // `begun`: a reader that has not advanced yet leaves the line at its start, begun once.
    if (stream.sol() && !sub.begun) {
      sub.begun = true
      sub.from = null
      base.startLine(sub.plant)
      const commented = sub.plant.state === 'blockComment'
      const opened = !commented && stream.match(SUB_OPEN, false)
      const close = !commented && stream.match(SUB_CLOSE, false)
      if (opened) sub.depth++
      if (close && !--sub.depth) {
        state.sub = null
        return emit(stream, state, [[close[1], null], [close[2], 'brace'], [stream.string.slice(close[1].length + 2), null]])
      }
      // A comment or `!` line is the preprocessor's, gone before the sub-diagram is read.
      const own = /^[ \t]*(?:'|\/')/.test(stream.string) || directiveLine.test(stream.string)
      if (!commented && !own && !opened && !close && subBrackets[state.state]) sub.nest += netBrackets(stream.string, subBrackets[state.state])
    }
    const mode = subMode(sub.type)
    const own = mode !== umlSub && !mode.inactive
    // A comment or `!` line's groups left pending (its indentation first) are the plant's too.
    const plant = own && (sub.plant.pending || sub.plant.state === 'blockComment' || (!stream.sol() && bangStates.has(sub.plant.state))
      || (stream.sol() && (stream.match(/^[ \t]*(?:'|\/')/, false) || stream.match(directiveLine, false))))
    const read = () => {
      if (plant) return base.token(stream, sub.plant)
      if (own && sub.plant.style) return styleBody(stream, sub.plant)
      const tags = own && stream.sol() ? styleStart(stream, sub.plant) : undefined
      if (tags !== undefined) return tags
      // The indentation is the body's; the mode reads from after it.
      if (!mode.inactive && stream.sol() && stream.match(/^[ \t]+(?=\S)/)) {
        sub.from = stream.pos
        return null
      }
      return innerToken(stream, sub, mode)
    }
    // A reader may hand back an empty first group at the line's start; read on here, or this
    // line would be begun again (its depth counted twice, its end looked for in a moved state).
    for (let tries = 0; tries < 10; tries++) {
      const token = read()
      if (stream.pos > stream.start) {
        sub.begun = false
        return token
      }
    }
    return null
  }

  /**
   * Whether the line ends a sub-diagram left open: the diagram's edge; its note's or legend's end
   * line, unless a uml sub-diagram is in a note or legend of its own; or its class's `}` or its
   * description's `]`, when indented less than the `{{` line and the sub-diagram's own lines have
   * closed every `{` or `[` they opened (a json or salt sub-diagram's `}` at column 0 is its own).
   * The server never ends one there (a syntax error); this is recovery, so it must not misread
   * valid input.
   */
  function subEnds(stream, state) {
    if (stream.match(EDGE, false)) return true
    const closer = subClosers[state.state]?.exec(stream.string)
    if (closer && state.sub.nest <= 0 && closer[1].length < state.sub.indent) return true
    if (!subBodies[state.state]?.test(stream.string)) return false
    const own = state.sub.type === 'uml' && state.sub.state
    return !own || ![own.state, ...(own.stack ?? [])].some((key) => ownBodies[state.state]?.has(key))
  }

  /** A body's `{{` line: the sub-diagram starts on the next line, the body kept underneath. */
  function subStart(stream, state, open) {
    const type = open[3] || 'uml'
    const mode = subMode(type)
    state.sub = { type, depth: 1, nest: 0, indent: open[1].length, from: null, begun: false, state: mode.startState ? mode.startState(stream.indentUnit) : {}, plant: base.startState() }
    return emit(stream, state, [[open[1], null], [open[2], 'brace'], [open[3], 'keyword'], [stream.string.slice(open[1].length + 2 + open[3].length), null]])
  }

  return { subToken, subEnds, subStart }
}
