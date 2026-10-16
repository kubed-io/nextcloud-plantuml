/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startnwdiag` blocks (T25), a table of the lexicon's (`core.lex`), read as `NwDiagramFactory`
 * of 1.2026.8 does: lines are trimmed, so each is read from its start after any indentation, and
 * the `{ … }` bodies (networks, groups; unclosed, the block's `@end` ends them) need no state of
 * their own. `nwdiag`, `network` and `group` are keywords, a network's or a group's name a
 * classifier; `address`, `color`, `width` and `description` properties take a value, `color`'s a
 * `ColorLiteral` (quoted or not, the quotes strings), `width = full` a value word; an element is
 * `name [ key = value, … ]` (the name a classifier, `shape`'s value a value word, `color`'s a
 * colour), a bare `name;` too; a link is `a -- b`; `//` at a line's start is a comment.
 */
export default (core) => {
  const { common, number, patterns, table } = core.lex
  const lines = common()
  const name = /[-.\w]+/.source
  const colour = `#?${patterns.colourPart}`
  const end = /(?=[\s,\];]|$)/.source
  const mode = table({
    start: [
      { regex: /([ \t]*)(\/\/.*)/, sol: true, token: [null, 'comment'] },
      ...lines.rules,
      { regex: /([ \t]*)(nwdiag)(?=\s*\{?\s*$)/, sol: true, token: [null, 'keyword'] },
      { regex: new RegExp(`([ \\t]*)(network|group)(\\s+)(${name})`), sol: true, token: [null, 'keyword', null, 'typeName'] },
      { regex: /([ \t]*)(network|group)(?=\s*\{)/, sol: true, token: [null, 'keyword'] },
      { regex: /([ \t]*)(color)(\s*)(=)(\s*)/, sol: true, token: [null, 'propertyName', null, 'definitionOperator', null], next: 'colour' },
      { regex: /([ \t]*)(address|width|description)(\s*)(=)(\s*)/, sol: true, token: [null, 'propertyName', null, 'definitionOperator', null], next: 'value' },
      // A link, then an element (with a list, or bare): the names are classifiers.
      { regex: new RegExp(`([ \\t]*)(${name}?)(\\s*)(--)(\\s*)(${name})`), sol: true, token: [null, 'typeName', null, 'LinkOperator', null, 'typeName'] },
      { regex: new RegExp(`([ \\t]*)(${name})(\\s*)(\\[)`), sol: true, token: [null, 'typeName', null, 'squareBracket'], push: 'attributes' },
      { regex: new RegExp(`([ \\t]*)(${name})(?=\\s*;?\\s*$)`), sol: true, token: [null, 'typeName'] },
      { regex: /[{}]/, token: 'brace' },
      { regex: /;/, token: 'separator' },
      { regex: /./, token: null },
    ],
    colour: [
      { regex: new RegExp(`(")(${colour})(")`), token: ['string', 'ColorLiteral', 'string'] },
      { regex: /"[^"]*"/, token: 'string' },
      { regex: new RegExp(`${colour}(?![\\w.])`), token: 'ColorLiteral' },
      { regex: /;/, token: 'separator' },
      { regex: /./, token: null },
    ],
    value: [
      { regex: /"[^"]*"/, token: 'string' },
      { regex: /full(?!\w)/, token: 'atom' },
      number,
      { regex: /;/, token: 'separator' },
      { regex: /./, token: null },
    ],
    attributes: [
      { regex: /\]/, token: 'squareBracket', pop: true },
      { regex: new RegExp(`(color)(\\s*)(=)(\\s*)(")(${colour})(")`), token: ['attributeName', null, 'definitionOperator', null, 'string', 'ColorLiteral', 'string'] },
      { regex: new RegExp(`(color)(\\s*)(=)(\\s*)(${colour})${end}`), token: ['attributeName', null, 'definitionOperator', null, 'ColorLiteral'] },
      { regex: /(shape)(\s*)(=)(\s*)([^\s,"\]]+)/, token: ['attributeName', null, 'definitionOperator', null, 'atom'] },
      { regex: /[A-Za-z_]\w*(?=\s*=)/, token: 'attributeName' },
      { regex: /=/, token: 'definitionOperator' },
      { regex: /"[^"]*"/, token: 'string' },
      { regex: /,/, token: 'separator' },
      { regex: /[^\s,\]="]+/, token: null },
      { regex: /./, token: null },
    ],
    ...lines.states,
  }, { lineStates: ['attributes', 'colour', 'value'] })
  return { type: 'nwdiag', mode, completions: [], lints: [], values: [] }
}
