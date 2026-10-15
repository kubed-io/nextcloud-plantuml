// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates src/editor/data/{vocabulary,builtins,directives}.json from PlantUML's source at the tag
// of the pinned server image (X1), and src/editor/data/stdlib/<folder>.json from plantuml-stdlib at
// the last commit before that release (X5). Needs network; the tests never do.
// Run: node scripts/vocabulary.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const VERSION = '1.2026.8'
const REPO = 'plantuml/plantuml'
const BASE = `https://raw.githubusercontent.com/${REPO}/v${VERSION}/src/main/java/net/sourceforge/plantuml`
const BUILTIN = 'tim/builtin'
const STDLIB = '7167ca0'

async function source(path) {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.text()
}

/** Java source without its comments, so a commented-out declaration is not read. */
const withoutComments = (java) => java.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// The constant names of a Java enum: the identifiers at the start of each
// entry in the body, up to the first `;`, ignoring comments and arguments.
export function enumConstants(java) {
  const stripped = withoutComments(java)
  const open = stripped.indexOf('{', stripped.search(/\benum\b/))
  const end = stripped.indexOf(';', open)
  const body = stripped.slice(open + 1, end === -1 ? undefined : end)
  const names = []
  let depth = 0
  let entry = ''
  for (const ch of body + ',') {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      const name = entry.trim().match(/^[A-Za-z_]\w*/)
      if (name) names.push(name[0])
      entry = ''
    } else if (depth === 0 || ch !== ',') entry += ch
  }
  return names
}

/**
 * The `!` lines of PlantUML's preprocessor, from its line classifier: each
 * `simpleKeyword("!x")` or `RegexLeaf("!x")`, widened by the `RegexOr` of
 * `RegexLeaf("y")` right after it in the same concat (`!include` + `url`
 * gives `!includeurl`; a bare `!end` is not a line, `!endfunction` is), and
 * the `!` + `function`/`procedure` declarations.
 */
export function directiveWords(java) {
  const code = withoutComments(java)
  const words = new Set()
  const literal = /(?:simpleKeyword|new\s+RegexLeaf)\(\s*"(![a-z_]+)"\s*\)/g
  const suffixes = /^(?:\s*,\s*RegexLeaf\.\w+\(\))*\s*,\s*(?:new\s+RegexOptional\(\s*)?new\s+RegexOr\(((?:\s*new\s+RegexLeaf\("\w+"\)\s*,?)+)\)/
  for (const match of code.matchAll(literal)) {
    const parts = code.slice(match.index + match[0].length).match(suffixes)?.[1]
    const following = parts ? [...parts.matchAll(/"(\w+)"/g)].map((m) => m[1]) : []
    if (!following.length) words.add(match[1])
    // `!end` alone is not a line; `!include` is, with or without a suffix.
    else {
      if (match[1] !== '!end') words.add(match[1])
      for (const part of following) words.add(match[1] + part)
    }
  }
  for (const match of code.matchAll(/new\s+RegexLeaf\("!"\)[^;]*?new\s+RegexLeaf\("(function|procedure)"\)/g)) {
    words.add(`!${match[1]}`)
  }
  return [...words].sort()
}

/**
 * The `%` functions declared in one builtin class: every
 * `new TFunctionSignature("%name", n)`, none for a class without one.
 */
export function signatures(java) {
  return [...java.matchAll(/new\s+TFunctionSignature\(\s*"(%\w+)"\s*(?:,\s*(\d+))?/g)].map((m) => ({ name: m[1], args: Number(m[2] ?? 0) }))
}

/** The readme's table rows as `name -> { description, example }`; a continuation row (no name) is skipped. */
export function readmeRows(markdown) {
  const plain = (cell) => cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/``/g, '').trim()
  const rows = new Map()
  for (const line of markdown.split('\n')) {
    const cells = line.split(/\|/).slice(1, -1).map((c) => c.trim())
    const name = cells[0]?.match(/^``(%\w+)``$/)
    if (name && !rows.has(name[1])) {
      rows.set(name[1], { description: plain(cells[1] ?? ''), example: plain(cells[2] ?? '') })
    }
  }
  return rows
}

async function builtins() {
  const api = `https://api.github.com/repos/${REPO}/contents/src/main/java/net/sourceforge/plantuml/${BUILTIN}?ref=v${VERSION}`
  const res = await fetch(api)
  if (!res.ok) throw new Error(`${api}: HTTP ${res.status}`)
  const files = (await res.json()).map((f) => f.name).filter((n) => n.endsWith('.java'))
  const [readme, ...classes] = await Promise.all([source(`${BUILTIN}/readme.md`), ...files.map((f) => source(`${BUILTIN}/${f}`))])
  const rows = readmeRows(readme)
  const byName = new Map(classes.flatMap(signatures).map((s) => [s.name, s]))
  return [...byName.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, args }) => ({ name, args, description: rows.get(name)?.description ?? '', example: rows.get(name)?.example ?? '' }))
}

