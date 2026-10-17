/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const lib = new URL('../../scripts/lib.mjs', import.meta.url).href
const root = realpathSync(mkdtempSync(join(tmpdir(), 'islib-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

mkdirSync(join(root, 'real'))
writeFileSync(join(root, 'real', 'main.mjs'), `import { isMain } from '${lib}'\nconsole.log(isMain(import.meta.url))\n`)
writeFileSync(join(root, 'other.mjs'), `import './real/main.mjs'\n`)
symlinkSync(join(root, 'real', 'main.mjs'), join(root, 'link.mjs'))
symlinkSync(join(root, 'real'), join(root, 'linked-dir'))

const run = (file, cwd = root) => execFileSync('node', [file], { cwd, encoding: 'utf8' }).trim()

describe('isMain', () => {
  it('is true for a relative path', () => expect(run(relative(root, join(root, 'real', 'main.mjs')))).toBe('true'))
  it('is true for an absolute path', () => expect(run(join(root, 'real', 'main.mjs'))).toBe('true'))
  it('is true for a symlinked file', () => expect(run(join(root, 'link.mjs'))).toBe('true'))
  it('is true through a symlinked directory', () => expect(run(join(root, 'linked-dir', 'main.mjs'))).toBe('true'))
  it('is false for a module imported by another', () => expect(run(join(root, 'other.mjs'))).toBe('false'))
})

describe('drawProblem', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('names the line the server finds a mistake on', async () => {
    const { drawProblem } = await import('../../scripts/lib.mjs')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', {
      status: 400,
      headers: { 'X-PlantUML-Diagram-Error': 'Syntax Error?', 'X-PlantUML-Diagram-Error-Line': '1' },
    })))
    expect(await drawProblem('http://plantuml', '@startuml\nx\n@enduml')).toBe('line 2: Syntax Error?')
  })

  it('is empty for a drawing', async () => {
    const { drawProblem } = await import('../../scripts/lib.mjs')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { status: 200 })))
    expect(await drawProblem('http://plantuml', '@startuml\n@enduml')).toBe('')
  })
})
