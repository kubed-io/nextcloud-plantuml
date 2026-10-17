/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The words a PlantUML line starts with, grouped as the diagrams use them.
 * A word joins a list here; what it says of itself is its docs entry (`data/docs/`).
 */
import { diagramAt, diagramsWithout } from '../blocks.js'
import { inStyleBody } from '../regions.js'
import { PARTICIPANTS, STRUCTURES } from '../lexicon/rules.js'
import { serverKeywords } from './server-list.js'

// The element keywords are the lexicon's, which makes a declared name a type (H15); `names.js`
// and `colors.js` read declarations with them too.
export { PARTICIPANTS, STRUCTURES }

const SEQUENCE = ['alt', 'else', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'end', 'note', 'ref', 'activate', 'deactivate', 'destroy', 'return', 'autonumber', 'title', 'header', 'footer', 'legend', 'skinparam', 'hide', 'show', 'left', 'right', 'top', 'bottom']

const ACTIVITY = ['start', 'stop', 'if', 'then', 'elseif', 'endif', 'while', 'endwhile', 'repeat', 'fork', 'end fork']

const labels = [...new Set([...PARTICIPANTS, ...STRUCTURES, ...SEQUENCE, ...ACTIVITY])]

/** Every word a line can start with; `connectors.js` offers nothing after one. */
export const KEYWORDS = labels.filter((label) => !label.includes(' '))

/** PlantUML's one-line commands that draw a reference page (`helper:` docs); offered on a line of their own in a uml block (X13). */
export const HELPERS = [
  'colors',
  'listsprite',
  'listopeniconic',
  'listfonts',
  'emoji',
  'stdlib',
  'skinparameters',
  'license',
  'version',
  'authors',
  'donors',
  'sudoku',
  'help themes',
  'help types',
  'help keywords',
  'help font',
  'help colors',
]

/** The helpers that take more after a space: no connector is due after one. */
export const HELPER_HEADS = ['colors', 'help']

const helpers = HELPERS.map((label) => ({ label, type: 'keyword', docKey: `helper:${label}` }))

/** A keyword's docs key, lower-cased as `docs/element.js` reads it (`stackMode`, `end fork`). */
const keyOf = (label) => `keyword:${label.toLowerCase()}`

/** The hand-kept words rank above the server's (X11). */
const options = labels.map((label) => ({ label, type: 'keyword', boost: 1, docKey: keyOf(label) }))

/** The multi-word labels, such as `end fork`, as their words. */
const PHRASES = [...labels, ...HELPERS].filter((label) => label.includes(' ')).map((label) => label.split(' '))

// Built once per server answer, so `withDocs` finds the same arrays again (F5).
const answered = new WeakMap() // server answer → { phrases, offered, withHelpers }

/** The server's words beside the hand-kept ones: its phrases, the options, and those with the helpers. */
function fromServer(server) {
  if (!answered.has(server)) {
    const known = new Set(labels)
    const extra = [...new Set([...server.types, ...server.keywords])].filter((label) => !known.has(label))
    const offered = [...options, ...extra.map((label) => ({ label, type: 'keyword', docKey: keyOf(label) }))]
    answered.set(server, {
      phrases: [...PHRASES, ...extra.filter((label) => label.includes(' ')).map((label) => label.split(' '))],
      offered,
      withHelpers: [...offered, ...helpers],
    })
  }
  return answered.get(server)
}

/** Whether some phrase starts with `words`, each one complete. */
function startsAPhrase(words, phrases) {
  return phrases.some((phrase) => words.every((word, index) => phrase[index] === word) && phrase.length > words.length)
}

/** Whether the line sits in a `@startuml` block; the line itself is blanked, as it is still being typed. */
export function inUml(state, number) {
  const diagram = diagramAt(diagramsWithout(state.doc, number), number)
  return diagram?.start != null && diagram.type === 'uml'
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function keywords(context) {
  const typed = context.matchBefore(/^\s*(?:[\w-]+ )*[\w-]*/)
  if (!typed || inStyleBody(context.state, context.pos)) {
    return null
  }
  const word = typed.text.trimStart()
  if (!word && !context.explicit) {
    return null
  }
  const { phrases, offered, withHelpers } = fromServer(await serverKeywords())
  const before = word.split(' ').slice(0, -1)
  if (before.length && !startsAPhrase(before, phrases)) {
    return null
  }
  const line = context.state.doc.lineAt(context.pos)
  const alone = line.text.slice(context.pos - line.from).trim() === ''
  const offerHelpers = alone && helpers.some(({ label }) => label.startsWith(word)) && inUml(context.state, line.number)
  return { from: typed.to - word.length, options: offerHelpers ? withHelpers : offered, validFor: /^[\w-]*(?: [\w-]*)*$/ }
}
