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
 * descriptions and titles. The rules other grammars share (arrows, colours,
 * names, Creole, a body's lines, a sprite's states) are the lexicon's
 * (`lexicon/rules.js`); the states and the regions are this module's.
 *
 * `plantumlLanguage(inner)` nests other stream modes: between `@start<type>`
 * and the next line starting `@end`, a type with a mode in `inner` is read by
 * that mode, except for `'` and `/' … '/` comments and `!` preprocessor lines. A `<style>`
 * block is a region of its own wherever it starts a line, read by
 * `inner.style` or else left plain, the middle of an inline `<math>…</math>` in Creole is read by
 * `inner.math` or else left plain, and likewise `<latex>…</latex>` by `inner.latex` and the lines
 * of a Creole body between a line `<latex>` and a line `</latex>`, and a `@startcreole` block is Creole and a `@startfiles` block
 * is paths and `<note>` bodies. In a uml note, legend, description or class body, a sub-diagram
 * (`{{type` … `}}`, sub-diagrams.js) is read by `inner[type]`, a base grammar of its own for uml.
 */
import { StreamLanguage, StringStream, getIndentUnit, language } from '@codemirror/language'
import {
  argsState, arrow, atLineStart, blockComment, body, box, callNames, calls, classStates, comma, codeLines, colours, comments, creole,
  declarations, directive, directiveLine, head, hex, lines, named, names, number, numbers, operators, patterns, paths, spriteLines, spriteStates, startLine, stereotypeState,
  stereotypes, styledClose, styledOpen, tagStates, toColon,
} from './lexicon/rules.js'
import { table } from './lexicon/table.js'
import { tokenTable } from './lexicon/tags.js'
import { SUB_CLOSE, SUB_OPEN } from './sub-diagrams.js'

// The rule and tags importers took from here before the lexicon held them.
export { arrow }
export { spriteData, underline, variable } from './lexicon/tags.js'

const { colourPart, notStylePart } = patterns

// `== Section ==`, and a delay: `...` alone or `... 5 minutes later ...`.
const separator = /={2,}[^=].*?={2,}\s*$|\.{3,}(?:.*?\.{3,})?\s*$/.source

// The words whose condition follows in parentheses (`if (x)`, `else (no)`).
const conditionWords = /(?:if|elseif|else|while|endwhile|switch|case)/.source

const lineKeywords = /abstract\s+class|end\s+(?:box|fork|group|merge|note|ref|split|title)|(?:fork|split)(?:\s+again)?|activate|actor|agent|alt|annotation|artifact|autoactivate|autonumber|backward|binary|boundary|box|break|caption|card|case|circle|class|clock|cloud|collections|component|concise|control|create|critical|database|deactivate|destroy|detach|diamond|else|elseif|end|end[hr]note|endif|endswitch|endwhile|entity|enum|file|folder|footer|frame|group|[hr]?note|header|hexagon|hide|if|interface|label|legend|loop|map|namespace|network|newpage|node|nwdiag|object|opt|package|page|par|participant|person|queue|rectangle|ref|remove|repeat|restore|return|robust|scale|set|show|skinparam|stack|start|state|stop|storage|switch|title|together|usecase|usecase\/|while/.source

/** The rules of a path slot, each ending in the state that reads the rest of the `!` line. */
const toPreprocessor = (rules) => rules.map((rule) => ({ ...rule, next: 'preprocessor' }))

/**
 * A `!` line: its directive (`!procedure`, the `!` of `!$x = 1`), then the state `preprocessor` to
 * the line's end; a `!` before anything PlantUML does not know is text. An include's, an import's
 * and a theme's source is a path (H22), read before the operators. Each pushes, and its states end
 * with their line (`lineStates`), so the state the line was read in, a class or a note body, comes
 * back after it.
 */
