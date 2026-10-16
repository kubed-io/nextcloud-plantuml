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
  const { atNextLine, attributeList, common, number, patterns, quotedColour, table } = core.lex
  const lines = common()
  const name = /[-.\w]+/.source
  const colour = `#?${patterns.colourPart}`
  const quoted = quotedColour(colour)
  const bareColour = new RegExp(`(color)(\\s*)(=)(\\s*)(${colour})(?=[\\s,\\];]|$)`)
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
      atNextLine({ next: 'start' }),
      { regex: new RegExp(quoted.source), token: quoted.token },
      { regex: /"[^"]*"/, token: 'string' },
      { regex: new RegExp(`${colour}(?![\\w.])`), token: 'ColorLiteral' },
      { regex: /;/, token: 'separator' },
      { regex: /./, token: null },
    ],
    value: [
      atNextLine({ next: 'start' }),
      { regex: /"[^"]*"/, token: 'string' },
      { regex: /full(?!\w)/, token: 'atom' },
      number,
      { regex: /;/, token: 'separator' },
      { regex: /./, token: null },
    ],
    attributes: attributeList([
      { regex: new RegExp(`(color)(\\s*)(=)(\\s*)${quoted.source}`), token: ['attributeName', null, 'definitionOperator', null, ...quoted.token] },
      { regex: bareColour, token: ['attributeName', null, 'definitionOperator', null, 'ColorLiteral'] },
      { regex: /(shape)(\s*)(=)(\s*)([^\s,"\]]+)/, token: ['attributeName', null, 'definitionOperator', null, 'atom'] },
    ]),
    ...lines.states,
  }, { lineStates: ['attributes'] })
  return { type: 'nwdiag', mode, completions: [], lints: [], values: [] }
}
