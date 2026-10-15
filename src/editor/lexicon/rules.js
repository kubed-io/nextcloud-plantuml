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

/** A rule for the start of a line: indentation plain, the rest as `token`. */
export const atLineStart = (pattern, token, extra = {}) => ({
  regex: new RegExp(`([ \\t]*)(${pattern})`),
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
    { regex: /\w+|[^\w[*/"<|~&$%]+/, token: base },
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
  { regex: /[\w-]+(?=\s*=)/, token: 'attributeName' },
  { regex: /=/, token: 'definitionOperator' },
  { regex: /"[^"]*"|'[^']*'/, token: 'string' },
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
    { regex: /(\})(>)/, token: ['brace', 'tagName'], pop: true },
    { regex: /\}/, token: 'brace', pop: true },
    { regex: /,/, token: 'separator' },
    ...attributes(/(?=[\s,}>]|$)/.source),
  ],
}

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

/** The lines of a `<code>` block: monospace down to `</code>`, or to the end of the body. */
export const codeLines = (closer, back) => [
  atLineStart(/<\/code>(?=\s*$)/.source, 'tagName', { next: back }),
  ...(closer ? [atLineStart(closer, 'keyword', { next: 'start' })] : []),
  { regex: /.+/, token: 'monospace' },
]

/** Creole on the lines down to `closer`, and the state `key`Code for its `<code>` blocks. */
export const body = (key, closer, token = 'keyword') => ({
  [key]: [
    atLineStart(closer, token, { next: 'start' }),
    ...lines(`${key}Code`),
    ...creole(null),
  ],
  [`${key}Code`]: codeLines(closer, key),
})

/** The rest of a line whose text starts on the next one: `note left of A #pink`. */
export const head = [
  ...colours,
  ...names,
  { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
  { regex: /\w+/, token: null },
]

/** The rest of a line up to the colon that starts its text, read by the state `next`. */
export const toColon = (next) => [
  { regex: /\s*:\s*/, token: null, next },
  ...names,
  { regex: /[^:$%]+/, token: null },
]

/**
 * A sprite definition's states (T16), after `sprite $name`. The sprites profile writes them out
 * again (profiles/sprites.js): change one, change the other.
 */
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
 * A diagram's name, as PlantUML 1.2026.8 reads it (`StartUtils.patternFilename`, B1): the rest of
 * a `@start<type>` line from the space or `{` after the type (and its arguments), with the
 * spaces, quotes and braces around the name split off. Groups: the lead, the name, the tail.
 * The quotes are `"`, `“` and `”`.
 */
export const startName = /^([\s{][\s"“”]*)([^"“”]*?)([\s}"“”]*)$/

/** The arguments in parentheses straight after the type; group 1 is what is between them. */
export const startCall = /^\(([^)]*)\)/

const startLead = /^([ \t]*)(@start[^\s{}"“”(]+)/

/** The pieces of a string made of spaces, quotes and braces, each as `[text, token]`. */
function wrapping(text) {
  return [...text].map((char) => [char, char === '{' || char === '}' ? 'brace' : /\s/.test(char) ? null : 'punctuation'])
}

// The arguments in parentheses after the type (R2's interim reading, Task 9 gives them the shared
// call's): `(` `)` parens, `,` a separator, `id` before `=` an attribute, `=` an assignment, digits.
function callParts(args) {
  const parts = [['(', 'paren']]
  for (const match of args.matchAll(/(\d+)|(,)|(=)|([A-Za-z_]\w*)(?=\s*=)|[A-Za-z_]\w*|[^]/g)) {
    const [text, digits, comma, equals, attribute] = match
    parts.push([text, digits ? 'number' : comma ? 'separator' : equals ? 'definitionOperator' : attribute ? 'attributeName' : null])
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
    parts.push(...callParts(call[1]), [')', 'paren'])
    rest = rest.slice(call[0].length)
  }
  const name = startName.exec(rest)
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
