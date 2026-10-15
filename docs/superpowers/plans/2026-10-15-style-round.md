<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# The style round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<style>` blocks get their own editor (grammar, completion, checks, folding) and stop breaking the uml highlighting; values get VS Code-like in-place choosers and number steppers; relative `!include` and `<style file=…>` resolve in the user's Nextcloud files.

**Architecture:** The outer PlantUML mode treats a `<style>` block as its own region, plain until the `style` profile (a chunk, P2) nests its grammar there. A core value registry (`src/editor/values/`) describes where a value sits and what list or kind it has; completion, the chooser widget and the stepper widget read it, and profiles add entries to it. On the server, `IncludeResolver` expands relative includes with the caller's rights before the source reaches PlantUML, keeping a line map so mistakes land on the right line.

**Tech Stack:** CodeMirror 6 (`StreamLanguage`, `WidgetType`, `Decoration`, `@codemirror/autocomplete`, `@codemirror/lint`), vitest + jsdom, PHP 8.1+ / PHPUnit 12 with OCP stubs, Node 24 for the generator.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` (X1 style part, X4's `%`, X8, X9, X10 style part, X13–X16, X18, W1–W3, R1–R7) and the two render route rows of `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`.

## Global Constraints

- Every colour is a Nextcloud variable (H1); `tests/js/theme.test.js` covers any new token or widget rule.
- One file per completion source and per lint rule; lint rules are pure `(state) => Diagnostic[]`; profiles are factories `(core) => Profile` and import no core module (the CI chunk-import guard must stay green).
- Strings exactly as the spec: "Choose a value", "Increase", "Decrease", "Unknown style property X", "Cannot find <path>", "<path> is already included", "In <path>, line N: <message>".
- Resolver limits: 8 levels, 64 files, 1 MB in all; paths never leave the caller's user folder; `/` is the user's root.
- Style vocabulary comes from PlantUML's source at tag `v1.2026.8` via `scripts/vocabulary.mjs`; the generated file records that version.
- Gherkin: proposals only, no `.feature` edit without Dr K's approval. Docs-only PRs carry the `no changelog` label.
- Commit after every task; one PR for the round, merged by the controller when CI is green.
- The maintainer is **Dr K**; SPDX headers say `kubed-io`.

## Review Focus

1. **A path that climbs out** (`!include ../../../../x.puml`, `/../x.puml`, an absolute filesystem path) must read nothing outside the caller's files and become "Cannot find …". Pinned in Task 5.
2. **An include cycle** (A includes B includes A) and a self-include must end, with a mistake, not recurse. Pinned in Task 5.
3. **Line mapping around an include**: a mistake on a line after a 10-line include must land on its own source line; one inside the included file on the include line. Pinned in Task 5.
4. **A style block before the style profile loads** (or when it fails) must leave the rest of the file highlighted as before — `note {` inside it must not open a note body. Pinned in Task 2.
5. **A stepper on `FontSize 0`** must not go to `-1`; a chooser on `FontStyle bold` must replace `bold` whole, not insert beside it. Pinned in Task 4.

---

### Task 1: Style vocabulary, generated

**Files:** Create `scripts/vocabulary.mjs`, `src/editor/data/vocabulary.json`; Test `tests/js/vocabulary.test.js`.

**Interfaces:** Produces `vocabulary.json` = `{ plantuml: '1.2026.8', style: { selectors: string[], properties: string[], fontStyles: string[] } }`. `node scripts/vocabulary.mjs` regenerates it from `https://raw.githubusercontent.com/plantuml/plantuml/v1.2026.8/src/main/java/net/sourceforge/plantuml/style/{SName,PName}.java` and `…/klimt/font/FontStyle.java`.

- [ ] **Step 1:** Test: `properties` has 30 entries including `BackGroundColor`, `FontStyle`, `RoundCorner`; `selectors` has 157 entries, includes `mindmapDiagram`, `class`, `package` (Java's `class_`/`package_` suffix dropped) and none ends in `_`; `fontStyles` is `['plain','italic','bold','underline','strike','wave']` (no `backcolor`); `plantuml` is `'1.2026.8'`.
- [ ] **Step 2:** Run `npx vitest run tests/js/vocabulary.test.js` — FAIL.
- [ ] **Step 3:** Write the script (fetch, extract the enum constants, lower-case `FontStyle`), run it, commit its output.
- [ ] **Step 4:** Tests PASS; `npm run lint`.
- [ ] **Step 5:** Commit `feat(editor): style vocabulary generated from PlantUML 1.2026.8 (X1)`.

### Task 2: Style blocks are their own region; `<style>` at the start of a line

**Files:** Modify `src/editor/plantuml-mode.js`, `src/editor/folding.js`, `src/editor/completion/creole.js` (or a new `completion/style-tag.js`, registered before `creole`), `src/editor/profiles/index.js` (P3 trigger); Test `tests/js/plantuml-mode.test.js`, `tests/js/folding.test.js`, `tests/js/completion.test.js`, `tests/js/profiles.test.js`.

**Interfaces:** Produces: `plantumlLanguage(inner)` treats a line that is `<style>` (after indentation), up to a line that is `</style>`, as a style region: the two tag lines `tagName`, the lines between handed to `inner.style` when present, else plain (`null`); a one-line `<style>…</style>` and `<style file=…>` are one `tagName` line. Checked at line start before any inner mode (P5), so it works inside yaml blocks too. `needed()` adds `'style'` when a line starts `<style`. Folding: a `<style>` line folds to the line before `</style>`.

- [ ] **Step 1:** Tests: X16 — every line of a `@startcreole` block uses the Creole rules (`**b**` strong, `//i//` emphasis, `<color:#F00>` tag + ColorLiteral, `[[url]]` link, `----` heading) and the line after `@endcreole` is uml again. Inside `<style>` … `</style>` with no style mode, `note {`, `legend {`, `title {` and `node {` lines are plain and the line after `</style>` is uml again (H8 notes still work after it); with a stub `inner.style`, the body lines carry its tokens; a style block inside a yaml block, with yaml and style both registered, is style; `needed` of a document with `<style>` includes `style`; the fold of a style block; completion at `<` on an empty line offers `<style>` first (inserting `<style>\n\t\n</style>` with the cursor on the empty line) and `<style file=` second, and C7's tags after them; mid-line `<` still offers only C7's tags.
- [ ] **Step 2:** Run the focused tests — FAIL.
- [ ] **Step 3:** Implement. `PROFILES.style` is registered in Task 3; in this task `needed` may name it, and the loader must tolerate a type with no registry entry (it already ignores unknown types — check).
- [ ] **Step 4:** Full `npx vitest run`, `npm run lint` — PASS.
- [ ] **Step 5:** Commit `fix(editor): a style block is its own region, never a note; creole blocks are Creole (X8, X16)`.

### Task 3: The style profile — grammar, completion, checks

**Files:** Create `src/editor/profiles/style.js`, `src/editor/lint/style.js`, `src/editor/completion/style.js` (profile-only: imports no core module); Modify `src/editor/profiles/index.js` (`PROFILES.style`), `src/editor/theme.js` if a new token name appears; Test `tests/js/style-profile.test.js`, `tests/js/lint.test.js`, `tests/js/completion.test.js`.

**Interfaces:** Consumes the vocabulary (Task 1) — the profile chunk imports `src/editor/data/vocabulary.json` directly (data, not a core module). Produces `default: (core) => Profile` with `type: 'style'`, `mode` (selectors `tagName`, `.class` and `:depth(n)` `className`, braces `bracket`, property names `propertyName`, hex `ColorLiteral`, named colours `atom`, numbers `number`, `'` comments `comment`), `completions: [styleCompletion]`, `lints: [styleLint]`, `values: ValueEntry[]` (Task 4's shape — add the field now as `[]`, filled in Task 4).

- [ ] **Step 1:** Tests: grammar tokens for a block holding `root {`, `.server {`, `node:depth(1) {`, `FontSize 22`, `BackGroundColor #FFF3B0;`, `LineColor red`, `'` comment, `}`. Completion inside a style block: at a selector position, the enclosing diagram's selector first (`mindmapDiagram` inside `@startmindmap`), then elements, then the rest; after `{` and indentation, properties (case kept as `PName`); after a property and a space, its values (`FontStyle` → the six font styles; `HorizontalAlignment` → `left`, `center`, `right`; `ShowStereotype` → `true`, `false`). Lint: `FontSise 12` → warning "Unknown style property FontSise" with quick fix "FontSize"; a property is matched case-insensitively (`fontsize` is fine); a `<style>` with no `</style>` → error "No </style> for this style block"; selectors never flagged.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; the lint finds style blocks itself (same line rules as Task 2).
- [ ] **Step 4:** `npx vitest run`, `npm run lint`, `npm run build` + the chunk-import guard — PASS; a `style-*.js` chunk exists.
- [ ] **Step 5:** Commit `feat(editor): a style editor between the style tags (X8, X9, X10)`.

### Task 4: Values — registry, chooser, stepper

**Files:** Create `src/editor/values/index.js` (registry + `valueAt(state, pos)`), `src/editor/values/widgets.js` (chooser and stepper `WidgetType`s, a `ViewPlugin` for the cursor's line), `img/icons/pencil.svg` exists — reuse it; Modify `src/editor/profiles/index.js` (profiles' `values` joined into the registry facet), `src/editor/profiles/style.js` (style value entries), `src/editor/completion/themes.js` (replace the whole value; Ctrl-Space inside a theme name), `src/editor/theme.js`, `src/editor.js`; Test `tests/js/values.test.js`, `tests/js/completion.test.js`, `tests/js/theme.test.js`.

**Interfaces:** Produces `ValueEntry = { match(lineText, state, lineFrom) => Array<{ from, to, kind: 'list'|'number', options?: () => string[] | Promise<string[]>, min?: number }> }`; `valuesFacet` (combine = flat); core entries: `!theme <name>` (list, from the themes source), `skinparam <name> <number>`, `scale <number>`, `<size:<number>>` (numbers); style entries (Task 3's profile): list values for `FontStyle`, `HorizontalAlignment`, `ShowStereotype`, numbers for numeric properties with `min: 0` for the spec's non-negative ones.

- [ ] **Step 1:** Tests: `valueAt` finds `bold` in `FontStyle bold` as a list value with its range; `22` in `FontSize 22` as a number with `min 0`; nothing on other lines. Chooser: with the cursor on the line, one pencil button per list value, labelled "Choose a value"; clicking selects the value and opens completion whose `from`/`to` span the whole value, the current value selected; picking `italic` turns `FontStyle bold` into `FontStyle italic`. Ctrl-Space inside `bol|d` opens the same list and replaces the whole word. Stepper: ▲ on `FontSize 22` → `23`, Shift ▲ → `32`, ▼ on `0` stays `0`, ▲ on `1.5` → `1.6`, ▲ on `LineThickness 2` in a skinparam line works; repeated clicks within the history's group delay undo in one step; no widgets on other lines.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement (decorations rebuilt on selection/doc change for the cursor's line only; holding repeats per W2).
- [ ] **Step 4:** `npx vitest run`, `npm run lint`, `npm run build` — PASS.
- [ ] **Step 5:** Commit `feat(editor): choosers and steppers on the cursor's line (W1–W3)`.

### Task 4b: Named colours and colour forms (X14, X15)

**Files:** Modify `lib/Service/RenderService.php` (`colors()`: names from `help colors` rendered as text, hex from the `colors` SVG's rect-then-text pairs; cached a day as `themes()`), `lib/Controller/RenderController.php` + `appinfo/routes.php` (`GET /colors`), `src/editor/plantuml-mode.js` (X15 forms; a named colour after `#` in a colour position a `ColorLiteral`), `src/editor.js` / the colour extension wiring (swatches for named colours from the route's map; a pick writes `#rrggbb`); Create `src/editor/completion/colors.js` (core), `src/editor/completion/server-list.js` reuse for the route; Test PHP `RenderServiceTest`/`RenderControllerTest` (fixtures: a `help colors` text and a `colors` SVG under `tests/unit/fixtures/`), JS mode/completion/editor tests.

- [ ] Tests first: the route returns name→hex (AliceBlue → #F0F8FF; ArchiMate `APPLICATION` → #C2F0FF); after `#` in `actor Bob #`, `node x #Al`, `<color:#`, `skinparam ArrowColor #`, `BackGroundColor #` inside a style block — names offered with swatches, not after `#` at the start of a line (`#highlight`) nor in `#line.dashed` style parts; `#Red/Yellow`, `#FF0000/FFFF00`, `#Red|Yellow`, `#?black:white`, `is colored in White/Red` tokenise as two `ColorLiteral`s each; a named colour gets a swatch.
- [ ] Implement; all suites, psalm, cs, lint, build. Commit `feat(editor): named colours from the server, gradients and auto colours (X14, X15)`.

### Task 4c: `%` built-ins and helper commands (X4's `%`, X13)

**Files:** Modify `scripts/vocabulary.mjs` (also writes `src/editor/data/builtins.json`: every `TFunctionSignature("%name", n)` under `tim/builtin/` at `v1.2026.8`, with description and example from that folder's `readme.md` when it has a row), `src/editor/completion/keywords.js` (X13 helpers on a line alone in a uml block); Create `src/editor/completion/builtins.js` (core source; loads `builtins.json` with a dynamic `import()` the first time `%` is typed, so it is a chunk of its own); Test `tests/js/vocabulary.test.js`, `tests/js/completion.test.js`.

- [ ] Tests first: `builtins.json` holds `%date`, `%lighten`, `%get_all_stdlib`, `%strlen` with descriptions, and functions without a readme row (e.g. `%get_current_theme`) with an empty description; after `%` anywhere (not in a `'` comment) the list is offered, each inserted as `%name()` with the cursor between the parentheses and the description as the detail; X13: on an empty line in a uml block, `col` offers `colors`, `help t` offers `help themes`/`help types`; not inside other block types.
- [ ] Implement; suites, lint, build + guard (the builtins chunk is imported dynamically, never statically). Commit `feat(editor): built-in functions after % and PlantUML's helper commands (X4, X13)`.

### Task 4d: Files diagrams (X18)

**Files:** Modify `src/editor/plantuml-mode.js` (a `@startfiles` block: path lines and `<note>` bodies, Creole from the existing rules, as X16 does for creole), `src/editor/completion/directives.js` (`@startfiles`/`@endfiles`, B8 body `/`), `src/editor/completion/style-tag.js` or a new `completion/files-note.js` (`<note>` at line start inside a files block); Test `tests/js/plantuml-mode.test.js`, `tests/js/completion.test.js`.

- [ ] Tests first, from plantuml.com/files-diagram's examples: `/src/example.py` gives `/` punctuation and plain segments; `/**creole_test**/""monospaced""` gives strong and monospace; `<note>` and `</note>` are `tagName`, the lines between Creole; the line after `@endfiles` is uml again; `@st` offers `@startfiles` and picking it inserts `@startfiles name` / `/` / `@endfiles`; `<` on an empty line inside a files block offers `<note>` first; outside a files block it does not.
- [ ] Implement; suites, lint, build. Commit `feat(editor): files diagrams, highlighted and offered (X18)`.

### Task 4e: Style refinements from the mindmap page

**Files:** Modify `src/editor/profiles/style-grammar.js`, `src/editor/lint/style.js`, `src/editor/completion/style.js`, `src/editor/profiles/style.js` (values); Test `tests/js/style-profile.test.js`, `tests/js/lint.test.js`, `tests/js/completion.test.js`, `tests/js/values.test.js`.

- [ ] Tests first, using plantuml.com/mindmap-diagram's "Word Wrap" style block verbatim: no diagnostic at all (`LineStyle 8.0;3.0` is one value, `BackgroundColor` matches `BackGroundColor`, `Shadowing 0.0`, `LineThickness 3.0`); the grammar gives `8.0;3.0` as one value (two numbers, the `;` inside it not a separator); the stepper steps each number of a dash pattern on its own; inside `@startmindmap` (and `@startwbs`) the selector list starts `node`, `rootNode`, `leafNode`, `boxless`, `arrow`, then `:depth(` (a snippet `:depth(${n})`), then `mindmapDiagram`, then the rest.
- [ ] Implement; suites, lint, build + guard. Commit `fix(editor): style blocks read mindmap's dash patterns and selectors`.

### Task 5: IncludeResolver

**Files:** Create `lib/Service/IncludeResolver.php`, `lib/Service/Expanded.php`; Test `tests/unit/IncludeResolverTest.php` (OCP `Folder`/`File` mocks as the other tests do).

**Interfaces:** Produces `IncludeResolver::expand(string $source, Folder $base, Folder $root): Expanded` with `Expanded { string $source; list<int> $lineMap /* 0-based sent line → 0-based source line */; list<array{line:int, path:string, inner:int|null}> $origins /* sent lines that came from a file */; list<array{line:int, message:string}> $mistakes; list<string> $etags }`, and `Expanded::mapError(int $sentLine, string $message): array{line:int, message:string}`.

- [ ] **Step 1:** Tests (each a fake folder tree): `!include foo.puml`, `./foo.puml`, `"foo.puml"`, `../shared/foo.puml`, `/x.puml` resolve; a file with `@startuml … @enduml` gives its inner lines; `!include f.puml!1` and `!include f.puml!ID` pick blocks; second plain `!include` of the same file is dropped; `!include_many` repeats; `!include_once` twice → mistake "f.puml is already included"; `!includesub f.puml!BASIC` collects both BASIC sections; `<style file=./a.css>` → `<style>`, lines, `</style>`; nested include resolves against its own folder; `<C4/C4_Container>` and `https://…` untouched; missing → line kept + mistake "Cannot find nope.puml"; **climb-out** (`../../../../x.puml`, `/../x.puml`) → "Cannot find …" and no read outside `$root` (assert the mock is never asked); **cycle** A↔B and self-include → stops with a mistake; depth 9 → mistake; 65 files → mistake; > 1 MB → mistake; R7: `!import lib.zip` (a real zip built in the test) then `!include inner.puml` reads from the zip before the folder, the `!import` line is not sent, an unreadable zip → "Cannot read lib.zip", a zip whose entries exceed 1 MB uncompressed stops at the limit; **line map**: an error on sent line after a 10-line include maps to its source line; an error inside the include maps to the include line with "In foo.puml, line 3: <msg>"; `etags` lists each included file's ETag.
- [ ] **Step 2:** `composer test:unit -- --filter IncludeResolver` — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PHP unit suite, `composer psalm`, `composer cs:check`, `php -l` — PASS.
- [ ] **Step 5:** Commit `feat(render): relative includes and imported libraries resolve in the user's files (R1–R3, R7)`.

### Task 6: Routes and the client resolve

**Files:** Modify `lib/Controller/RenderController.php`, `lib/AppInfo/Application.php` if DI needs it, `src/editor/preview.js`, `src/editor.js`, `src/readme/workspace.js` (and `src/readme.js` for the README path), `src/editor/watch.js` or `src/editor.js` (R6); Test `tests/unit/RenderControllerTest.php`, `tests/js/preview.test.js`, `tests/js/editor.test.js`, `tests/js/workspace.test.js`.

**Interfaces:** Consumes `IncludeResolver::expand` (Task 5). `bySource(string $source = '', mixed $index = 0, string $path = '')`; `byPath` resolves against the file's folder and its ETag becomes `md5(fileEtag . implode(',', $expanded->etags))` when anything was included (the file's own ETag otherwise, so today's caching is unchanged for files without includes). Both map the server's error line through `Expanded::mapError`, and a resolver mistake (when the server reports none) is sent as `X-PlantUML-Diagram-Error`/`-Line` like V3. JS: `render(source, index, path)`, `debouncedRender(source, index, path, cb)`; the editor passes its current path (the copy's after S8); README fences pass the README's path.

- [ ] **Step 1:** Tests: controller — `path` the caller cannot read → 404 (as GET); with `path`, the resolver's source is sent and the mapped error line returned; a resolver mistake with a clean server render is returned in the error headers; GET's ETag changes when an included file's ETag changes, and equals the file's ETag when nothing is included. JS — the body carries `path`; the editor sends the copy's path after Save as copy; a README fence sends the README path; R6: a `visibilitychange` to visible or a window `focus` triggers a render of the current source (and none while closed).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** PHP + JS suites, psalm, cs, lint, build — PASS.
- [ ] **Step 5:** Commit `feat(render): every route resolves relative files (R4, R6)`.

### Task 7: Local path completion

**Files:** Create `src/editor/completion/local-files.js`; Modify `src/editor/completion/index.js`, `src/editor/save.js` (a `listFolder(path)` Depth-1 PROPFIND helper), `src/editor/lint/state.js` or a new facet for the file's full path; Test `tests/js/completion.test.js`, `tests/js/save.test.js`.

**Interfaces:** Produces `listFolder(path) => Promise<Array<{ name, folder: boolean }>>` (cached per path for the page); a `filePath` facet (the edited file's path; updated on Save as copy alongside `fileName`).

- [ ] **Step 1:** Tests: after `!include ` (and `_many`, `_once`, `includesub`), offers `<`, `https://`, then the folder's `.puml`/`.iuml`/`.plantuml`/`.pu`/`.txt` files and its folders (a folder inserts `name/` and reopens); after `!include ./sub/`, that folder's entries; `../` offered except at the user's root; after `<style file=`, `.css`/`.txt` files and folders; the listing is fetched once per folder; nothing after `!include <` (X5's stdlib, round 3).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Suites, lint, build — PASS.
- [ ] **Step 5:** Commit `feat(editor): complete paths beside the diagram (R5)`.

### Task 8: Penpot — the style editor, choosers and steppers

Follow `skill://penpot/penpot-router/SKILL.md` (kb) and the skill it routes to; new UI as component instances bound to tokens. Add to the Editor page a board `screens / editor-style` (a uml block with a `<style>` block, the cursor on `FontStyle bold` showing the pencil chooser open as a list, and on `FontSize 22` the stepper), new components `value-chooser` (default/hover) and `number-stepper` (default/hover-up/hover-down); export `docs/design/editor-style.png`; add the board to the app spec's design table. Commit `docs(design): the style editor, choosers and steppers`.

### Task 9: Ship the round

- [ ] Specs: the round's rows `agreed (style round)` → `shipped (#PR)`; Known limitations; CHANGELOG `[Unreleased]` Added.
- [ ] Propose to Dr K (chat, not files): Behat "A diagram draws a file it includes from beside it" and "A diagram's style file beside it is applied" (`diagrams/view.feature` through `GET /render`).
- [ ] All checks; P6 sizes; PR; bot threads; merge; deploy (`dist/chunks` included).
- [ ] Live: create `/apps/UML_Fun.css` (the nodes style moved out of UML_Fun.puml) and `/apps/UML_Fun_parts.puml` (a `!startsub ACTORS` section and an `@startuml(id=legend)` block) in Dr K's folder, reference them from UML_Fun.puml with `<style file=./UML_Fun.css>`, `!includesub ./UML_Fun_parts.puml!ACTORS` and `!include ./UML_Fun_parts.puml!legend`; check in selenium-flow (on a copy in the selenium account) that the diagram is styled and includes resolve, a mistake in the parts file lands on the include line, the chooser and stepper work, and the style block is coloured.
