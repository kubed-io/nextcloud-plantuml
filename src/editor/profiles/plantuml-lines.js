/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lines of a data block that are PlantUML's, not the data's: `'` and
 * `/' … '/` comments, `!` preprocessor lines, `<style>` blocks and
 * `#highlight`. A profile's lint reads the body without them; a profile's
 * module, so it lands in the profiles' chunks and never in the editor's.
 */
export const HIGHLIGHT = /^\s*#highlight\b/
const OWN = /^\s*(?:'|!|#highlight\b)/

/**
 * The lines with PlantUML's own blanked, so every other line keeps its number.
 *
 * @param {string[]} lines
 * @return {string[]}
 */
export function dataLines(lines) {
  let closer = null // what ends the comment or style block in progress
  return lines.map((line) => {
    const text = line.trim()
    if (closer) {
      if (text.includes(closer)) {
        closer = null
      }
      return ''
    }
    if (text.startsWith("/'")) {
      closer = text.includes("'/", 2) ? null : "'/"
      return ''
    }
    if (text.startsWith('<style>')) {
      closer = text.includes('</style>') ? null : '</style>'
      return ''
    }
    return OWN.test(line) ? '' : line
  })
}
