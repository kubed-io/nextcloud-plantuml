<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Tag attributes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tag's parts are coloured like VS Code's HTML (tag, attribute, quiet `=`, value as a string), and a tag's attributes and their values complete, with the chooser and stepper on them.

**Architecture:** The PlantUML mode (`src/editor/plantuml-mode.js`, a legacy `simpleMode`) splits each tag into tokens: Creole tags with attributes push a `tagAttrs` state that pops at `>` or the end of the line; the `:` and `{…}` forms are split by regex groups; `<style file=…>` is split in `styleStart`. A new completion source `tag-attributes.js` offers a tag's attributes; the value registry (`src/editor/values/`) gains entries for their values, so completion (`values.js`), the chooser (W1) and the stepper (W2) see them; colour places join `colors.js`. A new route `GET /apps/plantuml/fonts` serves the server's `help font`.

**Tech Stack:** CodeMirror 6 (`@codemirror/legacy-modes` simple-mode, `@codemirror/autocomplete`), vitest + jsdom, PHP 8.1+ / PHPUnit 12, the Penpot MCP.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` rows H9, H10, C7, C9, W1–W4, X14, R5; the `/fonts` row of `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`.

## Global Constraints

- PlantUML facts come from v1.2026.8 (`klimt/creole/command/Splitter.java`): `<font size= color=>`, `<img src= vspace= valign=(top|middle|bottom)>`, `<style file=>`, `{scale= color=}` after `<&icon>`, `<:emoji:>`, `<$sprite>`; `{scale=}` only after `<img:…>` and `<qrcode:…>`; `<text …>` takes any `\w+=value`.
- Colours only through `src/editor/theme.js`'s existing tags: tag → `tags.tagName` (maroon), attribute name → `tags.attributeName`, `=` `:` `{` `,` `}` → `tags.punctuation`, values → `tags.string` (a colour stays `ColorLiteral`, which is the same green and keeps its swatch). No new hue, no literal (H1).
- Server lists follow C8 (once per page; strings only; a failure is an empty list); the route caches a day per server URL like `/themes`.
- The editor entry imports no chunk statically (CI guard).
- Gherkin: proposals in chat only. The maintainer is **Dr K**; SPDX `kubed-io`; no real names.
- One PR, branch `tag-attributes` (spec commit `e9eeee6` is on it); commit after every task; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An unclosed tag** (`<font size=12` and no `>`) must end at the line's end: the next line is highlighted as before. Pinned in Task 1.
2. **A `<` that is not a tag** — `A <- B`, `<<stereotype>>`, `a < b` in a label — must not enter the attribute state or offer attributes. Pinned in Tasks 1 and 4.
3. **The server not answering `/fonts`** leaves `<font:` with no list and no pencil, and no error. Pinned in Task 3.
4. **`scale=0.1` stepped down** goes to `0.0`, never below 0; `vspace=0` ▼ stays 0. Pinned in Task 3.
5. **Attributes already on the tag** (`<font size=12 |`) are not offered again; inside a quoted value (`<img src="a |`) nothing is offered. Pinned in Task 4.

---

### Task 1: A tag's parts (H10)

**Files:**
- Modify: `src/editor/plantuml-mode.js` (`creole()` tag rules ~lines 110-115, a `tagAttrs` state, `styleImport`/`styleStart` ~lines 255, 318-319)
- Test: `tests/js/plantuml-mode.test.js`, `tests/js/theme.test.js`

**Interfaces:**
- Produces: token names only (`tagName`, `attributeName`, `punctuation`, `string`, `ColorLiteral`); no exports change.

