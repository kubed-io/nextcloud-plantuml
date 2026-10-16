/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lexicon: the rules PlantUML's grammars share and the helpers that build
 * stream modes from them. The core grammar imports it; a profile, which imports
 * no core module, gets it as `core.lex`.
 */
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode'
import * as shared from './rules.js'
import { table } from './table.js'

/**
 * The token of the first rule in `rules` that matches where `stream` stands,
 * the stream moved past it, or null with the stream left where it was. Only a
 * rule with one token is tried: a rule with group tokens wants simple-mode to
 * hand its groups back one at a time.
 *
 * @param {import('@codemirror/language').StringStream} stream
 * @param {object[]} rules simple-mode rules
 * @return {string|null}
 */
function match(stream, rules) {
  for (const rule of rules) {
    if (typeof rule.token !== 'string' || (rule.sol && !stream.sol())) continue
    // simple-mode takes a regex's source as a string too.
    if (stream.match(rule.regex instanceof RegExp ? rule.regex : new RegExp(rule.regex))) return rule.token
  }
  return null
}

/**
 * A stream mode that reads every line as Creole with `base` for its text, the
 * tags Creole opens ending with their line, for a profile written by hand. An
 * inline `<math>` or `<latex>` is plain up to its closer (`creoleStates`). With
 * `lines`, it reads a body's lines as H8 has them too (`lines()`): rules and
 * headings, list markers, tree lines, a `<code>` block monospace to `</code>`
 * and a `<latex>` block plain to `</latex>`; the profile ends the body, and a
 * block left open with it.
 *
 * @param {string|null} base
 * @param {object} [options]
 * @param {boolean} [options.lines]
 */
const textMode = (base, { lines = false } = {}) => table({
  start: [...(lines ? shared.lines('code') : []), ...shared.creole(base)],
  code: shared.codeLines(null, 'start'),
  ...shared.creoleStates.states,
  latexBlock: [{ regex: /<\/latex>$/, sol: true, token: 'tagName', pop: true }, { regex: /.+/, token: null }],
}, { lineStates: shared.creoleStates.lineStates })

export const lex = { simpleMode, table, match, textMode, ...shared }
