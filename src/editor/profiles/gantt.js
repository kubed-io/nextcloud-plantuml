/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startgantt` blocks, and `@startproject`, which PlantUML reads as gantt. A
 * line is a sentence: a subject (`[Task]`, `{Resource}`, a date, `Project`),
 * verbs and joiners (keywords, a run of them one token), dates, durations and
 * percentages (numbers). An apostrophe in `[End's committee]` is the task's,
 * and `'s end` after a task a keyword: only a `'` that starts a line is a
 * comment, and comments are the editor's, as `!` lines and `<style>` blocks
 * are. Bare colour names are colours only after `colored in` and in a
 * `with … link`; a `#` colour is one anywhere, as the lexicon reads its parts
 * (`core.lex.patterns.colourPart`), and `$` and `%` names are the lexicon's. A
 * note, a legend and a multi-line title are read to their ends, their lines
 * Creole (G5, `core.lex.textMode`), and so is the text of a one-line title,
 * header, footer or caption.
 */
const WORDS = [
  'aligned', 'after', 'and', 'are', 'as', 'at', 'before', 'between', 'bottom', 'calendar', 'center', 'closed',
  'colou?red', 'column', 'completed?', 'completion', 'daily', 'date', 'default', 'deleted', 'displayed', 'displays',
  'ends?', 'first', 'footbox', 'for', 'from', 'gantt', 'ganttscale', 'group', 'happens', 'have', 'hide', 'hours',
  'in', 'is', 'it', 'just', 'label', 'language', 'lasts', 'least', 'left', 'legend', 'links?', 'monthly', 'must',
  'named', 'names', 'note', 'numbering', 'occurs', 'off', 'on', 'open', 'pauses', 'print', 'printscale', 'project',
  'projectscale', 'quarterly', 'requires', 'resources', 'ressources', 'right', 'row', 'same', 'scale', 'separator',
  'show', 'skinparam', 'starts?', 'task', 'the', 'then', 'to', 'today', 'top', 'weekly', 'weeks?', 'with',
  'working', 'works', 'yearly', 'zoom',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
].join('|')
const WORD = `(?:${WORDS})(?!\\w)`
// A run of keywords is one token: `Project starts`, `is colored in`.
const KEYWORDS = new RegExp(`${WORD}(?:[ \\t]+${WORD})*`, 'i')

const MONTH = '(?:january|february|march|april|may|june|july|august|september|october|november|december)'
const DAY = '\\d{1,2}(?:st|nd|rd|th)?'
// A calendar date or a time (Y17): a date written out, `2026-10-13`, `D+5` and `12:30`.
const DATES = [
  new RegExp(`${DAY}(?:[ \\t]+of)?[ \\t]+${MONTH}[ \\t]+\\d{4}(?!\\w)`, 'i'),
  new RegExp(`${MONTH}[ \\t]+${DAY},?[ \\t]+\\d{4}(?!\\w)`, 'i'),
  /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?!\w)/,
  // D+5 from the start, T+1 from today, E-2 from the end.
  /[dte][+-]\d+(?!\w)/i,
  /\d{1,2}:\d{2}(?!\w)/,
]

// A duration, an ordinal and a percentage: numbers.
const NUMBERS = [
  /\d+[ \t]+(?:working[ \t]+)?(?:day|week|month|hour|minute|second)s?(?!\w)/i,
  /\d+(?:st|nd|rd|th|%)?(?!\w)/i,
]

const SEPARATOR = /--(?:[ \t]*\S.*?[ \t]*--)?[ \t]*$/
const LINK_STYLE = /with(?=(?:[ \t]+#?\w+)*?[ \t]+link(?!\w))/i
const OWN_LINE = /(?:title|header|footer)(?=[ \t]*$)/i
const TEXT_LINE = /(?:title|header|footer|caption)(?=[ \t]+\S)/i

const startState = () => ({
  body: null, // the note, legend, title, header or footer being read, to its `end …`
  next: null, // the body the next line starts
  lead: false, // the token is the line's first
  colour: false, // 'any' where a colour goes, 'after' after one
  part: null, // the rest of a `[task]`, `{resource}` or `<<stereotype>>` once its opener is read
  phase: null, // 'arrow' in `-[…]->`, 'link' in `with … link`, 'text' to the line's end
  text: null, // the Creole mode's state, in a body or a 'text' phase
  closing: false, // the line is the body's `end …`
})

/** The first token of a line: a separator, the openers of bodies. */
function lineStart(stream, state) {
  if (stream.match(SEPARATOR)) {
    return 'heading'
  }
  const own = stream.match(OWN_LINE)
  if (own) {
    state.next = own[0].toLowerCase()
    return 'keyword'
  }
  if (stream.match(TEXT_LINE)) {
    state.phase = 'text'
    return 'keyword'
  }
  const body = stream.match(/(?:note|legend)(?!\w)/i, false)
  if (body) {
    state.next = body[0].toLowerCase()
  }
  return undefined
}

/** Inside `-[#red,dashed]->`: its colour (`colour.hash`), its style words, and its end. */
function arrow(stream, state, colour) {
  if (stream.match(/\]-*>/)) {
    state.phase = null
    return 'LinkOperator'
  }
  if (stream.match(colour.hash)) {
    return 'ColorLiteral'
  }
  if (stream.match(',')) {
    return 'separator'
  }
  if (stream.match(/[^,\]\s]+/)) {
    return 'attributeName'
  }
  stream.next()
  return null
}