const bang = [
  atLineStart(/!(?:include(?:_many|_once|sub|url|def)?|import)(?=[ \t]+[^\s'$%])/.source, 'meta', { push: 'includePath' }),
  atLineStart(/!theme(?=\s)/.source, 'meta', { push: 'theme' }),
  atLineStart(directive, 'meta', { push: 'preprocessor' }),
]

const activity = box(undefined, bang)

const states = {
  start: [
    ...comments,
    ...bang,
    // An activity box `:text;`, before a colon with a space beside it starts text (H18).
    ...activity.open,
    // `@start<type>` lines are read by `startLine` (lexicon/rules.js), see `plantumlLanguage`.
    atLineStart(/@end\w+\b/.source, 'keyword'),
    atLineStart(separator, 'heading'),
    // A note's text follows a colon on its own line, or else fills the lines
    // down to `end note`. A quoted note (`note "x" as N`) is neither.
    atLineStart(/[hr]?note\b(?=[^:"]*:)/.source, 'keyword', { next: 'noteLine' }),
    atLineStart(/[hr]?note(?=(?:\s[^:"]*)?$)/.source, 'keyword', { next: 'noteHead' }),
    atLineStart(/legend\b/.source, 'keyword', { next: 'legendHead' }),
    ...['title', 'header', 'footer'].map((word) => atLineStart(`${word}(?=\\s*$)`, 'keyword', { next: `${word}Body` })),
    atLineStart(/(?:title|header|footer|caption|mainframe)(?=\s)/.source, 'keyword', { next: 'text' }),
    // A condition's parentheses are brackets (H20), what they hold read as `condition`.
    { regex: new RegExp(`([ \\t]*)(${conditionWords}|repeat[ \\t]+while)([ \\t]*)(\\()`), sol: true, token: [null, 'keyword', null, 'paren'], push: 'condition' },
    // What a line declares is a type (H15); a class's `{` opens its members (H17).
    ...declarations,
    atLineStart(`(?:${lineKeywords})(?=\\s|$)`, 'keyword'),
    // `#highlight` and the like start a line; a colour never does, but a hex keeps its picker.
    atLineStart(`#(?![\\dA-Fa-f]+(?!\\w))\\w+`, null),
    // A sprite definition (T16): its header is read by `spriteHead`, its pixel rows by `spriteRows`.
    ...spriteLines,
    { regex: /"[^"]*"/, token: 'string' },
    { regex: /\[\[[^\]]*\]\]/, token: 'link' },
    // A colon with a space beside it starts text, as a link's does (a link is read by `afterLink`).
    { regex: /\s+:\s*|:\s+/, token: null, next: 'colonText' },
    // A URL is a path wherever words are read (H22); a string, a comment and a colour came first.
    paths.url,
    ...stereotypes,
    { regex: styledOpen, token: 'LinkOperator', next: 'arrowAttr' },
    { regex: arrow, token: 'LinkOperator', next: 'afterLink' },
    // Gantt: `[Task] is colored in White/Red`, a fill and a line.
    { regex: new RegExp(`\\b(is)(\\s+colou?red\\s+in\\s+)(#?${colourPart})(?:(/)(#?${colourPart}))?${notStylePart}`), token: ['keyword', null, 'ColorLiteral', 'punctuation', 'ColorLiteral'] },
    ...colours,
    // `node web [` opens a description that runs to a line starting with `]`.
    { regex: /\[(?=\s*$)/, token: null, next: 'descBody' },
    { regex: new RegExp(`\\b(${conditionWords}|then|is|not|equals)(\\s*)(\\()`), token: ['keyword', null, 'paren'], push: 'condition' },
    { regex: /\b(?:elseif|equals|not|while)(?=\s*\()/, token: 'keyword' },
    { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
    // A sprite used as an element's icon (`rectangle <$foo> as r`).
    { regex: /<\$[^>\s]+>/, token: 'tagName' },
    ...callNames,
    ...numbers,
    ...calls,
    { regex: /\w+/, token: null },
  ],
  boxText: activity.boxText,
  boxLast: activity.boxLast,
  // An element line's text after ` : ` is text (H14): a colour and a string keep their look.
  colonText: [...colours, { regex: /"[^"]*"/, token: 'string' }, ...creole(null)],
  stereotype: stereotypeState,
  args: argsState,
  // A condition, to its `)`; it ends with its line, see `lineStates`.
  condition: [
    { regex: /\)/, token: 'paren', pop: true },
    { regex: /\(/, token: 'paren', push: 'condition' },
    { regex: /"[^"]*"/, token: 'string' },
    paths.url,
    ...colours,
    ...callNames,
    ...numbers,
    ...calls,
    { regex: /\w+/, token: null },
  ],
  // A class's members, a `!` line among them pushed from here (H17).
  classHead: classStates.classHead,
  classBody: [...bang, ...classStates.classBody],
  // The rest of a `!` line; it ends with its line, see `lineStates`.
  preprocessor: [
    { regex: /"[^"]*"|'[^']*'/, token: 'string' },
    ...names,
    number,
    ...operators,
    { regex: /[()]/, token: 'paren' },
    comma,
    { regex: /\w+/, token: null },
  ],
  // The path after `!include`: `<C4/C4>` in angle brackets, else the path and its selector.
  includePath: [
    { regex: /\s+/, token: null },
    { regex: /(<)([^>\s]+)(>)/, token: ['angleBracket', 'url', 'angleBracket'], next: 'preprocessor' },
    ...toPreprocessor(paths.slot),
  ],
  // A theme's name is plain; what comes after `from` is a path.
  theme: [
    { regex: /(\s+from\s+)(?=[^\s'$%])/, token: null, next: 'themePath' },
    { regex: /"[^"]*"|'[^']*'/, token: 'string' },
    ...names,
    { regex: /\s+|[^\s"'$%]+|./, token: null },
  ],
  themePath: [
    { regex: /\s+/, token: null },
    ...toPreprocessor(paths.slot),
  ],
  blockComment,
  // Inside a styled link's brackets.
  arrowAttr: [
    { regex: styledClose, token: 'LinkOperator', next: 'afterLink' },
    { regex: hex, token: 'ColorLiteral' },
    { regex: named, token: 'ColorLiteral' },
    { regex: /[^,\]\s][^,\]]*/, token: 'attributeName' },
  ],
  // The far end of a link is plain but for its names; a colon starts its label. A note's
  // colon starts its text.
  afterLink: toColon('label'),
  noteLine: toColon('text'),
  // A tag's attributes and an icon's: both end with their line, see `base`.
  ...tagStates,
  // A sprite's header, pixel rows and svg. Its header ends with its line, see `nextLine`.
  ...spriteStates,
  label: creole('labelName'),
  text: creole(null),
  // Read by the language's token (`inlineMiddle`, `latexBody`); simple-mode wants the state to exist.
  math: [],
  latex: [],
  latexBlock: [],
  noteHead: head,
  legendHead: head,
  ...body('noteBody', /end\s*[hr]?note\b/.source, 'keyword', bang),
  ...body('legendBody', /end\s*legend\b/.source, 'keyword', bang),
  ...body('titleBody', /end\s*title\b/.source, 'keyword', bang),
  ...body('headerBody', /end\s*header\b/.source, 'keyword', bang),
  ...body('footerBody', /end\s*footer\b/.source, 'keyword', bang),
  ...body('descBody', /\]/.source, null, bang),
  // A creole diagram is Creole on every line, from the line after its start.
  creoleHead: [{ regex: /.+/, token: null }],
  ...body('creoleBody', /@end\w*/.source, 'keyword', bang),
  // A files diagram is a path on each line, and `<note>` bodies of Creole.
  filesHead: [{ regex: /.+/, token: null }],
  filesBody: [
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    atLineStart(/<note>(?=\s*$)/.source, 'tagName', { next: 'filesNote' }),
    ...bang,
    { regex: /\//, token: 'punctuation' },
    ...creole(null),
  ],
  filesNote: [
    atLineStart(/<\/note>(?=\s*$)/.source, 'tagName', { next: 'filesBody' }),
    atLineStart(/@end\w*/.source, 'keyword', { next: 'start' }),
    ...bang,
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
}

// The states that end with their line, and the state the next line starts in.
// Without this a label or a styled link left open would run on into it.
// A tag's attributes end with their line too; the state they were pushed from is popped.
// A `!` line's states are popped, back to the state it was read in.
const nextLine = { boxLast: 'start', afterLink: 'start', arrowAttr: 'start', noteLine: 'start', colonText: 'start', label: 'start', text: 'start', noteHead: 'noteBody', spriteHead: 'start', legendHead: 'legendBody', creoleHead: 'creoleBody', filesHead: 'filesBody', classHead: 'classBody' }
const base = table(states, { nextLine, lineStates: ['tagAttrs', 'tagBraces', 'stereotype', 'args', 'condition', 'preprocessor', 'includePath', 'theme', 'themePath'] })

// PlantUML's own style lines: a block opens on a line that is `<style>` and
// closes on one that is `</style>`; a one-line block (its middle read as a
// block's body) and an imported sheet (`<style file=…>`) are a line each.
const styleOpen = /^([ \t]*)(<style>)(\s*)$/
const styleOneLine = /^([ \t]*)(<style>)(.*)<\/style>\s*$/
const styleImport = /^([ \t]*)(<style)(\s+)([\w-]+)(\s*)(=)(\s*)([^>]*?)(\s*)(>)(\s*)$/
const styleClose = /^([ \t]*)(<\/style>)(\s*)$/

// The states of a `!` line: PlantUML's to its end, in a nested mode too.
const bangStates = new Set(['preprocessor', 'includePath', 'theme', 'themePath'])

// A line that starts or ends a diagram.
const diagramEdge = /^[ \t]*@(?:start|end)\w+/

// A `<latex>` block's last line, and the lines that end a Creole body with it unclosed.
const latexClose = /^<\/latex>$/
const bodyEnd = /^[ \t]*(?:end\s*(?:[hr]?note|legend|title|header|footer)\b|@end)/
// A files note ends with its `</note>` line, a description with the line starting `]`.
const bodyEnds = { filesNote: /^[ \t]*<\/note>/, filesNoteCode: /^[ \t]*<\/note>/, descBody: /^[ \t]*\]/, descBodyCode: /^[ \t]*\]/ }

// The bodies a sub-diagram opens in, each with the end line that ends one left open there: a
// note's or legend's; a class's or description's closer is in `subClosers`.
const subBodies = { noteBody: /^[ \t]*end\s*[hr]?note\b/, legendBody: /^[ \t]*end\s*legend\b/, descBody: null, classBody: null }
// A class's or description's own closer, which ends one left open when indented less than its `{{`
// and the sub-diagram's lines have closed every bracket of that kind they opened (`nest`).
const subClosers = { classBody: /^([ \t]*)\}[ \t]*$/, descBody: /^([ \t]*)\]/ }
// The brackets a sub-diagram's lines are counted by, in the body it opened in.
const subBrackets = { classBody: ['{', '}'], descBody: ['[', ']'] }

/** The `open` brackets of `line` less its `close` ones, outside `"…"` strings (`\\"` stays in one). */
function netBrackets(line, [open, close]) {
  let net = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted && char === '\\') i++
    else if (char === '"') quoted = !quoted
    else if (!quoted && char === open) net++
    else if (!quoted && char === close) net--
  }
  return net
}

// A uml sub-diagram's own note or legend, whose end line is its own.
const ownBodies = {
  noteBody: new Set(['noteHead', 'noteBody', 'noteBodyCode']),
  legendBody: new Set(['legendHead', 'legendBody', 'legendBodyCode']),
}

/** A style import's value: a `file` path is `url`, quoted its quotes punctuation; else a string. */
function sheetValue(name, value) {
  if (name !== 'file') return [[value, 'string']]
  const quoted = /^"([^"]+)"$/.exec(value)
  return quoted ? [['"', 'punctuation'], [quoted[1], 'url'], ['"', 'punctuation']] : [[value, /^["']/.test(value) ? 'string' : 'url']]
}

/**
 * Whether `pos` is in a style block's body, read by the line forms above: a
 * line between `<style>` and `</style>` (or the next `@end`) that is not
 * PlantUML's own `'` or `!` directive line, or the middle of a one-line block. The core
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
  if (styleOpen.test(line.text) || styleClose.test(line.text) || /^[ \t]*(?:'|@end)/.test(line.text) || directiveLine.test(line.text)) {
    return false
  }
  let open = false
  for (let number = 1; number < line.number; number++) {
    const text = state.doc.line(number).text
    open = open ? !(styleClose.test(text) || /^[ \t]*@end/.test(text)) : styleOpen.test(text)
  }
  return open
}

// What the server cannot draw (1.2026.8 answers "Diagram not supported by this release") is
// grey between its `@start` and `@end` lines; ditaa is drawn by another tool, so its lines are plain.
const INACTIVE = new Set(['chronology', 'jcckit'])
const PLAIN = new Set(['ditaa'])
const grey = {
  inactive: true,
  token(stream) {
    stream.skipToEnd()
    return 'Inactive'
  },
}
const plain = {
  token(stream) {
    stream.skipToEnd()
    return null
  },
}
const builtIn = {}
for (const type of INACTIVE) builtIn[type] = grey
for (const type of PLAIN) builtIn[type] = plain

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

/** The longest line that is tokenised: a longer one is one plain span (a hostile line must not freeze the editor). */
export const MAX_LINE = 10000

/**
 * PlantUML, with each `@start<type>` … `@end` block of a type in `inner` read
 * by that type's stream mode. A fresh language on every call, so a profile
 * arriving swaps it in a Compartment and the document is read again.
 */
export function plantumlLanguage(profiles = {}) {
  // A profile's mode of the same type overrides a built-in one.
  const inner = { ...builtIn, ...profiles }
  const modeOf = (block) => inner[block.type]
  const style = profiles.style
  const math = profiles.math
  const latex = profiles.latex
  const copyIn = (mode, state) => (mode?.copyState ? mode.copyState(state) : copyOf(state))

  /**
   * A `<style>` line at the start of a line, its tags read as tags; undefined
   * for any other line. A one-line block's middle is a body up to `until`, the
   * column of its `</style>`.
   */
  function styleStart(stream, state) {
    const sheet = stream.match(styleImport, false)
    if (sheet) return emit(stream, state, [
      [sheet[1], null], [sheet[2], 'tagName'], [sheet[3], null], [sheet[4], 'attributeName'], [sheet[5], null], [sheet[6], 'definitionOperator'],
      [sheet[7], null], ...sheetValue(sheet[4], sheet[8]), [sheet[9], null], [sheet[10], 'tagName'], [sheet[11], null],
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
      if (bodyEnd.test(stream.string) || bodyEnds[state.stack[state.stack.length - 1]]?.test(stream.string)) {
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
      if (stream.match(/^[ \t]*'/, false) || stream.match(directiveLine, false)) return base.token(stream, state)
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
  function innerToken(stream, block, mode = modeOf(block)) {
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

  // A uml sub-diagram is this language's own reading, with a state of its own that opens none.
  const umlSub = {
    startState: (indentUnit) => ({ ...startState(indentUnit), nested: true }),
    copyState,
    token,
    blankLine,
    indent,
  }
  // `style` names the mode for style blocks, not a diagram type.
  const subMode = (type) => (type === 'uml' ? umlSub : type !== 'style' && Object.hasOwn(inner, type) ? inner[type] : plain)

  function startState() {
    return { ...base.startState(), inner: null, style: null, math: null, latex: null, sub: null, nested: false }
  }

  function copyState(state) {
    const copy = base.copyState(state)
    const block = state.inner
    copy.inner = block && { type: block.type, state: copyIn(modeOf(block), block.state), from: block.from }
    copy.style = state.style && { state: copyIn(style, state.style.state), until: state.style.until }
    copy.math = state.math && { state: copyIn(math, state.math.state), until: state.math.until }
    copy.latex = state.latex && { state: copyIn(latex, state.latex.state), until: state.latex.until }
    const sub = state.sub
    copy.sub = sub && { type: sub.type, depth: sub.depth, nest: sub.nest, indent: sub.indent, from: sub.from, begun: sub.begun, state: copyIn(subMode(sub.type), sub.state), plant: base.copyState(sub.plant) }
    if (sub?.plant.style) copy.sub.plant.style = { state: copyIn(style, sub.plant.style.state), until: sub.plant.style.until }
    copy.nested = state.nested
    return copy
  }

  /**
   * A line of a sub-diagram, its `{{` and `}}` lines counting the depth and its other lines the
   * body's brackets (`nest`, see `subEnds`); a `'`, `/'` or `!` line, or one in a `/' … '/` comment,
   * counts neither, as the server drops it first. A comment or `!` line is PlantUML's (`plant`, a
   * state of its own so the body underneath stays as it was), and so is a `<style>` block in a
   * type's own grammar, read as in a block of that type. The mode gets each line with its
   * indentation cut, as the server hands it over.
   */
  function subToken(stream, state) {
    const sub = state.sub
    // `begun`: a reader that has not advanced yet leaves the line at its start, begun once.
    if (stream.sol() && !sub.begun) {
      sub.begun = true
      sub.from = null
      base.startLine(sub.plant)
      const commented = sub.plant.state === 'blockComment'
      const opened = !commented && stream.match(SUB_OPEN, false)
      const close = !commented && stream.match(SUB_CLOSE, false)
      if (opened) sub.depth++
      if (close && !--sub.depth) {
        state.sub = null
        return emit(stream, state, [[close[1], null], [close[2], 'brace'], [stream.string.slice(close[1].length + 2), null]])
      }
      // A comment or `!` line is the preprocessor's, gone before the sub-diagram is read.
      const own = /^[ \t]*(?:'|\/')/.test(stream.string) || directiveLine.test(stream.string)
      if (!commented && !own && !opened && !close && subBrackets[state.state]) sub.nest += netBrackets(stream.string, subBrackets[state.state])
    }
    const mode = subMode(sub.type)
    const own = mode !== umlSub && !mode.inactive
    // A comment or `!` line's groups left pending (its indentation first) are the plant's too.
    const plant = own && (sub.plant.pending || sub.plant.state === 'blockComment' || (!stream.sol() && bangStates.has(sub.plant.state))
      || (stream.sol() && (stream.match(/^[ \t]*(?:'|\/')/, false) || stream.match(directiveLine, false))))
    const read = () => {
      if (plant) return base.token(stream, sub.plant)
      if (own && sub.plant.style) return styleBody(stream, sub.plant)
      const tags = own && stream.sol() ? styleStart(stream, sub.plant) : undefined
      if (tags !== undefined) return tags
      // The indentation is the body's; the mode reads from after it.
      if (!mode.inactive && stream.sol() && stream.match(/^[ \t]+(?=\S)/)) {
        sub.from = stream.pos
        return null
      }
      return innerToken(stream, sub, mode)
    }
    // A reader may hand back an empty first group at the line's start; read on here, or this
    // line would be begun again (its depth counted twice, its end looked for in a moved state).
    for (let tries = 0; tries < 10; tries++) {
      const token = read()
      if (stream.pos > stream.start) {
        sub.begun = false
        return token
      }
    }
    return null
  }

  /**
   * Whether the line ends a sub-diagram left open: the diagram's edge; its note's or legend's end
   * line, unless a uml sub-diagram is in a note or legend of its own; or its class's `}` or its
   * description's `]`, when indented less than the `{{` line and the sub-diagram's own lines have
   * closed every `{` or `[` they opened (a json or salt sub-diagram's `}` at column 0 is its own).
   * The server never ends one there (a syntax error); this is recovery, so it must not misread
   * valid input.
   */
  function subEnds(stream, state) {
    if (stream.match(diagramEdge, false)) return true
    const closer = subClosers[state.state]?.exec(stream.string)
    if (closer && state.sub.nest <= 0 && closer[1].length < state.sub.indent) return true
    if (!subBodies[state.state]?.test(stream.string)) return false
    const own = state.sub.type === 'uml' && state.sub.state
    return !own || ![own.state, ...(own.stack ?? [])].some((key) => ownBodies[state.state]?.has(key))
  }

  /** A body's `{{` line: the sub-diagram starts on the next line, the body kept underneath. */
  function subStart(stream, state, open) {
    const type = open[3] || 'uml'
    const mode = subMode(type)
    state.sub = { type, depth: 1, nest: 0, indent: open[1].length, from: null, begun: false, state: mode.startState ? mode.startState(stream.indentUnit) : {}, plant: base.startState() }
    return emit(stream, state, [[open[1], null], [open[2], 'brace'], [open[3], 'keyword'], [stream.string.slice(open[1].length + 2 + open[3].length), null]])
  }

  function token(stream, state) {
    // A line past MAX_LINE is plain to its end and leaves the state alone, so the block open before
    // it stays open after it. Every nested mode runs inside this one `token`.
    if (stream.string.length > MAX_LINE) {
      stream.skipToEnd()
      return null
    }
    // A rule matched at the start of a line hands back its groups one at a
    // time (`pending`), all still at the start: they belong to the state it set.
    if (state.pending) return base.token(stream, state)
    // A sub-diagram left open ends at the diagram's edge, its note's or legend's end line, or its
    // class's or description's closer (see `subEnds`), which is then read as ever.
    if (state.sub && stream.sol() && subEnds(stream, state)) state.sub = null
    // A diagram's `@start` or `@end` line ends what is left open at the top level, a body, a
    // `<code>` or `<latex>` block, a `/' … '/` comment, as it does an inner block's (P5).
    if (stream.sol() && !state.inner && !state.style && state.state !== 'start' && stream.match(diagramEdge, false)) {
      state.state = 'start'
      state.stack = []
      state.latex = null
    }
    if (state.sub) return subToken(stream, state)
    if (state.state === 'math') return inlineMiddle(stream, state, 'math', math)
    if (state.state === 'latex') return inlineMiddle(stream, state, 'latex', latex)
    if (state.state === 'latexBlock') return latexBody(stream, state)
    // A `!` line is PlantUML's to its end, in a nested mode or a style block too.
    if (bangStates.has(state.state)) {
      if (!stream.sol()) return base.token(stream, state)
      // At the next line it is popped, back to the state the line was read in.
      base.startLine(state)
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
          // A `/' … '/` comment left open in the block leaves its start on the stack.
          state.state = 'start'
          state.stack = []
          return emit(stream, state, [[end[1], null], [end[2], 'keyword']])
        }
        // An open block ends at the next `@start`, which is read as ever (B1).
        if (stream.match(/^[ \t]*@start\w+/, false)) {
          state.inner = null
          state.state = 'start'
          state.stack = []
        }
      }
    }
    if (state.inner) {
      // A `/' … '/` comment is PlantUML's in any diagram, down to its closer, mid-line or not.
      if (modeOf(state.inner).inactive) return innerToken(stream, state.inner)
      if (state.state === 'blockComment') return base.token(stream, state)
      if (stream.sol()) {
        const tags = styleStart(stream, state)
        if (tags !== undefined) return tags
        // Comment and preprocessor lines are PlantUML's in any diagram.
        if (stream.match(/^[ \t]*(?:'|\/')/, false) || stream.match(directiveLine, false)) return base.token(stream, state)
      }
      return innerToken(stream, state.inner)
    }
    // The line's state, before its `<style>` or `@start` is looked for (see `table`).
    if (stream.sol()) base.startLine(state)
    const open = stream.sol() && !state.nested && Object.hasOwn(subBodies, state.state) && stream.match(SUB_OPEN, false)
    if (open) return subStart(stream, state, open)
    if (stream.sol() && state.state === 'start') {
      const tags = styleStart(stream, state)
      if (tags !== undefined) return tags
    }
    const start = stream.sol() && state.state === 'start' && stream.match(/^([ \t]*)(@start(\w+))(.*)/, false)
    // `style` names the mode for style blocks, not a diagram type.
    if (start && start[3] !== 'style' && Object.hasOwn(inner, start[3])) {
      const mode = inner[start[3]]
      state.inner = { type: start[3], state: mode.startState ? mode.startState(stream.indentUnit) : {} }
      // The block starts on the next line: the rest of this one is the type's, its name.
      return startLine(stream, state)
    }
    if (start) {
      const token = startLine(stream, state)
      // A creole or files diagram is Creole or paths from the line after its start.
      if (start[3] === 'creole') state.state = 'creoleHead'
      else if (start[3] === 'files') state.state = 'filesHead'
      return token
    }
    return base.token(stream, state)
  }

  function blankLine(state, indentUnit) {
    if (state.style) style?.blankLine?.(state.style.state, indentUnit)
    else if (state.sub?.plant.style) style?.blankLine?.(state.sub.plant.style.state, indentUnit)
    else if (state.sub) subMode(state.sub.type).blankLine?.(state.sub.state, indentUnit)
    else if (state.inner) modeOf(state.inner).blankLine?.(state.inner.state, indentUnit)
  }

  function indent(state, textAfter, context) {
    if (state.style) return style?.indent?.(state.style.state, textAfter, context) ?? null
    if (state.sub?.plant.style) return style?.indent?.(state.sub.plant.style.state, textAfter, context) ?? null
    if (state.sub) return subMode(state.sub.type).indent?.(state.sub.state, textAfter, context) ?? null
    if (!state.inner) return base.indent(state, textAfter, context)
    return modeOf(state.inner).indent?.(state.inner.state, textAfter, context) ?? null
  }

  const spec = {
    ...base,
    startState,
    copyState,
    token,
    blankLine,
    indent,
    // The highlight of a token @lezer/highlight has no tag for (lexicon/tags.js).
    tokenTable,
  }
  const plantuml = StreamLanguage.define(spec)
  parsers.set(plantuml, spec)
  return plantuml
}

/** Each language `plantumlLanguage` made → its stream parser, for `atTopLevel`. */
const parsers = new WeakMap()

/** One token, as CodeMirror reads it: a rule that only switched state is tried again in place. */
function readToken(parser, stream, state) {
  stream.start = stream.pos
  for (let i = 0; i < 10; i++) {
    parser.token(stream, state)
    if (stream.pos > stream.start) return
  }
  throw new Error('Stream parser failed to advance stream.')
}

/**
 * Whether the line at `pos` starts at a diagram's top level, outside any body the grammar
 * reads: a note, legend or title's text, a class's `{ … }`, an activity box's `:` … `;`, a
 * `/' … '/` comment, a nested block. The grammar's own state at the line's start says so,
 * read from `fromLine` (the block's `@start` line, where PlantUML begins afresh).
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {number} [fromLine] 1-based
 */
export function atTopLevel(state, pos, fromLine = 1) {
  const parser = parsers.get(state.facet(language))
  if (!parser) {
    return false
  }
  const unit = getIndentUnit(state)
  const read = parser.startState(unit)
  for (let number = fromLine; number < state.doc.lineAt(pos).number; number++) {
    const text = state.doc.line(number).text
    if (!text) {
      parser.blankLine(read, unit)
      continue
    }
    const stream = new StringStream(text, state.tabSize, unit)
    while (!stream.eol()) readToken(parser, stream, read)
  }
  // A line starts in the state its last line hands on, once that line's own states are done.
  base.startLine(read)
  return read.state === 'start' && !read.stack?.length && !read.pending && !read.inner && !read.style && !read.sub && !read.math && !read.latex
}

export const plantumlMode = plantumlLanguage({})
