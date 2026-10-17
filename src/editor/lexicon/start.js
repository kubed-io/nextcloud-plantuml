/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * How a `@start` line is read, on its own so the Files bundle can split a file
 * into diagrams without the whole grammar.
 */

const LEAD = /^[\s{][\s"“”]*/
const TAIL = /[\s}"“”]/
const QUOTE = /["“”]/

/**
 * `text` without the characters at its end that `char` matches, read from the end one at a
 * time: a `[…]*$` after a lazy group backtracks quadratically on a long run of spaces.
 *
 * @param {string} text
 * @param {RegExp} char
 * @return {string}
 */
export function untailed(text, char) {
  let end = text.length
  while (end > 0 && char.test(text[end - 1])) {
    end--
  }
  return text.slice(0, end)
}

/**
 * A diagram's name, as PlantUML 1.2026.8 reads it (`StartUtils.patternFilename`, B1): the rest of
 * a `@start<type>` line from the space or `{` after the type (and its arguments), with the
 * spaces, quotes and braces around the name split off. Null when the rest is no name: it does
 * not start with a space or `{`, or a quote is left inside the name. The quotes are `"`, `“`
 * and `”`.
 *
 * @param {string} rest
 * @return {[string, string, string, string]|null} as a match: the rest, the lead, the name, the tail
 */
export function startName(rest) {
  const lead = LEAD.exec(rest)?.[0]
  if (lead === undefined) {
    return null
  }
  const name = untailed(rest.slice(lead.length), TAIL)
  return QUOTE.test(name) ? null : [rest, lead, name, rest.slice(lead.length + name.length)]
}

/** The arguments in parentheses straight after the type; group 1 is what is between them. */
export const startCall = /^\(([^)]*)\)/
