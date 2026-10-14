<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Diagram types, round 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A file with several diagrams opens as tabs that follow the cursor both ways, folds by block, draws only the active diagram, loads per-type profiles on demand (YAML first, highlighted and checked), and has a Source toggle that hides the code.

**Architecture:** One pure scanner (`src/editor/blocks.js`) reads the document into diagrams; tabs, folding, the block lint, the render index and the profile loader all read it. The editor bundle becomes an ES module so each profile is a hashed chunk fetched with `import()`; a loaded profile is applied by reconfiguring a `Compartment` with a fresh PlantUML language that nests the profile's stream mode between its `@start`/`@end` lines.

**Tech Stack:** CodeMirror 6 (`@codemirror/language` folding, `legacy-modes/mode/yaml`, `StreamLanguage`), the `yaml` library 2.9, Vite 8 (Rolldown) ES output with chunks, vitest 5 + jsdom, PHP 8.1+ / PHPUnit 12.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` (L8, B1–B8, T6, T11, P1–P6, C2) and `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (the `POST /render` `index`).

## Global Constraints

- Every colour is a Nextcloud variable (H1); `tests/js/theme.test.js` must stay green with any new token or surface rule.
- One file per completion source and per lint rule (C1, V1); a lint rule is a pure `(state) => Diagnostic[]`.
- Diagram index: 0-based, PlantUML's, across the file; `newpage` pages count in `uml` blocks only. Labels and README numbers count from 1.
- `POST /apps/plantuml/render` takes `index` as an integer 0–999, absent meaning 0; anything else answers 400.
- Chunks are emitted under `dist/chunks/` with a content hash in the name; the editor entry stays `dist/plantuml-editor.js` and keeps O2's `?v=…&h=…` URL.
- UI copy is terse; the strings are exactly the spec's: "Source", "No @end<x> for this diagram", "Add @end<x>", "This closes @start<x>", "Change to @end<x>", "No diagram to end".
- Gherkin: no `.feature` edit without Dr K's approval; the round's scenario is proposed in chat.
- PHP: PHPUnit, `php -l`, Psalm and php-cs-fixer may run in the code-server pod; Behat runs in CI only.
- Commit after every task; one PR for the round, merged by the controller once CI is green (Dr K's standing authorisation for PRs this thread opens).
- The maintainer is **Dr K**; SPDX headers say `kubed-io`.

## Review Focus

1. **A profile that arrives after the editor closed** must not dispatch into a destroyed view. Pinned in Task 4.
2. **Deleting a block while its tab is active** (the count drops under the active index) must move to the last diagram and render it, never ask the server past the end. Pinned in Task 5.
3. **An unclosed `@startyaml`** must run the YAML mode to the end of the file, be flagged by B7, and leave every line after it YAML-coloured rather than crash the scanner. Pinned in Tasks 1 and 3.
4. **A profile chunk that fails to load** must leave plain text and log once, with no retry on each keystroke. Pinned in Task 4.
5. **A stale, cached Files bundle loading the new ES-module editor** as a classic script must still fall back to the Viewer ("did not define the editor"), not leave the click dead. Pinned in Task 4.

---

### Task 1: The block scanner

**Files:**
- Create: `src/editor/blocks.js`
- Create: `tests/fixtures/diagrams/*.puml` and `tests/fixtures/diagrams/expected.json` (shared with the PHP reader in round 4)
- Test: `tests/js/blocks.test.js`

**Interfaces:**
- Produces:
  - `scan(text: string) => Diagram[]` where `Diagram = { index, type, name, page, pages, from, to, start, end }`: `index` 0-based; `type` the word after `@start`; `name` string or `''`; `page` 1-based within its block and `pages` the block's count; `from`/`to` the diagram's first and last line numbers (1-based, `to` inclusive, excluding the `@end` line); `start`/`end` the block's `@start` and `@end` line numbers (`end` null when unclosed).
  - `diagramAt(diagrams: Diagram[], line: number) => Diagram | null` — the diagram whose block (`start`…`end`) holds the line.
  - `label(d: Diagram) => string` — name, else type, plus ` ${page}` when `pages > 1`.
  - `blocksOf(diagrams) => Block[]` with `Block = { type, name, start, end }` (one per block, pages merged), for folding and lint.

- [ ] **Step 1: Write the fixtures** — one file per case, each named for it, with `expected.json` mapping file name to the `scan` result: `one-uml.puml`, `no-start.puml` (plain `A -> B`, one diagram, type `uml`, `start` null), `uml-and-salt.puml`, `named-forms.puml` (`@startuml nodes` and `@startuml(id=nodes)` both give `nodes`), `pages.puml` (`newpage`, indented `  newpage`, `newpage Second` — three pages), `newpage-in-salt.puml` (one page), `unclosed.puml` (`@startyaml` to EOF, `end` null), `mismatched.puml` (`@startjson … @endyaml` closes it), `outside-text.puml` (lines between blocks belong to none).
- [ ] **Step 2: Write `blocks.test.js`** — for each fixture, `expect(scan(text)).toEqual(expected[file])`; plus `diagramAt` on a line between blocks is `null`, on the `@end` line is the block's last page; `label` gives `nodes 2` for page 2 of 3 and `salt` for an unnamed salt.
- [ ] **Step 3: Run** `npx vitest run tests/js/blocks.test.js` — expect FAIL (module missing).
- [ ] **Step 4: Implement `src/editor/blocks.js`** — one pass over lines; `/^\s*@start(\w+)(?:\(id=([^)]*)\)|\s+(.*?))?\s*$/`, `/^\s*@end\w*\s*$/`, `/^\s*newpage(?:\s.*)?$/` (uml only). With no `@start` line at all, one diagram covering the file.
- [ ] **Step 5: Run** the test — expect PASS. Then `npm run lint`.
- [ ] **Step 6: Commit** `feat(editor): read a file into its diagrams (B1)`.

### Task 2: Render one diagram by index

**Files:**
- Modify: `lib/Service/RenderService.php` (`render`), `lib/Controller/RenderController.php` (`bySource`)
- Modify: `src/editor/preview.js`
- Test: `tests/unit/RenderServiceTest.php`, `tests/unit/RenderControllerTest.php`, `tests/js/preview.test.js`

**Interfaces:**
- Produces:
  - PHP `RenderService::render(string $source, int $index = 0): Rendered` — posts to `svg` when `$index === 0`, else `svg/{$index}`.
  - PHP `RenderController::bySource(string $source = '', mixed $index = 0): Response` — `400` unless `$index` is an int (or a digit string) in 0–999.
  - JS `render(source, index = 0)`, `debouncedRender(source, index, cb)`; the request body is `{source, index}`.

- [ ] **Step 1: Write the failing PHP tests** — `testRendersTheDiagramAtAnIndex` (index 2 posts to `<url>/svg/2`), `testIndexZeroPostsToSvgAsBefore`, controller `testRefusesAnIndexOutsideZeroTo999` (data provider: `-1`, `1000`, `'x'`, `1.5`, `[]` → 400), `testPassesTheIndexToTheService`.
- [ ] **Step 2: Run** `composer test:unit -- --filter 'RenderService|RenderController'` — expect FAIL.
- [ ] **Step 3: Implement** both PHP changes.
- [ ] **Step 4: Run** the PHP tests, `php -l` on both files, `composer psalm` — expect PASS / no errors.
- [ ] **Step 5: Write the failing JS tests** in `preview.test.js` — the body carries `index`; a parked render keeps its own index; `debouncedRender(src, 1, cb)` then `debouncedRender(src, 0, cb)` within 300 ms sends one request with index 0.
- [ ] **Step 6: Implement** `preview.js`; update the call in `src/editor.js` to pass `0` for now.
- [ ] **Step 7: Run** `npx vitest run` — expect PASS.
- [ ] **Step 8: Commit** `feat(render): draw the diagram at an index (B5)`.

### Task 3: Nested inner modes in the PlantUML language

**Files:**
- Modify: `src/editor/plantuml-mode.js`, `src/editor/completion/index.js`, `src/editor/theme.js`
- Test: `tests/js/plantuml-mode.test.js`, `tests/js/theme.test.js`, `tests/js/completion.test.js`

**Interfaces:**
- Produces:
  - `plantumlLanguage(inner: Record<string, StreamParser>) => StreamLanguage` — a fresh language each call; `plantumlMode = plantumlLanguage({})` stays exported.
  - Completion sources are registered with `EditorState.languageData.of(() => [{ autocomplete: source }])` instead of `plantumlMode.data.of`, so they survive a language swap.

- [ ] **Step 1: Write the failing tests** — with a stub inner mode `{ token: (s) => { s.skipToEnd(); return 'atom' }, startState: () => ({}) }` under `yaml`: lines between `@startyaml` and `@endyaml` are all `atom`; `@endyaml` itself is a keyword; a `'` comment line inside is a comment; the line after `@endyaml` is uml again; with `inner` empty, a yaml block tokenises as today's uml; an unclosed `@startyaml` keeps `atom` to EOF; `copyState` of a state inside the block is a deep copy (mutating the copy's inner state leaves the original). Completion: after reconfiguring the language, `directives` still completes `@st`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — on a `@start<type>` line with `inner[type]`, set `state.inner = { type, state: mode.startState?.() ?? {} }`; while set, at line start try `@end`, `'`-comment and `!` rules first, then delegate to `mode.token(stream, state.inner.state)`; `copyState` uses `mode.copyState` when present, else a structured clone. Map any legacy token name the inner modes emit (`atom`, `number`, `property`, `def`, `variable-2`, `meta`) to a colour in `theme.js` from the existing palette (strings/atoms success, numbers/properties info, meta primary).
- [ ] **Step 4: Run** `npx vitest run` — expect PASS, theme test included.
- [ ] **Step 5: Commit** `feat(editor): nest a profile's mode between its @start and @end (P5)`.

