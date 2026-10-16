/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startflow` blocks (T18), a table of the lexicon's (`core.lex`), as `flowdiagram/` of 1.2026.8
 * reads them: it registers two line forms only. A box is `[n|s|e|w] id "label"`, a link
 * `[n|s|e|w] id`. The direction is one letter followed by a space, so `ew "x"` is the id `ew`; it is a
 * modifier, the box's id a classifier (`start "Start"` names a box, never a keyword), the label a
 * string, and a link's id plain. The common lines are syntax errors here (G4), so `title` stays plain.
 */
export default (core) => {
  const { table } = core.lex
  const direction = '(?:([nsew])([ \\t]+))?'
  const mode = table({
    start: [
      { regex: new RegExp(`([ \\t]*)${direction}(\\w+)([ \\t]+)(".*")(?=[ \\t]*$)`, 'i'), sol: true, token: [null, 'modifier', null, 'typeName', null, 'string'] },
      { regex: new RegExp(`([ \\t]*)([nsew])([ \\t]+)(\\w+)(?=[ \\t]*$)`, 'i'), sol: true, token: [null, 'modifier', null, null] },
    ],
  })
  return { type: 'flow', mode, completions: [], lints: [], values: [] }
}
