/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The rules PlantUML's grammars share, as simple-mode rule arrays and the
 * builders that make them: arrows, colours, the preprocessor's names, Creole,
 * a tag's attributes, a body's lines and a sprite's states. The core grammar
 * (`../plantuml-mode.js`) is built from them, and a profile gets them as
 * `core.lex`.
 *
 * Prism anchors several rules to the start of a line after any indentation,
 * which a stream mode cannot look back for. Those rules match at the start of
 * the line instead and capture the indentation as a group of its own, so only
 * the word is coloured (`atLineStart`).
 */
import preprocessor from '../data/directives.json'
import { startName, startCall } from './start.js'

/** The tokens every grammar reads alike: a double-quoted string, either quote, a paren and a comma. */
export const string = { regex: /"[^"]*"/, token: 'string' }
export const quoted = { regex: /"[^"]*"|'[^']*'/, token: 'string' }
export const paren = { regex: /[()]/, token: 'paren' }
export const comma = { regex: /,/, token: 'separator' }

const arrowAttr = /\[[^[\]]*\]/.source
const arrowDirection = /(?:[drlu]|do|down|le|left|ri|right|up)/.source
const arrowBody = `(?:-+${arrowDirection}-+|\\.+${arrowDirection}\\.+|-+(?:${arrowAttr}-*)?|${arrowAttr}-+|\\.+(?:${arrowAttr}\\.*)?|${arrowAttr}\\.+|=+|~+)`
// A line without a head: two or more of one stroke, or a placed or styled one.
const headless = `(?:-{2,}|\\.{2,}|={2,}|~{2,}|-+${arrowDirection}-+|\\.+${arrowDirection}\\.+|-+${arrowAttr}-+|\\.+${arrowAttr}\\.+)`
const arrowLeft = /(?:<{1,2}|\/{1,2}|\\{1,2}|<\||[#*^+}xo])/.source
const arrowRight = /(?:>{1,2}|\/{1,2}|\\{1,2}|\|>|[#*^+{xo])/.source
const arrowPrefix = /[[?]?[ox]?/.source
const arrowSuffix = /[ox]?[\]?]?/.source
// Prism's lookbehind is dropped: words are consumed whole, so an arrow is only
// ever tried where a token starts. An o or x head must not run into a word, or
// `.org` in a URL would be a dotted arrow with an o head.
const arrowEnd = /(?![-.=~<>?|\\\]ox])(?:(?<=[ox])(?!\w)|(?<![ox]))/.source
export const arrow = new RegExp(`${arrowPrefix}(?:${arrowBody}${arrowRight}|${arrowLeft}${arrowBody}(?:${arrowRight})?|${headless})${arrowSuffix}${arrowEnd}`)

// A styled link (`-[#FF6F61,bold]->`) is the same shape with the bracket made
// compulsory. It is read in pieces, so a colour in it is a node of its own.
const styledBody = `(?:-+${arrowAttr}-*|${arrowAttr}-+|\\.+${arrowAttr}\\.*|${arrowAttr}\\.+)`
const styledHeadless = `(?:-+${arrowAttr}-+|\\.+${arrowAttr}\\.+)`
const styled = `${arrowPrefix}(?:${styledBody}${arrowRight}|${arrowLeft}${styledBody}(?:${arrowRight})?|${styledHeadless})${arrowSuffix}${arrowEnd}`
/** A styled link's start, up to its `[`. */
export const styledOpen = new RegExp(`(?=${styled})${arrowPrefix}(?:${arrowLeft})?(?:-+|\\.+)?\\[`)
/** A styled link's end, from its `]`. */
export const styledClose = new RegExp(`\\](?:-+|\\.+)?(?:${arrowRight})?${arrowSuffix}${arrowEnd}`)

// #RGB, #RGBA, #RRGGBB or #RRGGBBAA.
const hexDigits = /(?:[\dA-Fa-f]{8}|[\dA-Fa-f]{6}|[\dA-Fa-f]{3,4})(?!\w)/.source
export const hex = new RegExp(`#${hexDigits}`)
// A colour's name is a word, never all hex digits (`#ABCDE` is a broken hex);
// a style part (`#line:red`, `#line.dashed`) is a word with `:` or `.` after it.
const colourName = /(?![\dA-Fa-f]+(?!\w))[A-Za-z]\w*/.source
const colourPart = `(?:${hexDigits}|${colourName})`
const notStylePart = /(?![\w.:])/.source
export const named = new RegExp(`#${colourName}${notStylePart}`)

/** A colour's pieces, as regex sources, for a rule that has a colour in it. */
export const patterns = { hexDigits, colourName, colourPart, notStylePart }

/**
 * Colours where one goes: gradients (`#Red/Yellow`, `|`, `-`, `\`, the second
 * part without its `#`), the automatic text colour (`#?black:white`), a hex
 * and a name; each part a `ColorLiteral`.
 */
export const colours = [
  { regex: new RegExp(`(#${colourPart})([/|\\\\-])(${colourPart})${notStylePart}`), token: ['ColorLiteral', 'punctuation', 'ColorLiteral'] },
  { regex: new RegExp(`(#\\?)(${colourPart})(:)(${colourPart})${notStylePart}`), token: ['punctuation', 'ColorLiteral', 'punctuation', 'ColorLiteral'] },
  { regex: hex, token: 'ColorLiteral' },
  { regex: named, token: 'ColorLiteral' },
]

/** A rule for the start of a line: indentation plain, the rest as `token`. A RegExp keeps its flags. */
export const atLineStart = (pattern, token, extra = {}) => ({
  regex: new RegExp(`([ \\t]*)(${pattern.source ?? pattern})`, pattern.flags ?? ''),
  sol: true,
  token: [null, token],
  ...extra,
})

/**
 * The preprocessor's names, on any line (X7): a function's name before its `(`, where it is
 * declared or called (`$ask(`) and a built-in (`%strlen(`), and a variable. `$5` is a price.
 */
export const names = [
  { regex: /[$%][A-Za-z_]\w*(?=\()/, token: 'FunctionName' },
  { regex: /\$[A-Za-z_]\w*/, token: 'VariableName' },
]

/**
 * `names` on a uml line, where a `$f(` or `%f(` call also opens the state `args` (H16), so its
 * arguments read as any call's. In Creole text and on a `!` line they are `names`.
 */
export const callNames = [
  { regex: /([$%][A-Za-z_]\w*)(\()/, token: ['FunctionName', 'paren'], push: 'args' },
  ...names,
]

/**
 * Paths (H22). `url` is a URL with a scheme (`https://…`, `file://…`), up to a space, a quote, `>`,
 * `]` or the line's end. `slot` is a path where one goes (an include's, a theme's source), the
 * first of its rules that fits: the path and then a selector, `!` and a number or a block's id.
 */
export const paths = {
  url: { regex: /[a-z][\w+.-]*:\/\/[^\s"'>\]]*/i, token: 'url' },
  slot: [
    // Quoted, the quotes punctuation as a quoted `@start` name's are (H12).
    { regex: /(")([^"]+)(")(!)(\d+)(?!\S)/, token: ['punctuation', 'url', 'punctuation', 'separator', 'number'] },
    { regex: /(")([^"]+)(")(!)([\w.-]+)/, token: ['punctuation', 'url', 'punctuation', 'separator', 'typeName'] },
    { regex: /(")([^"]+)(")/, token: ['punctuation', 'url', 'punctuation'] },
    { regex: /([^\s"'>!]+)(!)(\d+)(?!\S)/, token: ['url', 'separator', 'number'] },
    { regex: /([^\s"'>!]+)(!)([\w.-]+)/, token: ['url', 'separator', 'typeName'] },
    { regex: /[^\s"'>!]+/, token: 'url' },
  ],
}

/**
 * Creole, in any text. Runs of plain text are `base`, and so are bold, italic,
 * monospace and underline, as modifiers on it. `--strike--` and `~~wave~~` are
 * Creole too, but are left as text: they read as the links `--` and `~~`.
 */
export function creole(base) {
  const on = (style) => (base ? `${style} ${base}` : style)
  return [
    { regex: /\[\[[^\]]*\]\]/, token: 'link' },
    // `~~` is a wave, left as text; `~` before any other character escapes it.
    { regex: /~~/, token: base },
    { regex: /(~)([^~])/, token: ['punctuation', base] },
    // A line break or a tab in the text, and a backslash itself (Y20).
    { regex: /\\[ntlr\\]/, token: 'escape' },
    // A URL's `//` starts no italics.
    paths.url,
    { regex: /\*\*.+?\*\*/, token: on('strong') },
    { regex: /\/\/.+?\/\//, token: on('emphasis') },
    { regex: /"".+?""/, token: on('monospace') },
    { regex: /__.+?__/, token: on('underline') },
    // An inline formula, PlantUML's `<math>(.+?)</math>` on one line: its middle is the
    // state `math`'s, see the core's `inlineMiddle`.
    { regex: /<math>(?=.+?<\/math>)/, token: 'tagName', push: 'math' },
    { regex: /<latex>(?=.+?<\/latex>)/, token: 'tagName', push: 'latex' },
    // A tag's parts (H10): its name and `>` are tags, `:` and `,` separators, `{` and `}` braces, an
    // attribute's name an attribute and its value a string, or a colour.
    { regex: new RegExp(`(<(?:color|back|u|s|w))(:)(#?${colourPart})(>)`), token: ['tagName', 'separator', 'ColorLiteral', 'tagName'] },
    { regex: /(<img)(:)([^>{}]+)(>)/, token: ['tagName', 'separator', 'url', 'tagName'] },
    { regex: /(<img)(:)([^>{}]+)(\{)/, token: ['tagName', 'separator', 'url', 'brace'], push: 'tagBraces' },
    { regex: /(<(?:size|color|back|font|u|s|w|space|qrcode))(:)([^>{}]+)(>)/, token: ['tagName', 'separator', 'string', 'tagName'] },
    { regex: /(<qrcode)(:)([^>{}]+)(\{)/, token: ['tagName', 'separator', 'string', 'brace'], push: 'tagBraces' },
    { regex: /(<&[^>\s{}]+|<:[^>\s{}]+:|<\$[^>\s{}]+)(\{)/, token: ['tagName', 'brace'], push: 'tagBraces' },
    { regex: /<(?:font|img|text)(?=\s)/, token: 'tagName', push: 'tagAttrs' },
    // A table row or cell colour (`<#lightblue,#red>`) and a coloured emoji (`<#green:sunny:>`).
    { regex: new RegExp(`(<)(#${colourPart})(?:(,)(#${colourPart}))?(:[^>\\s]+:)?(>)`), token: ['tagName', 'ColorLiteral', 'tagName', 'ColorLiteral', 'tagName', 'tagName'] },
    { regex: /<\/?(?:b|i|u|s|w|r|code|plain|sub|sup|size|font|color|back)(?:[:\s][^>]*)?>/, token: 'tagName' },
    // An OpenIconic icon, an emoji, an image, a Unicode character.
    { regex: /<(?:&[^>\s]+|:[^>\s]+:|\$[^>\s]+|U\+[\dA-Fa-f]+)>|&#(?:\d+|x[\dA-Fa-f]+);/, token: 'tagName' },
    ...names,
    { regex: /\|=?/, token: 'separator' },
    { regex: /\w+|[^\w[*/"<|~&$%\\]+/, token: base },
    { regex: /./, token: base },
  ]
}

/** The pieces of `name=value`, as they stand in a tag; `end` is what may follow a value. */
export const attributes = (end) => [
  { regex: new RegExp(`(color)(\\s*)(=)(\\s*)(#?${colourPart})${end}`), token: ['attributeName', null, 'definitionOperator', null, 'ColorLiteral'] },
  // A quoted colour keeps its swatch (C6), its quotes a string.
  { regex: new RegExp(`(color)(\\s*)(=)(\\s*)(["'])(#?${colourPart})(\\5)`), token: ['attributeName', null, 'definitionOperator', null, 'string', 'ColorLiteral', 'string'] },
  // An image's source is a path (H22), quoted or not.
  { regex: /(src)(\s*)(=)(\s*)(")([^"]+)(")/, token: ['attributeName', null, 'definitionOperator', null, 'punctuation', 'url', 'punctuation'] },
  { regex: /(src)(\s*)(=)(\s*)([^\s>"',}]+)/, token: ['attributeName', null, 'definitionOperator', null, 'url'] },
  // A namespaced name (`xlink:href`) is one.
  { regex: /[\w:-]+(?=\s*=)/, token: 'attributeName' },
  { regex: /=/, token: 'definitionOperator' },
  quoted,
  { regex: /[^\s>"',}]+/, token: 'string' },
  { regex: /./, token: null },
]

/**
 * The states Creole pushes for a tag's attributes (`<font size=12 color=red>`) and an icon's
 * (`<&star{scale=2}>`). Both end with their line: a table lists them in its `lineStates`.
 */
export const tagStates = {
  tagAttrs: [
    { regex: /\s+/, token: null },
    { regex: /\/?>/, token: 'tagName', pop: true },
    ...attributes(/(?=\s|\/?>|$)/.source),
  ],
  tagBraces: [
    { regex: /\s+/, token: null },
    { regex: /(\})(>)(?!>)/, token: ['brace', 'tagName'], pop: true },
    { regex: /\}/, token: 'brace', pop: true },
    comma,
    ...attributes(/(?=[\s,}>]|$)/.source),
  ],
}

// An inline formula's middle, plain up to its closer, which pops back to the text it was in.
const inline = (tag) => [
  { regex: new RegExp(`.+?(?=</${tag}>)`), token: null },
  { regex: new RegExp(`</${tag}>`), token: 'tagName', pop: true },
]

/**
 * The states `creole()` pushes, for a profile that reads Creole: `tagStates`, and an inline
 * `<math>` or `<latex>` read plain up to its `</math>` or `</latex>`, then back to the text, so what
 * follows it keeps its colours. Spread `states` into the table and add `lineStates` to its own:
 * a tag left open ends with its line.
 */
export const creoleStates = {
  states: { ...tagStates, math: inline('math'), latex: inline('latex') },
  lineStates: ['tagAttrs', 'tagBraces', 'math', 'latex'],
}

/**
 * A stereotype (H13): `<<` opens the state `stereotype` when `>>` closes it on the line and no
 * `-`, `.`, `=`, `~` or `<` follows (those start a link). It ends with its line, a table lists
 * it in its `lineStates`. Creole states do not take it: in a label `<<x>>` is text.
 */
export const stereotypes = [
  { regex: /<<(?![-.=~<])(?=.*?>>)/, token: 'angleBracket', push: 'stereotype' },
]

export const stereotypeState = [
  { regex: /\s+/, token: null },
  { regex: />>/, token: 'angleBracket', pop: true },
  { regex: /(\()([A-Za-z])(,)(#?\w+)(\))/, token: ['paren', 'atom', 'separator', 'ColorLiteral', 'paren'] },
  { regex: /\$[\w.-]+/, token: 'tagName' },
  { regex: /\*\d+(?:\.\d+)?/, token: 'number' },
  { regex: /\{/, token: 'brace', push: 'tagBraces' },
  comma,
  { regex: /(?:[^>\s,{]|>(?!>))+/, token: 'annotation' },
]

/**
 * Numbers (H14): a timing mark (`@100`, `@+50`), a `||45||` delay and a number standing on its own,
 * an integer or a decimal with a trailing `%`. A digit inside a word is no number: the word is read
 * whole before this is tried again, and `2x` is refused by the lookahead.
 */
export const number = { regex: /\d+(?:\.\d+)?%?(?![\w.])/, token: 'number' }
export const numbers = [
  { regex: /@[+-]?\d+(?:\.\d+)?/, token: 'number' },
  { regex: /(\|\|)(\d+)(\|\|)/, token: ['separator', 'number', 'separator'] },
  number,
]

/** The preprocessor's operators by kind (H19), for a `!` line and a call's arguments. */
export const operators = [
  { regex: /[+\-*/]/, token: 'arithmeticOperator' },
  { regex: /[=!]=|[<>]=?/, token: 'compareOperator' },
  { regex: /&&|\|\|/, token: 'logicOperator' },
  { regex: /\?=|=/, token: 'definitionOperator' },
]

/**
 * A call (H16): a word straight before `(`, then the paren, which opens the state `args`. The words
 * that take a condition are left to the keyword rules. `args` ends with its line (a table lists it
 * in its `lineStates`; it pops every `(` pushed, see `table`).
 */
export const calls = [
  { regex: /(?!(?:if|elseif|else|then|endif|endwhile|while|repeat|switch|case|equals|not|is|backward)\()([A-Za-z_]\w*)(\()/, token: ['FunctionName', 'paren'], push: 'args' },
]

export const argsState = [
  { regex: /\)/, token: 'paren', pop: true },
  { regex: /\(/, token: 'paren', push: 'args' },
  comma,
  quoted,
  ...names,
  ...numbers,
  // A name before `=` is an attribute (`id=fun`).
  { regex: /[A-Za-z_]\w*(?=\s*=(?!=))/, token: 'attributeName' },
  ...operators,
  ...calls,
  { regex: /\w+/, token: null },
]

/**
 * What Creole reads at the start of a line in a body, not in a one-line label (where a `#` is
 * a colour): rules, headings, list items and tree lines; `<code>` opens the state `code`.
 */
export const lines = (code) => [
  atLineStart(/(?:-{4,}|\.{4,}|={4,}|_{4,})(?=\s*$)/.source, 'heading'),
  // No group in these: a rule's groups are its tokens.
  atLineStart(/(?:\.\..+\.\.|==.+==|--.+--)\s*$/.source, 'heading'),
  atLineStart(/={1,3}[ \t].*/.source, 'heading'),
  atLineStart(/(?:\*{1,2}|#{1,2})(?=[ \t])/.source, 'list'),
  atLineStart(/\|_/.source, 'list'),
  atLineStart(/<code>(?=\s*$)/.source, 'tagName', { next: code }),
  // A formula over several lines: exactly `<latex>`, down to a line that is exactly `</latex>`.
  { regex: /<latex>$/, sol: true, token: 'tagName', push: 'latexBlock' },
]

// A diagram's end ends a body left open, and anything open in it.
const diagramEnd = atLineStart(/@end\w*/.source, 'keyword', { next: 'start' })

/** The lines of a `<code>` block: monospace down to `</code>`, or to the end of the body or the diagram. */
export const codeLines = (closer, back) => [
  diagramEnd,
  atLineStart(/<\/code>(?=\s*$)/.source, 'tagName', { next: back }),
  ...(closer ? [atLineStart(closer, 'keyword', { next: 'start' })] : []),
  { regex: /.+/, token: 'monospace' },
]

/**
 * Creole on the lines down to `closer` or the diagram's `@end`, and the state `key`Code for its
 * `<code>` blocks; `extra` rules are tried straight after the closer (the core's `!` lines).
 */
export const body = (key, closer, token = 'keyword', extra = []) => ({
  [key]: [
    diagramEnd,
    atLineStart(closer, token, { next: 'start' }),
    ...extra,
    ...lines(`${key}Code`),
    ...creole(null),
  ],
  [`${key}Code`]: codeLines(closer, key),
})

/** An activity box's closer (H18): `;`, or an SDL shape's `|`, `<`, `>`, `/`, `\`, `]`, `}`, ending the line. */
const activityCloser = /[;|<>/\\\]}](?=\s*$)/

/**
 * A box (H18): `:` opening a line, after an optional `#colour`, and `closer` at a line's end are
 * brackets; between them is Creole, over as many lines as it takes. An actor's shorthand
 * (`:Dr K: as drk`, `:Main Admin: --> (Use)`) is no box. Returns the rules for `start` (`open`) and the
 * states `boxText` and `boxLast` (the last line; map it to `start` in `nextLine`); `extra` rules (the core's `!` lines) are tried first in the state, and an
 * `@end` line ends an open box.
 */
export function box(closer = activityCloser, extra = []) {
  const end = closer.source
  const rules = [
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    ...extra,
    ...comments,
    { regex: closer, token: 'bracket', next: 'start' },
    // A run of symbols up to the closer, which creole's own run would take along, and a URL.
    { regex: new RegExp(`[^\\w[*/"<|~&$%]+?(?=${end})`), token: null },
    { regex: new RegExp(`${paths.url.regex.source.replace(/\*$/, '*?')}(?=${end})`, 'i'), token: 'url' },
    ...creole(null),
  ]
  // PlantUML reads the last character of the line as the closer, so a line ending in one is the
  // box's last (`boxLast`, back to `start` with its line), whether a tag or a link owns the
  // character; a `!` directive line or a comment line is no line of the box.
  const lastLine = `(?=.*${end})`
  const boxLine = `(?![ \\t]*(?:${directive}|'|\\/'))`
  // An actor's shorthand ends at its second colon, a URL's `://` aside.
  const open = `(?![ \\t]*:[^:]+:(?!\\/\\/)(?=\\s+as\\b|\\s*[-.=<>/]|\\s*$))([ \\t]*)(#${colourPart})?(:)`
  const opener = (pattern, next) => ({ regex: new RegExp(pattern), sol: true, token: [null, 'ColorLiteral', 'bracket'], next })
  return {
    open: [opener(`${open}${lastLine}`, 'boxLast'), opener(open, 'boxText')],
    boxText: [{ regex: new RegExp(`${boxLine}${lastLine}`), sol: true, token: null, next: 'boxLast' }, ...rules],
    boxLast: rules,
  }
}

/**
 * Comments: `'` to the end of the line, and `/' … '/`, which pushes the state `blockComment` when
 * it runs on past its line, so the state it started in comes back at its `'/`.
 */
export const comments = [
  atLineStart(/\/'.*?'\//.source, 'comment'),
  atLineStart(/\/'.*/.source, 'comment', { push: 'blockComment' }),
  atLineStart(/'.*/.source, 'comment'),
]

export const blockComment = [
  { regex: /.*?'\//, token: 'comment', pop: true },
  { regex: /.+/, token: 'comment' },
]

/** Sequence participants; completion's keywords and names read declarations with these too. */
export const PARTICIPANTS = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue']

/** Class, component, use case and state elements; completion reads these too. */
export const STRUCTURES = ['class', 'interface', 'abstract', 'enum', 'package', 'namespace', 'component', 'node', 'cloud', 'frame', 'folder', 'rectangle', 'usecase', 'state', 'object']

// The element keywords (H15): those, with the kinds PlantUML adds. Longest first, so
// `abstract class` is never `abstract` and a name `class`.
const elements = [...PARTICIPANTS, ...STRUCTURES, 'abstract class', 'annotation', 'struct', 'protocol', 'map', 'json']
const alternation = (words) => [...new Set(words)].sort((a, b) => b.length - a.length).map((word) => word.replace(' ', '\\s+')).join('|')

/** The element keywords a line declares a name with, as one regex alternation. */
const DECLARING = alternation(elements)

// The kinds whose `{` opens members (H17).
const BODIED = alternation(['class', 'interface', 'enum', 'abstract class', 'abstract', 'annotation', 'entity', 'struct', 'protocol', 'object', 'map'])
// A URL is a path, never a name (`component https://x.org/a`); a `$name` is the preprocessor's
// variable. Two groups, `declaredTokens`.
const declared = /(?:(\$[A-Za-z_]\w*)|(?![A-Za-z][\w+.-]*:\/\/)([A-Za-z_][\w.:]*))/.source
const declaredTokens = ['VariableName', 'typeName']
const endsInBrace = /(?=.*\{\s*$)/.source

/** The alias after `as`, a name made there too (H15), on a declaring line only. */
export const alias = { regex: /\b(as)(\s+)([A-Za-z_][\w.]*)/, token: ['keyword', null, 'typeName'] }

// What an element shows when it is not its name: a string, a sprite, `[x]`, `(x)` or `:x:`.
const shown = /(?:("[^"]*")|(<\$[^>\s]+>)|(\[[^\]]*\]|\([^)]*\)|:[^:]*:))/.source
const aliased = `(?:${alias.regex.source.replace('\\b', '(\\s+)')})?`

/**
 * A declaration (H15), at the start of a line: the element keyword, then the name it makes, a
 * `typeName`, or what it shows and the alias after `as`. A kind with members whose line ends `{`
 * pushes the state `classHead`, which reads the rest of the line and becomes `classBody` at the
 * next one (a table's `nextLine`); a quoted name opens it too, its alias read there.
 */
export const declarations = [
  { regex: new RegExp(`([ \\t]*)(${BODIED})(\\s+)${declared}${endsInBrace}`), sol: true, token: [null, 'keyword', null, ...declaredTokens], push: 'classHead' },
  { regex: new RegExp(`([ \\t]*)(${BODIED})(?=\\s.*\\{\\s*$)`), sol: true, token: [null, 'keyword'], push: 'classHead' },
  {
    regex: new RegExp(`([ \\t]*)(${DECLARING})(\\s+)(?:${declared}|${shown})${aliased}`),
    sol: true,
    token: [null, 'keyword', null, ...declaredTokens, 'string', 'tagName', null, null, 'keyword', null, 'typeName'],
  },
]

// A directive PlantUML's preprocessor knows (`TLineType`, `../data/directives.json`), whole, with
// `!end function` and the like; or an assignment, `!$x = 1`, `! local x ?= 1`. Any other line
// starting `!` is text.
const directiveWords = preprocessor.directives.map((word) => word.slice(1)).sort((a, b) => b.length - a.length).join('|')
const assignment = /!(?=[ \t]*(?:(?:local|global)[ \t]*)?\$?[A-Za-z_]\w*[ \t]*\??=)/.source

/** The directive or `!` of a preprocessor line, as a regex source, matched where the line's text starts. */
export const directive = `!(?:end[ \\t]*(?:function|definelong|procedure)|${directiveWords})\\b|${assignment}`

/** Whether a line, from its start, is the preprocessor's. */
export const directiveLine = new RegExp(`^[ \\t]*(?:${directive})`)

/**
 * A class body's states (H17). `classHead` is the rest of the declaring line, its `{` a brace.
 * `classBody` is the members down to a line starting `}`: a visibility mark and `{static}` and
 * the like modifiers, a divider a heading, a method's name a function, a type after `:` a
 * `typeName`, the rest plain. A `!` line is the grammar's to add: it pushes from here.
 */
export const classStates = {
  classHead: [
    { regex: /\{(?=\s*$)/, token: 'brace' },
    alias,
    string,
    ...stereotypes,
    ...colours,
    { regex: /\w+/, token: null },
  ],
  classBody: [
    atLineStart(/\}/.source, 'brace', { pop: true }),
    atLineStart(/@end\w*/.source, 'keyword', { pop: true }),
    ...comments,
    atLineStart(/(?:--|\.\.|==|__)(?:.*?(?:--|\.\.|==|__))?\s*$/.source, 'heading'),
    // A space may follow the mark: the server reads `+ render()` as `+render()`.
    atLineStart(/[-+#~](?=[ \t]*\S)/.source, 'modifier'),
    { regex: /(\{)(static|abstract|field|method|classifier)(\})/, token: ['brace', 'modifier', 'brace'] },
    { regex: /(\s*)(:)(\s*)([A-Za-z_][\w.<>[\],]*)/, token: [null, 'separator', null, 'typeName'] },
    ...calls,
    ...callNames,
    string,
    ...stereotypes,
    { regex: /\w+/, token: null },
  ],
}

/** The rest of a line whose text starts on the next one: `note left of A #pink`. */
export const head = [
  ...stereotypes,
  ...colours,
  ...callNames,
  { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
  ...numbers,
  ...calls,
  { regex: /\w+/, token: null },
]

/** The rest of a line up to the colon that starts its text, read by the state `next`. */
export const toColon = (next) => [
  { regex: /\s*:\s*/, token: null, next },
  // A multiplicity or role, as the one before the link is a string.
  string,
  ...names,
  { regex: /[^:$%"]+|"/, token: null },
]

/**
 * A sprite definition (T16) and `listsprites`, at the start of a line: the definition's name a
 * variable, the rest of its line read by the state `spriteHead`, which ends with its line (a
 * table maps it to `start` in its `nextLine`).
 */
export const spriteLines = [
  { regex: /([ \t]*)(sprite)(\s+)(\$?[-.%\w]+)/, sol: true, token: [null, 'keyword', null, 'VariableName'], next: 'spriteHead' },
  atLineStart(/listsprites?\b/.source, 'keyword'),
]

/** A sprite definition's states (T16), after `sprite $name`: its header, pixel rows and svg. */
export const spriteStates = {
  // The rest of a sprite's header: its size, then a `{` that ends the line and opens
  // the rows, or a payload, or an svg. Ends with its line, see the core's `nextLine`.
  spriteHead: [
    { regex: /\s+/, token: null },
    { regex: /(\[)(\d+)(x)(\d+)(\/)(\d+)(z)?(\])/, token: ['squareBracket', 'number', 'separator', 'number', 'separator', 'number', 'keyword', 'squareBracket'] },
    { regex: /(\[)(\d+)(x)(\d+)(\/)(color)(\])/, token: ['squareBracket', 'number', 'separator', 'number', 'separator', 'keyword', 'squareBracket'] },
    { regex: /\{(?=\s*$)/, token: 'brace', next: 'spriteRows' },
    { regex: /<svg(?=[\s>])/, token: 'tagName', next: 'spriteSvg' },
    { regex: /data:[^,\s]*,/, token: 'attributeName' },
    { regex: /\S+/, token: 'SpriteData' },
  ],
  // Pixel rows are data, down to the closing `}` or `end sprite`.
  spriteRows: [
    atLineStart(/\}/.source, 'brace', { next: 'start' }),
    atLineStart(/end[ \t]*sprite\b/.source, 'keyword', { next: 'start' }),
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    atLineStart(/'.*/.source, 'comment'),
    { regex: /\s+/, token: null },
    { regex: /\S+/, token: 'SpriteData' },
  ],
  // An svg sprite, down to the line that ends with `</svg>`.
  spriteSvg: [
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    { regex: /\s+/, token: null },
    { regex: /<\/svg>/, token: 'tagName', next: 'start' },
    { regex: /<\/?[\w:-]+|\/?>/, token: 'tagName' },
    ...attributes(/(?=\s|\/?>|$)/.source),
  ],
}

/**
 * A rule that, at the start of a line, takes nothing and moves on (`{ next }` or `{ pop: true }`):
 * the first rule of a state that ends with its line by itself, with nothing in a table's
 * `nextLine` or `lineStates` (`table` retries the line in the state it moved to).
 */
export const atNextLine = (move) => ({ regex: /(?=)/, sol: true, token: null, ...move })

// A line of the common commands, in any case as PlantUML reads them: indentation plain, the
// command a keyword, the rest of the line read by `next`.
const command = (pattern, next) => ({ regex: new RegExp(`([ \\t]*)(${pattern})`, 'i'), sol: true, token: [null, 'keyword'], next })

// What follows a `skinparam`, `scale`, `hide` or `show`, or a one-line legend: colours, strings and numbers.
const commonArgs = [
  atNextLine({ next: 'start' }),
  ...colours,
  string,
  number,
  { regex: /\w+/, token: null },
]

// The ends of the common bodies, which a `<latex>` block left open in one ends with.
const commonEnd = /end[ \t]*(?:legend|title|header|footer)\b/i
// The names `common` gives the states Creole pushes.
const COMMON_STATES = { tagAttrs: 'commonTagAttrs', tagBraces: 'commonTagBraces', math: 'commonMath', latex: 'commonLatex', latexBlock: 'commonLatexBlock' }
// The state of a common body: `commonTitle`, its `<code>` blocks `commonTitleCode`.
const bodyOf = (word) => `common${word[0].toUpperCase()}${word.slice(1)}`

/**
 * The lines of PlantUML's common commands (G4), for a profile's table: `{ rules, states }`, the
 * rules for its `start` and the states they move to, which end with their line or body by
 * themselves and come back to `start`: spread them into `table()`. With `all`: `header`,
 * `footer`, `caption` and `mainframe` with their text as Creole (H8), `header` and `footer`
 * alone on their line a body down to `end header` or `end footer`; `skinparam`, `scale`, `hide`
 * and `show` with their words (colours, strings, numbers); `left to right direction` and `top to
 * bottom direction`; `legend` a body down to `end legend` (`'block'`), a keyword line (`'line'`,
 * chart's `legend <position>`), or none (`false`). With `title`, `title` read as `header` is,
 * alone (`{ all: false, title: true }` is hcl's). All in any case. The states Creole pushes are
 * here too, under names of their own so a grammar's never collide (`commonTagAttrs`,
 * `commonTagBraces`, `commonMath`, `commonLatex`, `commonLatexBlock`), ending with their line or
 * block: an inline formula and a `<latex>` block plain. With `direction` false (wbs, which
 * registers no `CommandRankDir`), no direction line.
 *
 * @param {object} [options]
 * @param {'block'|'line'|false} [options.legend]
 * @param {boolean} [options.title]
 * @param {boolean} [options.all]
 * @param {boolean} [options.direction]
 * @return {{ rules: object[], states: Record<string, object[]> }}
 */
export function common({ legend = 'block', title = true, all = true, direction = true } = {}) {
  const own = [...(title ? ['title'] : []), ...(all ? ['header', 'footer'] : [])]
  const text = [...own, ...(all ? ['caption', 'mainframe'] : [])]
  const rules = [
    ...own.map((word) => command(`${word}(?=[ \\t]*$)`, bodyOf(word))),
    ...(text.length ? [command(`(?:${text.join('|')})(?=\\s)`, 'commonText')] : []),
  ]
  if (all) {
    if (legend === 'block') rules.push(command(/legend\b/.source, 'commonLegendHead'))
    if (legend === 'line') rules.push(command(/legend\b/.source, 'commonArgs'))
    rules.push(command(/(?:skinparam|scale|hide|show)(?=\s|$)/.source, 'commonArgs'))
    if (direction) rules.push(command(/(?:left[ \t]+to[ \t]+right|top[ \t]+to[ \t]+bottom)[ \t]+direction\b/.source, 'commonArgs'))
  }
  const bodies = ['title', 'header', 'footer', 'legend'].map((word) => body(bodyOf(word), new RegExp(`end[ \\t]*${word}\\b`, 'i')))
  // Every push of one goes to its `COMMON_STATES` name.
  const ownState = (rule) => (Object.hasOwn(COMMON_STATES, rule.push ?? '') ? { ...rule, push: COMMON_STATES[rule.push] } : rule)
  // A pushed state that ends with its line pops back to the one it was pushed from.
  const ending = (rules) => [atNextLine({ pop: true }), ...rules]
  const states = {
    commonText: [atNextLine({ next: 'start' }), ...creole(null)],
    commonArgs,
    // The rest of a legend's line (`legend top left`), then its body.
    commonLegendHead: [atNextLine({ next: bodyOf('legend') }), ...commonArgs.slice(1)],
    ...Object.assign({}, ...bodies),
    tagAttrs: ending(creoleStates.states.tagAttrs),
    tagBraces: ending(creoleStates.states.tagBraces),
    math: creoleStates.states.math,
    latex: creoleStates.states.latex,
    latexBlock: [
      { regex: /<\/latex>$/, sol: true, token: 'tagName', pop: true },
      { regex: new RegExp(`(?=[ \\t]*${commonEnd.source})`, 'i'), sol: true, token: null, pop: true },
      { regex: /.+/, token: null },
    ],
  }
  return {
    rules,
    states: Object.fromEntries(Object.entries(states).map(([key, list]) => [COMMON_STATES[key] ?? key, list.map(ownState)])),
  }
}

/** A setting line of a math or latex block, from its start: `color`, `backgroundcolor`, `scale` or `dpi` and a space. */
export const settingLine = /^[ \t]*(?:(?:background)?color|scale|dpi)[ \t]/i

/**
 * A setting line's next token, in the math and latex profiles (`color red`, `scale 2`): its
 * keyword, then a colour or a number as `state.value` says (`'keyword'`, `'colour'`, `'number'`),
 * the rest plain (`'rest'`).
 *
 * @param {import('@codemirror/language').StringStream} stream
 * @param {{value: string|null}} state
 * @return {string|null}
 */
export function setting(stream, state) {
  if (state.value === 'keyword') {
    stream.match(/\w+/)
    state.value = /color$/i.test(stream.current()) ? 'colour' : 'number'
    return 'keyword'
  }
  if (state.value === 'colour' && stream.match(/#?\w+/)) {
    state.value = 'rest'
    return 'ColorLiteral'
  }
  if (state.value === 'number' && stream.match(/\d+(?:\.\d+)?(?!\w)/)) {
    state.value = 'rest'
    return 'number'
  }
  stream.match(/\S+/)
  state.value = 'rest'
  return null
}

export { startName, startCall } from './start.js'

const startLead = /^([ \t]*)(@start[^\s{}"“”(]+)/

/** The pieces of a string made of spaces, quotes and braces, each as `[text, token]`. */
function wrapping(text) {
  return [...text].map((char) => [char, char === '{' || char === '}' ? 'brace' : /\s/.test(char) ? null : 'punctuation'])
}

// The arguments in parentheses after the type are read by the rules of `args` (R2), run here
// without a stack: a paren is a paren whether it pushes or pops. Each is `[text, token]`.
const argRules = argsState.map((rule) => ({ ...rule, regex: new RegExp(rule.regex.source, 'y') }))

function readArgs(args) {
  const parts = [['(', 'paren']]
  for (let pos = 0; pos < args.length;) {
    let found = false
    for (const { regex, token } of argRules) {
      regex.lastIndex = pos
      const match = regex.exec(args)
      if (!match || !match[0]) continue
      if (Array.isArray(token)) token.forEach((one, i) => match[i + 1] && parts.push([match[i + 1], one]))
      else parts.push([match[0], token])
      pos += match[0].length
      found = true
      break
    }
    if (!found) parts.push([args[pos++], null])
  }
  return parts
}

/**
 * Reads the `@start<type>` line `stream` stands at the start of, and returns the first piece's
 * token with the rest in `state.pending` (simple-mode's own way): the type a `keyword`, or a
 * `FunctionName` with `(…)` straight after it, then the arguments, then the diagram's name
 * (`DiagramName`; with `url` too when it is a `file://` path). Null, the stream left alone, when
 * the line is no `@start` line.
 *
 * @param {import('@codemirror/language').StringStream} stream
 * @param {{pending: object[]|null}} state
 * @return {string|null}
 */
export function startLine(stream, state) {
  const line = stream.string.slice(stream.pos)
  const lead = startLead.exec(line)
  if (!lead) return null
  let rest = line.slice(lead[0].length)
  const call = startCall.exec(rest)
  const parts = [[lead[1], null], [lead[2], call ? 'FunctionName' : 'keyword']]
  if (call) {
    parts.push(...readArgs(call[1]), [')', 'paren'])
    rest = rest.slice(call[0].length)
  }
  const name = startName(rest)
  if (name) {
    parts.push(...wrapping(name[1]))
    if (name[2]) parts.push([name[2], name[2].startsWith('file://') ? 'DiagramName url' : 'DiagramName'])
    parts.push(...wrapping(name[3]))
  } else {
    parts.push([rest, null])
  }
  const [[text, token], ...others] = parts.filter(([part]) => part)
  stream.pos += text.length
  state.pending = others.length ? others.map(([part, style]) => ({ text: part, token: style })) : null
  return token
}

/**
 * An inline attribute list's state (Y8), `[k = v, …]` as blockdiag's diagrams have it: the rules
 * a profile pushes on its `[` and that pop on the `]`. A key is an `attributeName`, `=` a
 * `definitionOperator`, a quoted value a `string`, `,` a `separator`; any other word is plain.
 * `extra` rules (a key's own value: a colour, a number, a value word) are tried first. The state
 * ends with its line: list it in the table's `lineStates`.
 */
export const attributeList = (extra = []) => [
  ...extra,
  { regex: /\]/, token: 'squareBracket', pop: true },
  { regex: /[A-Za-z_]\w*(?=\s*=)/, token: 'attributeName' },
  { regex: /=/, token: 'definitionOperator' },
  string,
  comma,
  { regex: /[^\s,\]="]+/, token: null },
  { regex: /./, token: null },
]

/**
 * A string whose `escape` (a backslash and the next character by default) is an `escape`, as DOT
 * and HCL have it: `rules` for where a string starts, a closed one whole and an open one pushing
 * the state `escapedString`, which pops at its closing quote. Spread `states` into the table and
 * list `escapedString` in its `lineStates`: an unfinished string ends with its line.
 *
 * @param {RegExp} [escape]
 * @return {{ rules: object[], states: { escapedString: object[] } }}
 */
export const escapedString = (escape = /\\./) => ({
  rules: [
    { regex: /"[^"\\]*"/, token: 'string' },
    { regex: /"/, token: 'string', push: 'escapedString' },
  ],
  states: {
    escapedString: [
      { regex: escape, token: 'escape' },
      { regex: /[^"\\]+/, token: 'string' },
      { regex: /"/, token: 'string', pop: true },
    ],
  },
})

/**
 * A quoted colour (C6): `source`, three groups, the quotes and between them `colour` (a regex
 * source; by default a hex or a name, its `#` optional), and their `token`s, the quotes strings
 * and the colour a `ColorLiteral`. A rule puts its own groups before it (a key, its `=`).
 *
 * @param {string} [colour]
 * @return {{ source: string, token: string[] }}
 */
export const quotedColour = (colour = `#?${colourPart}`) => ({
  source: `(")(${colour})(")`,
  token: ['string', 'ColorLiteral', 'string'],
})
