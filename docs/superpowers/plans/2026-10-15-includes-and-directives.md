<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Includes and directives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `!includesub NAME` stops showing a false mistake; completion offers the sections and blocks of an included file, every `!` directive, and the server's own keywords and element types.

**Architecture:** The resolver leaves a `!includesub` without `!` to the PlantUML server, which reads it as a section of the same diagram. `scripts/vocabulary.mjs` gains a third artifact, `src/editor/data/directives.json`, read from PlantUML's `TLineType` at the pinned tag, and `directives.js` builds its `!` options from it. A new route `GET /apps/plantuml/keywords` reads `help keywords` and `help types` as text; `keywords.js` adds the server's words to its own list.

**Tech Stack:** CodeMirror 6 (`@codemirror/autocomplete`), vitest + jsdom, PHP 8.1+ / PHPUnit 12 with OCP stubs, Node 24 for the generator.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` (R2's `!includesub` sentence, new R8, X1's directive part, X3, X11) and the `/keywords` row of `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`.

## Global Constraints

- PlantUML facts come from tag `v1.2026.8` (the pinned server); the directive list from `src/main/java/net/sourceforge/plantuml/text/TLineType.java`.
- The editor entry imports no chunk statically (CI guard); `directives.json` is small (under 1 kB) and is imported statically by `directives.js`, as core.
- Server lists follow C8: asked once per page in the browser, cached a day per server URL on the server, only strings kept, a failed answer is an empty list.
- Behaviour the user already has stays: the hand-kept keyword list (with its details) keeps working when the server does not answer; `PARTICIPANTS`, `STRUCTURES`, `KEYWORDS` and `HELPER_HEADS` stay exported and synchronous for `names.js`, `colors.js` and `connectors.js`.
- Gherkin: proposals in chat only, never a `.feature` edit.
- The maintainer is **Dr K**; SPDX headers say `kubed-io`; no real names anywhere.
- One PR for the round, branch `includes-and-directives`, started from `design/style-editor` (it carries the Penpot commit `0e8e82e`); commit after every task.

## Review Focus

1. **`!includesub ACTORS` in a file that has `!startsub ACTORS` above it** must render with no mistake from the resolver. Pinned in Task 1.
2. **`!includesub ./parts.puml!` when `parts.puml` does not exist, or cannot be read**, must offer nothing and throw nothing (no unhandled promise). Pinned in Task 3.
3. **The server answering `/keywords` with 503 or junk** must leave line-start keyword completion exactly as it is today. Pinned in Task 5.
4. **Multi-word server keywords** (`left to right direction`, `floating note`) must be offered from their first word and inserted whole. Pinned in Task 5.
5. **`!else` typed inside a nested `!if` that is already closed once** must still rank `!else`/`!elseif`/`!endif` first while an `!if` remains open. Pinned in Task 2.

---

### Task 1: `!includesub` without a `!` goes to the server

**Files:**
- Modify: `lib/Service/IncludeResolver.php:154-157`
- Test: `tests/unit/IncludeResolverTest.php`
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (R2)

- [ ] **Step 0:** `git -C /projects/kubed-io/nextcloud-plantuml switch -c includes-and-directives design/style-editor`

- [ ] **Step 1: Write the failing tests**
  - `testIncludesubWithoutANameIsLeftForTheServer`: source `"@startuml\n!startsub ACTORS\nactor A\n!endsub\n!includesub ACTORS\n@enduml\n"` → the expanded text equals the source line for line, `mistakes === []`, `etags === []`, `missing === []`.
  - `testIncludesubOfAFileWithoutANameIsLeftForTheServer`: `!includesub ./parts.puml` with `parts.puml` present beside the diagram → kept as written, no mistake, and the file is never read (the folder mock's `get` is not called).
  - Remove or rewrite any existing test that asserts `needs !NAME`.

- [ ] **Step 2:** `composer run test:unit -- --filter IncludeResolver` → the new tests FAIL with a "needs !NAME" mistake.

- [ ] **Step 3:** In `directive()`, replace the `needs !NAME` branch with `$this->keep($at, null); return;` for `includesub` with `$selector === null`, with the comment `// Without a `!`, PlantUML reads the whole as a section of this same diagram.`