- [ ] **Step 1: Write the failing tests** in `plantuml-mode.test.js` (use the file's existing token helper), each asserting `[text, token]` pairs for the tag's parts:
  - `note: <font size=12 color=red>big</font>` → `<font` tagName, `size` attributeName, `=` punctuation, `12` string, `color` attributeName, `=` punctuation, `red` string, `>` tagName, `</font>` tagName.
  - `<img src="a b.png" valign=top>` → `<img`, `src`, `=`, `"a b.png"` (string), `valign`, `=`, `top`, `>`.
  - `<size:20>` → `<size` tagName, `:` punctuation, `20` string, `>` tagName; `<color:#FF0000>` → `<color`, `:`, `#FF0000` ColorLiteral, `>`; `<color:red>` → `red` ColorLiteral; `<font:Trebuchet MS>` → `Trebuchet MS` string; `<u:red>` → `<u`, `:`, `red` ColorLiteral, `>`.
  - `<&star{scale=2,color=red}>` → `<&star` tagName, `{` punctuation, `scale` attributeName, `=`, `2` string, `,` punctuation, `color`, `=`, `red` ColorLiteral, `}` punctuation, `>` tagName; `<:sunny:{scale=0.5}>` and `<img:x.png{scale=0.5}>` likewise.
  - `<text fill=blue>` → `fill` attributeName, `blue` string.
  - `<style file=./UML_Fun.css>` → `<style` tagName, `file` attributeName, `=` punctuation, `./UML_Fun.css` string, `>` tagName.
  - Review Focus 1: `"note: <font size=12\nA -> B"` → line 2 tokens equal those of `"A -> B"` alone.
  - Review Focus 2: `A <- B : x`, `class A <<entity>>` and `note: a < b` produce no `attributeName` token.
  - `theme.test.js`: the style profile's tags and every name above are styled (extend 'colours every token the PlantUML mode emits' with `tags.attributeName`).
- [ ] **Step 2:** `npx vitest run tests/js/plantuml-mode.test.js tests/js/theme.test.js` → the new tests FAIL.
- [ ] **Step 3:** In `creole(base)`: `<font\s`, `<img\s`, `<text\s` emit `tagName` and `push: 'tagAttrs'`; the `tagAttrs` state reads `[\w-]+(?=\s*=)` attributeName, `=` punctuation, `"[^"]*"|'[^']*'` string, a colour after `color=` ColorLiteral, `[^\s>"'/]+` string, whitespace null, `/?>` tagName with `pop: true`, and pops at the end of the line (simple-mode keeps state across lines, so the state's rules include `{ regex: /$/, pop: true }` or the mode resets it in `startState`/`sol` — pick the one the tests prove). The `:` forms and `{…}` suffixes are regex rules with token arrays, before the existing catch-all tag rule, which stays for `<b>`, `</font>` and the rest. In `styleStart`, `styleImport` gains groups so the import line emits `<style`, attribute, `=`, value, `>` as above (the one-line and block `<style>` forms are unchanged).
- [ ] **Step 4:** the tests PASS; `npm test`; `npm run lint`.
- [ ] **Step 5:** Spec H10 status stays `agreed` (filled at ship). Commit `feat(editor): a tag's parts coloured like HTML`.

### Task 2: `GET /apps/plantuml/fonts`

**Files:**
- Modify: `lib/Service/RenderService.php` (`fonts()`), `lib/Controller/RenderController.php` (`fonts()`), `appinfo/routes.php`
- Create: `tests/unit/fixtures/help-font.txt` (the live server's raw `help font` text answer, untrimmed: POST `@startuml\nhelp font\n@enduml\n` to `http://plantuml.flow.svc/txt`)
- Test: `tests/unit/RenderServiceTest.php`, `tests/unit/RenderControllerTest.php`

**Interfaces:**
- Produces: `RenderService::fonts(): list<string>`; route answers `{"fonts": [...]}`.

- [ ] **Step 1: Write the failing tests**, mirroring the keywords ones: `testFontsAreTheServersList` (contains `DejaVu Sans`, `DejaVu Sans Mono`, `Dialog`; every entry a family name with its spaces; none is the heading text), `testFontsAreAskedOncePerServerForADay`, `testFontsWithoutTheListAreNotPlantumlAndNotCached`, `testFontsAnswered404AreNotPlantuml`; controller `testFontsAreTheServersList`, `testFontsFromAServerThatCannotAnswerIs503WithProblem`.
- [ ] **Step 2:** `composer run test:unit -- --filter Fonts` → FAIL.
- [ ] **Step 3:** `fonts()` = `cached('fonts', …)` over `helpText("@startuml\nhelp font\n@enduml\n", 'font')` and `linesAfter(…, 'The possible font on your system are')` (by line: families hold spaces), at most 200; empty → `notPlantUml('txt answered help font without a list of fonts')`. Controller as `themes()`; route `['name' => 'render#fonts', 'url' => '/fonts', 'verb' => 'GET']` commented `// {"fonts": [...]}, for <font:…> and font= completion`.
- [ ] **Step 4:** the tests PASS; `composer run test:unit`, `composer run psalm`, `composer run cs:check`.
- [ ] **Step 5:** App spec `/fonts` row stays `agreed` (filled at ship). Commit `feat(render): the server's fonts`.

### Task 3: A tag's values (W4)

**Files:**
- Modify: `src/editor/values/index.js` (new core entries), `src/editor/completion/server-list.js` (`serverList('fonts')`), `src/editor/completion/colors.js` (`PLACES`)
- Test: `tests/js/values.test.js`, `tests/js/completion.test.js` (`describe('named colours')`, `describe('values')` or nearest)

**Interfaces:**
- Consumes: Task 2's route.
- Produces: registry entries visible through `valuesOn(state, line)` / `valueAt(state, pos)`; `serverList` accepts `'fonts'`.

- [ ] **Step 1: Write the failing tests**:
  - `valuesOn` on `<img src=x.png valign=top vspace=4>` → a `list` value over `top` whose `options()` resolves `['top', 'middle', 'bottom']`, and a `number` value over `4` with `min: 0`.
  - `<font size=12>` → number over `12`, `min: 0`; `<space:8>` → number, `min: 0`; `<&star{scale=1.5}>` → number over `1.5`, `min: 0`; `stepNumber('0.1', -1, 0)` → `'0.0'` and `stepNumber('0', -1, 0)` → `'0'` (Review Focus 4).
  - `<font:DejaVu Sans>` → a `list` value over `DejaVu Sans` whose options come from `serverList('fonts')` (stub fetch answering `{fonts: ['DejaVu Sans', 'Dialog']}`); with fetch failing, options resolve `[]` and the chooser draws no pencil for it (Review Focus 3: assert through the widgets' decoration set as the existing W1 tests do).
  - `values` completion at `<img valign=|>` (explicit) offers `top`, `middle`, `bottom`.
  - Named colours (stub `serverColors`): `<font color=|`, `<font color=re|`, `<u:|`, `<w:|`, `<s:|`, `<color:|` (no `#`), `<&star{color=|` each offer the names with swatches; `<color:#|` keeps today's behaviour.
- [ ] **Step 2:** `npx vitest run tests/js/values.test.js tests/js/completion.test.js` → FAIL.
- [ ] **Step 3:** In `values/index.js` add entries (one `ValueEntry` each, joined to `coreValues`): `valign` list; `size=`/`vspace=` numbers in `<font …>`/`<img …>`; `<space:N>`; `scale=` in a `{…}` (stepped by its own last decimal, as `stepNumber` already does); `<font:family>` list over `serverList('fonts')`. In `colors.js` `PLACES` add `<(?:color|back|u|s|w):#?(\w*)$`, `<font\b[^>]*\scolor=["']?#?(\w*)$` and `\{[^}]*color[=:]#?(\w*)$`, keeping how the file writes a `#` the user typed or not.
- [ ] **Step 4:** the tests PASS; `npm test`; `npm run lint`.
- [ ] **Step 5:** Commit `feat(editor): a tag's values in completion, the chooser and the stepper`.

### Task 4: A tag's attributes (C9)

**Files:**
- Create: `src/editor/completion/tag-attributes.js`
- Modify: `src/editor/completion/index.js` (`sources`, after `creole`)
- Test: `tests/js/completion.test.js` (new `describe('tag attributes')`; update the registered-sources test)

**Interfaces:**
- Produces: `export function tagAttributes(context: CompletionContext): CompletionResult|null`.

- [ ] **Step 1: Write the failing tests**:
  - `note: <font |` → `size=`, `color=`; `<img |` → `src=`, `vspace=`, `valign=`; `<style |` at a line start → `file=`; `<&star{|` and `<:sunny:{|` and `<$foo{|` → `scale=`, `color=`; `<img:x.png{|` and `<qrcode:hi{|` → `scale=` only; `<&star{scale=2,|` → `color=` only.
  - Picking `valign=` inserts `valign=` and opens completion (`completionStatus` active) offering `top`, `middle`, `bottom` (Task 3's values).
  - Review Focus 5: `<font size=12 |` → `color=` only; `<img src="a |` → null; `<text |` → null.
  - Review Focus 2: `A <|`, `A <- B |`, `class A <<|`, inside a style block body, and in a `'` comment → null.
- [ ] **Step 2:** `npx vitest run tests/js/completion.test.js -t 'tag attributes'` → FAIL.
- [ ] **Step 3:** `tagAttributes`: match the text before the cursor on its line against an open tag (`/<(font|img|style)\b([^<>]*?)\s([\w-]*)$/`, or `/<(?:#\w+)?(&[-\w]+|:[\w]+:|\$\w+|img:[^>{}]+|qrcode:[^>{}]+)\{([^}]*?)([\w-]*)$/` for `{…}`), refuse inside an open quote, inside `inStyleBody` and on a `'` comment line, and offer the tag's attributes (the spec's set) minus those already written, `type: 'property'`, each `apply` inserting `name=` and calling `startCompletion`. `<style` only at a line's start (as `styleImport`).
- [ ] **Step 4:** the tests PASS; `npm test`; `npm run lint`.
- [ ] **Step 5:** Spec C9/H10/W4 statuses stay `agreed` until ship. Commit `feat(editor): complete a tag's attributes`.

### Task 5: Penpot — tag colours and the attribute list

- [ ] Follow `skill://penpot/penpot-router/SKILL.md` (kb) and the skill it routes to; reuse components (`source-pane`, `completion-row`, `value-chooser`, `number-stepper`, `color-swatch`) and tokens; one `execute_code` at a time.
- [ ] Update the `source / code` text in `screens / editor-style` and `screens / editor-style-stepper` so tag parts follow H10 (maroon `<style`/`>`, attribute orange, grey `=`, green values); the maroon is a new token `color-syntax-tag` if the file has no matching token (record the light `#9f0808` / dark `#fa7777` values).
- [ ] New board `screens / editor-tag-attributes`: a uml block with `note: <font |` on the cursor line and the completion popup open on `size=` and `color=`; a second line `<img src="logo.png" valign=top>` showing the pencil after `top`. Link its Source toggle like its siblings.
- [ ] Export `docs/design/editor-tag-attributes.png` (and re-export the two updated boards); add the row to `docs/design/README.md` and the app spec's design table. Commit `docs(design): tag colours and the attribute list`.

### Task 6: Ship

- [ ] Specs: H10, C9, W4 and `/fonts` → `shipped (#PR)`; CHANGELOG `[Unreleased]` Added: tag parts coloured like HTML; a tag's attributes and values complete, with the chooser and stepper; `GET /apps/plantuml/fonts`.
- [ ] All checks (`npm test`, lint, build + entry gzip vs 240,193 B, PHP unit, psalm, cs); PR; bot threads; merge on green; deploy with `dist/chunks`; `apachectl -k graceful`.
- [ ] Live, in selenium-flow on the selenium account's UML_Fun copy: the `<style file=…>` line's four colours; `<font |` offers `size=`/`color=`; `valign=` pencil lists top/middle/bottom; `<font:` lists the server's fonts; `/apps/plantuml/fonts` answers.
- [ ] Propose Gherkin "Asking for the server's fonts" in chat.
