/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The words a PlantUML line starts with, grouped as the diagrams use them.
 * A word joins a list here; a `detail` is for the few whose name says little.
 */
import { diagramAt, scan } from '../blocks.js'
import { inStyleBody } from '../plantuml-mode.js'
import { serverKeywords } from './server-list.js'

/** Sequence participants; `names.js` reads declarations with these too. */
export const PARTICIPANTS = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue']

/** Class, component, use case and state elements; `names.js` reads these too. */
export const STRUCTURES = ['class', 'interface', 'abstract', 'enum', 'package', 'namespace', 'component', 'node', 'cloud', 'frame', 'folder', 'rectangle', 'usecase', 'state', 'object']

const SEQUENCE = ['alt', 'else', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'end', 'note', 'ref', 'activate', 'deactivate', 'destroy', 'return', 'autonumber', 'title', 'header', 'footer', 'legend', 'skinparam', 'hide', 'show', 'left', 'right', 'top', 'bottom']

const ACTIVITY = ['start', 'stop', 'if', 'then', 'elseif', 'endif', 'while', 'endwhile', 'repeat', 'fork', 'end fork']

const DETAILS = {
  alt: 'alternatives',
  opt: 'optional',
  par: 'parallel',
  ref: 'reference',
  autonumber: 'number messages',
  skinparam: 'style',
}

const labels = [...new Set([...PARTICIPANTS, ...STRUCTURES, ...SEQUENCE, ...ACTIVITY])]

/** Every word a line can start with; `connectors.js` offers nothing after one. */
export const KEYWORDS = labels.filter((label) => !label.includes(' '))

/** PlantUML's one-line commands that draw a reference page; offered on a line of their own in a uml block (X13). */
const HELPERS = {
  colors: 'the named colours',
  listsprite: 'the standard sprites',
  listopeniconic: 'the Open Iconic icons',
  listfonts: 'the fonts on the server',
  emoji: 'the emoji',
  stdlib: 'the standard library',
  skinparameters: 'the skin parameters',
  license: 'the license',
  version: 'the PlantUML version',
  authors: 'the authors',
  donors: 'the donors',
  sudoku: 'a sudoku',
  'help themes': 'the themes',
  'help types': 'the element types',
  'help keywords': 'the keywords',
  'help font': 'the font help',
  'help colors': 'the colour help',
}

/** The helpers that take more after a space: no connector is due after one. */
export const HELPER_HEADS = ['colors', 'help']

const helpers = Object.entries(HELPERS).map(([label, detail]) => ({ label, type: 'keyword', detail }))

/** The hand-kept words rank above the server's (X11). */
const options = labels.map((label) => ({ label, type: 'keyword', boost: 1, ...(DETAILS[label] && { detail: DETAILS[label] }) }))

/** The multi-word labels, such as `end fork`, as their words. */
const PHRASES = [...labels, ...Object.keys(HELPERS)].filter((label) => label.includes(' ')).map((label) => label.split(' '))

/** Whether some phrase starts with `words`, each one complete. */
function startsAPhrase(words, phrases) {
  return phrases.some((phrase) => words.every((word, index) => phrase[index] === word) && phrase.length > words.length)
}

/** Whether the line sits in a `@startuml` block; the line itself is blanked, as it is still being typed. */
export function inUml(state, number) {
  const lines = state.doc.toString().split('\n')
  lines[number - 1] = ''
  const diagram = diagramAt(scan(lines.join('\n')), number)
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
  const server = await serverKeywords()
  const known = new Set(labels)
  const extra = [...new Set([...server.types, ...server.keywords])].filter((label) => !known.has(label))
  const before = word.split(' ').slice(0, -1)
  const phrases = [...PHRASES, ...extra.filter((label) => label.includes(' ')).map((label) => label.split(' '))]
  if (before.length && !startsAPhrase(before, phrases)) {
    return null
  }
  const line = context.state.doc.lineAt(context.pos)
  const alone = line.text.slice(context.pos - line.from).trim() === ''
  const offerHelpers = alone && helpers.some(({ label }) => label.startsWith(word)) && inUml(context.state, line.number)
  const offered = [...options, ...extra.map((label) => ({ label, type: 'keyword' }))]
  return { from: typed.to - word.length, options: offerHelpers ? [...offered, ...helpers] : offered, validFor: /^[\w-]*(?: [\w-]*)*$/ }
}
