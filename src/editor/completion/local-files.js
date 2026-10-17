/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Paths beside the diagram, one folder at a time: after `!include ` (and its
 * variants) and `<style file=`, the folder the typed path names, relative to
 * the edited file's folder (`/` is the user's root, never above it). A folder
 * inserts `name/` and opens the next level. Picking `<` opens the stdlib
 * (stdlib.js), which is not here.
 *
 * After `path!` the names inside that file: its `!startsub` sections for
 * `!includesub`, its blocks (`@startuml(id=NAME) Title`) for
 * the other includes: the ids first, then each block's index, with its name (else its type) beside it,
 * because PlantUML takes a block by id or index and never by a bare name. Each file is read once per page.
 */
import { pickedCompletion, startCompletion } from '@codemirror/autocomplete'
import { listFolder, loadFile } from '../save.js'
import { filePath } from '../lint/state.js'
import { blocksOf, scan } from '../blocks.js'

const INCLUDE = /^\s*!include(?:_many|_once|sub)?[ \t]+([^\s]*)$/
const INCLUDE_NAME = /^\s*!include(_many|_once|sub)?[ \t]+(?:"([^"!]+)"|([^\s"!]+))!([^\s"]*)$/
const INCLUDESUB = /^\s*!includesub[ \t]+$/
const SECTION = /^\s*!startsub[ \t]+(\S+)/gm
const STYLE = /<style file=([^\s>]*)$/
const INCLUDE_FILES = /\.(?:puml|iuml|plantuml|pu|txt)$/i
const STYLE_FILES = /\.(?:css|txt)$/i

export function reopen(view, completion, from, to, suffix = '') {
  const insert = completion.label + suffix
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input.complete',
    annotations: pickedCompletion.of(completion),
  })
  startCompletion(view)
}

/** A file picked after `!includesub` gets the `!` and opens its section names. */
const reopenWithBang = (view, completion, from, to) => reopen(view, completion, from, to, '!')

/** Files read this page, by path: a second completion does not read again. */
const reads = new Map()

// An included file may change elsewhere: forget what was read when the page
// comes back, the moments the preview redraws too.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('focus', () => reads.clear())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      reads.clear()
    }
  })
}

function readOnce(path) {
  if (!reads.has(path)) {
    const read = loadFile(path).then((file) => file.content)
    read.catch(() => reads.delete(path))
    reads.set(path, read)
  }
  return reads.get(path)
}

/** Every first group (or the second, when the first is empty) of `pattern` in `text`, once each. */
function namesIn(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((m) => m[1] ?? m[2]))]
}

/** The ids of the blocks in `content`, then their indexes, each with the block's name or type beside it. */
function blockOptions(content) {
  // The server's resolver reads a CRLF file's lines without their `\r`; a `@startuml\r` opens nothing here.
  const blocks = blocksOf(scan(content.replace(/\r\n?/g, '\n')))
  const detail = (block) => block.name || block.type
  const ids = new Map()
  for (const block of blocks) {
    if (block.id && !ids.has(block.id)) {
      ids.set(block.id, block)
    }
  }
  return [
    ...[...ids].map(([label, block]) => ({ label, detail: detail(block), type: 'constant' })),
    ...blocks.map((block, index) => ({ label: String(index), detail: detail(block), type: 'constant' })),
  ]
}

/** The names of the sections or blocks of the file `name` points at. */
async function namesOf(context, file, kind, name, typed) {
  if (/^<|^https?:|[$%]/.test(name)) {
    return null
  }
  const slash = name.lastIndexOf('/')
  const folder = folderOf(file, name.slice(0, slash + 1))
  if (folder === null) {
    return null
  }
  let content
  try {
    content = await readOnce(`${folder === '/' ? '' : folder}/${name.slice(slash + 1)}`)
  } catch {
    return null
  }
  const options = kind === 'sub' ? namesIn(content, SECTION).map((label) => ({ label, type: 'constant' })) : blockOptions(content)
  return {
    from: context.pos - typed.length,
    options,
    validFor: /^[^\s"]*$/,
  }
}

const fixed = [
  { label: '<', detail: 'standard library', type: 'text', boost: 3, apply: reopen },
  { label: 'https://', detail: 'web address', type: 'text', boost: 2 },
  { label: 'http://', detail: 'web address', type: 'text', boost: 2 },
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
  const file = context.state.facet(filePath)
  const named = INCLUDE_NAME.exec(before)
  if (named && file) {
    return namesOf(context, file, named[1] === 'sub' ? 'sub' : 'block', named[2] ?? named[3], named[4])
  }
  const include = INCLUDE.exec(before)
  const match = include ?? STYLE.exec(before)
  if (!match || !file) {
    return null
  }
  const typed = match[1]
  if (typed.startsWith('<') || /^https?:/.test(typed)) {
    return null
  }
  const slash = typed.lastIndexOf('/')
  const folder = folderOf(file, typed.slice(0, slash + 1))
  if (folder === null) {
    return null
  }
  const own = INCLUDESUB.test(before) ? namesIn(context.state.doc.toString(), SECTION) : []
  const ownOptions = own.map((label) => ({ label, type: 'constant', boost: 4 }))
  let entries
  try {
    entries = await listFolder(folder)
  } catch {
    // The diagram's own sections do not depend on the listing.
    return own.length ? { from: context.pos, options: ownOptions, validFor: /^[\w-]*$/ } : null
  }
  const sub = include && /^\s*!includesub/.test(before)
  const wanted = include ? INCLUDE_FILES : STYLE_FILES
  const options = entries
    .filter((entry) => entry.folder || wanted.test(entry.name))
    .map((entry) => (entry.folder
      ? { label: `${entry.name}/`, type: 'namespace', boost: 1, apply: reopen }
      : { label: entry.name, type: 'file', ...(sub && { apply: reopenWithBang }) }))
  if (folder !== '/') {
    options.unshift({ label: '../', type: 'namespace', boost: 1, apply: reopen })
  }
  if (include && typed === '') {
    options.unshift(...fixed)
  }
  options.unshift(...ownOptions)
  return { from: context.pos - (typed.length - slash - 1), options, validFor: /^[^/]*$/ }
}
