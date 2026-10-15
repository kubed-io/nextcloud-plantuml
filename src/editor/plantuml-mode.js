/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML for CodeMirror 6, as a simple-mode rule table. The rules are ported
 * from Prism's `plant-uml` grammar (components/prism-plant-uml.js at v1.30.0,
 * MIT, Copyright (c) 2012 Lea Verou): its comments, preprocessor lines,
 * @start/@enduml, arrows, strings and keywords. Its times and punctuation are
 * left plain. Added here: a `!` line's parts, the preprocessor's names on every
 * line (`$variable`, `$procedure(`, `%builtin(`), headless links (`--`, `..`,
 * `~~`, `==`), bodies of `=` and `~`, a link's label, separator lines, colours (hex,
 * named, gradients and automatic: each a `ColorLiteral`, the node the colour
 * swatches look for), and Creole in labels, notes, legends, `[ … ]`
 * descriptions and titles.
 *
 * Prism anchors several rules to the start of a line after any indentation,
 * which a stream mode cannot look back for. Those rules match at the start of
 * the line instead and capture the indentation as a group of its own, so only
 * the word is coloured.
 *
 * `plantumlLanguage(inner)` nests other stream modes: between `@start<type>`
 * and the next line starting `@end`, a type with a mode in `inner` is read by
 * that mode, except for `'` and `/' … '/` comments and `!` preprocessor lines. A `<style>`
 * block is a region of its own wherever it starts a line, read by
 * `inner.style` or else left plain, the middle of an inline `<math>…</math>` in Creole is read by
 * `inner.math` or else left plain, and likewise `<latex>…</latex>` by `inner.latex` and the lines
 * of a Creole body between a line `<latex>` and a line `</latex>`, and a `@startcreole` block is Creole and a `@startfiles` block
 * is paths and `<note>` bodies.
 */
import { StreamLanguage } from '@codemirror/language'
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'
import { Tag, tags } from '@lezer/highlight'

