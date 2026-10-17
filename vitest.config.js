/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Vitest config, kept separate from vite.config.js (the *build* config, one
 * build per ENTRY, not a test config).
 *
 * Two projects. A suite that needs a DOM opts into jsdom with a
 * `// @vitest-environment jsdom` pragma and runs isolated, in a worker of its
 * own. The rest run in the node environment without isolation, sharing their
 * workers (about half the wall time): the module-level caches they fill are
 * emptied by the resets the suites call (`resetServerLists`, `resetOnce`).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

const DIR = 'tests/js'
const suites = readdirSync(DIR).filter((name) => name.endsWith('.test.js')).map((name) => `${DIR}/${name}`)
const dom = suites.filter((file) => readFileSync(file, 'utf8').includes('@vitest-environment jsdom'))

export default defineConfig({
  test: {
    // Vitest leaves one CPU to the machine; on a two-CPU runner that is one worker, and the jsdom suites queue.
    maxWorkers: Math.max(2, availableParallelism()),
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          isolate: false,
          include: suites.filter((file) => !dom.includes(file)),
        },
      },
      {
        extends: true,
        test: { name: 'jsdom', environment: 'node', include: dom },
      },
    ],
  },
})
