<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Refactor, optimization and security round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close the audit's code-level security findings, cut the measured per-keystroke, per-hover, bundle and test-suite costs, and remove duplication and dead code, without changing behaviour except where a spec row says so.

**Architecture:** PHP hardening lands in `RenderController`, `IncludeResolver` and `RenderService`; the editor gains per-document memos (`diagramsOf`, style regions) that core and profiles share through `core`; `plantuml-mode.js` is split by job; shared helpers replace copies in the lexicon, completion, lint, tests and scripts.

**Tech Stack:** PHP 8.4 / Nextcloud OCP (PHPUnit, Behat in CI only), CodeMirror 6 stream languages, vitest, Vite 8.

**Spec:** `docs/superpowers/specs/2026-10-17-refactor-round-design.md` (rows Z1–Z8, F1–F7, Q1–Q7, U1–U6, Targets). Evidence with file:line and measurements: `.superpowers/research/2026-10-17-refactor-round/refactor.md` and `security.md` (git-ignored; read the section a task names).

## Global Constraints

- Behaviour is unchanged except where a row says "Behaviour change" (U5, U6) or is a security fix (Z1–Z8).
- A profile imports no core module (P2); the entry never imports a chunk statically (CI guard: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`).
- Every colour is a Nextcloud variable; no new dependency except `crelt` (already bundled through CodeMirror) made explicit in `package.json`.
- Limits, verbatim: 1 MiB (1,048,576 bytes) per render source or file; 256 include lookups; 64 files (existing); 10,000 characters per tokenised line.
- PHP in the code-server pod: `php -l`, `composer run test:unit`, psalm and php-cs-fixer are fine; Behat runs in CI only, never in a pod.
- Dr K, never a real name; SPDX `kubed-io`; branch `refactor-round`; one commit per task (or per logical step) ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Gherkin text exactly as Task 1 and 2 give it (approved in the spec).

## Review Focus

1. **Exactly at a limit.** A source or file of exactly 1,048,576 bytes draws; one byte more is refused; a file whose stored size is stale (smaller than its content, as S3 can report) is still cut at the limit by the capped read. Pinned in Task 1.
2. **A memo never serves a stale document.** After an edit, `diagramsOf` and the style regions answer for the new `Text`; two editors (two `Text`s with the same string) never share a wrong answer. Pinned in Tasks 5 and 6.
3. **View-only is per share, not per file type.** Own files and a share that allows download still include; a file inside a shared folder whose share forbids download is refused; the error never reveals the file's content or size. Pinned in Task 2.
4. **The long-line guard keeps the grammar's state.** A 10,000-character line is still tokenised; a 10,001-character line is plain; the lines after it are coloured exactly as without it (a block opened before it stays open). Pinned in Task 4.
5. **notify_push absent, present, or failing to load.** No capability: the module is never imported and polling stays at 10 s; capability: one listener per page; a failed import: polling at 10 s, no error thrown. Pinned in Task 9.

---

### Task 1: The render routes are capped and answer cleanly (Z1, Z6, Z7 controller, F6)

**Files:** Modify `lib/Controller/RenderController.php`; Test `tests/unit/Controller/RenderControllerTest.php`; Behat `features/diagrams/view.feature`, `tests/integration/bootstrap/Steps/RenderApiSteps.php` (or `DiagramFileSteps.php`).

**Interfaces — Produces:** `RenderController::MAX_SOURCE = 1048576`; a too-large answer is `413` with the JSON problem `"The diagram is too large to draw"` (translated with the app id, as the other problems are).

- [ ] **Step 1: Failing tests** (`RenderControllerTest`): `bySource` with a 1,048,577-byte source → 413 and that problem, the render service never called; with exactly 1,048,576 bytes → rendered; `byPath` on a node whose `getSize()` is over the limit → 413 without `fopen`; a node whose stored size is small but whose stream yields more than the limit → 413 (read capped at limit + 1); `byPath` whose `fopen` throws `NotPermittedException` → 404, `LockedException` → 423; every image response has `Content-Security-Policy` (core's `EmptyContentSecurityPolicy`, set explicitly), `X-Content-Type-Options: nosniff` and `Content-Disposition: inline; filename="diagram.svg"` (`.png` for PNG); `bySource` with a `path` and a source matching no `NAMES_A_FILE` line → the resolver is never called (F6).
- [ ] **Step 2:** `composer run test:unit` FAILS on those. **Step 3:** implement: read files through a stream capped at `MAX_SOURCE + 1` (the pattern of `IncludeResolver::content()`), `NAMES_A_FILE` starting `^[ \t]*` (Z3's PHP part for this file), the response headers in the one place image responses are built.
- [ ] **Step 4: Behat**, added to `features/diagrams/view.feature` exactly:
  ```gherkin
  Scenario: A diagram too large to draw
    Given I have a diagram file of more than a megabyte
    When the diagram is drawn
    Then the answer says the diagram is too large to draw
  ```
  with step definitions beside the existing render steps (a `Given` writing a >1 MiB `.puml` over WebDAV, the `When` requesting `GET /render?path=`, the `Then` checking 413 and the problem text); `tests/integration/bin/check-step-definitions.sh` passes.
- [ ] **Step 5:** `composer run test:unit`, `php -l` on changed files, psalm. Commit `Render: a megabyte at most, clean answers, defended images`.

### Task 2: The include resolver is bounded and respects view-only shares (Z2, Z3 PHP, Z4, Z7 cleanup, Q5 `take`)

**Files:** Modify `lib/Service/IncludeResolver.php`; Test `tests/unit/Service/IncludeResolverTest.php`; Behat `features/diagrams/edit.feature` + a new `tests/integration/bootstrap/Steps/ShareSteps.php`.

**Interfaces — Produces:** `IncludeResolver::MAX_LOOKUPS = 256`; a view-only file is kept as the existing "Cannot read <path>" mistake.

- [ ] **Step 1: Failing tests:** 300 `!include` lines of missing files → at most 256 `root->get` calls, the rest kept as "past the limit" mistakes; once 64 files are read, no further `find()` call; a node on a `SharedStorage` whose share has `getAttributes()->getAttribute('permissions', 'download') === false` → "Cannot read <path>", never opened; the same with download allowed → read; a file in the caller's own storage → read; a view-only zip via `!import` → refused the same way; the `^\s*` line regexes replaced by `^[ \t]*` (a 1 MB run of newlines resolves in a bounded number of steps: assert it completes under 1 s with `pcre.jit=0` set via `ini_set` in the test); the temp-zip cleanup is registered with `register_shutdown_function` as well as `finally` (assert the registered callable removes the files); `take()` has no parameter.
- [ ] **Step 2:** FAIL. **Step 3:** implement. The share check follows `OCA\Files_Sharing\ViewOnly::check()`; check the counters before `find()`.
- [ ] **Step 4: Behat**, added to `features/diagrams/edit.feature` exactly:
  ```gherkin
  Scenario: A view-only share cannot be read through a diagram
    Given a colleague shared a text file with me that may be viewed but not downloaded
    And I have a diagram that includes that file
    When the diagram is drawn
    Then the drawing names the include as one it cannot read
    And none of the shared file's text is in it
  ```
  `ShareSteps.php` creates the colleague through the provisioning API as admin, shares with `attributes=[{"scope":"permissions","key":"download","value":false}]` through the OCS share API, and accepts the share if the server needs it; `check-step-definitions.sh` and `check-suites.sh` pass.
- [ ] **Step 5:** unit tests, `php -l`, psalm. Commit `Includes: bounded lookups, view-only shares stay unread`.

### Task 3: One place to ask the server, no credentials in logs (Q5, Z5)

**Files:** Modify `lib/Service/RenderService.php`, `lib/Controller/RenderController.php`, `lib/AppInfo/Application.php`, `lib/Repair/RegisterMimetype.php`, `lib/Repair/UnregisterMimetype.php`, `lib/Settings/InstanceSettings.php`, `lib/Service/ServerConfig.php` (paths as they are); Tests in `tests/unit/`.

**Interfaces — Produces:** `RenderService::answer(string $format, string $diagram, string $what): string` (post, throw `notPlantUml($what)` on status ≥ 400, return the body); `RenderController::listed(callable $read, ?string $key): JSONResponse`; `Application::MIMETYPE = 'text/x-plantuml'`, `Application::ERROR_MAX = 200`; `ServerConfig::redacted(string $url): string` → `scheme://host[:port]`.

- [ ] **Step 1: Failing tests:** `redacted('https://user:pw@h:8443/p?q')` → `https://h:8443`; every log call and exception message in the touched files carries the redacted form (assert through a logger mock on a failing render with a credentialed URL); the list routes keep their exact JSON shapes (existing tests); `answer()` throws on 500 with the same message the copies threw.
- [ ] **Step 2:** FAIL. **Step 3:** implement; `src/files-helpers.js` keeps its JS copy of the mimetype (another language).
- [ ] **Step 4:** unit tests, psalm. Commit `Server answers in one place; the server URL is logged without credentials`.

### Task 4: The editor survives hostile lines, and the card takes no HTML (Z3 JS, Z8)

**Files:** Modify `src/editor/profiles/gantt.js` (`SEPARATOR`), `src/editor/plantuml-mode.js` (the outer `token`), `src/editor/docs/card.js`, `src/editor/docs/index.js` (icon field), new `src/editor/docs/icons.js`; Tests `tests/js/gantt-profile.test.js`, `tests/js/plantuml-mode.test.js`, `tests/js/doc-card.test.js`.

**Interfaces — Produces:** `MAX_LINE = 10000` in `plantuml-mode.js`; `ICONS: Record<string, string>` in `docs/icons.js` (empty for now, values are `?raw` SVG imports); `Entry.icon` is a name.

- [ ] **Step 1: Failing tests:** gantt `SEPARATOR` on `'--' + ' x --'.repeat(20000) + 'y'` returns within 50 ms and the separator forms in the gantt tests still match; a 10,001-character line is one plain span, a 10,000-character one is tokenised; with `@startuml` / a 20,000-character line / `alt x` / `end` / `@enduml`, `alt` and `end` keep their tokens (Review Focus 4); a card whose entry has `icon: 'nope'` keeps the slot hidden and empty, and no code path assigns `innerHTML` from entry data (assert `card.js` source has no `innerHTML` except from `ICONS`).
- [ ] **Step 2:** FAIL. **Step 3:** implement: the guard in the one `token` every line goes through (it covers nested profiles); `SEPARATOR` anchored with no overlapping quantifiers (the security report §5 gives one form).
- [ ] **Step 4:** `npm test`. Commit `Editor: long lines stay plain, gantt separators linear, card icons by name`.

### Task 5: One block scan per document version (F2, F5)

**Files:** Modify `src/editor/blocks.js`, `src/editor/folding.js`, `src/editor/profiles/index.js` (`core`), every `scan(` caller (`editor.js`, `completion/{directives,keywords,files-note,style,docs,sub-diagrams,colors}.js`, `lint/{blocks,yaml,json}.js`, `docs/element.js`); Tests `tests/js/blocks.test.js`, `tests/js/completion.test.js`.

**Interfaces — Produces:** `diagramsOf(doc: Text): Diagram[]` exported from `blocks.js`, memoised in a `WeakMap` keyed by the `Text`; `core.diagrams = diagramsOf`; `withDocs` caches described option arrays in a `WeakMap<options[], Map<type, described[]>>`.

- [ ] **Step 1: Failing tests:** `diagramsOf(doc) === diagramsOf(doc)` (same array); after `state.update({changes})`, `diagramsOf(newState.doc)` reflects the edit (Review Focus 2); folding answers as before; `withDocs` returns the same described array object for two calls with the same options and type; a counting spy on `scan` shows one scan per document version across a completion request plus a hover.
- [ ] **Step 2:** FAIL. **Step 3:** implement; callers that blank the typed line (`inUml`, `openType`) use the memo unless that line is a `@start`/`@end`/`newpage` line (refactor report §1.1a).
- [ ] **Step 4:** `npm test`, build + guard. Commit `Editor: one block scan per document version`.

### Task 6: Style regions once per version, one rule for a style body (F3, U5, part of U1)

**Files:** Create `src/editor/regions.js`; Modify `src/editor/plantuml-mode.js` (move `inStyleBody` and its region regexes out), `src/editor/profiles/index.js` (`core.styleBlocks`), `src/editor/profiles/style.js`, `src/editor/profiles/style-grammar.js`, `src/editor/lint/style.js`, `src/editor/completion/style.js`, the `inStyleBody` importers; Tests `tests/js/style-profile.test.js`, `tests/js/completion.test.js`.

**Interfaces — Produces:** `regions.js` exports `styleRegions(doc: Text): StyleRegion[]` (memoised per `Text`) and `inStyleBody(state, pos): boolean`; `core.styleBlocks(doc: Text)` returns what `styleBlocks(lines)` returns today.

- [ ] **Step 1: Failing tests:** `inStyleBody` gives today's answers on the existing cases; a `!foo` line inside `<style>` is **not** body for the core guard (U5, behaviour change: it fails today); the style profile's lint and completion results are unchanged; `styleRegions(doc)` is computed once per `Text` (spy).
- [ ] **Step 2:** FAIL. **Step 3:** implement; the body rule is the profile's (`style-grammar.js:98`: a line starting `!` or `'` is not body).
- [ ] **Step 4:** `npm test`, build + guard. Commit `Editor: style regions once per version, one rule for the body`.

### Task 7: A hover asks the cheap question first (F1, part of U1, part of U4)

**Files:** Create `src/editor/docs/top-level.js` (`atTopLevel`, `readToken` moved from `plantuml-mode.js`); Modify `src/editor/docs/element.js`, `src/editor/plantuml-mode.js`; Test `tests/js/hover.test.js`.

- [ ] **Step 1: Failing test:** on a 3,350-line uml block, hovering a plain name calls `atTopLevel` zero times (spy), and a skinparam name / helper / `!theme` line still resolves as before (existing tests).
- [ ] **Step 2:** FAIL. **Step 3:** implement the order `lineKey(...)` then `atTopLevel(...)`; move the two functions; `readToken` gets a comment naming its upstream (`@codemirror/language`'s internal `readToken`, the installed version).
- [ ] **Step 4:** `npm test`. Commit `Hover: the line's form before the block's state`.

### Task 8: Sub-diagram reading moves out of the mode (rest of U1)

**Files:** Modify `src/editor/plantuml-mode.js`, `src/editor/sub-diagrams.js`.

- [ ] **Step 1:** Move `netBrackets`, `subToken`, `subEnds`, `subStart` and their helpers to `sub-diagrams.js`, passing what they close over (`base`, `subMode`, `emit`) explicitly. No behaviour change: `tests/js/sub-diagrams.test.js` and `plantuml-mode.test.js` pass unchanged. `plantuml-mode.js` ends below 500 lines.
- [ ] **Step 2:** `npm test`, build + guard. Commit `Mode: the grammar alone; sub-diagrams read in their own module`.

### Task 9: notify_push only where it exists (F4)

**Files:** Modify `src/editor/watch.js`; Test `tests/js/watch.test.js`.

**Interfaces — Produces:** `pushAvailable(): Promise<boolean>`, importing `@nextcloud/notify_push` only when `getCapabilities().notify_push` is set (from `@nextcloud/capabilities`, already in the entry).

- [ ] **Step 1: Failing tests (Review Focus 5):** no capability → the module mock is never imported and the interval is 10 s; capability present → `listen('notify_file', …)` called once for two watchers; the dynamic import rejecting → 10 s polling, no unhandled rejection.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npm test`, `npm run build`; the entry's gzip size is ≤ 236 KB (print it). Commit `Editor: notify_push loads only where the server has it`.

### Task 10: The lexicon owns its common rules (Q1)

**Files:** Modify `src/editor/lexicon/rules.js`, `src/editor/plantuml-mode.js`, `src/editor/profiles/{chart,chen,nwdiag,json,wire,ebnf,hcl}.js`.

**Interfaces — Produces:** `lex.string` (`/"[^"]*"/` → `string`), `lex.quoted` (`/"[^"]*"|'[^']*'/` → `string`), `lex.paren` (`/[()]/` → `paren`), `lex.comma` defined before its first use.

- [ ] **Step 1:** Replace every inline copy listed in the refactor report §1.3. A move: `dictionary.test.js`, every profile token test and `plantuml-mode.test.js` pass unchanged.
- [ ] **Step 2:** `npm test`, build + guard. Commit `Lexicon: strings, quotes, parens and commas once`.

### Task 11: Completion and DOM helpers (Q2, Q3, Q4)

**Files:** Create `src/editor/completion/apply.js`, `src/editor/once.js`; Modify the sources and loaders named in Q2/Q3, `src/editor.js`, `src/editor/docs/{card,hover}.js`, `package.json` (`crelt`); Tests where the helpers are new.

**Interfaces — Produces:** `reopen(suffix = '')` → a `Completion.apply`; `WEB_SCHEMES` (the two `https://`/`http://` options); `ELEMENT_KINDS` (the shared kind pattern, offering exactly what `names.js` and `colors.js` offer today); `once(cache: Map, key, load: () => Promise) → Promise`, deleting the key on rejection; `crelt` replaces `el()`/`element()`.

- [ ] **Step 1: Failing tests** for `once` (two calls share one promise; a rejection is forgotten, so the next call retries) and `reopen` (inserts the label plus suffix, then the list is open again).
- [ ] **Step 2:** FAIL. **Step 3:** implement and switch every copy; each copy's existing "forgets a failed load" test still passes.
- [ ] **Step 4:** `npm test`, build + guard. Commit `Completion and loaders: shared helpers; crelt builds the DOM`.

### Task 12: The scripts share a library; doc-examples is testable (Q7)

**Files:** Create `scripts/lib.mjs`, `tests/js/doc-examples.test.js`; Modify `scripts/{vocabulary,doclinks,doc-examples}.mjs`.

**Interfaces — Produces:** `isMain(metaUrl): boolean`, `fetchText(url): Promise<string>` (throws on a non-OK status naming the URL), `readData(path)`, `writeData(path, data)` (pretty JSON + newline).

- [ ] **Step 1: Failing tests** for `sourceOf(key, example)`: a function fragment wrapped in a message line inside `@startuml`; a tag fragment the same; a bare style property wrapped in `<style>` with an element; an `@start…` example passed through; a `keyword:x@gantt` example wrapped in `@startgantt`/`@endgantt`. Importing `doc-examples.mjs` makes no network call.
- [ ] **Step 2:** FAIL. **Step 3:** implement; the three scripts use `lib.mjs`; regenerating changes no data file (`node scripts/vocabulary.mjs` and `doclinks.mjs` are not required in this task).
- [ ] **Step 4:** `npm test`. Commit `Scripts: one library; doc-examples testable`.

### Task 13: Shims, dead code, unread data and unread properties go (U2, U3, U6)

**Files:** Modify `src/editor/plantuml-mode.js`, `src/editor/completion/keywords.js` and the four importers; `src/editor/lexicon/rules.js` and the other exports the sweep finds; `src/editor/data/builtins.json` (drop `args`), `scripts/vocabulary.mjs` (stop writing `args`; write `types`/`keywords` to `scripts/data/language-words.json`, kept for scripts and tests); `src/editor/data/language.json` (only `plantuml` and `skinparameters`); `src/editor/completion/style.js` (U6); tests that read the moved fields.

- [ ] **Step 1: Failing test (U6, behaviour change):** style completion after `<style>` / `node {` / `  ` offers 27 properties and none of `ExportedName`, `Image`, `ImagePosition`; the style lint still accepts all three.
- [ ] **Step 2:** FAIL. **Step 3:** remove the shims (importers go to the lexicon), make unused exports private or delete them (each checked with a repo-wide search for importers), move the data fields, filter the three properties (a list beside I8's own lines, read by completion only).
- [ ] **Step 4:** `npm test`, build + guard; the `language` chunk is smaller than before (print both sizes). Commit `Cleanup: no shims, no dead exports, no unread data`.

### Task 14: Shared test helpers and a faster suite (Q6, F7)

**Files:** Create `tests/js/helpers/{tokens,server,state}.js`; Modify the 19 token-reading suites and the `OC`/`Response` stubbing suites, `vitest.config.js`, `src/editor/completion/server-list.js` (+ reset), `src/editor/lint/{blocks,style,creole-colour}.js` (`replaceAction`), new `src/editor/lint/actions.js`.

**Interfaces — Produces:** `tokensOf(language, lines)`, `blockTokens(language, type, lines)`, `serverAnswering(routes)`, `stateAt(marked, extensions)`, `waitForCompletion(view)` (polls every 5 ms); `resetServerLists()`; `replaceAction(name, insert)`.

- [ ] **Step 1:** Write the helpers, switch the suites, add the `isolate: false` project for node-environment suites (jsdom suites stay isolated), call the resets in the suites that fill module caches.
- [ ] **Step 2:** `npx vitest run` passes with the same test count as before this task, in ≤ 15 s (print the wall time); `npx vitest run --isolate=false` would no longer be needed. Commit `Tests: shared helpers, a faster suite; lint actions shared`.

### Task 15: Docs, measurements and status (U4, Targets)

**Files:** `vitest.config.js`, `src/editor/plantuml-mode.js` (header), `AGENTS.md` (map of `src/editor/`), `docs/superpowers/specs/2026-10-14-editor-design.md` (C1's sources and order, the notify_push known limitation, K1 untouched), `src/editor/docs/hover.js` (`lintSection` names `@codemirror/lint`'s `renderDiagnostic` and its version), `CHANGELOG.md` (`### Changed`/`### Security`, one short user-facing line each), `docs/superpowers/specs/2026-10-17-refactor-round-design.md` (rows to `shipped (refactor round, <date>)`).

- [ ] **Step 1:** Fix every stale comment and doc line the refactor report §3.4 lists.
- [ ] **Step 2:** Measure the four Targets the way the report did (its §2) and write the numbers into the spec under "Targets" as "measured"; a target missed is reported, not hidden.
- [ ] **Step 3:** `npm test`, `npm run lint`, `npm run build` + guard, `composer run test:unit`, psalm. Commit `Spec: the refactor round shipped`.
- [ ] **Step 4 (after merge and deploy):** live check in the selenium browser: editor on UML_Fun.puml (light and dark), hover and completion timing feel, a >1 MiB file in the Viewer shows "too large", a view-only include, `curl -I` on `GET /render` for the three headers.