### Task 4: ES-module editor and the profile loader

**Files:**
- Modify: `vite.config.js`, `src/files.js`, `package.json` (comment)
- Create: `src/editor/profiles/index.js`
- Modify: `src/editor.js`, `src/editor/lint/index.js`
- Test: `tests/js/profiles.test.js`, `tests/js/files.test.js`, `tests/js/editor.test.js`

**Interfaces:**
- Consumes: `scan` (Task 1), `plantumlLanguage` (Task 3).
- Produces:
  - `needed(diagrams: Diagram[], text: string) => Set<string>` — the block types that have a registered profile, plus `archimate` per P3 (registered from round 2; the rule is written now).
  - `loadProfile(type) => Promise<Profile | null>` — one promise per type for the page; a rejection logs `console.error` and resolves `null`, and is forgotten only on the next `openEditor`.
  - `Profile = { type, mode?, completions: CompletionSource[], lints: LintRule[] }`.
  - `PROFILES: Record<string, () => Promise<{ default: Profile }>>` — `{ yaml: () => import('./yaml.js') }`.
  - `profileRules` — a `Facet<LintRule[]>` in `lint/index.js` the linter reads beside `rules`; `needsRefresh` also fires when it changes.

- [ ] **Step 1: Write the failing tests** — `profiles.test.js`: `needed` of a uml+yaml document is `{yaml}`; two concurrent `loadProfile('yaml')` calls import once (spy on the registry); a rejecting import resolves `null` and logs once. `files.test.js`: the editor script element has `type="module"`; a script that loads without defining `openEditor` still falls back to the Viewer. `editor.test.js`: opening a document with a yaml block reconfigures the language once the profile resolves; a profile that resolves after `close()` dispatches nothing.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — `vite.config.js`: for `ENTRY=editor`, `formats: ['es']` and `rolldownOptions.output.chunkFileNames: 'chunks/[name]-[hash].js'`; `files.js`: `script.type = 'module'`. In `editor.js`, a `profilesConfig` `Compartment` holding `[languageConfig, ...completion data, profileRules.of(lints)]`; after each doc change (in the existing update listener) and on open, `needed()` → `loadProfile()` → if not `closed`, `view.dispatch({ effects: profilesConfig.reconfigure(…) })`.
- [ ] **Step 4: Run** `npx vitest run` — expect PASS.
- [ ] **Step 5: Build** `npm run build` — expect `dist/plantuml-editor.js` to contain `import("./chunks/` and no profile code; `ls dist/chunks/`.
- [ ] **Step 6: Commit** `feat(editor): an ES-module editor that loads profiles on demand (P1–P4)`.