- [ ] **Step 4:** the filter run PASSES; then the whole `composer run test:unit`.

- [ ] **Step 5:** In spec R2, after "`!includesub path!NAME` takes the lines of every `!startsub NAME` … `!endsub` section;" add "`!includesub NAME` without a `!` names a section of the same diagram and is left to the server;". Commit `fix(include): leave !includesub without a ! to the server`.

### Task 2: Every `!` directive (X1's directive part, X3)

**Files:**
- Modify: `scripts/vocabulary.mjs` (a `directives()` artifact and an exported `directiveWords(java)`)
- Create: `src/editor/data/directives.json`
- Modify: `src/editor/completion/directives.js`
- Test: `tests/js/vocabulary.test.js`, `tests/js/completion.test.js` (`describe('directives')`)

**Interfaces:**
- Produces: `directiveWords(java: string): string[]` in `scripts/vocabulary.mjs`; `directives.json` = `{ "plantuml": "1.2026.8", "directives": ["!assert", …] }`, sorted, once each.

- [ ] **Step 1: Write the failing tests**
  - `vocabulary.test.js` › `directiveWords`: given a Java fixture holding `simpleKeyword("!ifdef")`, `new RegexLeaf("!define")`, `new RegexLeaf("!include")` followed by `new RegexOr(new RegexLeaf("url"), new RegexLeaf("_many"), new RegexLeaf("_once"))`, `new RegexLeaf("!end")` followed by `new RegexOr(new RegexLeaf("function"), new RegexLeaf("definelong"), new RegexLeaf("procedure"))`, a `new RegexLeaf("!")` … `new RegexLeaf("function")` declaration and a commented-out `// simpleKeyword("!include_sprites")` → the result contains `!ifdef`, `!define`, `!include`, `!includeurl`, `!include_many`, `!include_once`, `!endfunction`, `!enddefinelong`, `!endprocedure`, `!function`, `!procedure`; does not contain `!end`, `!` or `!include_sprites`.
  - `vocabulary.test.js` › the committed `directives.json`: `plantuml === '1.2026.8'`; its list equals, as a set, `!assert !define !definelong !dump_memory !else !elseif !endfor !endfunction !enddefinelong !endif !endprocedure !endsub !endwhile !foreach !function !if !ifdef !ifndef !import !include !include_many !include_once !includedef !includesub !includeurl !log !option !procedure !return !startsub !theme !undef !while` plus the hand-added `!pragma`, `!local`, `!global`, `!unquoted`, `!final`.
  - `completion.test.js` › directives:
    - `!|` offers every word in `directives.json` plus `!$`.
    - Picking `!if` inserts `!if condition\n\n!endif` with `condition` the first field and the cursor's second stop on the empty line (assert through `insertCompletionText` of the snippet result as the existing whole-block tests do); likewise `!while`…`!endwhile`, `!foreach $item in list`…`!endfor`, `!procedure $name()`…`!endprocedure`, `!function $name()` / `!return ` / `!endfunction`, `!startsub NAME`…`!endsub`, `!$` → `!$name = value`.
    - `!theme`, `!include`, `!pragma` and the other plain words still insert the word and a space (keep the existing four tests).
    - `"!if $a\n!if $b\n!endif\n!|"` → the first three options are `!else`, `!elseif`, `!endif`; `"!if $a\n!endif\n!|"` → `!else` is not boosted.

- [ ] **Step 2:** `npx vitest run tests/js/vocabulary.test.js tests/js/completion.test.js` → FAIL.

