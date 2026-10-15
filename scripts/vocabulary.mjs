// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates src/editor/data/vocabulary.json from PlantUML's source at the tag
// of the pinned server image (X1). Needs network; the tests never do.
// Run: node scripts/vocabulary.mjs
import { writeFile } from 'node:fs/promises'

const VERSION = '1.2026.8'
const BASE = `https://raw.githubusercontent.com/plantuml/plantuml/v${VERSION}/src/main/java/net/sourceforge/plantuml`

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

async function main() {
  const [sname, pname, fontStyle] = await Promise.all([
    source('style/SName.java'),
    source('style/PName.java'),
    source('klimt/font/FontStyle.java'),
  ])
  const vocabulary = {
    plantuml: VERSION,
    style: {
      selectors: enumConstants(sname).map((n) => n.replace(/_$/, '')),
      properties: enumConstants(pname),
      fontStyles: enumConstants(fontStyle).filter((n) => n !== 'BACKCOLOR').map((n) => n.toLowerCase()),
    },
  }
  const url = new URL('../src/editor/data/vocabulary.json', import.meta.url)
  await writeFile(url, JSON.stringify(vocabulary, null, 2) + '\n')
  const { selectors, properties, fontStyles } = vocabulary.style
  console.info(`${selectors.length} selectors, ${properties.length} properties, ${fontStyles.length} font styles`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
