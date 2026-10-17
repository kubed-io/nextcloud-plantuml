<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# nextcloud-plantuml — refactor, optimization and security round

Dr K, 2026-10-17: "be on the lookout for improvements and areas to be DRY. Let's make the next round about
refactor and optimization. Find any security issues as well." This round changes how the code is built,
not what it does, except where a row says otherwise. Two read-only audits of `main` at cf9e54f are its
evidence; their reports, with every measurement and file:line, are kept in
`.superpowers/research/2026-10-17-refactor-round/` (git-ignored).

**Scope, as Dr K set it:** the code in this repo only. Out of scope: CI and the release workflow ("the ci
stuff is fine"), the PlantUML server's own fetch policy and network egress (another repo), rate limiting
("caps, no rate limit"), and replacing the WebDAV client ("keep the library").

**Done means:** every existing test passes unchanged apart from the rows below that say they change
behaviour; the measured targets in "Targets" hold; and the editor, Viewer, README and admin page behave as
before in the live check.

## Requirements

Status: **agreed (refactor round)**, approved by Dr K on 2026-10-17.

### Security

| # | Requirement | Evidence | Status |
|---|---|---|---|
| Z1 | **Render caps.** `POST /render` refuses a `source` over 1 MiB with 413 and the problem line "The diagram is too large to draw"; `GET /render?path=` checks the file's size before reading and refuses one over 1 MiB the same way, reading through a stream capped at the limit + 1 byte (as `FileReader::read()` does). | Any logged-in user can send a source of any size; `byPath` reads the whole file into memory (`RenderController.php:80, 98-121`). | shipped (refactor round, 2026-10-17) |
| Z2 | **Include lookups are capped, not only reads.** The resolver stops looking files up once it has made 256 lookups or reached its 64-file limit; each line past that becomes the existing "past the limit" mistake without touching the filesystem. | `find()` and `root->get()` run per include line before `MAX_FILES` is checked (`IncludeResolver.php:110-121, 355-364, 390-436`): ~90,000 lookups per MB of `!include` lines. | shipped (refactor round, 2026-10-17) |
| Z3 | **No catastrophic regexes on hostile input.** `NAMES_A_FILE` and the resolver's line regexes match leading space with `[ \t]*`, never `\s*` (which crosses newlines under `/m`); the gantt `SEPARATOR` is anchored and has no overlapping quantifiers; and every grammar leaves a line over 10,000 characters plain (one guard in the outer language's token, which every line goes through, nested profiles included). | `NAMES_A_FILE` took 132 s on 1 MB of newlines without PCRE JIT; gantt's `SEPARATOR` took 3.9 s on an 80 kB line, re-run on every edit and scroll (`gantt.js:51`). | shipped (refactor round, 2026-10-17) |
| Z4 | **View-only shares stay view-only.** An include, `!import` or `<style file=>` naming a file whose share forbids download is kept as the mistake "Cannot read <path>" and its bytes are never read. Viewing such a shared diagram itself is unchanged. | Includes read through `File::fopen`, which checks READ only; the download attribute is enforced by DAV, not the Node API (`IncludeResolver.php:691-706`). A recipient could read a view-only text file out through their own diagram. | shipped (refactor round, 2026-10-17) |
| Z5 | **No credentials in logs.** Wherever the server URL is logged or put in an exception, it is `scheme://host[:port]`, never its user, password, path or query. The stored URL itself is unchanged, so a basic-auth URL keeps working. | `RenderService.php:453, 459-462`, `InstanceSettings.php:275`, `ServerConfig::setUrl:517` log or throw the raw URL. | shipped (refactor round, 2026-10-17) |
| Z6 | **Render responses defend themselves.** Every image response from the render routes carries an explicit `Content-Security-Policy: default-src 'none'; …` (core's empty policy, set on purpose), `X-Content-Type-Options: nosniff` and `Content-Disposition: inline; filename="diagram.svg"` (or `.png`). | Today the protection of an SVG opened in its own tab rests on core's default policy (`RenderController.php:200-210`). | shipped (refactor round, 2026-10-17) |
| Z7 | **Failures answer, not crash.** `GET /render?path=` answers 404 for a file it may not read and 423 for a locked one, instead of a 500 with a stack trace. A temporary zip copy from `!import` is removed even when the request dies on a memory or time limit (a shutdown hook beside the `finally`). | `getContent()`'s `NotPermittedException`/`LockedException` are uncaught (`RenderController.php:80`); `finally` does not run on a fatal error (`IncludeResolver.php:714-728`). | shipped (refactor round, 2026-10-17) |
| Z8 | **No HTML sink for data.** The doc card's icon slot takes an icon name looked up in a bundled map of `?raw` SVGs; no data string is ever set as HTML. An unknown name leaves the slot hidden. | `card.js:31` `icon.innerHTML = entry.icon` (unreachable today: no entry has an icon). | shipped (refactor round, 2026-10-17) |

### Performance

| # | Requirement | Evidence | Status |
|---|---|---|---|
| F1 | **A hover asks the cheap question first.** On untokenised text, `elementAt` checks whether the line could name anything (theme, skinparam, helper) before re-tokenising the block to see if the line is at top level. | 11.3 ms per hover on a plain name in a 3,350-line block, 22.7 ms for lint's tooltip check; ~0.3 ms after (`docs/element.js:109`). | shipped (refactor round, 2026-10-17) |
| F2 | **One block scan per document version.** `blocks.js` exports `diagramsOf(doc)`, memoised per immutable `Text` (folding's WeakMap, lifted); every whole-document `scan()` call site uses it, and profiles get it as `core.diagrams` (P2 holds). A caller that blanks the typed line scans afresh only when that line is a `@start`/`@end`/`newpage` line. | 13 call sites each re-scan; 2–6 per keystroke, 1 per hover (~0.5 ms each on 3,600 lines). | shipped (refactor round, 2026-10-17) |
| F3 | **One style-region pass per document version.** `inStyleBody` reads a per-`Text` memo of style regions instead of walking from line 1; the style profile gets the same regions as `core.styleBlocks`. | `inStyleBody` is 72 % of per-keystroke completion time (12 call sites, 0.26 ms each); the style profile parses every style block 3 more times. | shipped (refactor round, 2026-10-17) |
| F4 | **notify_push loads only where it exists.** The editor imports `@nextcloud/notify_push` (and the axios it brings) lazily, only when `getCapabilities().notify_push` is set. The watcher's choice of interval (10 s polling, 60 s with push) is unchanged. | −25.1 KB gzip off the editor entry (260.5 → 235.3 KB); the live instance has no notify_push and would never fetch it. | shipped (refactor round, 2026-10-17) |
| F5 | **Completion details are mapped once.** `withDocs` caches its described options per (options array, block type) and reads the block type from F2's memo. | `keywords` with docs: 0.27 → 0.72 ms per keystroke, mostly re-mapping ~250 options and a scan. | shipped (refactor round, 2026-10-17) |
| F6 | **A preview with no includes skips the resolver.** `POST /render` with a `path` runs include expansion only when the source names a file (the `NAMES_A_FILE` check `byPath` already makes). | Every debounced preview re-reads every include and re-copies every zip, even for a source with none. | shipped (refactor round, 2026-10-17) |
| F7 | **The JS suite runs in half the time.** Node-environment suites run with `isolate: false` (a vitest project of their own); every module-level cache a test can fill (`server-list.js`, the docs index, profiles, stdlib) has a reset the suites call; completion waits poll every 5 ms through one helper instead of vitest's 50 ms default. | 25.0 s → 12.2 s measured with `--isolate=false`; 4 tests then fail on `server-list.js`'s per-module cache. | shipped (refactor round, 2026-10-17) |

### DRY

| # | Requirement | Evidence | Status |
|---|---|---|---|
| Q1 | **The lexicon owns its common rules.** `lex.string` (`"…"`), `lex.quoted` (`"…"` or `'…'`), `lex.paren` and `lex.comma` (defined before its first use) replace the inline copies in core and profiles. | 16, 4, 6 and 7 copies (`plantuml-mode.js`, `lexicon/rules.js`, chart, chen, nwdiag, json, wire, ebnf, hcl). | shipped (refactor round, 2026-10-17) |
| Q2 | **Completion helpers live in one module.** `completion/apply.js` holds `reopen(suffix)` (insert, then reopen the list), the web-scheme options and the element-kind pattern; `local-files.js`, `stdlib.js`, `tag-attributes.js`, `connectors.js`, `protocols.js`, `colors.js` and `names.js` import them. What each source offers is unchanged. | 3, 2 and 2 copies; `reopen` lives in `local-files.js` but serves three sources. | shipped (refactor round, 2026-10-17) |
| Q3 | **"Load once, retry after a failure" is one helper.** `once(cache, key, load)` replaces the five hand-written copies; each keeps its existing "forgets a failed load" test. | `builtins.js`, `stdlib.js`, `docs/index.js`, `local-files.js`, `save.js`. | shipped (refactor round, 2026-10-17) |
| Q4 | **One DOM builder.** CodeMirror's own `crelt` (already in the bundle; added to `package.json`) replaces the three `el()`/`element()` helpers. | `editor.js:57`, `docs/card.js:14`, `docs/hover.js:87`. | shipped (refactor round, 2026-10-17) |
| Q5 | **PHP says each thing once.** `RenderService::answer(format, diagram, what)` replaces eight post-then-check-status copies; `RenderController::listed(read, key)` replaces seven identical list routes' try/catch; the mimetype `text/x-plantuml` and `ERROR_MAX` are each defined once (`Application`); `IncludeResolver::take()` loses its unused parameter. | ~60 lines (`RenderService.php`, `RenderController.php:123-198`). | shipped (refactor round, 2026-10-17) |
| Q6 | **Lint actions and test helpers are shared.** A `replaceAction(name, insert)` serves the three lint rules that build one; `tests/js/helpers/` gains `tokensOf(language, lines)`, `blockTokens(language, type, lines)`, `serverAnswering(routes)` and `stateAt(marked, extensions)`, replacing their copies. | `tokens()` is copied in 19 test files (~170 lines); `OC`/`Response` stubs 14 and 9 times. | shipped (refactor round, 2026-10-17) |
| Q7 | **The scripts share a library.** `scripts/lib.mjs` exports `isMain`, `fetchText`, `readData` and `writeData`; `doc-examples.mjs` gets the main guard the others have, so `sourceOf` has tests (a function fragment, a tag fragment, a bare style property, an `@start` example, an `@<type>` key). | `doc-examples.mjs` runs its network loop on import (`:58-69`); fetch/ok/text is written 9 times. | shipped (refactor round, 2026-10-17) |

### Structure and cleanup

| # | Requirement | Evidence | Status |
|---|---|---|---|
| U1 | **`plantuml-mode.js` holds the grammar, nothing else.** Style regions and `inStyleBody` move to `editor/regions.js` (with F3's memo); `atTopLevel` and `readToken` to `docs/top-level.js`, beside their one caller; the sub-diagram functions to `sub-diagrams.js`. A move only: every token test passes unchanged. | 773 lines doing six jobs. | shipped (refactor round, 2026-10-17) |
| U2 | **No backcompat shims.** The re-exports of `arrow`, `spriteData`, `underline` and `variable` from the mode and of `PARTICIPANTS`/`STRUCTURES` from `keywords.js` go; their four importers import from the lexicon. | `plantuml-mode.js:38-40`, `keywords.js:13-15`; Dr K: no backcompat until a second user. | shipped (refactor round, 2026-10-17) |
| U3 | **Dead code and unread data go.** Unused exports (`activityCloser`, `DECLARING`, and others the sweep finds) are removed or made module-private; `builtins.json` drops `args` (it disagrees with the source's argument counts); the shipped docs chunk carries only what the editor reads (`language.json`'s `types` and `keywords` move to a scripts-and-tests file). | §3.2 of the refactor report; the `language` chunk halves. | shipped (refactor round, 2026-10-17) |
| U4 | **Comments and docs say what is true.** Stale comments are fixed (`vitest.config.js`, the mode's header, AGENTS.md's map of `src/editor/`), the editor spec's C1 lists today's sources, its notify_push size is the measured one, and the two places that copy upstream code (`lintSection` from `@codemirror/lint`'s `renderDiagnostic`, `readToken` from `@codemirror/language`) name their source and version. | §3.4 of the refactor report. | shipped (refactor round, 2026-10-17) |
| U5 | **One rule for what a style block's body is.** A line starting `!` or `'` inside `<style>` is never a style body line, for the core's completion guard and the style profile alike. **Behaviour change:** today the core treats an unknown `!x` line in a style block as body. | Two copies of style-block detection disagree (`style-grammar.js:98` vs `plantuml-mode.js` / `lexicon/rules.js:424`). | shipped (refactor round, 2026-10-17) |
| U6 | **Completion offers only what PlantUML reads.** `ExportedName`, `Image` and `ImagePosition` (accepted but unused on 1.2026.8, I8) are no longer offered; the lint still accepts them and their cards still say so. **Behaviour change.** | `completion/style.js:52` offers all 30 properties. | shipped (refactor round, 2026-10-17) |

## Targets

Measured the way the refactor audit measured them (`.superpowers/research/2026-10-17-refactor-round/`):

- Editor entry ≤ 236 kB gzip (260.45 before the round): measured 240.94 kB (`npm run build`), **missed by about 4.9 kB**, a 19.5 kB drop. It sits above the audit's 235.3 kB experiment because notify_push moved to its own bundle (`dist/plantuml-push.js`, 28.03 kB) with its capability check and loader kept in the entry, and later tasks added code.
- Per keystroke on the 3,600-line documents: all completion sources ≤ 1.2 ms (1.78–2.58 today). Measured: raw 0.80 / 0.65 / 0.56 ms and with `withDocs` 1.24 / 1.03 / 0.75 ms on documents A / B / C (median of 20, after a warm-up). Raw met; with `withDocs` on A (3,637 lines of `uml.puml`) **missed by 0.04 ms**.
- A hover on a plain name in a 3,350-line block ≤ 1 ms (11.3 today). Measured: 0.36 ms. Met.
- `npx vitest run` ≤ 15 s (25.0 today). Measured: 11.9–12.2 s over three runs (1,941 tests). Met.

## Testing

- Every row lands with the tests its evidence names; a row marked as a behaviour change adds a test that would fail on the old behaviour.
- Moves (U1, Q1, Q4) are proven by the existing suites passing unchanged.
- PHP: `RenderControllerTest` and `IncludeResolverTest` cover Z1, Z2, Z4, Z5, Z6 and Z7; Z3's regexes get timing-free tests on pathological input (a long newline run, an 80 kB gantt line), each bounded by a step count or a small time budget.
- Behat, through the API only. Proposed for Dr K (Gherkin is proposed, never edited):
  - `features/diagrams/view.feature`, **"A diagram too large to draw"**: `Given I have a diagram file of more than a megabyte` / `When the diagram is drawn` / `Then the answer says the diagram is too large to draw`.
  - `features/diagrams/edit.feature`, **"A view-only share cannot be read through a diagram"**: `Given a colleague shared a text file with me that may be viewed but not downloaded` / `And I have a diagram that includes that file` / `When the diagram is drawn` / `Then the drawing names the include as one it cannot read` / `And none of the shared file's text is in it`.
- Live check after deploy: the targets above in the browser, the editor and README on a large file, a view-only include, and the render route's headers with `curl -I`.

## Open proposals

Not in this round; each waits on Dr K.

- The README and Files bundles use the WebDAV client for one GET (README) and one POST + stat (+ New): a plain `fetch` would take ~51 KB and ~68 KB gzip off **every Files page load**. Dr K chose to keep the library for the editor; these two load on every page, not on demand.
- Cache an expanded source per (file, include ETags) so a preview or a 304 does not re-read every include (needs a pod measurement first).
- `links.json` with a default link per kind: 1,098 entries hold 151 distinct links (raw chunk 99 → ~40 KB, ~0.7 KB gzip).
- Extract the file-operation state machine from `openEditor` (560 lines) into a module testable without the DOM.
- The audit's out-of-scope findings: SHA-pinning third-party actions in the release workflow, and an egress NetworkPolicy for the PlantUML server.