async function style() {
  const [sname, pname, fontStyle] = await Promise.all([
    source('style/SName.java'),
    source('style/PName.java'),
    source('klimt/font/FontStyle.java'),
  ])
  return {
    plantuml: VERSION,
    style: {
      selectors: enumConstants(sname).map((n) => n.replace(/_$/, '')),
      properties: enumConstants(pname),
      fontStyles: enumConstants(fontStyle).filter((n) => n !== 'BACKCOLOR').map((n) => n.toLowerCase()),
    },
  }
}

async function directives() {
  const java = await source('text/TLineType.java')
  // `!pragma` is a diagram command, not a TLineType line; `!local`/`!global`
  // are the AFFECTATION forms and `!unquoted`/`!final` the function modifiers.
  const extra = ['!pragma', '!local', '!global', '!unquoted', '!final']
  return { plantuml: VERSION, directives: [...new Set([...directiveWords(java), ...extra])].sort() }
}

/**
 * The `.puml` files of each stdlib library folder, from a GitHub tree listing:
 * `folder -> paths below it`, `.puml` dropped, sorted. Nothing else is offered.
 */
export function stdlibIndex(tree) {
  const index = {}
  for (const { path, type } of tree.tree) {
    const match = type === 'blob' && /^stdlib\/([^/]+)\/(.+)\.puml$/.exec(path)
    if (match) (index[match[1]] ??= []).push(match[2])
  }
  for (const files of Object.values(index)) files.sort()
  return index
}

async function stdlib() {
  const api = `https://api.github.com/repos/plantuml/plantuml-stdlib/git/trees/${STDLIB}?recursive=1`
  const res = await fetch(api)
  if (!res.ok) throw new Error(`${api}: HTTP ${res.status}`)
  const tree = await res.json()
  if (tree.truncated) throw new Error(`${api}: truncated`)
  return Object.fromEntries(Object.entries(stdlibIndex(tree)).map(([folder, files]) => [folder, { 'plantuml-stdlib': STDLIB, files }]))
}

const artifacts = [
  { file: 'vocabulary.json', build: style },
  { file: 'builtins.json', build: builtins },
  { file: 'directives.json', build: directives },
  { folder: 'stdlib', build: stdlib },
]

const save = (file, data) => writeFile(new URL(`../src/editor/data/${file}`, import.meta.url), JSON.stringify(data, null, 2) + '\n')

async function write({ file, folder, build }) {
  const data = await build()
  if (folder) {
    // One file per entry, so each is its own chunk.
    await mkdir(new URL(`../src/editor/data/${folder}/`, import.meta.url), { recursive: true })
    for (const [name, entry] of Object.entries(data)) await save(`${folder}/${name}.json`, entry)
    const files = Object.values(data).reduce((sum, entry) => sum + entry.files.length, 0)
    console.info(`${folder}/: ${Object.keys(data).length} folders, ${files} files`)
    return
  }
  await save(file, data)
  const counts = Array.isArray(data) ? { entries: data } : data.style ?? { directives: data.directives }
  console.info(`${file}: ${Object.entries(counts).map(([k, v]) => `${v.length} ${k}`).join(', ')}`)
}

async function main() {
  for (const artifact of artifacts) await write(artifact)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) await main()
