// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates src/editor/data/{vocabulary,builtins,directives,asciimath}.json from PlantUML's source at
// the tag of the pinned server image (X1, T14), and src/editor/data/stdlib/<folder>.json from plantuml-stdlib at
// the last commit before that release, its files or the folder its README links to (X5). Needs
// network; the tests never do.
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

// The role of each section of AsciiMath's symbol table, by its heading comment (T14).
const SECTIONS = [
  [/greek/, 'symbols'],
  [/binary operation|relation|logical|arrows/, 'operators'],
  [/brackets/, 'brackets'],
  [/miscellaneous/, 'symbols'],
  [/functions|commands/, 'functions'],
  [/newline/, 'keywords'],
]
// A symbol that takes an argument is a function, `_ ^ /` operators, a bracket a bracket, whatever its section.
const TYPES = {
  UNARY: 'functions', BINARY: 'functions', UNDEROVER: 'functions', TEXT: 'functions', INFIX: 'operators',
  LEFTBRACKET: 'brackets', RIGHTBRACKET: 'brackets', LEFTRIGHT: 'brackets',
}
// Where T14 parts from both: the integrals are n-ary like `sum`, ∀ ∃ ⊤ ⊥ are values, `+-` an
// operator, the floor and ceiling halves brackets, and the spaces layout like `newline`.
const ROLES = {
  int: 'functions', oint: 'functions', AA: 'symbols', EE: 'symbols', TT: 'symbols', '_|_': 'symbols',
  '+-': 'operators', '-+': 'operators', '|__': 'brackets', '__|': 'brackets', '|~': 'brackets', '~|': 'brackets',
  lceiling: 'brackets', rceiling: 'brackets', '\\ ': 'keywords', quad: 'keywords', qquad: 'keywords',
}
const STRING = /"(?:[^"\\]|\\.)*"/.source
const TUPLE = new RegExp(String.raw`new\s+Tuple\(\s*(?:new\s+String\[\]\s*\{[^}]*\}\s*,\s*)?(${STRING})\s*,\s*${STRING}\s*,\s*(?:${STRING}|null)\s*,\s*(${STRING}|null)\s*,\s*Ttype\.(\w+)((?:\s*,\s*Flag\.\w+)*)\s*\)`, 'g')

/**
 * AsciiMath's names from PlantUML's port of ASCIIMathTeXImg.js, by the role the
 * editor gives them: `functions`, `symbols`, `operators`, `brackets`, `keywords`.
 * A name's role is its own in `ROLES`, else its type's, else its section's; each
 * TeX name the table copies in (`tex`, unless `NOTEXCOPY`) takes its symbol's.
 * A single letter is a variable however the table lists it (`f`), and `"` opens
 * a text, so neither is a name. A section heading not in `SECTIONS` throws.
 */
export function asciimathNames(java) {
  const read = (match) => ({ input: JSON.parse(match[1]), tex: match[2] === 'null' ? null : JSON.parse(match[2]), type: match[3], flags: match[4] })
  const constants = new Map([...java.matchAll(new RegExp(String.raw`Tuple\s+(aAM\w+)\s*=\s*(?=new\s+Tuple)`, 'g'))]
    .map((m) => [m[1], read(new RegExp(TUPLE.source).exec(java.slice(m.index)))]))
  const open = java.indexOf('{', java.search(/aAMsymbols\s*=/))
  const lists = { functions: new Set(), symbols: new Set(), operators: new Set(), brackets: new Set(), keywords: new Set() }
  let section = null
  for (const line of java.slice(open + 1).split('\n')) {
    if (/^\s*\}/.test(line)) break
    const heading = /^\s*\/\/\s*(\S.*)$/.exec(line)?.[1]
    if (heading) {
      section = SECTIONS.find(([pattern]) => pattern.test(heading))?.[1]
      if (!section) throw new Error(`AsciiMath: no role for the section "${heading}"`)
      continue
    }
    const symbols = /new\s+Tuple/.test(line)
      ? [...line.matchAll(TUPLE)].map(read)
      : [...line.matchAll(/\baAM\w+/g)].map((m) => constants.get(m[0])).filter(Boolean)
    for (const { input, tex, type, flags } of symbols) {
      if (/^[A-Za-z]$/.test(input) || input === '"') continue
      const role = ROLES[input] ?? TYPES[type] ?? section
      lists[role].add(input)
      if (tex && !flags.includes('NOTEXCOPY')) lists[role].add(tex)
    }
  }
  return Object.fromEntries(Object.entries(lists).map(([role, names]) => [role, [...names].sort()]))
}

