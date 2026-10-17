/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A Creole tag's attributes: after `<font `, `<img ` or `<style ` (that last
 * only at the start of a line) and a space, or after an attribute written and
 * a space, those the tag takes and has not got; the same inside the `{…}`
 * after an icon, emoji, sprite, `<img:…>` or `<qrcode:…>`. Each is inserted as
 * `name=` and opens the value's completion. Not on a `!` line, in a comment or
 * a style block, or inside a quoted value.
 */
import { reopenPlain } from './apply.js'
import { inStyleBody } from '../regions.js'

const FONT = ['size', 'color']
const IMG = ['src', 'vspace', 'valign']
const STYLE = ['file']
const ICON = ['scale', 'color']
const SCALE = ['scale']

const VALUE = '(?:"[^"]*"|\'[^\']*\'|[^\\s"\'<>]+)'
// `<name`, the attributes written (each `name=value`), a space, the name being typed.
const TAG = new RegExp(`(?:^|[^<])<(font|img|style)((?:\\s+[\\w-]+=${VALUE})*)\\s+([\\w-]*)$`)
// `<&icon{`, `<:emoji:{`, `<$sprite{`, `<img:path{`, `<qrcode:text{`, the keys written (each `key=value,`), the key being typed.
const BRACE = /<(?:#\w+)?(&[-\w]+|:[^:\s<>]+:|\$[\w-]+|img:[^>{}]+|qrcode:[^>{}]+)\{((?:[\w-]+=[^,{}]*,)*)([\w-]*)$/

const TAKEN = /([\w-]+)=/g

/** The open tag at the end of `lead`: the attributes it takes, those written and the part typed; or null. */
function openTag(lead) {
  const tag = TAG.exec(lead)
  if (tag) {
    const at = tag.index + tag[0].indexOf('<')
    return tag[1] === 'style' && lead.slice(0, at).trim() !== ''
      ? null
      : { names: { font: FONT, img: IMG, style: STYLE }[tag[1]], written: tag[2], typed: tag[3] }
  }
  const brace = BRACE.exec(lead)
  if (brace) {
    return { names: /^(?:img|qrcode):/.test(brace[1]) ? SCALE : ICON, written: brace[2], typed: brace[3] }
  }
  return null
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function tagAttributes(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = context.state.sliceDoc(line.from, context.pos)
  if (/^\s*[!']/.test(before) || inStyleBody(context.state, context.pos)) {
    return null
  }
  const open = openTag(before)
  if (!open) {
    return null
  }
  const written = new Set([...open.written.matchAll(TAKEN)].map((m) => m[1]))
  const options = open.names
    .filter((name) => !written.has(name))
    .map((name) => ({ label: `${name}=`, type: 'property', apply: reopenPlain }))
  if (options.length === 0) {
    return null
  }
  return { from: context.pos - open.typed.length, options, validFor: /^[\w-]*$/ }
}
