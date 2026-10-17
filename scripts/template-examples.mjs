// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Draws every built-in template (editor spec A8) on the PlantUML server, the listed types'
// Examples (own.json's) included, and prints the ones it refuses; exits 1 if any. An Empty
// draws nothing, which the server answers with a 400, so it is not sent.
//
//   PLANTUML_URL=http://plantuml.flow.svc node scripts/template-examples.mjs
import { TYPES } from '../src/editor/add/types.js'
import { drawProblem, isMain, readData } from './lib.mjs'

const server = process.env.PLANTUML_URL ?? 'http://plantuml.flow.svc'

/** Each built-in as `<type>:<title>`, and each listed type's Example as `example:<type>`, with the text it adds. */
export function sources(templates, own, types) {
  const builtIn = Object.entries(templates).flatMap(([type, list]) => list.map(({ title, text }) => ({ key: `${type}:${title}`, source: text })))
  const examples = types
    .map(({ type }) => ({ key: `example:${type}`, source: own[`diagram:${type}`]?.example }))
    .filter(({ source }) => source)
  return [...builtIn, ...examples]
}

async function main() {
  let failed = 0
  for (const { key, source } of sources(await readData('data/templates.json'), await readData('data/docs/own.json'), TYPES)) {
    const reason = await drawProblem(server, source)
    if (reason) {
      failed++
      console.info(`${key}: ${reason}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

if (isMain(import.meta.url)) await main()
