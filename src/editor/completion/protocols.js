/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The scheme alone, where a path goes (C10): `file://` after `@start<type> `, which names the
 * file the command line writes the image to, and `https://` and `http://` after `[[`, `<img:`
 * and `<img src=`. What follows a scheme cannot be guessed, so a pick inserts nothing more. The
 * includes' schemes come with their local files (local-files.js). Not once a name is typed after
 * `@startuml`, nor in a comment.
 */
import { ensureSyntaxTree } from '@codemirror/language'

const START = /^[ \t]*@start[^\s{}"“”(]+(?:\([^)]*\))?[ \t]+$/
const WEB = /(?:\[\[|<img:|<img\s(?:[^>]*\s)?src=)([a-z+.-]*)$/i

const file = [{ label: 'file://', detail: 'file path', type: 'text' }]
const web = [
  { label: 'https://', detail: 'web address', type: 'text', boost: 2 },
  { label: 'http://', detail: 'web address', type: 'text', boost: 2 },
]

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function protocols(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  if (/^\s*'/.test(before) || ensureSyntaxTree(context.state, context.pos, 50)?.resolveInner(context.pos, -1).name === 'comment') {
    return null
  }
  if (START.test(before)) {
    return { from: context.pos, options: file }
  }
  const typed = WEB.exec(before)
  if (!typed) {
    return null
  }
  return { from: context.pos - typed[1].length, options: web, validFor: /^[a-z+.-]*$/i }
}
