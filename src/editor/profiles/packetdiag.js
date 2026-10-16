/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startpacketdiag` blocks (T24), a table of the lexicon's (`core.lex`), read as
 * `PacketDiagramFactory` of 1.2026.8 does: lines are trimmed, so each is read from its start after
 * any indentation. An optional `packetdiag { … }` wrapper (the braces are plain lines of their own;
 * unclosed, the block's `@end` ends it), options (`colwidth`, `node_height`, `scale_interval`,
 * `scale_direction`, `same_height` = a number or a value word, `;` optional), and fields: `N`,
 * `N-M` or `*`, an optional `:`, a description (Creole, to the line's end, `as`, `is` and `#red`
 * in it text) and an optional trailing `[len = 8, rotate = 270]` attribute list.
 */
export default (core) => {
  const { atNextLine, common, creole, number, table, tagStates } = core.lex
  const lines = common()
  const bit = /\d+/.source
  // A field's start: the range, its tokens, then the colon or a space.
  const ranges = [
    [`(${bit})(-)(${bit})`, ['number', 'separator', 'number']],
    [`(${bit})`, ['number']],
    [/(\*)/.source, ['atom']],
  ]
  const fields = ranges.flatMap(([range, token]) => [
    { regex: new RegExp(`([ \\t]*)${range}(:)`), sol: true, token: [null, ...token, 'separator'], next: 'description' },
    { regex: new RegExp(`([ \\t]*)${range}(?=\\s|$)`), sol: true, token: [null, ...token], next: 'description' },
  ])
  const mode = table({
    start: [
      ...lines.rules,
      { regex: /([ \t]*)(packetdiag)(?=\s*\{?\s*$)/, sol: true, token: [null, 'keyword'] },
      { regex: /([ \t]*)(colwidth|node_height|scale_interval|scale_direction|same_height)(\s*)(=)(\s*)/, sol: true, token: [null, 'propertyName', null, 'definitionOperator', null], next: 'option' },
      ...fields,
      { regex: /[{}]/, token: 'brace' },
      { regex: /./, token: null },
    ],
    option: [
      atNextLine({ next: 'start' }),
      { regex: /(?:ltr|rtl|true|false)(?!\w)/, token: 'atom' },
      number,
      { regex: /;/, token: 'separator' },
      { regex: /./, token: null },
    ],
    // The trailing `[ … ]` only where it closes the line; `[[link]]` is Creole's.
    description: [
      atNextLine({ next: 'start' }),
      { regex: /\[(?=[^[\]]*\]\s*$)/, token: 'squareBracket', push: 'attributes' },
      ...creole(null),
    ],
    attributes: [
      { regex: /\]/, token: 'squareBracket', pop: true },
      { regex: /[A-Za-z_]\w*(?=\s*=)/, token: 'attributeName' },
      { regex: /=/, token: 'definitionOperator' },
      { regex: /"[^"]*"/, token: 'string' },
      { regex: /,/, token: 'separator' },
      number,
      { regex: /[^\s,\]="]+/, token: null },
      { regex: /./, token: null },
    ],
    // What a description's Creole pushes ends with its line; an inline formula is plain.
    ...tagStates,
    math: [],
    latex: [],
    ...lines.states,
  }, { lineStates: ['attributes', 'tagAttrs', 'tagBraces', 'math', 'latex'] })
  return { type: 'packetdiag', mode, completions: [], lints: [], values: [] }
}
