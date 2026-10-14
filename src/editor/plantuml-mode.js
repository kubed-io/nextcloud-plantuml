/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML for CodeMirror 6, as a simple-mode rule table. The rules are ported
 * from Prism's `plant-uml` grammar (components/prism-plant-uml.js at v1.30.0,
 * MIT, Copyright (c) 2012 Lea Verou): its comments, preprocessor lines,
 * @start/@enduml, arrows, strings and keywords. Its times, colours, variables
 * and punctuation are left plain. Added here: headless links (`--`, `..`, `~~`,
 * `==`), bodies of `=` and `~`, a link's label, and separator lines.
 *
 * Prism anchors several rules to the start of a line after any indentation,
 * which a stream mode cannot look back for. Those rules match at the start of
 * the line instead and capture the indentation as a group of its own, so only
 * the word is coloured.
 */
import { StreamLanguage } from '@codemirror/language'
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'

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
// is only ever tried where a token starts.
export const arrow = new RegExp(`${arrowPrefix}(?:${arrowBody}${arrowRight}|${arrowLeft}${arrowBody}(?:${arrowRight})?|${headless})${arrowSuffix}(?![-.=~<>?|\\\\\\]ox])`)

// A link and the rest of its line: whatever stands before the first `:` is the
// far end, everything after it the label. One group per token below.
const labelled = new RegExp(`(${arrow.source})([^:]*?)(\\s*:\\s*)(.*)$`)

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

export const plantumlMode = StreamLanguage.define(simpleMode({
  start: [
    atLineStart(/\/'.*?'\//.source, 'comment'),
    atLineStart(/\/'.*/.source, 'comment', { next: 'blockComment' }),
    atLineStart(/'.*/.source, 'comment'),
    atLineStart(/!.*/.source, 'meta'),
    atLineStart(/@(?:end|start)uml\b/.source, 'keyword'),
    atLineStart(separator, 'heading'),
    atLineStart(`(?:${lineKeywords})(?=\\s|$)`, 'keyword'),
    { regex: /"[^"]*"/, token: 'string' },
    { regex: labelled, token: ['operator', null, null, 'labelName'] },
    { regex: arrow, token: 'operator' },
    { regex: /\b(?:elseif|equals|not|while)(?=\s*\()/, token: 'keyword' },
    { regex: /\b(?:as|is|then)\b/, token: 'keyword' },
    { regex: /\w+/, token: null },
  ],
  blockComment: [
    { regex: /.*?'\//, token: 'comment', next: 'start' },
    { regex: /.+/, token: 'comment' },
  ],
  languageData: {
    name: 'plantuml',
    commentTokens: { line: "'", block: { open: "/'", close: "'/" } },
    // `'` starts a comment, so it is never paired.
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
  },
}))
