// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What the build scripts share.
import { realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EDITOR = new URL('../src/editor/', import.meta.url)

/** True when the script whose `import.meta.url` is given was started directly, not imported. */
export function isMain(metaUrl) {
  const entry = process.argv[1]
  if (entry === undefined) return false
  // Node gives import.meta.url the realpath but leaves argv[1] as typed, so resolve symlinks first.
  let real = entry
  try {
    real = realpathSync(entry)
  } catch {
    // an unresolvable path is compared as typed
  }
  return pathToFileURL(real).href === metaUrl
}

/** The body of a URL as text; a non-OK status throws, naming the URL. */
export async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

/** A JSON file under src/editor/, such as `data/language.json`. */
export async function readData(path) {
  return JSON.parse(await readFile(new URL(path, EDITOR), 'utf8'))
}

/** Writes JSON under src/editor/ pretty-printed with a final newline, creating its folder. */
export async function writeData(path, data) {
  const file = new URL(path, EDITOR)
  await mkdir(dirname(fileURLToPath(file)), { recursive: true })
  await writeFile(file, JSON.stringify(data, null, 2) + '\n')
}
