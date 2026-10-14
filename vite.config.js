/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Plain vite config (no @nextcloud preset), the sibling apps' shape: one
 * self-contained IIFE per surface, nothing added to the global scope, no
 * module loader plumbing. The preset's EmptyJSDirPlugin wipes `js/` on every
 * build, which is why none of the siblings use it.
 *
 * Three entries, one build each, chosen by ENTRY (see package.json):
 *
 *   files   → dist/plantuml-files.js    Viewer handler, file actions, + New
 *   editor  → dist/plantuml-editor.js   CodeMirror split pane
 *   readme  → dist/plantuml-readme.js   the Text workspace observer
 *
 * files and readme are loaded by Listener\LoadFilesScriptListener via
 * Util::addScript('plantuml', '../dist/plantuml-<entry>'): NC's loader appends
 * `js/<file>.js` to the app root, so the `../dist/` prefix walks back out of
 * `js/`. The files bundle adds the editor's `<script>` itself, on first use.
 * `emptyOutDir` is off because the three builds share `dist/`.
 *
 * The editor builds first so the files build can stamp a hash of it into the
 * editor's URL: Nextcloud's `?v=` changes only with the app version, and the
 * server caches app scripts for six months.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const entry = process.env.ENTRY || 'files'

const editorHash = entry === 'files'
  ? createHash('sha256').update(readFileSync('dist/plantuml-editor.js')).digest('hex').slice(0, 12)
  : ''

export default defineConfig({
  define: { __PLANTUML_EDITOR_HASH__: JSON.stringify(editorHash) },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    sourcemap: true,
    target: 'es2020',
    // Vite 8 bundles with Rolldown; Oxc is its minifier and keeps esbuild out
    // of the tree.
    minify: 'oxc',
    lib: {
      entry: `src/${entry}.js`,
      name: `plantuml${entry[0].toUpperCase()}${entry.slice(1)}`,
      formats: ['iife'],
      fileName: () => `plantuml-${entry}.js`,
    },
  },
})
