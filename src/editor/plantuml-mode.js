/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML for CodeMirror 6, as a simple-mode rule table. The rules are ported
 * from Prism's `plant-uml` grammar (components/prism-plant-uml.js at v1.30.0,
 * MIT, Copyright (c) 2012 Lea Verou): its comments, preprocessor lines,
 * @start/@enduml, arrows, strings and keywords. Its times, variables and
 * punctuation are left plain. Added here: headless links (`--`, `..`, `~~`,
 * `==`), bodies of `=` and `~`, a link's label, separator lines, `#hex` colours
 * (named `ColorLiteral`, the node the colour picker looks for), and Creole in
 * labels, notes, legends, `[ … ]` descriptions and titles.
 *
 * Prism anchors several rules to the start of a line after any indentation,
 * which a stream mode cannot look back for. Those rules match at the start of
 * the line instead and capture the indentation as a group of its own, so only
 * the word is coloured.
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

// #RGB, #RGBA, #RRGGBB or #RRGGBBAA. A named colour (`#Red`) or a style part
// (`#line:red`, `#line.dashed`) is never all hex digits.
const hex = /#(?:[\dA-Fa-f]{8}|[\dA-Fa-f]{6}|[\dA-Fa-f]{3,4})(?!\w)/

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

/** PlantUML's `__underline__`, which no tag in @lezer/highlight names. */
export const underline = Tag.define()

/**
 * Creole, in any text. Runs of plain text are `base`, and so are bold, italic,
 * monospace and underline, as modifiers on it. `--strike--` and `~~wave~~` are
 * Creole too, but are left as text: they read as the links `--` and `~~`.
 */
function creole(base) {
  const on = (style) => (base ? `${style} ${base}` : style)
  return [
    { regex: /\[\[[^\]]*\]\]/, token: 'link' },
    // A URL's `//` starts no italics.
    { regex: /[a-z][\w+.-]*:\/\/[^\s\]]*/i, token: base },
    { regex: /\*\*.+?\*\*/, token: on('strong') },
    { regex: /\/\/.+?\/\//, token: on('emphasis') },
    { regex: /"".+?""/, token: on('monospace') },
    { regex: /__.+?__/, token: on('underline') },
    { regex: new RegExp(`(<(?:color|back):)(${hex.source})(>)`), token: ['tagName', 'ColorLiteral', 'tagName'] },
    { regex: /<\/?(?:b|i|u|s|w|plain|sub|sup|size|font|color|back)(?:[:\s][^>]*)?>/, token: 'tagName' },
    // An OpenIconic icon, an emoji, an image.
    { regex: /<(?:&[^>\s]+|:[^>\s]+:|img:[^>]+)>/, token: 'tagName' },
    { regex: /\|=?/, token: 'punctuation' },
    { regex: /\w+|[^\w[*/"<|]+/, token: base },
    { regex: /./, token: base },
  ]
}

/** Creole on the lines down to `closer`, and the rules (`----`, `....`, `====`) between them. */
const body = (closer, token = 'keyword') => [
  atLineStart(closer, token, { next: 'start' }),
  atLineStart(/(?:-{4,}|\.{4,}|={4,})(?=\s*$)/.source, 'heading'),
  ...creole(null),
]

/** The rest of a line whose text starts on the next one: `note left of A #pink`. */
const head = [
  { regex: hex, token: 'ColorLiteral' },
  { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
  { regex: /\w+/, token: null },
]

const base = simpleMode({
  start: [
    atLineStart(/\/'.*?'\//.source, 'comment'),
    atLineStart(/\/'.*/.source, 'comment', { next: 'blockComment' }),
    atLineStart(/'.*/.source, 'comment'),
    atLineStart(/!.*/.source, 'meta'),
    atLineStart(/@(?:end|start)uml\b/.source, 'keyword'),
    atLineStart(separator, 'heading'),
    // A note's text follows a colon on its own line, or else fills the lines
    // down to `end note`. A quoted note (`note "x" as N`) is neither.
    { regex: /([ \t]*)([hr]?note\b)([^:"]*?)(\s*:\s*)/, sol: true, token: [null, 'keyword', null, null], next: 'text' },
    atLineStart(/[hr]?note(?=(?:\s[^:"]*)?$)/.source, 'keyword', { next: 'noteHead' }),
    atLineStart(/legend\b/.source, 'keyword', { next: 'legendHead' }),
    ...['title', 'header', 'footer'].map((word) => atLineStart(`${word}(?=\\s*$)`, 'keyword', { next: `${word}Body` })),
    atLineStart(/(?:title|header|footer|caption)(?=\s)/.source, 'keyword', { next: 'text' }),
    atLineStart(`(?:${lineKeywords})(?=\\s|$)`, 'keyword'),
    { regex: /"[^"]*"/, token: 'string' },
    { regex: /\[\[[^\]]*\]\]/, token: 'link' },
    { regex: styledOpen, token: 'operator', next: 'arrowAttr' },
    { regex: arrow, token: 'operator', next: 'afterLink' },
    { regex: hex, token: 'ColorLiteral' },
    // `node web [` opens a description that runs to a line starting with `]`.
    { regex: /\[(?=\s*$)/, token: null, next: 'descBody' },
    { regex: /\b(?:elseif|equals|not|while)(?=\s*\()/, token: 'keyword' },
    { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
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
    { regex: /[^,\]\s][^,\]]*/, token: 'attributeName' },
  ],
  // The far end of a link is plain; a colon starts its label.
  afterLink: [
    { regex: /\s*:\s*/, token: null, next: 'label' },
    { regex: /[^:]+/, token: null },
  ],
  label: creole('labelName'),
  text: creole(null),
  noteHead: head,
  legendHead: head,
  noteBody: body(/end\s*[hr]?note\b/.source),
  legendBody: body(/end\s*legend\b/.source),
  titleBody: body(/end\s*title\b/.source),
  headerBody: body(/end\s*header\b/.source),
  footerBody: body(/end\s*footer\b/.source),
  descBody: body(/\]/.source, null),
  languageData: {
    name: 'plantuml',
    commentTokens: { line: "'", block: { open: "/'", close: "'/" } },
    // `'` starts a comment, so it is never paired.
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
  },
})

// The states that end with their line, and the state the next line starts in.
// Without this a label or a styled link left open would run on into it.
const nextLine = { afterLink: 'start', arrowAttr: 'start', label: 'start', text: 'start', noteHead: 'noteBody', legendHead: 'legendBody' }

export const plantumlMode = StreamLanguage.define({
  ...base,
  token(stream, state) {
    // A rule matched at the start of a line hands back its groups one at a
    // time (`pending`), all still at the start: they belong to the state it set.
    if (stream.sol() && !state.pending && Object.hasOwn(nextLine, state.state)) {
      state.state = nextLine[state.state]
    }
    return base.token(stream, state)
  },
  // StreamLanguage names a node after its token, and takes the highlight from
  // here for a name @lezer/highlight has no tag for.
  tokenTable: { ColorLiteral: tags.color, underline },
})
