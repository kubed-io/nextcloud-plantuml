// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates src/editor/data/vocabulary.json from PlantUML's source at the tag
// of the pinned server image (X1). Needs network; the tests never do.
// Run: node scripts/vocabulary.mjs
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const VERSION = '1.2026.8'
const REPO = 'plantuml/plantuml'
const BASE = `https://raw.githubusercontent.com/${REPO}/v${VERSION}/src/main/java/net/sourceforge/plantuml`
const BUILTIN = 'tim/builtin'

async function source(path) {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.text()
}

// The constant names of a Java enum: the identifiers at the start of each
// entry in the body, up to the first `;`, ignoring comments and arguments.
export function enumConstants(java) {
  const stripped = java.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
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

const artifacts = [
  { file: 'vocabulary.json', build: style },
  { file: 'builtins.json', build: builtins },
]

async function write({ file, build }) {
  const data = await build()
  await writeFile(new URL(`../src/editor/data/${file}`, import.meta.url), JSON.stringify(data, null, 2) + '\n')
  console.info(`${file}: ${Array.isArray(data) ? `${data.length} entries` : Object.entries(data.style).map(([k, v]) => `${v.length} ${k}`).join(', ')}`)
}

async function main() {
  for (const artifact of artifacts) await write(artifact)
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) await main()
