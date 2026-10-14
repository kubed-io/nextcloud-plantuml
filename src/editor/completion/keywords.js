/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The words a PlantUML line starts with, grouped as the diagrams use them.
 * A word joins a list here; a `detail` is for the few whose name says little.
 */

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

const options = labels.map((label) => ({ label, type: 'keyword', ...(DETAILS[label] && { detail: DETAILS[label] }) }))

/** The first words of the keywords that have a second, such as `end fork`. */
const TWO_WORD = new Set(labels.filter((label) => label.includes(' ')).map((label) => label.split(' ')[0]))

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function keywords(context) {
  const typed = context.matchBefore(/^\s*(?:\w+ )?\w*/)
  if (!typed) {
    return null
  }
  const word = typed.text.trimStart()
  if (word.includes(' ') && !TWO_WORD.has(word.split(' ')[0])) {
    return null
  }
  if (!word && !context.explicit) {
    return null
  }
  return { from: typed.to - word.length, options, validFor: /^\w*(?: \w*)?$/ }
}