### Task 5: The YAML profile

**Files:**
- Create: `src/editor/profiles/yaml.js`, `src/editor/lint/yaml.js`
- Modify: `package.json` (`yaml` ^2.9.1)
- Test: `tests/js/yaml-profile.test.js`, `tests/js/lint.test.js`

**Interfaces:**
- Consumes: `Profile` (Task 4), `scan` (Task 1).
- Produces: `default: Profile` with `type: 'yaml'`, `mode` = the legacy `yaml` mode wrapped so a line starting `#highlight` is `meta`, `completions: []`, `lints: [yamlLint]`; `yamlLint(state) => Diagnostic[]`.

- [ ] **Step 1: Write the failing tests** — tokens: `key: value` gives a property and a plain value, `- item` the list marker, `#highlight "a" / "b"` meta; lint: `a: [1,\nb: : :` in a yaml block gives one error at the line and column `parseDocument` reports, mapped into document positions; a valid block gives none; a uml block with the same text gives none; `#highlight` lines are skipped (blanked, keeping line numbers).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: `npm install yaml@^2.9.1`, then implement** both modules; the lint parses each yaml block's lines `from…to` and reports `doc.errors` only.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build` — expect PASS, and a `yaml-*.js` chunk holding the library.
- [ ] **Step 5: Commit** `feat(editor): YAML blocks highlighted and checked (T6, T11)`.

