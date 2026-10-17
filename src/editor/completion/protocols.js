/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The scheme alone, where a path goes (C10): `file://` after `@start<type> `, which names the
 * file the command line writes the image to, and `https://` and `http://` after `[[`, `<img:`
 * and `<img src=`. What follows a scheme cannot be guessed, so a pick inserts nothing more. The
 * includes' schemes come with their local files (local-files.js). Not once a name that is no
 * start of `file://` is typed after `@startuml`, nor in a comment.
 */
import { ensureSyntaxTree } from '@codemirror/language'
import { WEB_SCHEMES } from './apply.js'

const START = /^[ \t]*@start[^\s{}"“”(]+(?:\([^)]*\))?[ \t]+([a-z:/]*)$/
const FILE = 'file://'
const WEB = /(?:\[\[|<img:|<img\s(?:[^>]*\s)?src=)([a-z+.-]*)$/i

const file = [{ label: FILE, detail: 'file path', type: 'text' }]

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export function protocols(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  if (/^\s*'/.test(before) || ensureSyntaxTree(context.state, context.pos, 50)?.resolveInner(context.pos, -1).name === 'comment') {
    return null
  }
  const start = START.exec(before)
  // While the scheme's start is typed, `file://` stays on offer; a name is no scheme.
  const scheme = (text) => text.length < FILE.length && FILE.startsWith(text)
  if (start && scheme(start[1])) {
    return { from: context.pos - start[1].length, options: file, validFor: scheme }
  }
  const typed = WEB.exec(before)
  if (!typed) {
    return null
  }
  return { from: context.pos - typed[1].length, options: WEB_SCHEMES, validFor: /^[a-z+.-]*$/i }
}