const arrowAttr = /\[[^[\]]*\]/.source
const arrowDirection = /(?:[drlu]|do|down|le|left|ri|right|up)/.source
const arrowBody = `(?:-+${arrowDirection}-+|\\.+${arrowDirection}\\.+|-+(?:${arrowAttr}-*)?|${arrowAttr}-+|\\.+(?:${arrowAttr}\\.*)?|${arrowAttr}\\.+|=+|~+)`
// A line without a head: two or more of one stroke, or a placed or styled one.
const headless = `(?:-{2,}|\\.{2,}|={2,}|~{2,}|-+${arrowDirection}-+|\\.+${arrowDirection}\\.+|-+${arrowAttr}-+|\\.+${arrowAttr}\\.+)`
const arrowLeft = /(?:<{1,2}|\/{1,2}|\\{1,2}|<\||[#*^+}xo])/.source
const arrowRight = /(?:>{1,2}|\/{1,2}|\\{1,2}|\|>|[#*^+{xo])/.source
const arrowPrefix = /[[?]?[ox]?/.source
const arrowSuffix = /[ox]?[\]?]?/.source
// Prism's lookbehind is dropped: words are consumed whole below, so an arrow
// is only ever tried where a token starts. An o or x head must not run into a
// word, or `.org` in a URL would be a dotted arrow with an o head.
const arrowEnd = /(?![-.=~<>?|\\\]ox])(?:(?<=[ox])(?!\w)|(?<![ox]))/.source
export const arrow = new RegExp(`${arrowPrefix}(?:${arrowBody}${arrowRight}|${arrowLeft}${arrowBody}(?:${arrowRight})?|${headless})${arrowSuffix}${arrowEnd}`)

// A styled link (`-[#FF6F61,bold]->`) is the same shape with the bracket made
// compulsory. It is read in pieces, so a colour in it is a node of its own.
const styledBody = `(?:-+${arrowAttr}-*|${arrowAttr}-+|\\.+${arrowAttr}\\.*|${arrowAttr}\\.+)`
const styledHeadless = `(?:-+${arrowAttr}-+|\\.+${arrowAttr}\\.+)`
const styled = `${arrowPrefix}(?:${styledBody}${arrowRight}|${arrowLeft}${styledBody}(?:${arrowRight})?|${styledHeadless})${arrowSuffix}${arrowEnd}`
const styledOpen = new RegExp(`(?=${styled})${arrowPrefix}(?:${arrowLeft})?(?:-+|\\.+)?\\[`)
const styledClose = new RegExp(`\\](?:-+|\\.+)?(?:${arrowRight})?${arrowSuffix}${arrowEnd}`)

// #RGB, #RGBA, #RRGGBB or #RRGGBBAA.
const hexDigits = /(?:[\dA-Fa-f]{8}|[\dA-Fa-f]{6}|[\dA-Fa-f]{3,4})(?!\w)/.source
const hex = new RegExp(`#${hexDigits}`)
// A colour's name is a word, never all hex digits (`#ABCDE` is a broken hex);
// a style part (`#line:red`, `#line.dashed`) is a word with `:` or `.` after it.
const colourName = /(?![\dA-Fa-f]+(?!\w))[A-Za-z]\w*/.source
const colourPart = `(?:${hexDigits}|${colourName})`
const notStylePart = /(?![\w.:])/.source
const named = new RegExp(`#${colourName}${notStylePart}`)

/**
 * Colours where one goes: gradients (`#Red/Yellow`, `|`, `-`, `\`, the second
 * part without its `#`), the automatic text colour (`#?black:white`), a hex
 * and a name; each part a `ColorLiteral`.
 */
const colours = [
  { regex: new RegExp(`(#${colourPart})([/|\\\\-])(${colourPart})${notStylePart}`), token: ['ColorLiteral', 'punctuation', 'ColorLiteral'] },
  { regex: new RegExp(`(#\\?)(${colourPart})(:)(${colourPart})${notStylePart}`), token: ['punctuation', 'ColorLiteral', 'punctuation', 'ColorLiteral'] },
  { regex: hex, token: 'ColorLiteral' },
  { regex: named, token: 'ColorLiteral' },
]

// `== Section ==`, and a delay: `...` alone or `... 5 minutes later ...`.
const separator = /={2,}[^=].*?={2,}\s*$|\.{3,}(?:.*?\.{3,})?\s*$/.source

const lineKeywords = /abstract\s+class|end\s+(?:box|fork|group|merge|note|ref|split|title)|(?:fork|split)(?:\s+again)?|activate|actor|agent|alt|annotation|artifact|autoactivate|autonumber|backward|binary|boundary|box|break|caption|card|case|circle|class|clock|cloud|collections|component|concise|control|create|critical|database|deactivate|destroy|detach|diamond|else|elseif|end|end[hr]note|endif|endswitch|endwhile|entity|enum|file|folder|footer|frame|group|[hr]?note|header|hexagon|hide|if|interface|label|legend|loop|map|namespace|network|newpage|node|nwdiag|object|opt|package|page|par|participant|person|queue|rectangle|ref|remove|repeat|restore|return|robust|scale|set|show|skinparam|stack|start|state|stop|storage|switch|title|together|usecase|usecase\/|while/.source

/** A rule for the start of a line: indentation plain, the rest as `token`. */
const atLineStart = (pattern, token, extra = {}) => ({
  regex: new RegExp(`([ \\t]*)(${pattern})`),
  sol: true,
  token: [null, token],
  ...extra,
})

/**
 * The preprocessor's names, on any line (X7): a function's name before its `(`, where it is
 * declared or called (`$ask(`) and a built-in (`%strlen(`), and a variable. `$5` is a price.
 */
const names = [
  { regex: /[$%][A-Za-z_]\w*(?=\()/, token: 'FunctionName' },
  { regex: /\$[A-Za-z_]\w*/, token: 'VariableName' },
]

/** PlantUML's `__underline__`, which no tag in @lezer/highlight names. */
export const underline = Tag.define()

/** A sprite's pixel rows and payloads: data, which no other tag names. */
export const spriteData = Tag.define()

/** A preprocessor variable: its own tag, so a nested mode's `variable` (YAML's `&anchor`) keeps its colour. */
export const variable = Tag.define(tags.variableName)

/**
 * Creole, in any text. Runs of plain text are `base`, and so are bold, italic,
 * monospace and underline, as modifiers on it. `--strike--` and `~~wave~~` are
 * Creole too, but are left as text: they read as the links `--` and `~~`.
 */
function creole(base) {
  const on = (style) => (base ? `${style} ${base}` : style)
  return [
    { regex: /\[\[[^\]]*\]\]/, token: 'link' },
    // `~~` is a wave, left as text; `~` before any other character escapes it.
    { regex: /~~/, token: base },
    { regex: /(~)([^~])/, token: ['punctuation', base] },
    // A URL's `//` starts no italics.
    { regex: /[a-z][\w+.-]*:\/\/[^\s\]]*/i, token: base },
    { regex: /\*\*.+?\*\*/, token: on('strong') },
    { regex: /\/\/.+?\/\//, token: on('emphasis') },
    { regex: /"".+?""/, token: on('monospace') },
    { regex: /__.+?__/, token: on('underline') },
    // An inline formula, PlantUML's `<math>(.+?)</math>` on one line: its middle is the
    // state `math`'s, see `inlineMiddle`.
    { regex: /<math>(?=.+?<\/math>)/, token: 'tagName', push: 'math' },
    { regex: /<latex>(?=.+?<\/latex>)/, token: 'tagName', push: 'latex' },
    // A tag's parts (H10): its name and `>` are tags, `:`, `{`, `,` and `}` punctuation, an
    // attribute's name an attribute and its value a string, or a colour.
    { regex: new RegExp(`(<(?:color|back|u|s|w))(:)(#?${colourPart})(>)`), token: ['tagName', 'punctuation', 'ColorLiteral', 'tagName'] },
    { regex: /(<(?:size|color|back|font|u|s|w|space|img|qrcode))(:)([^>{}]+)(>)/, token: ['tagName', 'punctuation', 'string', 'tagName'] },
    { regex: /(<(?:img|qrcode))(:)([^>{}]+)(\{)/, token: ['tagName', 'punctuation', 'string', 'punctuation'], push: 'tagBraces' },
    { regex: /(<&[^>\s{}]+|<:[^>\s{}]+:|<\$[^>\s{}]+)(\{)/, token: ['tagName', 'punctuation'], push: 'tagBraces' },
    { regex: /<(?:font|img|text)(?=\s)/, token: 'tagName', push: 'tagAttrs' },
    // A table row or cell colour (`<#lightblue,#red>`) and a coloured emoji (`<#green:sunny:>`).
    { regex: new RegExp(`(<)(#${colourPart})(?:(,)(#${colourPart}))?(:[^>\\s]+:)?(>)`), token: ['tagName', 'ColorLiteral', 'tagName', 'ColorLiteral', 'tagName', 'tagName'] },
    { regex: /<\/?(?:b|i|u|s|w|r|code|plain|sub|sup|size|font|color|back)(?:[:\s][^>]*)?>/, token: 'tagName' },
    // An OpenIconic icon, an emoji, an image, a Unicode character.
    { regex: /<(?:&[^>\s]+|:[^>\s]+:|\$[^>\s]+|U\+[\dA-Fa-f]+)>|&#(?:\d+|x[\dA-Fa-f]+);/, token: 'tagName' },
    ...names,
    { regex: /\|=?/, token: 'punctuation' },
    { regex: /\w+|[^\w[*/"<|~&$%]+/, token: base },
    { regex: /./, token: base },
  ]
}

/** The pieces of `name=value`, as they stand in a tag; `end` is what may follow a value. */
const attributes = (end) => [
  { regex: new RegExp(`(color)(\\s*)(=)(\\s*)(#?${colourPart})${end}`), token: ['attributeName', null, 'punctuation', null, 'ColorLiteral'] },
  // A quoted colour keeps its swatch (C6), its quotes a string.
  { regex: new RegExp(`(color)(\\s*)(=)(\\s*)(["'])(#?${colourPart})(\\5)`), token: ['attributeName', null, 'punctuation', null, 'string', 'ColorLiteral', 'string'] },
  { regex: /[\w-]+(?=\s*=)/, token: 'attributeName' },
  { regex: /=/, token: 'punctuation' },
  { regex: /"[^"]*"|'[^']*'/, token: 'string' },
  { regex: /[^\s>"',}]+/, token: 'string' },
  { regex: /./, token: null },
]

/**
 * What Creole reads at the start of a line in a body, not in a one-line label (where a `#` is
 * a colour): rules, headings, list items and tree lines; `<code>` opens the state `code`.
 */
const lines = (code) => [
  atLineStart(/(?:-{4,}|\.{4,}|={4,}|_{4,})(?=\s*$)/.source, 'heading'),
  // No group in these: a rule's groups are its tokens.
  atLineStart(/(?:\.\..+\.\.|==.+==|--.+--)\s*$/.source, 'heading'),
  atLineStart(/={1,3}[ \t].*/.source, 'heading'),
  atLineStart(/(?:\*{1,2}|#{1,2})(?=[ \t])/.source, 'punctuation'),
  atLineStart(/\|_/.source, 'punctuation'),
  atLineStart(/<code>(?=\s*$)/.source, 'tagName', { next: code }),
  // A formula over several lines: exactly `<latex>`, down to a line that is exactly `</latex>`.
  { regex: /<latex>$/, sol: true, token: 'tagName', push: 'latexBlock' },
]

/** The lines of a `<code>` block: monospace down to `</code>`, or to the end of the body. */
const codeLines = (closer, back) => [
  atLineStart(/<\/code>(?=\s*$)/.source, 'tagName', { next: back }),
  ...(closer ? [atLineStart(closer, 'keyword', { next: 'start' })] : []),
  { regex: /.+/, token: 'monospace' },
]

/** Creole on the lines down to `closer`, and the state `key`Code for its `<code>` blocks. */
const body = (key, closer, token = 'keyword') => ({
  [key]: [
    atLineStart(closer, token, { next: 'start' }),
    ...lines(`${key}Code`),
    ...creole(null),
  ],
  [`${key}Code`]: codeLines(closer, key),
})

/** The rest of a line whose text starts on the next one: `note left of A #pink`. */
const head = [
  ...colours,
  ...names,
  { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
  { regex: /\w+/, token: null },
]

/** The rest of a line up to the colon that starts its text, read by the state `next`. */
const toColon = (next) => [
  { regex: /\s*:\s*/, token: null, next },
  ...names,
  { regex: /[^:$%]+/, token: null },
]

const base = simpleMode({
  start: [
    atLineStart(/\/'.*?'\//.source, 'comment'),
    atLineStart(/\/'.*/.source, 'comment', { next: 'blockComment' }),
    atLineStart(/'.*/.source, 'comment'),
    // A `!` line: its directive word (`!procedure`, the `!` of `!$x`), then the state
    // `preprocessor` to the line's end.
    { regex: /([ \t]*)(!include\w*)(\s+)(<[^>\s]+>)/, sol: true, token: [null, 'meta', null, 'link'], next: 'preprocessor' },
    atLineStart(/!\w*/.source, 'meta', { next: 'preprocessor' }),
    atLineStart(/@startcreole\b/.source, 'keyword', { next: 'creoleHead' }),
    atLineStart(/@startfiles\b/.source, 'keyword', { next: 'filesHead' }),
    atLineStart(/@(?:end|start)\w+\b/.source, 'keyword'),
    atLineStart(separator, 'heading'),
    // A note's text follows a colon on its own line, or else fills the lines
    // down to `end note`. A quoted note (`note "x" as N`) is neither.
    atLineStart(/[hr]?note\b(?=[^:"]*:)/.source, 'keyword', { next: 'noteLine' }),
    atLineStart(/[hr]?note(?=(?:\s[^:"]*)?$)/.source, 'keyword', { next: 'noteHead' }),
    atLineStart(/legend\b/.source, 'keyword', { next: 'legendHead' }),
    ...['title', 'header', 'footer'].map((word) => atLineStart(`${word}(?=\\s*$)`, 'keyword', { next: `${word}Body` })),
    atLineStart(/(?:title|header|footer|caption)(?=\s)/.source, 'keyword', { next: 'text' }),
    atLineStart(`(?:${lineKeywords})(?=\\s|$)`, 'keyword'),
    // `#highlight` and the like start a line; a colour never does, but a hex keeps its picker.
    atLineStart(`#(?![\\dA-Fa-f]+(?!\\w))\\w+`, null),
    // A sprite definition (T16): its header is read by `spriteHead`, its pixel rows by `spriteRows`.
    { regex: /([ \t]*)(sprite)(\s+)(\$?[-.%\w]+)/, sol: true, token: [null, 'keyword', null, 'VariableName'], next: 'spriteHead' },
    atLineStart(/listsprites?\b/.source, 'keyword'),
    { regex: /"[^"]*"/, token: 'string' },
    { regex: /\[\[[^\]]*\]\]/, token: 'link' },
    { regex: styledOpen, token: 'operator', next: 'arrowAttr' },
    { regex: arrow, token: 'operator', next: 'afterLink' },
    // Gantt: `[Task] is colored in White/Red`, a fill and a line.
    { regex: new RegExp(`\\b(is)(\\s+colou?red\\s+in\\s+)(#?${colourPart})(?:(/)(#?${colourPart}))?${notStylePart}`), token: ['keyword', null, 'ColorLiteral', 'punctuation', 'ColorLiteral'] },
    ...colours,
    // `node web [` opens a description that runs to a line starting with `]`.
    { regex: /\[(?=\s*$)/, token: null, next: 'descBody' },
    { regex: /\b(?:elseif|equals|not|while)(?=\s*\()/, token: 'keyword' },
    { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
    // A sprite used as an element's icon (`rectangle <$foo> as r`).
    { regex: /<\$[^>\s]+>/, token: 'tagName' },
    ...names,
    { regex: /\w+/, token: null },
  ],
  // The rest of a `!` line; it ends with its line, see `token`.
  preprocessor: [
    { regex: /"[^"]*"|'[^']*'/, token: 'string' },
    ...names,
    { regex: /\d+(?:\.\d+)?(?!\w)/, token: 'number' },
    { regex: /[(),]|[=!<>?]=|&&|\|\||[=<>]/, token: 'punctuation' },
    { regex: /\w+/, token: null },
  ],
  blockComment: [
    { regex: /.*?'\//, token: 'comment', next: 'start' },
    { regex: /.+/, token: 'comment' },
  ],
  // Inside a styled link's brackets.
  arrowAttr: [
    { regex: styledClose, token: 'operator', next: 'afterLink' },
    { regex: hex, token: 'ColorLiteral' },
    { regex: named, token: 'ColorLiteral' },
    { regex: /[^,\]\s][^,\]]*/, token: 'attributeName' },
  ],
  // The far end of a link is plain but for its names; a colon starts its label. A note's
  // colon starts its text.
  afterLink: toColon('label'),
  noteLine: toColon('text'),
  // A tag's attributes (`<font size=12 color=red>`), and an icon's (`<&star{scale=2}>`): both
  // end with their line, see `tagStates`.
  tagAttrs: [
    { regex: /\s+/, token: null },
    { regex: /\/?>/, token: 'tagName', pop: true },
    ...attributes(/(?=\s|\/?>|$)/.source),
  ],
  tagBraces: [
    { regex: /\s+/, token: null },
    { regex: /(\})(>)/, token: ['punctuation', 'tagName'], pop: true },
    { regex: /\}/, token: 'punctuation', pop: true },
    { regex: /,/, token: 'punctuation' },
    ...attributes(/(?=[\s,}>]|$)/.source),
  ],
  // The sprite states are written out again in profiles/sprites.js (a profile imports no core
  // module): change one, change the other.
  // The rest of a sprite's header: its size, then a `{` that ends the line and opens
  // the rows, or a payload, or an svg. Ends with its line, see `nextLine`.
  spriteHead: [
    { regex: /\s+/, token: null },
    { regex: /(\[)(\d+)(x)(\d+)(\/)(\d+)(z)?(\])/, token: ['punctuation', 'number', 'punctuation', 'number', 'punctuation', 'number', 'keyword', 'punctuation'] },
    { regex: /(\[)(\d+)(x)(\d+)(\/)(color)(\])/, token: ['punctuation', 'number', 'punctuation', 'number', 'punctuation', 'keyword', 'punctuation'] },
    { regex: /\{(?=\s*$)/, token: 'punctuation', next: 'spriteRows' },
    { regex: /<svg(?=[\s>])/, token: 'tagName', next: 'spriteSvg' },
    { regex: /data:[^,\s]*,/, token: 'attributeName' },
    { regex: /\S+/, token: 'SpriteData' },
  ],
  // Pixel rows are data, down to the closing `}` or `end sprite`.
  spriteRows: [
    atLineStart(/\}/.source, 'punctuation', { next: 'start' }),
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
  label: creole('labelName'),
  text: creole(null),
  // Read by the language's token (`inlineMiddle`, `latexBody`); simple-mode wants the state to exist.
  math: [],
  latex: [],
  latexBlock: [],
  noteHead: head,
  legendHead: head,
  ...body('noteBody', /end\s*[hr]?note\b/.source),
  ...body('legendBody', /end\s*legend\b/.source),
  ...body('titleBody', /end\s*title\b/.source),
  ...body('headerBody', /end\s*header\b/.source),
  ...body('footerBody', /end\s*footer\b/.source),
  ...body('descBody', /\]/.source, null),
  // A creole diagram is Creole on every line, from the line after its start.
  creoleHead: [{ regex: /.+/, token: null }],
  ...body('creoleBody', /@end\w*/.source),
  // A files diagram is a path on each line, and `<note>` bodies of Creole.
  filesHead: [{ regex: /.+/, token: null }],
  filesBody: [
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    atLineStart(/<note>(?=\s*$)/.source, 'tagName', { next: 'filesNote' }),
    { regex: /\//, token: 'punctuation' },
    ...creole(null),
  ],
  filesNote: [
    atLineStart(/<\/note>(?=\s*$)/.source, 'tagName', { next: 'filesBody' }),
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    ...lines('filesNoteCode'),
    ...creole(null),
  ],
  // An unclosed `<code>` ends with its note.
  filesNoteCode: [atLineStart(/<\/note>(?=\s*$)/.source, 'tagName', { next: 'filesBody' }), ...codeLines(/@end\w*/.source, 'filesNote')],
  languageData: {
    name: 'plantuml',
    commentTokens: { line: "'", block: { open: "/'", close: "'/" } },
    // `'` starts a comment, so it is never paired.
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
  },
})

// The states that end with their line, and the state the next line starts in.
// Without this a label or a styled link left open would run on into it.
// A tag's attributes end with their line too; the state they were pushed from is popped.
const tagStates = ['tagAttrs', 'tagBraces']
const nextLine = { afterLink: 'start', arrowAttr: 'start', noteLine: 'start', label: 'start', text: 'start', noteHead: 'noteBody', spriteHead: 'start', legendHead: 'legendBody', creoleHead: 'creoleBody', filesHead: 'filesBody' }

// PlantUML's own style lines: a block opens on a line that is `<style>` and
// closes on one that is `</style>`; a one-line block (its middle read as a
// block's body) and an imported sheet (`<style file=…>`) are a line each.
const styleOpen = /^([ \t]*)(<style>)(\s*)$/
const styleOneLine = /^([ \t]*)(<style>)(.*)<\/style>\s*$/
const styleImport = /^([ \t]*)(<style)(\s+)([\w-]+)(\s*)(=)(\s*)([^>]*?)(\s*)(>)(\s*)$/
const styleClose = /^([ \t]*)(<\/style>)(\s*)$/

// A `<latex>` block's last line, and the lines that end a Creole body with it unclosed.
const latexClose = /^<\/latex>$/
const bodyEnd = /^[ \t]*(?:end\s*(?:[hr]?note|legend|title|header|footer)\b|@end)/

/**
 * Whether `pos` is in a style block's body, read by the line forms above: a
 * line between `<style>` and `</style>` (or the next `@end`) that is not
 * PlantUML's own `'` or `!` line, or the middle of a one-line block. The core
 * completion sources leave such a place to the style profile's.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 */
export function inStyleBody(state, pos) {
  const line = state.doc.lineAt(pos)
  const one = styleOneLine.exec(line.text)
  if (one) {
    const column = pos - line.from
    const from = one[1].length + one[2].length
    return column >= from && column <= from + one[3].length
  }
  if (styleOpen.test(line.text) || styleClose.test(line.text) || /^[ \t]*(?:['!]|@end)/.test(line.text)) {
    return false
  }
  let open = false
  for (let number = 1; number < line.number; number++) {
    const text = state.doc.line(number).text
    open = open ? !(styleClose.test(text) || /^[ \t]*@end/.test(text)) : styleOpen.test(text)
  }
  return open
}

/** CodeMirror's own copy for a stream mode without copyState: the object, and any array in it. */
const copyOf = (state) => (state && typeof state === 'object'
  ? Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.slice() : value]))
  : state)

/**
 * Hands back `parts` ([text, token] pairs, as they come on the line) one at a
 * time, the way simple-mode hands back a rule's groups.
 */
function emit(stream, state, parts) {
  const [[text, token], ...rest] = parts.filter(([part]) => part)
  stream.pos += text.length
  state.pending = rest.length ? rest.map(([part, style]) => ({ text: part, token: style })) : null
  return token
}

/**
 * PlantUML, with each `@start<type>` … `@end` block of a type in `inner` read
 * by that type's stream mode. A fresh language on every call, so a profile
 * arriving swaps it in a Compartment and the document is read again.
 */
export function plantumlLanguage(inner = {}) {
  const modeOf = (block) => inner[block.type]
  const style = inner.style
  const math = inner.math
  const latex = inner.latex
  const copyIn = (mode, state) => (mode?.copyState ? mode.copyState(state) : copyOf(state))

  /**
   * A `<style>` line at the start of a line, its tags read as tags; undefined
   * for any other line. A one-line block's middle is a body up to `until`, the
   * column of its `</style>`.
   */
  function styleStart(stream, state) {
    const sheet = stream.match(styleImport, false)
    if (sheet) return emit(stream, state, [
      [sheet[1], null], [sheet[2], 'tagName'], [sheet[3], null], [sheet[4], 'attributeName'], [sheet[5], null], [sheet[6], 'punctuation'],
      [sheet[7], null], [sheet[8], 'string'], [sheet[9], null], [sheet[10], 'tagName'], [sheet[11], null],
    ])
    const one = stream.match(styleOneLine, false)
    const open = one || stream.match(styleOpen, false)
    if (!open) return undefined
    state.style = { state: style?.startState ? style.startState(stream.indentUnit) : {}, until: one ? one[1].length + one[2].length + one[3].length : null }
    return emit(stream, state, one ? [[one[1], null], [one[2], 'tagName']] : [[open[1], null], [open[2], 'tagName'], [open[3], null]])
  }

  /** The middle of a one-line block, the mode kept from reading past it; then its `</style>`. */
  function styleMiddle(stream, state) {
    const { until } = state.style
    if (stream.pos >= until) {
      state.style = null
      const close = stream.string.slice(until)
      return emit(stream, state, [['</style>', 'tagName'], [close.slice('</style>'.length), null]])
    }
    if (!style) {
      stream.pos = until
      return null
    }
    const line = stream.string
    stream.string = line.slice(0, until)
    try {
      return style.token(stream, state.style.state)
    } finally {
      stream.string = line
    }
  }

  /**
   * The middle of an inline `<math>…</math>` or `<latex>…</latex>` (`key`), up to its first
   * closer (`until`), read by that mode, kept from reading past it, or else plain; then the
   * closer, back in the Creole it was in.
   */
  function inlineMiddle(stream, state, key, mode) {
    const closer = `</${key}>`
    state[key] ??= { state: mode?.startState ? mode.startState(stream.indentUnit) : {}, until: stream.string.indexOf(closer, stream.pos + 1) }
    const { until } = state[key]
    if (stream.pos >= until) {
      state[key] = null
      state.state = state.stack.pop()
      stream.pos = until + closer.length
      return 'tagName'
    }
    if (!mode) {
      stream.pos = until
      return null
    }
    const line = stream.string
    stream.string = line.slice(0, until)
    try {
      return mode.token(stream, state[key].state)
    } finally {
      stream.string = line
    }
  }

  /**
   * A line of a `<latex>` block, read by the latex mode or else plain, to a line that is
   * `</latex>`; a Creole body's own end leaves it unclosed, to be read as ever.
   */
  function latexBody(stream, state) {
    if (stream.sol()) {
      if (latexClose.test(stream.string)) {
        state.latex = null
        state.state = state.stack.pop()
        return emit(stream, state, [['</latex>', 'tagName']])
      }
      if (bodyEnd.test(stream.string)) {
        state.latex = null
        state.state = state.stack.pop()
        return base.token(stream, state)
      }
    }
    state.latex ??= { state: latex?.startState ? latex.startState(stream.indentUnit) : {}, until: null }
    if (!latex) {
      stream.skipToEnd()
      return null
    }
    return latex.token(stream, state.latex.state)
  }

  /** A line of a style block. PlantUML reads a block to its diagram's end at most. */
  function styleBody(stream, state) {
    if (state.style.until !== null) return styleMiddle(stream, state)
    if (stream.sol()) {
      const close = stream.match(styleClose, false)
      if (close) {
        state.style = null
        return emit(stream, state, [[close[1], null], [close[2], 'tagName'], [close[3], null]])
      }
      if (stream.match(/^[ \t]*@end/, false)) {
        state.style = null
        return null
      }
      if (stream.match(/^[ \t]*['!]/, false)) return base.token(stream, state)
    }
    if (style) return style.token(stream, state.style.state)
    stream.skipToEnd()
    return null
  }

  /**
   * The block's next token, from its mode. After a comment that closed mid-line
   * (`/' a '/ rest`) the mode reads the rest as a line of its own, as PlantUML
   * does with the comment gone, so nothing of its last line carries over.
   */
  function innerToken(stream, block) {
    const mode = modeOf(block)
    block.from ??= stream.pos
    const from = block.from
    if (!from) return mode.token(stream, block.state)
    const line = stream.string
    stream.string = line.slice(from)
    stream.pos -= from
    stream.start -= from
    try {
      return mode.token(stream, block.state)
    } finally {
      stream.string = line
      stream.pos += from
      stream.start += from
    }
  }

  return StreamLanguage.define({
    ...base,
    startState: () => ({ ...base.startState(), inner: null, style: null, math: null, latex: null }),
    copyState(state) {
      const copy = base.copyState(state)
      const block = state.inner
      copy.inner = block && { type: block.type, state: copyIn(modeOf(block), block.state), from: block.from }
      copy.style = state.style && { state: copyIn(style, state.style.state), until: state.style.until }
      copy.math = state.math && { state: copyIn(math, state.math.state), until: state.math.until }
      copy.latex = state.latex && { state: copyIn(latex, state.latex.state), until: state.latex.until }
      return copy
    },
    token(stream, state) {
      // A rule matched at the start of a line hands back its groups one at a
      // time (`pending`), all still at the start: they belong to the state it set.
      if (state.pending) return base.token(stream, state)
      if (state.state === 'math') return inlineMiddle(stream, state, 'math', math)
      if (state.state === 'latex') return inlineMiddle(stream, state, 'latex', latex)
      if (state.state === 'latexBlock') return latexBody(stream, state)
      // A `!` line is PlantUML's to its end, in a nested mode or a style block too.
      if (state.state === 'preprocessor') {
        if (!stream.sol()) return base.token(stream, state)
        state.state = 'start'
      }
      if (state.style) {
        const token = styleBody(stream, state)
        // A block left open ends at `@end`, which is then read as ever.
        if (state.style || stream.pos > stream.start) return token
      }
      if (state.inner) {
        if (stream.sol()) {
          state.inner.from = null
          // The block ends here, a `/' … '/` comment left open with it.
          const end = stream.match(/^([ \t]*)(@end\w*)/, false)
          if (end) {
            state.inner = null
            state.state = 'start'
            return emit(stream, state, [[end[1], null], [end[2], 'keyword']])
          }
        }
        // A `/' … '/` comment is PlantUML's in any diagram, down to its closer, mid-line or not.
        if (state.state === 'blockComment') return base.token(stream, state)
        if (stream.sol()) {
          const tags = styleStart(stream, state)
          if (tags !== undefined) return tags
          // Comment and preprocessor lines are PlantUML's in any diagram.
          if (stream.match(/^[ \t]*(?:['!]|\/')/, false)) return base.token(stream, state)
        }
        return innerToken(stream, state.inner)
      }
      if (stream.sol() && tagStates.includes(state.state)) state.state = state.stack.pop()
      if (stream.sol() && Object.hasOwn(nextLine, state.state)) {
        state.state = nextLine[state.state]
      }
      if (stream.sol() && state.state === 'start') {
        const tags = styleStart(stream, state)
        if (tags !== undefined) return tags
      }
      const start = stream.sol() && state.state === 'start' && stream.match(/^([ \t]*)(@start(\w+))(.*)/, false)
      // `style` names the mode for style blocks, not a diagram type.
      if (start && start[3] !== 'style' && Object.hasOwn(inner, start[3])) {
        const mode = inner[start[3]]
        state.inner = { type: start[3], state: mode.startState ? mode.startState(stream.indentUnit) : {} }
        // The block starts on the next line: the rest of this one is plain.
        return emit(stream, state, [[start[1], null], [start[2], 'keyword'], [start[4], null]])
      }
      return base.token(stream, state)
    },
    blankLine(state, indentUnit) {
      if (state.style) style?.blankLine?.(state.style.state, indentUnit)
      else if (state.inner) modeOf(state.inner).blankLine?.(state.inner.state, indentUnit)
    },
    indent(state, textAfter, context) {
      if (state.style) return style?.indent?.(state.style.state, textAfter, context) ?? null
      if (!state.inner) return base.indent(state, textAfter, context)
      return modeOf(state.inner).indent?.(state.inner.state, textAfter, context) ?? null
    },
    // StreamLanguage names a node after its token, and takes the highlight from
    // here for a name @lezer/highlight has no tag for. The legacy names an inner
    // mode emits (`atom`, `number`, `property`, `def`, `variable-2`, …) map already.
    tokenTable: { SpriteData: spriteData, ColorLiteral: tags.color, StyleNumber: tags.string, VariableName: variable, FunctionName: tags.function(tags.variableName), underline },
  })
}

export const plantumlMode = plantumlLanguage({})