- [ ] **Step 3: `directiveWords(java)`** — strip comments as `enumConstants` does, then collect every `"![a-z_]*"` literal from `simpleKeyword(…)` and `RegexLeaf(…)`; a literal directly followed (within its `RegexConcat`) by an optional or plain `RegexOr` of `RegexLeaf("x")` parts expands to the literal plus each part (`!include` stays, `!end` alone is dropped); a bare `"!"` followed by `RegexLeaf("function")`/`("procedure")` gives `!function`/`!procedure`. Add the artifact `{ file: 'directives.json', build: directives }`, where `directives()` fetches `text/TLineType.java`, adds `!pragma` (a diagram command, not a `TLineType` line), `!local`, `!global` (the `AFFECTATION` forms), `!unquoted`, `!final` (function modifiers), sorts and dedupes. Make `write()`'s summary line work for all three artifacts. Run `node scripts/vocabulary.mjs` (needs network) and commit the generated file.

- [ ] **Step 4: `directives.js`** — `options['!']` becomes the list from `directives.json`: snippets (via `snippetCompletion`, `type: 'keyword'`) for the block shapes above, `!$`, and every other word `{ label, type: 'keyword', apply: `${label} ` }`. Before returning for `!`, count the open conditionals above the cursor (`!if`, `!ifdef`, `!ifndef` open; `!endif` closes; lines blanked inside `/' … '/` comments are not counted) and, when one is open, give `!else`, `!elseif`, `!endif` `boost: 2`. Keep `validFor: /^[@!][\w$]*$/` so `!$` filters.

- [ ] **Step 5:** the tests PASS; `npm test`. Spec: X1's status adds "the directives (#PR)"; X3 → `shipped (#PR)` (filled in Task 6). Commit `feat(editor): every ! directive, with block snippets`.

### Task 3: Sections and blocks of an included file (R8)

**Files:**
- Modify: `src/editor/completion/local-files.js`
- Test: `tests/js/completion.test.js` (`describe('local paths')`; extend the `save.js` mock with `loadFile: vi.fn()`)
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (add R8 after R7)

**Interfaces:**
- Consumes: `loadFile(path): Promise<{content, etag}>` from `src/editor/save.js`; `folderOf` and `filePath` as today.

- [ ] **Step 1: Write the failing tests**
  - Picking a file after `!includesub ` inserts `parts.puml!` and reopens completion (`completionStatus` is `active`); after `!include ` it still inserts `parts.puml` alone.
  - `!includesub ./parts.puml!|` with `loadFile` resolving `!startsub ACTORS\n…\n!endsub\n!startsub ACTORS\n…\n!startsub LEGEND` → labels `['ACTORS', 'LEGEND']`, `type: 'constant'`, `from` just after the `!`; `loadFile` was called with `/apps/parts.puml` for a diagram at `/apps/UML_Fun.puml`.
  - `!include ./parts.puml!|` with `@startuml parts\n…\n@enduml\n@startuml(id=legend)\n…\n@enduml\n@startmindmap\n…` → labels `['parts', 'legend']` (named blocks only; the unnamed one is not offered).
  - `!includesub |` (nothing typed) also offers the section names of the open document (`!startsub ACTORS` in it) before the files, `type: 'constant'`.
  - `loadFile` rejecting → `null`, no unhandled rejection; a path with `$` or `%`, a `<…>` path and an `https://` path → `null` without calling `loadFile`.
  - A second completion for the same path in the same page calls `loadFile` once (kept per page, like `listFolder`).

- [ ] **Step 2:** `npx vitest run tests/js/completion.test.js -t 'local paths'` → FAIL.

- [ ] **Step 3:** In `localFiles`: a third pattern `/^\s*!include(_many|_once|sub)?[ \t]+"?([^\s"!]+)"?!([\w-]*)$/` takes precedence; resolve the file with `folderOf(file, dir)` + name, read it once per page through a module-level `Map` of promises, and offer `!startsub (\S+)` names for `includesub`, else the names of `@start\w+[ \t]+([\w-]+)` and `@start\w+\(id=([\w-]+)\)` lines; once each, in file order. A file option after `!includesub` gets `apply` that inserts `label + '!'` and calls `startCompletion` (as `reopen` does). With nothing typed after `!includesub `, prepend the open document's own `!startsub` names.