### Task 6: Tabs linked to the cursor

**Files:**
- Create: `src/editor/tabs.js`
- Modify: `src/editor.js`, `css/editor.css`
- Test: `tests/js/tabs.test.js`, `tests/js/editor.test.js`

**Interfaces:**
- Consumes: `scan`, `diagramAt`, `label` (Task 1); `debouncedRender(source, index, cb)` (Task 2).
- Produces: `createTabs({ onActivate: (index) => void }) => { element: HTMLElement, update(diagrams: Diagram[], active: number): void }`.

- [ ] **Step 1: Write the failing tests** — `tabs.test.js`: one diagram → `element.hidden`; three → three `role="tab"` with labels from `label()` and `aria-selected` on the active; ←/→/Home/End move focus, Enter/Space/click call `onActivate(index)`; `update` with fewer diagrams than `active` selects the last. `editor.test.js`: moving the selection into the second block renders with index 1; a selection on a line between blocks keeps the tab; activating tab 2 puts the cursor at the end of its `@start` line and focuses the source; deleting the active (last) block renders the new last index.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `tabs.js` (WAI-ARIA tabs; roving `tabindex`; `scrollIntoView({ inline: 'nearest' })` on the active tab), mount it at the top of `.plantuml-editor__diagram`, and in `editor.js` keep `diagrams`/`active`, recomputed on doc and selection changes; tab activation dispatches `{ selection, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 20 }) }` and focuses the view unless the source is hidden (Task 8). CSS per B2.
- [ ] **Step 4: Run** `npx vitest run` — expect PASS.
- [ ] **Step 5: Commit** `feat(editor): one tab per diagram, following the cursor both ways (B2–B5)`.

### Task 7: Folding, the block lint and whole-block directives

**Files:**
- Create: `src/editor/folding.js`, `src/editor/lint/blocks.js`
- Modify: `src/editor/completion/directives.js`, `src/editor/lint/index.js`, `src/editor/theme.js`, `src/editor.js`
- Test: `tests/js/folding.test.js`, `tests/js/lint.test.js`, `tests/js/completion.test.js`

**Interfaces:**
- Consumes: `scan`, `blocksOf` (Task 1).
- Produces: `plantumlFolding` (extension array: `foldService.of(…)`, `foldGutter()`, `keymap.of(foldKeymap)`); `blocksLint(state) => Diagnostic[]`; `DIRECTIVES` gains `salt`, `regex`, `ebnf`.

