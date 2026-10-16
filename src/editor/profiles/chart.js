/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startchart` blocks (T19), a table of the lexicon's (`core.lex`). The words are lower case
 * and case-sensitive, as `chart/command/*.java` of 1.2026.8 has them. A range `0 --> 100` (or
 * `->`) is number, separator, number: never a link, so no label opens after it. `legend
 * <position>` is one line, never a body. `[ … ]` holds data, labels and `ticks` pairs; what is
 * pushed (a list, a stereotype) ends with its line. The common lines are the lexicon's (G4).
 */
export default (core) => {
  const { colours, common, stereotypeState, stereotypes, table, tagStates } = core.lex
  const lines = common({ legend: 'line' })
  const word = (list) => new RegExp(`(?:${list})(?![\\w-])`)
  const number = { regex: /-?(?:\d+\.?\d*|\.\d+)(?![\w.])/, token: 'number' }
  const mode = table({
    start: [
      // `legend right`: a keyword and a position, before the common legend line reads it.
      { regex: /([ \t]*)(legend)(\s+)(left|right|top|bottom)(?![\w-])/, sol: true, token: [null, 'keyword', null, 'atom'] },
      ...lines.rules,
      { regex: word('h-axis|x-axis|v2-axis|y2-axis|v-axis|y-axis|bar|line|area|scatter|legend|stackMode|orientation|annotation|at|ticks|spacing'), token: 'keyword' },
      { regex: word('labels|grid|label-right|label-top|v2|y2'), token: 'modifier' },
      { regex: word('left|right|top|bottom|grouped|stacked|vertical|horizontal'), token: 'atom' },
      { regex: /"[^"]*"/, token: 'string' },
      ...stereotypes,
      ...colours,
      { regex: /-{1,2}>/, token: 'separator' },
      number,
      { regex: /\[/, token: 'squareBracket', push: 'data' },
      { regex: /[()]/, token: 'paren' },
      { regex: /[\w-]+/, token: null },
    ],
    // Data, labels and ticks: a bare label is plain, `0:"Poor"`'s colon a separator.
    data: [
      { regex: /\]/, token: 'squareBracket', pop: true },
      { regex: /"[^"]*"/, token: 'string' },
      number,
      { regex: /[,:]/, token: 'separator' },
      { regex: /[()]/, token: 'paren' },
      { regex: /[^\]\s,:"()]+/, token: null },
    ],
    stereotype: stereotypeState,
    // A stereotype's `{` pushes `tagBraces`; chart reads no Creole of its own (the common lines'
    // is theirs), so nothing pushes an inline formula.
    ...tagStates,
    ...lines.states,
  }, { lineStates: ['data', 'stereotype', 'tagAttrs', 'tagBraces'] })
  return { type: 'chart', mode, completions: [], lints: [], values: [] }
}
