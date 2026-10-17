/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The two patterns a `@start` line is read with, on their own so the Files
 * bundle can split a file into diagrams without the whole grammar.
 */

/**
 * A diagram's name, as PlantUML 1.2026.8 reads it (`StartUtils.patternFilename`, B1): the rest of
 * a `@start<type>` line from the space or `{` after the type (and its arguments), with the
 * spaces, quotes and braces around the name split off. Groups: the lead, the name, the tail.
 * The quotes are `"`, `“` and `”`.
 */
export const startName = /^([\s{][\s"“”]*)([^"“”]*?)([\s}"“”]*)$/

/** The arguments in parentheses straight after the type; group 1 is what is between them. */
export const startCall = /^\(([^)]*)\)/
