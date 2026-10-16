/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Creole, the markup inside PlantUML's text: after a `<`, the tags, each a
 * snippet whose blanks are fields; after `</`, the closers of the tags still
 * open on the line, innermost first. Not where a `<` means something else: a
 * <<stereotype>>, a <style> or << line, a `!` line (`!include <` is the
 * stdlib), a style block, a comment, or an arrow such as `A <- B`. `<code>`
 * opens a block, so only at the start of a line.
 */
import { snippetCompletion } from '@codemirror/autocomplete'
import { connectorTyped } from './connectors.js'
import { inStyleBody } from '../plantuml-mode.js'

/** [label, template, detail]. `${1:12}` is a field holding 12; a bare `${12}` would be field 12. */
const TAGS = [
  ['<b>', '<b>${}</b>', 'bold'],
  ['<i>', '<i>${}</i>', 'italic'],
  ['<u>', '<u>${}</u>', 'underline'],
  ['<s>', '<s>${}</s>', 'strike-through'],
  ['<w>', '<w>${}</w>', 'wavy underline'],
  ['<size:12>', '<size:${1:12}>', 'size'],
  ['<color:#>', '<color:${}>', 'colour'],
  ['<back:#>', '<back:${}>', 'background'],
  ['<font:name>', '<font:${name}>${}</font>', 'font'],
  ['<plain>', '<plain>${}</plain>', 'no formatting'],
  ['<sub>', '<sub>${}</sub>', 'subscript'],
  ['<sup>', '<sup>${}</sup>', 'superscript'],
  ['<img:url>', '<img:${url}>', 'image'],
  ['<code>', '<code>\n${}\n</code>', 'monospace block'],
  ['<r>', '<r>', 'right-aligned cell'],
]

const options = TAGS.map(([label, template, detail]) => snippetCompletion(template, { label, detail, type: 'text' }))
const inline = options.filter((option) => option.label !== '<code>')

/** The tags a `</…>` can close. */
const CLOSING = new Set(['b', 'i', 'u', 's', 'w', 'size', 'color', 'back', 'font', 'plain', 'sub', 'sup', 'code'])

/** The tags opened and not yet closed in `text`, innermost first. */
function stillOpen(text) {
  const open = []
  for (const [, slash, name] of text.matchAll(/<(\/?)([a-z]+)(?::[^>]*)?>/g)) {
    if (!CLOSING.has(name)) {
      continue
    }
    const at = open.lastIndexOf(name)
    if (!slash) {
      open.push(name)
    } else if (at >= 0) {
      open.splice(at, 1)
    }
  }
  return [...new Set(open.reverse())]
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function creole(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = context.state.sliceDoc(line.from, context.pos)
  // `<<` opens a stereotype, never a tag.
  const typed = /(?:^|[^<])(<\/?[a-z]*)$/.exec(before)
  if (!typed || /^\s*(?:'|!|<style>|<<)/.test(before) || inStyleBody(context.state, context.pos)) {
    return null
  }
  const from = context.pos - typed[1].length
  const lead = before.slice(0, from - line.from)
  if (typed[1].startsWith('</')) {
    const closers = stillOpen(lead)
    if (closers.length === 0) {
      return null
    }
    return {
      from,
      options: closers.map((name, i) => ({ label: `</${name}>`, type: 'text', boost: -i })),
      validFor: /^<\/[a-z]*$/,
    }
  }
  if (connectorTyped(lead) !== null) {
    return null
  }
  return { from, options: lead.trim() ? inline : options, validFor: /^<[a-z]*$/ }
}
