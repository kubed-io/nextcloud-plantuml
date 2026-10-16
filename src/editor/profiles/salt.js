/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startsalt` blocks (T2), a table of the lexicon's (`core.lex`), read a cell at a time as
 * PlantUML 1.2026.8's `salt/` parser reads them: a line is a row, cells split at `|` and `}`,
 * and an opener (`{`, its kind a modifier) or `}` may stand anywhere on a line. Each opener pushes
 * its kind's cell-start state: a table (`{`, `{+`, `{#`, `{!`, `{-`), a group box (`{^`, a table
 * with no border cells), a tree (`{T…`), a menu (`{*`), or the rest (`{S`, `{SI`, `{S-`, `{/`);
 * `}` pops it. A widget is a whole cell (the
 * server tests the trimmed cell's start and end), so its rules sit in the cell-start state and
 * look for the cell's end; any other cell is Creole in the kind's mid-cell state, where `|` and
 * an opener go back to cell start, as does each line (`nextLine`). The top state has the common
 * lines (G4), sprites (T16), and a `salt` line plain (the server refuses it).
 *
 * A cell's Creole is read on the line cut at the cell's end, so no Creole rule runs past a `|`,
 * `{`, `}` or escape, and a tag left open ends there.
 */
export default (core) => {
  const { common, creole, creoleStates, spriteLines, spriteStates, table } = core.lex
  const lines = common()
  // The end of a cell: trailing spaces, then `|`, `}` or the line's end (or the cut, at a `{`).
  const END = '(?=[ \\t]*(?:\\||\\}|$))'
  // A character of a cell: an escape is one.
  const CELL = '(?:[^|{}\\\\]|\\\\.)'
  const whole = (source) => new RegExp(`${source}${END}`)
  const KINDS = ['table', 'group', 'tree', 'menu', 'other']
  const mid = (kind) => `${kind}Mid`
  const escape = { regex: /\\[|{}]/, token: 'escape' }

  const openers = [
    // The server splits `{` off, so the tree's `T…` may follow a space; `{ Text` is a table.
    { regex: whole('(\\{)([ \\t]*)(T[-+!#^]?)'), token: ['brace', null, 'modifier'], push: 'tree' },
    // `{S+` is `{S` and a cell `+`.
    { regex: /(\{)(S[I-]?|\/)/, token: ['brace', 'modifier'], push: 'other' },
    { regex: /(\{)(\*)/, token: ['brace', 'modifier'], push: 'menu' },
    // A group box is a table without a border layout.
    { regex: /(\{)(\^)/, token: ['brace', 'modifier'], push: 'group' },
    { regex: /(\{)([-+#!])/, token: ['brace', 'modifier'], push: 'table' },
    { regex: /\{/, token: 'brace', push: 'table' },
  ]

  // In the order the server tries them (`getNextElement`).
  const widgets = (next) => [
    // A separator starts and ends with its doubled character, `..` alone too.
    { regex: whole(`(?:(?=\\.\\.)${CELL}*\\.\\.|(?===)${CELL}*==|(?=~~)${CELL}*~~|(?=--)${CELL}*--)`), token: 'heading', next },
    { regex: whole(`"${CELL}*"`), token: 'string', next },
    { regex: /(\[)(X)(\])/, token: ['squareBracket', 'atom', 'squareBracket'], next },
    { regex: /\[ ?\]/, token: 'squareBracket', next },
    // A button's label is Creole; `[[url]]` is a link.
    { regex: new RegExp(`\\[(?!\\[)(?=${CELL}*\\]${END})`), token: 'squareBracket', push: 'label' },
    { regex: whole(`(\\^)(${CELL}*)(\\^)`), token: ['squareBracket', null, 'squareBracket'], next },
    { regex: /(\()(X)(\))/, token: ['paren', 'atom', 'paren'], next },
    { regex: /\( ?\)/, token: 'paren', next },
    { regex: whole('(<<)(\\w+)(>>)'), token: ['angleBracket', 'typeName', 'angleBracket'], next },
    // Two rules: an empty group would leave simple-mode an empty `pending`, which it cannot read.
    { regex: whole('(<<)(\\w+)'), token: ['angleBracket', 'typeName'], push: 'image' },
    { regex: whole('<<'), token: 'angleBracket', push: 'image' },
    { regex: whole('\\.'), token: 'punctuation', next },
  ]

  // What a cell's start means in one kind only.
  const own = {
    table: (next) => [
      { regex: whole('\\*'), token: 'punctuation', next },
      { regex: new RegExp(`([NSEWC])(=)(?=[ \\t]|${END})`), token: ['attributeName', 'definitionOperator'] },
    ],
    group: (next) => [{ regex: whole('\\*'), token: 'punctuation', next }],
    // Only a row's first cell has a depth.
    tree: (next) => [{ regex: /([ \t]*)(\++)/, sol: true, token: [null, 'list'], next }],
    menu: (next) => [{ regex: whole('-'), token: 'heading', next }],
    other: () => [],
  }

  const states = {}
  for (const kind of KINDS) {
    const next = mid(kind)
    const ownRules = own[kind](next)
    states[kind] = [
      // The tree's depth is matched with its indentation.
      ...(kind === 'tree' ? ownRules : []),
      { regex: /[ \t]+/, token: null },
      { ...escape, next },
      { regex: /\|/, token: 'separator' },
      { regex: /\}/, token: 'brace', pop: true },
      ...openers,
      ...widgets(next),
      ...(kind === 'tree' ? [] : ownRules),
      { regex: /(?=)/, token: null, next },
    ]
    states[next] = [
      escape,
      { regex: /\|/, token: 'separator', next: kind },
      { regex: /\}/, token: 'brace', pop: true },
      // The opener is pushed from cell start, so its `}` comes back to a new cell.
      { regex: /(?=\{)/, token: null, next: kind },
      ...creole(null),
    ]
  }

  const base = table({
    start: [
      ...lines.rules,
      ...spriteLines,
      { regex: /[ \t]*salt[ \t]*$/, sol: true, token: null },
      { regex: /[ \t]+/, token: null },
      ...openers,
      { regex: /\}/, token: 'brace' },
      { regex: /[^{}\s]+/, token: null },
    ],
    ...states,
    label: [{ regex: new RegExp(`\\]${END}`), token: 'squareBracket', pop: true }, escape, ...creole(null)],
    // Pixel rows, a cell each, down to a cell `>>`; one left open ends at `@end` (P5).
    image: [
      { regex: /[ \t]+/, token: null },
      { regex: /\|/, token: 'separator' },
      { regex: whole('>>'), token: 'angleBracket', pop: true },
      { regex: /[^\s|]+/, token: 'SpriteData' },
    ],
    ...creoleStates.states,
    ...spriteStates,
    ...lines.states,
  }, {
    nextLine: { ...Object.fromEntries(KINDS.map((kind) => [mid(kind), kind])), spriteHead: 'start' },
    lineStates: ['label', ...creoleStates.lineStates],
  })

  const CELLS = new Set(KINDS)
  const MIDS = new Set(KINDS.map(mid))
  const TAGS = new Set(creoleStates.lineStates)
  const STOP = /\\[|{}]|[|{}]/g

  /** From `pos`: the first escape or cell end, and the first cell end. */
  function stops(string, pos) {
    STOP.lastIndex = pos
    let first = -1
    for (let found = STOP.exec(string); found; found = STOP.exec(string)) {
      if (first < 0) first = found.index
      if (found[0].length === 1) return { first, end: found.index }
    }
    return { first: first < 0 ? string.length : first, end: string.length }
  }

  /** Where the state's rules stop reading the line: a cell's end, or a mid-cell escape too. */
  function limit(stream, state) {
    const owner = TAGS.has(state.state) ? state.stack.at(-1) : state.state
    if (!CELLS.has(owner) && !MIDS.has(owner) && owner !== 'label') return null
    const { first, end } = stops(stream.string, stream.pos)
    if (CELLS.has(owner)) return end
    if (MIDS.has(owner)) return first
    // A label ends at the cell's last `]`.
    const close = stream.string.lastIndexOf(']', end - 1)
    return close >= stream.pos ? Math.min(first, close) : first
  }

  const mode = {
    ...base,
    token(stream, state) {
      if (state.pending) return base.token(stream, state)
      if (stream.sol()) base.startLine(state)
      const until = limit(stream, state)
      if (until === null) return base.token(stream, state)
      if (until === stream.pos) {
        // A tag left open ends with its cell.
        while (TAGS.has(state.state) && state.stack.length) state.state = state.stack.pop()
        return base.token(stream, state)
      }
      const line = stream.string
      stream.string = line.slice(0, until)
      try {
        return base.token(stream, state)
      } finally {
        stream.string = line
      }
    },
  }
  return { type: 'salt', mode, completions: [], lints: [], values: [] }
}
