/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML's standard library after `!include <` (and its variants), one
 * level at a time: first the libraries the server has (GET
 * /apps/plantuml/stdlib), then a library's folders and `.puml` files. The
 * server lists no files, so those come from an index per library folder,
 * generated from plantuml-stdlib (scripts/vocabulary.mjs), each its own chunk
 * loaded the first time that library is opened; a folder that only links to
 * another is read as that one. A folder inserts `name/` and opens the next
 * level; a file its path and the closing `>`.
 */
import { reopen } from './local-files.js'
import { serverStdlib } from './server-list.js'

const INCLUDE = /^\s*!include(?:_many|_once|sub)?[ \t]+<([^>\s]*)$/

// Lazy: the entry must never import a chunk statically.
const indexes = Object.fromEntries(Object.entries(import.meta.glob('../data/stdlib/*.json'))
  .map(([path, load]) => [path.slice(path.lastIndexOf('/') + 1, -'.json'.length), load]))
const folders = Object.keys(indexes)

/** A library's index folder: its name in any case, else its name and version (`material7` 7.4.47 → `material7.4.47`). */
function folderOf({ name, version }) {
  const wanted = [name, name + version]
  // An alias ending in the version's major number: `material7` + `7.4.47`.
  const major = /\d+$/.exec(name)?.[0]
  if (major && version.startsWith(`${major}.`)) {
    wanted.push(name.slice(0, -major.length) + version)
  }
  for (const candidate of wanted) {
    const folder = folders.find((f) => f.toLowerCase() === candidate.toLowerCase())
    if (folder) {
      return folder
    }
  }
  return null
}

/** Each index, loaded once; a failed load is forgotten, so the next key tries again. */
const loaded = new Map()

/** A folder's files; a folder whose README links to another (`awslib` → `awslib14`) has that one's. */
async function load(folder) {
  const { default: index } = await indexes[folder]()
  if (index.link && indexes[index.link]) {
    return (await indexes[index.link]()).default.files ?? []
  }
  return index.files ?? []
}

function files(folder) {
  if (!loaded.has(folder)) {
    loaded.set(folder, load(folder)
      .catch((error) => {
        loaded.delete(folder)
        throw error
      }))
  }
  return loaded.get(folder)
}

const openLibrary = (view, completion, from, to) => reopen(view, completion, from, to, '/')

/** The folders and files directly under `dir` (`''` or `a/b/`) among a library's paths. */
function level(paths, dir) {
  const seen = new Set()
  const options = []
  for (const path of paths) {
    if (!path.startsWith(dir)) {
      continue
    }
    const rest = path.slice(dir.length)
    const slash = rest.indexOf('/')
    if (slash < 0) {
      options.push({ label: rest, type: 'file', apply: `${rest}>` })
    } else if (!seen.has(rest.slice(0, slash))) {
      seen.add(rest.slice(0, slash))
      options.push({ label: rest.slice(0, slash + 1), type: 'namespace', boost: 1, apply: reopen })
    }
  }
  return options
}

/** @param {import('@codemirror/autocomplete').CompletionContext} context */
export async function stdlib(context) {
  const line = context.state.doc.lineAt(context.pos)
  const include = INCLUDE.exec(line.text.slice(0, context.pos - line.from))
  if (!include) {
    return null
  }
  const typed = include[1]
  const libraries = await serverStdlib()
  const slash = typed.indexOf('/')
  if (slash < 0) {
    if (libraries.length === 0) {
      return null
    }
    const options = libraries.map((library) => ({
      label: library.name,
      docKey: `library:${library.name}`,
      detail: `${library.version} · ${library.source}`,
      type: 'namespace',
      // A library with no index is offered by its name only.
      ...(folderOf(library) && { apply: openLibrary }),
    }))
    return { from: context.pos - typed.length, options, validFor: /^[^/>\s]*$/ }
  }
  const name = typed.slice(0, slash).toLowerCase()
  const library = libraries.find((candidate) => candidate.name.toLowerCase() === name)
  const folder = library && folderOf(library)
  if (!folder) {
    return null
  }
  let paths
  try {
    paths = await files(folder)
  } catch {
    return null
  }
  const dir = typed.slice(slash + 1, typed.lastIndexOf('/') + 1)
  const options = level(paths, dir)
  if (options.length === 0) {
    return null
  }
  return { from: context.pos - (typed.length - typed.lastIndexOf('/') - 1), options, validFor: /^[^/>\s]*$/ }
}
