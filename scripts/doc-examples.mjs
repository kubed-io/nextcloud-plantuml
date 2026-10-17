// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Draws every example in our own doc lines on the PlantUML server and prints the keys
// whose answer is an error; exits 1 if any.
//
//   PLANTUML_URL=http://plantuml.flow.svc node scripts/doc-examples.mjs
import { isMain, readData } from './lib.mjs'

const server = process.env.PLANTUML_URL ?? 'http://plantuml.flow.svc'

/**
 * Examples the server cannot draw on PlantUML 1.2026.8, so they cannot be checked: two types answer
 * "not supported", and a local path is refused by the server's INTERNET security profile.
 */
const UNDRAWN = new Set(['diagram:chronology', 'diagram:jcckit', 'directive:!import', 'directive:!includesub'])

/** The element a style property's example is wrapped around when it is only the property's line. */
const STYLED = '<style>\nnode {\n  %\n}\n</style>\nnode Web'

/**
 * What the server is sent: a diagram's example as it is, and any other wrapped in the context it needs. A
 * function's or a Creole tag's fragment goes in a message line (a whole-line example, one with a line
 * break, stands as it is), a style property's bare line in a style block with an element to style.
 */
export function sourceOf(key, example) {
  if (example.startsWith('@start')) {
    return example
  }
  const [, kind, at] = /^(\w+):.*?(?:@(\w+))?$/.exec(key) ?? []
  const type = at ?? 'uml'
  let body = example
  if (kind === 'function' && example.startsWith('%')) {
    body = `Alice -> Bob : ${example}`
  } else if (kind === 'tag' && !example.includes('\n')) {
    body = `A -> B : ${example}`
  } else if (kind === 'property' && !example.includes('<style>')) {
    body = STYLED.replace('%', () => example)
  }
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

async function main() {
  const own = await readData('data/docs/own.json')
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
}

if (isMain(import.meta.url)) await main()