async function asciimath() {
  return { plantuml: VERSION, asciimath: asciimathNames(await source('math/ASCIIMathTeXImg.java')) }
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

/** The library folders with a README of their own, sorted. */
export function stdlibReadmes(tree) {
  return tree.tree.flatMap(({ path, type }) => (type === 'blob' && /^stdlib\/([^/]+)\/README\.md$/.exec(path)?.[1]) || []).sort()
}

/**
 * Each folder's entry: its files, or, for a folder whose README's front matter
 * says `link: <folder>` (`awslib` → `awslib14`), that folder, if it has files.
 */
export function stdlibEntries(tree, readmes) {
  const index = stdlibIndex(tree)
  const entries = {}
  for (const folder of new Set([...Object.keys(index), ...Object.keys(readmes)])) {
    const frontMatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(readmes[folder] ?? '')?.[1] ?? ''
    const link = /^link:[ \t]*(\S+)/m.exec(frontMatter)?.[1]
    if (link && link !== folder && index[link]) entries[folder] = { 'plantuml-stdlib': STDLIB, link }
    else if (index[folder]) entries[folder] = { 'plantuml-stdlib': STDLIB, files: index[folder] }
  }
  return entries
}

async function stdlib() {
  const api = `https://api.github.com/repos/plantuml/plantuml-stdlib/git/trees/${STDLIB}?recursive=1`
  const res = await fetch(api)
  if (!res.ok) throw new Error(`${api}: HTTP ${res.status}`)
  const tree = await res.json()
  if (tree.truncated) throw new Error(`${api}: truncated`)
  const readmes = await Promise.all(stdlibReadmes(tree).map(async (folder) => {
    const url = `https://raw.githubusercontent.com/plantuml/plantuml-stdlib/${STDLIB}/stdlib/${folder}/README.md`
    const readme = await fetch(url)
    if (!readme.ok) throw new Error(`${url}: HTTP ${readme.status}`)
    return [folder, await readme.text()]
  }))
  return stdlibEntries(tree, Object.fromEntries(readmes))
}

const artifacts = [
  { file: 'vocabulary.json', build: style },
  { file: 'builtins.json', build: builtins },
  { file: 'directives.json', build: directives },
  { file: 'asciimath.json', build: asciimath },
  { folder: 'stdlib', build: stdlib },
]

const save = (file, data) => writeFile(new URL(`../src/editor/data/${file}`, import.meta.url), JSON.stringify(data, null, 2) + '\n')

async function write({ file, folder, build }) {
  const data = await build()
  if (folder) {
    // One file per entry, so each is its own chunk.
    await mkdir(new URL(`../src/editor/data/${folder}/`, import.meta.url), { recursive: true })
    for (const [name, entry] of Object.entries(data)) await save(`${folder}/${name}.json`, entry)
    const entries = Object.values(data)
    const files = entries.reduce((sum, entry) => sum + (entry.files?.length ?? 0), 0)
    const links = entries.filter((entry) => entry.link).length
    console.info(`${folder}/: ${entries.length} folders (${links} links), ${files} files`)
    return
  }
  await save(file, data)
  const counts = Array.isArray(data) ? { entries: data } : data.style ?? data.asciimath ?? { directives: data.directives }
  console.info(`${file}: ${Object.entries(counts).map(([k, v]) => `${v.length} ${k}`).join(', ')}`)
}

async function main() {
  for (const artifact of artifacts) await write(artifact)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) await main()
