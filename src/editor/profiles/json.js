/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startjson` blocks (T5), read by CodeMirror's json mode, which keeps the key or value
 * position; this wrapper only renames what it returns into the dictionary's tokens. PlantUML
 * reads `title`, `scale`, `skin`, `skinparam` and `hide` lines before the second data line only
 * (a `title` later is JSON text the server refuses), so the wrapper counts the lines the json
 * mode has read and hands those words' lines to a table of G4's common lines. A `#highlight`
 * line at column 0 is PlantUML's too, and the json mode would take it for garbage.
 */
import { json } from '@codemirror/legacy-modes/mode/javascript'

const COMMON_LINE = /^[ \t]*(?:title|scale|skin|skinparam|hide)\b/i
const HIGHLIGHT_LINE = /^#highlight(?= )/
// Where a path part ends: the next `/`, a stereotype or the line's end.
const PART_END = '(?=\\s*(?:/|<<|$))'

const RENAME = { 'string property': 'propertyName', string: 'string', number: 'number', atom: 'atom', comment: 'comment' }
const PUNCTUATION = { '{': 'brace', '}': 'brace', '[': 'squareBracket', ']': 'squareBracket', ',': 'separator', ':': 'separator' }

// CodeMirror's own copy for a stream mode without copyState (the json mode has none).
const copyOf = (state) => Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.slice() : value]))

/** @param {import('./index.js').Core} core */
export default (core) => {
  const { common, stereotypes, stereotypeState, table } = core.lex
  const lines = common()
  const common_ = table({
    start: [
      ...lines.rules,
      // `skin` is not in G4's list; its argument is a name, read like the other commands' words.
      { regex: /([ \t]*)(skin)(?=\s|$)/i, sol: true, token: [null, 'keyword'], next: 'commonArgs' },
      { regex: /.+/, token: null },
    ],
    ...lines.states,
  })
  const highlight = table({
    start: [
      { regex: HIGHLIGHT_LINE, sol: true, token: 'keyword' },
      { regex: /\s+/, token: null },
      { regex: /\//, token: 'separator' },
      { regex: /"[^"]*"/, token: 'string' },
      { regex: new RegExp(`\\*\\*?${PART_END}`), token: 'atom' },
      { regex: new RegExp(`\\d+${PART_END}`), token: 'number' },
      ...stereotypes,
      { regex: new RegExp(`[^/"<\\s](?:[^/"<]|<(?!<))*?${PART_END}`), token: 'propertyName' },
      { regex: /./, token: null },
    ],
    stereotype: stereotypeState,
    tagBraces: lines.states.commonTagBraces,
  }, { lineStates: ['stereotype', 'commonTagBraces'] })

  const mode = {
    name: 'json',
    startState: (indentUnit) => ({ json: json.startState(indentUnit), common: common_.startState(), highlight: highlight.startState(), kind: 'json', data: 0, counted: false }),
    copyState: (s) => ({ ...s, json: json.copyState ? json.copyState(s.json) : copyOf(s.json), common: common_.copyState(s.common), highlight: highlight.copyState(s.highlight) }),
    token(stream, state) {
      if (stream.sol()) {
        state.counted = false
        if (state.kind === 'common') {
          common_.startLine(state.common)
          if (state.common.state === 'start') state.kind = 'json'
        }
        if (state.kind !== 'common') {
          if (stream.match(HIGHLIGHT_LINE, false)) {
            state.kind = 'highlight'
            state.highlight = highlight.startState()
          } else if (state.data <= 1 && stream.match(COMMON_LINE, false)) {
            state.kind = 'common'
            state.common = common_.startState()
          } else {
            state.kind = 'json'
          }
        }
      }
      if (state.kind === 'common') return common_.token(stream, state.common)
      if (state.kind === 'highlight') return highlight.token(stream, state.highlight)
      const raw = json.token(stream, state.json)
      const text = stream.current()
      if (!state.counted && (raw || /\S/.test(text))) {
        state.counted = true
        state.data++
      }
      if (raw === 'operator' && text === '-' && /\d/.test(stream.peek() ?? '')) return 'number'
      if (raw == null) return PUNCTUATION[text] ?? null
      return RENAME[raw] ?? null
    },
  }
  return { type: 'json', mode, completions: [], lints: [], values: [] }
}
