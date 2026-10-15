/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML for CodeMirror 6, as a simple-mode rule table. The rules are ported
 * from Prism's `plant-uml` grammar (components/prism-plant-uml.js at v1.30.0,
 * MIT, Copyright (c) 2012 Lea Verou): its comments, preprocessor lines,
 * @start/@enduml, arrows, strings and keywords. Its times, variables and
 * punctuation are left plain. Added here: headless links (`--`, `..`, `~~`,
 * `==`), bodies of `=` and `~`, a link's label, separator lines, colours (hex,
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
 * that mode, except for `'` comment and `!` preprocessor lines. A `<style>`
 * block is a region of its own wherever it starts a line, read by
 * `inner.style` or else left plain, and a `@startcreole` block is Creole and a `@startfiles` block
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
    // `~~` is a wave, left as text; `~` before any other character escapes it.
    { regex: /~~/, token: base },
    { regex: /(~)([^~])/, token: ['punctuation', base] },
    // A URL's `//` starts no italics.
    { regex: /[a-z][\w+.-]*:\/\/[^\s\]]*/i, token: base },
    { regex: /\*\*.+?\*\*/, token: on('strong') },
    { regex: /\/\/.+?\/\//, token: on('emphasis') },
    { regex: /"".+?""/, token: on('monospace') },
    { regex: /__.+?__/, token: on('underline') },
    { regex: new RegExp(`(<(?:color|back):)(#${colourPart})(>)`), token: ['tagName', 'ColorLiteral', 'tagName'] },
    // A table row or cell colour (`<#lightblue,#red>`) and a coloured emoji (`<#green:sunny:>`).
    { regex: new RegExp(`(<)(#${colourPart})(?:(,)(#${colourPart}))?(:[^>\\s]+:)?(>)`), token: ['tagName', 'ColorLiteral', 'tagName', 'ColorLiteral', 'tagName', 'tagName'] },
    { regex: /<\/?(?:b|i|u|s|w|r|code|plain|sub|sup|size|font|color|back)(?:[:\s][^>]*)?>/, token: 'tagName' },
    // An OpenIconic icon, an emoji, an image, a Unicode character.
    { regex: /<(?:&[^>\s]+|:[^>\s]+:|img:[^>]+|U\+[\dA-Fa-f]+)>|&#(?:\d+|x[\dA-Fa-f]+);/, token: 'tagName' },
    { regex: /\|=?/, token: 'punctuation' },
    { regex: /\w+|[^\w[*/"<|~&]+/, token: base },
    { regex: /./, token: base },
  ]
}

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
  { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
  { regex: /\w+/, token: null },
]

const base = simpleMode({
  start: [
    atLineStart(/\/'.*?'\//.source, 'comment'),
    atLineStart(/\/'.*/.source, 'comment', { next: 'blockComment' }),
    atLineStart(/'.*/.source, 'comment'),
    atLineStart(/!.*/.source, 'meta'),
    atLineStart(/@startcreole\b/.source, 'keyword', { next: 'creoleHead' }),
    atLineStart(/@startfiles\b/.source, 'keyword', { next: 'filesHead' }),
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
    // `#highlight` and the like start a line; a colour never does, but a hex keeps its picker.
    atLineStart(`#(?![\\dA-Fa-f]+(?!\\w))\\w+`, null),
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
  // The far end of a link is plain; a colon starts its label.
  afterLink: [
    { regex: /\s*:\s*/, token: null, next: 'label' },
    { regex: /[^:]+/, token: null },
  ],
  label: creole('labelName'),
  text: creole(null),
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
const nextLine = { afterLink: 'start', arrowAttr: 'start', label: 'start', text: 'start', noteHead: 'noteBody', legendHead: 'legendBody', creoleHead: 'creoleBody', filesHead: 'filesBody' }

// PlantUML's own style lines: a block opens on a line that is `<style>` and
// closes on one that is `</style>`; a one-line block (its middle read as a
// block's body) and an imported sheet (`<style file=…>`) are a line each.
const styleOpen = /^([ \t]*)(<style>)(\s*)$/
const styleOneLine = /^([ \t]*)(<style>)(.*)<\/style>\s*$/
const styleImport = /^([ \t]*)(<style\s+[\w-]+\s*=[^>]*>)(\s*)$/
const styleClose = /^([ \t]*)(<\/style>)(\s*)$/

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
  const copyIn = (mode, state) => (mode?.copyState ? mode.copyState(state) : copyOf(state))

  /**
   * A `<style>` line at the start of a line, its tags read as tags; undefined
   * for any other line. A one-line block's middle is a body up to `until`, the
   * column of its `</style>`.
   */
  function styleStart(stream, state) {
    const sheet = stream.match(styleImport, false)
    if (sheet) return emit(stream, state, [[sheet[1], null], [sheet[2], 'tagName'], [sheet[3], null]])
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

  return StreamLanguage.define({
    ...base,
    startState: () => ({ ...base.startState(), inner: null, style: null }),
    copyState(state) {
      const copy = base.copyState(state)
      const block = state.inner
      copy.inner = block && { type: block.type, state: copyIn(modeOf(block), block.state) }
      copy.style = state.style && { state: copyIn(style, state.style.state), until: state.style.until }
      return copy
    },
    token(stream, state) {
      // A rule matched at the start of a line hands back its groups one at a
      // time (`pending`), all still at the start: they belong to the state it set.
      if (state.pending) return base.token(stream, state)
      if (state.style) {
        const token = styleBody(stream, state)
        // A block left open ends at `@end`, which is then read as ever.
        if (state.style || stream.pos > stream.start) return token
      }
      if (state.inner) {
        if (stream.sol()) {
          const end = stream.match(/^([ \t]*)(@end\w*)/, false)
          if (end) {
            state.inner = null
            return emit(stream, state, [[end[1], null], [end[2], 'keyword']])
          }
          const tags = styleStart(stream, state)
          if (tags !== undefined) return tags
          // Comment and preprocessor lines are PlantUML's in any diagram.
          if (stream.match(/^[ \t]*['!]/, false)) return base.token(stream, state)
        }
        return modeOf(state.inner).token(stream, state.inner.state)
      }
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
    tokenTable: { ColorLiteral: tags.color, underline },
  })
}

export const plantumlMode = plantumlLanguage({})
