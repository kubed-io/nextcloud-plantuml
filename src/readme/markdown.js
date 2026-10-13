/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reads the two things the README observer needs out of the README's own text:
 * its fenced code blocks, in order, and its images. Text's DOM keeps neither the
 * fence's language nor an image's alt text reliably, so they come from here.
 *
 * A line scanner, not a Markdown parser: CommonMark fences (``` or ~~~, closed
 * by a run of the same character at least as long) and inline images. Pure, so
 * it runs under vitest in plain node.
 */

const OPENING = /^( *)(`{3,}|~{3,})(.*)$/
const IMAGE = /!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)"']*?))\s*(?:"[^"]*"|'[^']*')?\s*\)/g
// Text's AttachmentResolver loads these as they are; only a relative path is a
// file in the user's folder.
const DIRECT = /^(?:https?:|data:)/i

function scan(md) {
  const fences = []
  const text = []
  const lines = md.replace(/\r?\n$/, '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const open = OPENING.exec(lines[i])
    // CommonMark: a backtick fence's info string may not hold a backtick.
    if (!open || (open[2][0] === '`' && open[3].includes('`'))) {
      text.push(lines[i])
      continue
    }
    const [, indent, marker, info] = open
    const closing = new RegExp(`^ *${marker[0]}{${marker.length},} *$`)
    const indentation = new RegExp(`^ {0,${indent.length}}`)
    const body = []
    for (i++; i < lines.length && !closing.test(lines[i]); i++) {
      body.push(lines[i].replace(indentation, ''))
    }
    fences.push({ lang: info.trim().split(/\s+/)[0], source: body.join('\n'), index: fences.length })
  }
  return { fences, text: text.join('\n') }
}

/**
 * Every fenced block in document order. `index` counts all of them, so a
 * mermaid fence between two plantuml ones keeps the numbering Text's code
 * blocks have.
 *
 * @param {string} md
 * @return {Array<{lang: string, source: string, index: number}>}
 */
export function findFences(md) {
  return scan(md).fences
}

/**
 * Every image outside a fence whose source is a relative path. The source is
 * as written, unwrapped from `<…>`; a bare space is accepted although CommonMark
 * would end the link there.
 *
 * @param {string} md
 * @return {Array<{alt: string, src: string}>}
 */
export function findImages(md) {
  return [...scan(md).text.matchAll(IMAGE)]
    .map(([, alt, bracketed, bare]) => ({ alt, src: (bracketed ?? bare).trim() }))
    .filter(({ src }) => src && !DIRECT.test(src))
}
