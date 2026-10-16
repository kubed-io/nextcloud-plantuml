/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startmindmap` and `@startwbs` blocks (T3), two tables of the lexicon's (`core.lex`) that
 * PlantUML 1.2026.8 reads differently. A line is a node: a run of markers (a list marker, Y28,
 * never a link), its modifiers, and its text as Creole with a trailing `<<stereotype>>`.
 *
 * mindmap: `*` or `#` (indentation allowed), `+` or `-` (at column 0, a `-` puts the node on the
 * left), then `[#colour]`, then `_` (no box); `0 text` is a root; `**:` opens a box down to a
 * line ending `;`; `left side` and the other direction phrases are keywords.
 *
 * wbs: `*`, `+` or `-` (indentation allowed), then `_` and `<` or `>`, in that order only, then
 * `[#colour]` and `(id)` in either order; `"label" as id`; the box; and a link
 * `A -> B #red <<s>> : label`. It has no `#` marker and no side lines.
 *
 * `'` comments, `!` lines and `<style>` blocks are the editor's (P5); the commands every diagram
 * shares are the lexicon's common lines (G4).
 */

// A colour in brackets, then an underscore; one stereotype may follow a box's closer.
const COLOUR = '(\\[)(#\\w+)(\\])'
// An id, in `(id)` and at either end of a link.
const NAME = '[\\w\\u00C0-\\uFFFF]+'
const ID = `(\\()(${NAME})(\\))`
// A box ends on a line ending `;` and an optional stereotype (H18).
const CLOSER = /;(?=\s*(?:<<[^>]*>>)?\s*$)/

/** The tokens of a marker run's prefix, group by group, from the one after the indentation. */
const MARKS = ['squareBracket', 'ColorLiteral', 'squareBracket']
const IDS = ['paren', 'typeName', 'paren']

function profile(core, type) {
  const { atNextLine, box, colours, common, creole, creoleStates, stereotypes, stereotypeState, table } = core.lex
  const wbs = type === 'wbs'
  // wbs registers no direction lines (`CommandRankDir`): the server refuses them.
  const lines = common({ direction: !wbs })
  const boxes = box(CLOSER)
  const rest = `(?=.*${CLOSER.source})`
  const opener = (prefix, tokens) => [
    { regex: new RegExp(`${prefix}(:)${rest}`), sol: true, token: [...tokens, 'bracket'], next: 'boxLast' },
    { regex: new RegExp(`${prefix}(:)`), sol: true, token: [...tokens, 'bracket'], next: 'boxText' },
  ]
  // A mindmap's text may follow its marker directly (`**a`); a wbs node's is set off by a space.
  const node = (prefix, tokens, after = '') => ({ regex: new RegExp(`${prefix}${after}`), sol: true, token: tokens, next: 'label' })

  let nodes
  if (wbs) {
    // Marker, `_`, `<` or `>`, then the colour and the id in either order.
    const prefix = `([ \\t]*)([*+-]+)(_)?([<>])?(?:${COLOUR}(?:${ID})?|${ID}(?:${COLOUR})?)?`
    const tokens = [null, 'list', 'modifier', 'modifier', ...MARKS, ...IDS, ...IDS, ...MARKS]
    nodes = [
      ...opener(prefix, tokens),
      { regex: new RegExp(`${prefix}([ \\t]+)("[^"]*")([ \\t]+)(as)([ \\t]+)(\\w+)`), sol: true, token: [...tokens, null, 'string', null, 'keyword', null, 'typeName'], next: 'label' },
      node(prefix, tokens, '(?=[ \\t]|$)'),
      // `A -> B #red <<s>> : label`: the references plain, the connector, then the rest.
      { regex: new RegExp(`([ \\t]*)(${NAME})([ \\t]+)([.-]+>)([ \\t]+)(${NAME})`), sol: true, token: [null, null, null, 'LinkOperator', null, null], next: 'link' },
    ]
  } else {
    const prefix = `([*#]+)(?:${COLOUR})?(_)?`
    const tokens = ['list', ...MARKS, 'modifier']
    const sides = `([ \\t]*)([*#]+)(?:${COLOUR})?(_)?`
    nodes = [
      ...opener(prefix, tokens),
      node(sides, [null, ...tokens]),
      // The empty first group keeps a bare run from being the only group simple-mode reads.
      node(`()([+-]+)(?:${COLOUR})?(_)?`, [null, ...tokens]),
      { regex: /(0)(?=[ \t]+\S)/, sol: true, token: 'list', next: 'label' },
      // A line without `*` or `#` naming a side and a direction word (`left side`).
      { regex: /([ \t]*)((?=[^*#]*\b(?:left|right|top|bottom)\b[^*#]*\b(?:side|direction)\b)[^*#]+)/, sol: true, token: [null, 'keyword'] },
    ]
  }

  const mode = table({
    start: [
      ...lines.rules,
      ...nodes,
      ...stereotypes,
    ],
    label: [atNextLine({ next: 'start' }), ...stereotypes, ...creole(null)],
    link: [
      atNextLine({ next: 'start' }),
      { regex: /\s*:\s*/, token: null, next: 'linkLabel' },
      ...stereotypes,
      ...colours,
      { regex: /[^:#<]+|./, token: null },
    ],
    linkLabel: [atNextLine({ next: 'start' }), ...creole('labelName')],
    boxText: boxes.boxText,
    boxLast: boxes.boxLast,
    stereotype: stereotypeState,
    ...creoleStates.states,
    // Comments are the editor's, but a box's rules name the state that a comment pushes.
    blockComment: [],
    ...lines.states,
  }, { nextLine: { boxLast: 'start' }, lineStates: ['stereotype', ...creoleStates.lineStates] })
  return { type, mode, completions: [], lints: [], values: [] }
}

export default (core) => profile(core, 'mindmap')
export const wbs = (core) => profile(core, 'wbs')
