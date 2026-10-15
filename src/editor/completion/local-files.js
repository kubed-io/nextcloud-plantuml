/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Paths beside the diagram, one folder at a time: after `!include ` (and its
 * variants) and `<style file=`, the folder the typed path names, relative to
 * the edited file's folder (`/` is the user's root, never above it). A folder
 * inserts `name/` and opens the next level. The stdlib after `<` is not here.
 */
import { startCompletion } from '@codemirror/autocomplete'
import { listFolder } from '../save.js'
import { filePath } from '../lint/state.js'

const INCLUDE = /^\s*!include(?:_many|_once|sub)?[ \t]+([^\s]*)$/
const STYLE = /<style file=([^\s>]*)$/
const INCLUDE_FILES = /\.(?:puml|iuml|plantuml|pu|txt)$/i
const STYLE_FILES = /\.(?:css|txt)$/i

function reopen(view, completion, from, to) {
  view.dispatch({ changes: { from, to, insert: completion.label }, selection: { anchor: from + completion.label.length } })
  startCompletion(view)
}

const fixed = [
  { label: '<', detail: 'standard library', type: 'text', boost: 3 },
  { label: 'https://', detail: 'web address', type: 'text', boost: 2 },
]

/**
 * The folder `typed` names, as a path in the user's files, or null above the root.
 *
 * @param {string} file the edited file's path
 * @param {string} dir the typed path up to its last `/`
 */
function folderOf(file, dir) {
  const parts = dir.startsWith('/') ? [] : file.split('/').slice(1, -1)
  for (const part of dir.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) {
        return null
      }
    } else if (part !== '' && part !== '.') {
      parts.push(part)
    }
  }
  return '/' + parts.join('/')
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function localFiles(context) {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const include = INCLUDE.exec(before)
  const match = include ?? STYLE.exec(before)
  const file = context.state.facet(filePath)
  if (!match || !file) {
    return null
  }
  const typed = match[1]
  if (typed.startsWith('<') || typed.startsWith('http')) {
    return null
  }
  const slash = typed.lastIndexOf('/')
  const folder = folderOf(file, typed.slice(0, slash + 1))
  if (folder === null) {
    return null
  }
  let entries
  try {
    entries = await listFolder(folder)
  } catch {
    return null
  }
  const wanted = include ? INCLUDE_FILES : STYLE_FILES
  const options = entries
    .filter((entry) => entry.folder || wanted.test(entry.name))
    .map((entry) => (entry.folder
      ? { label: `${entry.name}/`, type: 'namespace', boost: 1, apply: reopen }
      : { label: entry.name, type: 'file' }))
  if (folder !== '/') {
    options.unshift({ label: '../', type: 'namespace', boost: 1, apply: reopen })
  }
  if (include && typed === '') {
    options.unshift(...fixed)
  }
  return { from: context.pos - (typed.length - slash - 1), options, validFor: /^[^/]*$/ }
}