/** Inside `with blue dotted link`: a colour (`colour.any`), a style word, then `link`. */
function linkStyle(stream, state, colour) {
  if (stream.match(/link(?!\w)/i)) {
    state.phase = null
    return 'keyword'
  }
  if (stream.match(/(?:dotted|bold|dashed)(?!\w)/i)) {
    return 'attributeName'
  }
  stream.match(colour.any) || stream.next()
  return 'ColorLiteral'
}

/** After an opener (`[`, `{`, `<<`): its body in `token`, then its closer, whose token is `bracket`. */
function open(state, body, token, closer, bracket) {
  state.part = { body, token, closer, bracket }
  return bracket
}

/** The body and the closer of a bracketed name, one token each. */
function part(stream, state) {
  const { body, token, closer, bracket } = state.part
  if (body && stream.match(body)) {
    state.part = { body: null, token, closer, bracket }
    return token
  }
  stream.match(closer)
  state.part = null
  return bracket
}

/** A run of keywords; one ending `colored in`, or `from`/`to` after a colour, is followed by one. */
function keywords(stream, state) {
  const run = stream.current()
  if (/colou?red[ \t]+in$/i.test(run) || (state.colour && /(?:from|to)$/i.test(run))) {
    state.colour = 'any'
  } else {
    state.colour = false
  }
  return 'keyword'
}

/** The mode, built from the lexicon: its colour's parts, its names and its Creole. */
function build(lex) {
  const { colourPart } = lex.patterns
  const colour = { hash: new RegExp(`#${colourPart}`), any: new RegExp(`#?${colourPart}`) }
  // A body's lines are H8's (rules, list markers, `<code>`); a one-line text is Creole alone.
  const body = lex.textMode(null, { lines: true })
  const text = lex.textMode(null)
  return {
    startState,
    // Both text modes keep simple-mode's state, which either copies.
    copyState: (state) => ({ ...state, text: state.text && text.copyState(state.text) }),
    token(stream, state) {
      if (stream.sol()) {
        state.lead = true
        state.colour = false
        state.phase = null
        state.part = null
        if (state.next) {
          state.body = state.next
          state.next = null
          state.text = body.startState()
        } else if (!state.body) {
          state.text = null
        }
        state.closing = Boolean(state.body) && new RegExp(`^[ \\t]*end[ \\t]*${state.body}(?!\\w)`, 'i').test(stream.string)
      }
      // A body's line is Creole, but for its end.
      if (state.body && !state.closing) {
        return body.token(stream, state.text)
      }
      if (state.part) {
        return part(stream, state)
      }
      if (stream.eatSpace()) {
        return null
      }
      const lead = state.lead
      state.lead = false
      if (state.body) {
        if (lead && stream.match(new RegExp(`end[ \\t]*${state.body}(?!\\w)`, 'i'))) {
          state.body = null
          state.text = null
          return 'keyword'
        }
        stream.skipToEnd()
        return null
      }
      if (lead) {
        const token = lineStart(stream, state)
        if (token !== undefined) {
          return token
        }
      }
      if (state.phase === 'text') {
        state.text ??= text.startState()
        return text.token(stream, state.text)
      }
      if (state.phase === 'arrow') {
        return arrow(stream, state, colour)
      }
      if (state.phase === 'link') {
        return linkStyle(stream, state, colour)
      }
      if (stream.match(LINK_STYLE)) {
        state.phase = 'link'
        return 'keyword'
      }
      if (state.colour === 'any' && !stream.match(KEYWORDS, false) && stream.match(colour.any)) {
        state.colour = 'after'
        return 'ColorLiteral'
      }
      if (state.colour === 'after' && stream.match('/')) {
        state.colour = 'any'
        return 'separator'
      }
      if (stream.match(colour.hash)) {
        state.colour = 'after'
        return 'ColorLiteral'
      }
      if (DATES.some((pattern) => stream.match(pattern))) {
        return 'Date'
      }
      if (NUMBERS.some((pattern) => stream.match(pattern))) {
        return 'number'
      }
      if (stream.match(KEYWORDS)) {
        return keywords(stream, state)
      }
      state.colour = false
      if (stream.match(/'s[ \t]+(?:end|start)(?!\w)/i)) {
        return 'keyword'
      }
      if (stream.match(/\[\[[^\]]*\]\]/)) {
        return 'link'
      }
      if (stream.match(/\[(?=[^[\]]*\])/)) {
        return open(state, /[^\]]+/, 'typeName', ']', 'squareBracket')
      }
      if (stream.match(/\{(?=[^{}]*\})/)) {
        return open(state, /[^}]+/, 'propertyName', '}', 'brace')
      }
      const name = lex.match(stream, lex.names)
      if (name) {
        return name
      }
      if (stream.match(/"[^"]*"/)) {
        return 'string'
      }
      if (stream.match(/<<(?=[^>]*>>)/)) {
        return open(state, /[^>]+/, 'annotation', '>>', 'angleBracket')
      }
      if (stream.match(/-+>/)) {
        return 'LinkOperator'
      }
      if (stream.match(/-+\[/)) {
        state.phase = 'arrow'
        return 'LinkOperator'
      }
      stream.match(/\w+/) || stream.next()
      return null
    },
  }
}

// One mode for gantt and project, for each lexicon.
const modes = new WeakMap()
const modeOf = (lex) => {
  if (!modes.has(lex)) {
    modes.set(lex, build(lex))
  }
  return modes.get(lex)
}

const profile = (type, core) => ({ type, mode: modeOf(core.lex), completions: [], lints: [], values: [] })

export default (core) => profile('gantt', core)

/** `@startproject`: the same profile, under the type its blocks are scanned as. */
export const project = (core) => profile('project', core)