- [ ] **Step 4:** the tests PASS; `npm test`.

- [ ] **Step 5:** Spec R8, after R7: "| R8 | **Sections and blocks by name.** After `!includesub path!`, the names of that file's `!startsub` sections; after `!include path!` (and its variants), the names of its named blocks (`@startuml NAME`, `@startuml(id=NAME)`). Picking a file after `!includesub ` adds the `!` and opens the names. With nothing typed after `!includesub `, the diagram's own sections come first, for the same-diagram form. The file is read once per page through WebDAV, with the user's rights. | Dr K: \"`./UML_Fun_parts.puml needs !NAME`\" | shipped (#PR) |". Commit `feat(editor): complete section and block names after an include`.

### Task 4: `GET /apps/plantuml/keywords`

**Files:**
- Modify: `lib/Service/RenderService.php` (`keywords()`), `lib/Controller/RenderController.php` (`keywords()`), `appinfo/routes.php`
- Create: `tests/unit/fixtures/help-keywords.txt`, `tests/unit/fixtures/help-types.txt`
- Test: `tests/unit/RenderServiceTest.php`, `tests/unit/RenderControllerTest.php`

**Interfaces:**
- Produces: `RenderService::keywords(): array{diagrams: list<string>, types: list<string>, keywords: list<string>}`; route answers `{"diagrams": […], "types": […], "keywords": […]}`.

- [ ] **Step 1: Fixtures.** Save the live server's text answers as they come (do not trim): `help keywords` and `help types` posted to `http://plantuml.flow.svc/txt` (the encoding the existing fixtures were made with; a POST of `@startuml\nhelp keywords\n@enduml\n` works).

- [ ] **Step 2: Write the failing tests** (mirroring the themes tests):
  - `testKeywordsAreTheServersLists`: `diagrams` has 30 entries, starts `['board', 'bpm', 'chart', …]`, contains `uml`, `creole`, `files`, and no `@`; `types` has 53 entries and contains `actor`, `usecase`, `json`; `keywords` contains `alt`, `hnote`, `newpage`, `left to right direction`, `floating note`, `v2-axis`, and no entry starts with `@`.
  - `testKeywordsKeepOnlyLinesThatLookLikeKeywords`: text after the list (a line of prose, a line over 64 characters) is dropped.
  - `testKeywordsAreAskedOncePerServerForADay`, `testKeywordsWithoutTheListAreNotPlantumlAndNotCached`, `testKeywordsAnswered404AreNotPlantuml`.
  - Controller: `testKeywordsAreTheServersLists` (200, the three keys) and `testKeywordsFromAServerThatCannotAnswerIs503WithProblem`.

- [ ] **Step 3:** `composer run test:unit -- --filter Keywords` → FAIL.

- [ ] **Step 4:** `keywords()` = `cached('keywords', …)` reading both answers with `post('txt', …)`. Parse **by line**, not by word (a keyword may hold spaces): the trimmed non-empty lines after the marker (`The possible keywords are`, `The possible types are`), each kept only if it matches `/^[@\w][\w -]{0,63}$/`. `@start\w+` lines give `diagrams` (the part after `@start`), `@end…` lines are dropped, the rest are `keywords`; once each, in the server's order. An empty `types` or `keywords` list is `notPlantUml('txt answered help … without a list of …')`. Controller method `keywords()` with `#[NoAdminRequired] #[NoCSRFRequired]`, as `themes()`; route `['name' => 'render#keywords', 'url' => '/keywords', 'verb' => 'GET']` with the comment `// {"diagrams", "types", "keywords"}, for the editor's line-start completion`.