- [ ] **Step 1: Write the failing tests** — folding: `foldable(state, lineStart)` on a `@start` line spans to the end of the line before `@end`; none for an unclosed block's last line; none elsewhere. Lint, with the spec's exact messages: unclosed → "No @end<x> for this diagram" and **Add @end<x>** inserts `@end<x>\n` before the next `@start` (or at EOF); mismatched → "This closes @start<x>" and **Change to @end<x>**; stray `@end` → warning "No diagram to end". Directives: picking `@startsalt` inserts `@startsalt name\n{\n\t\n}\n@endsalt` with `name` the first field; inside an unclosed `@startjson`, `@end` offers only `@endjson`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**; fold gutter and placeholder colours in `theme.js` per B6 (variables only).
- [ ] **Step 4: Run** `npx vitest run` — expect PASS.
- [ ] **Step 5: Commit** `feat(editor): fold, check and insert whole diagrams (B6–B8)`.

### Task 8: The Source toggle

**Files:**
- Create: `img/icons/code-tags.svg` (Material Design `code-tags`, `fill="currentColor"`, header as `refresh.svg`)
- Modify: `src/editor.js`, `css/editor.css`
- Test: `tests/js/editor.test.js`

**Interfaces:**
- Produces: the button `.plantuml-editor__source-toggle`; the overlay class `plantuml-editor--diagram-only`.

- [ ] **Step 1: Write the failing tests** — the toggle is hidden until load, then before the Reload icon, `aria-pressed="true"`, labelled and titled "Source", `aria-controls="plantuml-editor-source"`; a click sets `aria-pressed="false"` and the overlay class; with the focus in the source the focus moves to the toggle; a second click restores both and focuses the source; Ctrl/Cmd+S still saves while hidden; a fresh open shows the source.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**; CSS: `.plantuml-editor--diagram-only .plantuml-editor__source, … .plantuml-editor__splitter { display: none }` and the panes' columns `1fr`; pressed background `--color-primary-element-light`.
- [ ] **Step 4: Run** `npx vitest run` — expect PASS.
- [ ] **Step 5: Commit** `feat(editor): a Source toggle that hides the code (L8)`.

### Task 9: Penpot boards

**Files:** none in the repo beyond `docs/design/*.png` exports.

- [ ] **Step 1:** Read the Penpot high-level overview, open file "NXT PlantUML", and on the editor board add: the tab strip (three tabs, the second active) above the diagram, the `<>` Source toggle before the Reload icon (pressed), fold chevrons in the gutter; add a board "editor / diagram only" with the toggle unpressed and the diagram full width. Follow the `penpot-mcp-gotchas` memory (openPage first, sequential writes).
- [ ] **Step 2:** Export the changed boards as PNG into `docs/design/` and list them in the app spec's design table.
- [ ] **Step 3: Commit** `docs(design): tabs, folding and the Source toggle`.

### Task 10: Ship the round

**Files:**
- Modify: both specs (statuses: `agreed (round 1)` → `shipped (#<PR>)`, C1's registration line, Known limitations), `CHANGELOG.md` (`[Unreleased]` Added), `README.md` if it lists diagram types

- [ ] **Step 1:** Run everything: `npx vitest run`, `npm run lint`, `npm run build`, `composer test:unit`, `composer psalm`, `composer cs:check`, `yaml-style` on any changed YAML. Expect all green.
- [ ] **Step 2:** Measure P6: `gzip -9c` of `dist/plantuml-editor.js` and each `dist/chunks/*.js`, before (main) and after; put the table in the PR body.
- [ ] **Step 3:** Propose the Gherkin scenario "Drawing one diagram of a file that holds several" to Dr K in chat; only on approval add it and its step definitions to `features/diagrams/edit.feature`.
- [ ] **Step 4:** Open the PR, read and answer every bot review thread, merge when green.
- [ ] **Step 5:** Deploy to the live Nextcloud (tar | `kubectl exec` into `cloud/nextcloud`, `dist/chunks/` included), then check in selenium-flow on both themes: a file with a uml, a salt and a yaml block shows three tabs; the cursor and tabs follow each other; the yaml block is coloured and a broken line is marked; folding works; the Source toggle hides and restores the code; the network panel shows the yaml chunk fetched only for a file with a yaml block.
- [ ] **Step 6:** Commit the status updates on main via the PR; update the `nextcloud-plantuml-state` memory.
