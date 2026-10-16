// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Draws every example in our own doc lines on the PlantUML server and prints the keys
// whose answer is an error; exits 1 if any.
//
//   PLANTUML_URL=http://plantuml.flow.svc node scripts/doc-examples.mjs
import { readFileSync } from 'node:fs'

const server = process.env.PLANTUML_URL ?? 'http://plantuml.flow.svc'
const own = JSON.parse(readFileSync(new URL('../src/editor/data/docs/own.json', import.meta.url), 'utf8'))

/**
 * Examples the server cannot draw on PlantUML 1.2026.8, so they cannot be checked: two types answer
 * "not supported", and a local path is refused by the server's INTERNET security profile.
 */
const UNDRAWN = new Set(['diagram:chronology', 'diagram:jcckit', 'directive:!import', 'directive:!includesub'])

/** What the server is sent: a diagram's example as it is, a directive's or a function's wrapped in a diagram. */
export function sourceOf(key, example) {
  if (example.startsWith('@start')) {
    return example
  }
  const [, kind, at] = /^(\w+):.*?(?:@(\w+))?$/.exec(key) ?? []
  const type = at ?? 'uml'
  const body = kind === 'function' && example.startsWith('%') ? `Alice -> Bob : ${example}` : example
  return `@start${type}\n${body}\n@end${type}`
}

/** The reason the server gives for refusing a source, or '' when it draws. */
async function problem(source) {
  const response = await fetch(`${server}/svg`, { method: 'POST', body: source })
  const text = await response.text()
  const error = response.headers.get('X-PlantUML-Diagram-Error')
  if (error) {
    return `line ${Number(response.headers.get('X-PlantUML-Diagram-Error-Line')) + 1}: ${error}`
  }
  if (!response.ok) {
    return `status ${response.status}`
  }
  return /Syntax Error|not supported/i.test(text) ? 'drawn as an error' : ''
}

let failed = 0
for (const [key, { example }] of Object.entries(own)) {
  if (!example || UNDRAWN.has(key)) {
    continue
  }
  const reason = await problem(sourceOf(key, example))
  if (reason) {
    failed++
    console.info(`${key}: ${reason}`)
  }
}
process.exit(failed ? 1 : 0)