- [ ] **Step 5:** the tests PASS; `composer run test:unit`, `composer run psalm`, `composer run cs:check` (code-server pod only). App spec's `/keywords` row: "agreed, round 3" → "shipped (#PR)" for X11. Commit `feat(render): the server's keywords and element types`.

### Task 5: Keyword completion takes the server's words (X11)

**Files:**
- Modify: `src/editor/completion/server-list.js` (`serverKeywords()`), `src/editor/completion/keywords.js`
- Test: `tests/js/completion.test.js` (`describe('keywords')`)
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (X11)

**Interfaces:**
- Consumes: Task 4's route.
- Produces: `serverKeywords(): Promise<{types: string[], keywords: string[]}>` (each list strings only; `{types: [], keywords: []}` on any failure).

- [ ] **Step 1: Write the failing tests** (stub `global.fetch` and `OC.generateUrl` as the themes tests do):
  - With the server answering `{types: ['hexagon', 'actor'], keywords: ['hnote', 'left to right direction', 'alt']}`: `hex|` offers `hexagon`; `hn|` offers `hnote`; `left|` offers `left to right direction` and picking it inserts the whole phrase; `alt` is offered once, with its hand-kept detail `alternatives`.
  - The hand-kept words rank above server-only ones (`boost: 1` on the hand list).
  - With fetch rejecting, or answering 503, or `{keywords: 'x'}`: the offered labels equal today's hand list exactly (snapshot the label array before the change and assert against it).
  - `left to |` keeps offering `left to right direction` (a three-word keyword keeps matching while its words are typed).
  - `KEYWORDS`, `PARTICIPANTS`, `STRUCTURES` and `HELPER_HEADS` are unchanged arrays.

- [ ] **Step 2:** `npx vitest run tests/js/completion.test.js -t keywords` → FAIL.

- [ ] **Step 3:** `serverKeywords()` in `server-list.js` via `ask('keywords', read, empty)`, keeping only string entries of `types` and `keywords`. `keywords(context)` becomes `async`: its current guards first (unchanged), then `await serverKeywords()`, then the options = the hand list (`boost: 1`, details as today) plus each server word not already in it (`type: 'keyword'`). The typed-text pattern becomes `/^\s*(?:[\w-]+ )*[\w-]*/`, accepted when every word before the last is the start of some multi-word label; `validFor: /^[\w-]*(?: [\w-]*)*$/`.

- [ ] **Step 4:** the tests PASS; `npm test`; `npm run lint`.

- [ ] **Step 5:** Spec X11: replace "C2's hand-kept keyword list becomes the server's" with "The server's element types (`help types`) and keywords (`help keywords`) join C2's hand-kept list, which keeps its details, ranks first, and is all that is offered while the server does not answer"; status `shipped (#PR)`. Commit `feat(editor): line-start keywords from the server`.

### Task 6: Ship the round

- [ ] Specs: fill `#PR` in R2, R8, X1, X3, X11 and the app spec's `/keywords` row; CHANGELOG `[Unreleased]`: Added (every `!` directive; section and block names after an include; the server's keywords), Fixed (`!includesub NAME` of the same diagram no longer shows a mistake).
- [ ] All checks: `npm test`, `npm run lint`, `npm run build` (entry has no static `./chunks/` import; record the entry's gzip size against 238,734 bytes), `composer run test:unit`, psalm, cs.
- [ ] Propose to Dr K in chat (not files): a `diagrams/view.feature` scenario "A diagram draws a section of itself by name" and a scenario "Asking for the server's keywords" for the `/keywords` route.
- [ ] Push, PR (body ends with the Claude Code line), answer bot threads, merge on green, deploy (`dist/chunks` included), `apachectl -k graceful`.
- [ ] Live: `/apps/plantuml/keywords` answers the three lists; in the browser on UML_Fun.puml, `!` offers the whole list, `!includesub ./UML_Fun_parts.puml!` offers `ACTORS`, `!include ./UML_Fun_parts.puml!` offers `parts` and `legend`, `hn` offers `hnote`; restore Dr K's line 29 to `!includesub ./UML_Fun_parts.puml!ACTORS` only if he asks.
- [ ] Delete `.superpowers/sdd/2026-10-15-style-round` and this round's own workspace.
