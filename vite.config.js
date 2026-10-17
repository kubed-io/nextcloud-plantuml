/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Plain vite config (no @nextcloud preset), the sibling apps' shape: one
 * self-contained bundle per surface, nothing added to the global scope. The
 * preset's EmptyJSDirPlugin wipes `js/` on every build, which is why none of
 * the siblings use it.
 *
 * Four entries, one build each, chosen by ENTRY (see package.json):
 *
 *   push    → dist/plantuml-push.js     notify_push's listen(), all inlined
 *   files   → dist/plantuml-files.js    Viewer handler, file actions, + New
 *   editor  → dist/plantuml-editor.js   CodeMirror split pane
 *   readme  → dist/plantuml-readme.js   the Text workspace observer
 *
 * push is an ES module with nothing left to import: the editor `import()`s it
 * by URL, and only where the server has notify_push, so axios stays out of the
 * editor entry and a failed download costs the live updates, never the editor.
 * files and readme are IIFEs. The editor is an ES module, so it can `import()`
 * a diagram type's profile (src/editor/profiles/) only when a file needs it:
 * each profile is a chunk in dist/chunks/, named by its content hash, so the
 * six-month cache below never serves a stale one.
 *
 * files and readme are loaded by Listener\LoadFilesScriptListener via
 * Util::addScript('plantuml', '../dist/plantuml-<entry>'): NC's loader appends
 * `js/<file>.js` to the app root, so the `../dist/` prefix walks back out of
 * `js/`. The files bundle adds the editor's `<script type="module">` itself,
 * on first use. `emptyOutDir` is off because the four builds share `dist/`.
 *
 * The push build runs before the editor, which stamps its hash into the push
 * URL; the editor builds before files, which stamps the editor's. Each hash is
 * there because Nextcloud's `?v=` changes only with the app version, and the
 * server caches app scripts for six months.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const entry = process.env.ENTRY || 'files'
const isEditor = entry === 'editor'
const isEs = isEditor || entry === 'push'

const hashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12)
const editorHash = entry === 'files' ? hashOf('dist/plantuml-editor.js') : ''
const pushHash = isEditor ? hashOf('dist/plantuml-push.js') : ''

export default defineConfig({
  define: {
    __PLANTUML_EDITOR_HASH__: JSON.stringify(editorHash),
    __PLANTUML_PUSH_HASH__: JSON.stringify(pushHash),
  },
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
      formats: [isEs ? 'es' : 'iife'],
      fileName: () => `plantuml-${entry}.js`,
    },
    rolldownOptions: isEditor ? { output: { chunkFileNames: 'chunks/[name]-[hash].js', minify: true } } : {},
  },
})
