<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Twelve grammars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** wire, flow, chart, bpm, dot, chen, regex, ebnf, hcl, mindmap, wbs, packetdiag and nwdiag blocks each get a grammar of their own, built from the lexicon and speaking the dictionary.

**Architecture:** Each is a profile (`src/editor/profiles/<type>.js`, a factory `(core) => { type, mode, completions: [], lints: [], values: [] }`, a lazy chunk loaded only for a file that holds the type, P1–P5), its mode a `core.lex.table(...)` of lexicon components and its own rules (G3). mindmap and wbs are one module with two profiles, as gantt and project are. The outer grammar keeps `'` and `/' … '/` comments, `!` lines and `<style>` blocks in every one (P5).

**Tech Stack:** CodeMirror 6 legacy `simpleMode` through `core.lex.table`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` rows T3, T7, T8, T17–T25, with G1–G6 and the dictionary (Y1–Y37). Research: `.superpowers/research/2026-10-15-dictionary/syntax-a.md` (wire, flow, chart, bpm, dot, chen), `syntax-b.md` (regex, ebnf, hcl, mindmap, wbs, packetdiag, nwdiag), `patterns.md` (where a shared rule must not apply), `examples/<type>-<n>.puml` (each drawn by the live server; the `-fails` ones do not draw, on purpose).

**Depends on:** `2026-10-15-styling-dictionary.md`, merged: `core.lex` (`table`, `match`, `textMode`, `common`, `patterns`, `colours`, `names`, `numbers`, `calls`, `stereotypes`, `box`, `creole`, `attributes`), the dictionary test and its fixtures folder.

## Global Constraints

- Every token is a dictionary token (G1; the list in the dictionary plan's Global Constraints). No new colour, no literal (H1).
- A profile imports no core module; what it needs comes in `core.lex` (P2, CI's chunk guard). Each new chunk's gzip size goes in the PR (P6); the entry does not grow.
- Lines and words follow PlantUML 1.2026.8's command regexes (G6), cited in the research files. A grammar never throws on what the server refuses; it colours what it can.
- Common lines per type exactly as G4: `core.lex.common()` in wire, chart (`{ legend: 'line' }`), chen, regex, ebnf, mindmap, wbs, nwdiag, packetdiag; `{ all: false, title: true }` in hcl; none in flow, bpm, dot.
- Each task adds `tests/js/fixtures/grammars/<type>.puml`, copied from the research examples that draw, and the dictionary test covers it with no change to the test.
- Dr K; SPDX `kubed-io`; branch `twelve-grammars` from main after the dictionary round's merge; one PR; commit per task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A uml keyword used as a name** (flow `start "Start"`, chen attribute `note`, ebnf rule `file = …`, hcl key `map = …`) is never a keyword and never opens a note or legend body. Pinned in Tasks 5, 6, 8, 9.
2. **A run of `-` or `+` that is a marker or a range** (mindmap `--`, wbs `+-`, chart `0 --> 100`, packetdiag `0-15`, wire's `--` column break) is never a connector. Pinned in Tasks 1, 4, 7, 11.
3. **A `#` that is not a colour** (regex `#fff`, hcl `# comment`, mindmap's `#` marker, DOT's `#` line) gets no swatch. Pinned in Tasks 1, 2, 8, 9.
4. **A block comment `(* …` or `/* …` left open** ends at the block's `@end`, and the next block reads normally (P5 checks `@end` first). Pinned in Tasks 3 and 8.
5. **`legend right` in a chart** is one line; the lines after it keep their tokens. Pinned in Task 4.

---

Every task has the same shape; only its rules and tests differ:

- **Files:** Create `src/editor/profiles/<type>.js`, `tests/js/<type>-profile.test.js`, `tests/js/fixtures/grammars/<type>.puml`; modify `src/editor/profiles/index.js` (`PROFILES[<type>]`).
- **Test helper:** `tokens(type, ...lines)` as in `tests/js/board-git-profile.test.js`, the language built with the profile's mode and its factory called with `core` (`tests/js/helpers/core.js`).
- **Steps:** (1) the failing tests below; (2) `npx vitest run tests/js/<type>-profile.test.js` FAILS; (3) the profile; (4) `npx vitest run tests/js/<type>-profile.test.js tests/js/dictionary.test.js tests/js/profiles.test.js` passes, with `profiles.test.js` asserting `needed()` asks for the type only when a block of it is in the file; (5) commit `<Type>: a grammar of its own (T<n>)`.

### Task 1: mindmap and wbs (T3)

`src/editor/profiles/tree.js`: `export default (core) => profile(core, 'mindmap')`, `export const wbs = (core) => profile(core, 'wbs')`; `PROFILES.wbs = () => import('./tree.js').then((m) => ({ default: m.wbs }))`.

Tests:
- mindmap `** Completion` → `**` `list`; `  *** Directives` (indented) → `***` `list`; `-- Windows 95` → `--` `list`, never `LinkOperator`; `+++ deep` → `list`; `*[#Orange] root` → `[` `squareBracket`, `#Orange` `ColorLiteral`, `]` `squareBracket`; `**_ boxless` → `_` `modifier`; `** a **b** <<green>>` → `**b**` `strong`, `green` `annotation`; `**:multi` / `line **two**;` → `:` `bracket`, `**two**` `strong`, `;` `bracket`; `left side` and `top to bottom direction` → `keyword`; `# hash node` → `#` `list` (no swatch); `0 root` → `0` `list`; `title Features` → `Title`.
- wbs `*_< left` → `*` `list`, `_` `modifier`, `<` `modifier`; `**[#pink](a) Item` → `ColorLiteral`, `(` `paren`, `a` `typeName`, `)` `paren`; `** "Task C" as C` → `string`, `keyword`, `typeName`; `A -> B #red <<s>> : label` → `->` `LinkOperator`, `#red` `ColorLiteral`, `s` `annotation`, `label` `labelName`; `left side` → plain (wbs has no such line); `# x` → no `list`.

### Task 2: regex (T7)

Tests (one line each): `^(?<user>[\w.+-]+)@x$` → `^` `keyword`, `(?<` `paren`, `user` `typeName`, `>` `paren`, `[` `squareBracket`, `\w` `escape`, `-` `separator`, `]` `squareBracket`, `+` `Quantifier`, `)` `paren`, `$` `keyword`; `(?:a|b){2,5}` → `(?:` `paren`, `|` `logicOperator`, `{2,5}` `Quantifier`; `a*?` → `*?` `Quantifier`; `\p{Lu}\x{1F600}￿\0377` → four `escape`s; `.` → `escape`; `[^a-z]` → `^` `logicOperator`; `[[:alpha:]]` → `[:alpha:]` `escape` inside the brackets; `(?#note)` → `comment`; `\Qx\E` → `\Q` and `\E` `escape`, `x` plain; Review Focus 3: `#fff` → no `ColorLiteral`; `"q"` → no `string`; `title My regex` → `Title`.

### Task 3: ebnf (T8)

Tests: `expr = term , { ( "+" | "-" ) , term } ;` → `expr` `typeName`, `=` `definitionOperator`, `,` `separator`, `{` `brace`, `(` `paren`, `"+"` `string`, `|` `logicOperator`, `;` `separator`; `my-rule = 'a' ;` → `my-rule` one `typeName`, `'a'` `string`; `consonant = letter - vowel ;` → `-` `arithmeticOperator`; `three = 3 * "ab" ;` → `3` `number`, `*` `Quantifier`; `some = { x }- ;` → `}` `brace`, `-` `Quantifier`; `sp = ? any char ? ;` → `? any char ?` `string`; `(* a` / `comment *)` → both `comment`; `(** doc **)` → `comment`; Review Focus 1: `file = "a" ;` → `file` `typeName`, no `keyword`; Review Focus 4: `(* open` / `@endebnf` / `@startuml` / `A -> B` → `@endebnf` `keyword` and `->` `LinkOperator`.

### Task 4: chart (T19)

Tests: `h-axis "Quarters" [Q1, Q2] label-right grid` → `h-axis` `keyword`, `"Quarters"` `string`, `[` `squareBracket`, `,` `separator`, `Q1` plain, `label-right` and `grid` `modifier`; `v-axis "Revenue" 0 --> 100 ticks [0:"Poor", 100:"Great"]` → `0` `number`, `-->` `separator` (Review Focus 2), `ticks` `keyword`, `:` `separator`, `"Poor"` `string`, no `labelName`; `bar <<s>> "Sales" [45, 62.5, -10] #3498db labels` → `s` `annotation`, numbers `number`, `#3498db` `ColorLiteral`, `labels` `modifier`; `scatter "P" [(1,12),(6,34)] <<square>>` → `(` `paren`, `square` `annotation`; `stackMode stacked` → `stacked` `atom`; `annotation "Peak" at (Q4, 70) <<arrow>>` → `at` `keyword`; Review Focus 5: `legend right` / `bar [1,2] #red` / `@endchart` → `legend` `keyword`, `right` `atom`, then `bar` `keyword` and `#red` `ColorLiteral`.

### Task 5: chen (T22)

Tests: `entity "Customer" as CUSTOMER <<weak>> #lightblue {` → `entity` `keyword`, `"Customer"` `string`, `as` `keyword`, `CUSTOMER` `typeName`, `weak` `annotation`, `#lightblue` `ColorLiteral`, `{` `brace`; `relationship RENTED_TO {` → `relationship` `keyword`, `RENTED_TO` `typeName`; inside: `  Number : INTEGER <<key>>` → `Number` `propertyName`, `:` `separator`, `INTEGER` `typeName`, `key` `annotation`; `  Name {` → `propertyName`, `brace`; `}` → `brace`; `RENTED_TO -(N,M)- DIRECTOR` → `-` `LinkOperator`, `(` `paren`, `N` `number`, `,` `separator`, `M` `number`, `)` `paren`, `-` `LinkOperator`, the names plain; `A =1= B` → `=` `LinkOperator`, `1` `number`; `A -- B` → `--` `LinkOperator`; `PERSON ->- U { A, B } #red` → `->-` `LinkOperator`, `U` `modifier`, `{` `brace`, `,` `separator`; Review Focus 1: `  note` / `  state` inside an entity → `propertyName` each, and the line after `}` reads chen (`A -- B` `LinkOperator`); `left to right direction` → `keyword`.

### Task 6: wire (T17)

Tests: `* DDR3L [100x50] #salmon` → `*` `list`, `DDR3L` `typeName`, `[` `squareBracket`, `100x50` `number`, `#salmon` `ColorLiteral`; `\t* inner` → `*` `list`; `spot third(100%+10, 50%) #cyan` → `spot` `keyword`, `third` `typeName`, `(` `paren`, `100%+10` `number`, `,` `separator`, `50%` `number`; `goto(100,10)` → `goto` `FunctionName`, numbers; `print("Foo 10")` → `print` `FunctionName`, `"Foo 10"` `string`; `DDR3 <=> SLC_NAND #red : abcd` → `<=>` `LinkOperator`, `#red` `ColorLiteral` (no longer lost before the label), `abcd` `labelName`; `a = b` and `a - b` → `=` and `-` `LinkOperator`; Review Focus 2: a line `--` → `heading`; `-------` → `heading`; Review Focus 1: `class -> other` → `class` plain.

### Task 7: flow and bpm (T18, T20)

Two profiles, two files (`flow.js`, `bpm.js`), one task: both are a few line forms with no common lines.

Tests, flow: `e work "Do the work"` → `e` `modifier`, `work` `typeName`, `"Do the work"` `string`; `start "Start"` → `start` `typeName`, no `keyword` (Review Focus 1); `w a` → `w` `modifier`, `a` plain; `title X` → no `keyword`, no `Title` (G4).
Tests, bpm: `:show new message;` → `:` `bracket`, text plain, `;` `bracket`; `:**bold**;` → `strong`; `20:<+>` → `20` `typeName`, `:` `separator`, `<+>` `LinkOperator`; `a<+>` → `a` `typeName`; `resume 20` and `goto a` → `keyword`, the id plain; `new branch`, `else`, `end branch` → `keyword`; `title X` → no `keyword`.

### Task 8: dot (T21)

Tests: `digraph foo {` → `digraph` `keyword`, `foo` `typeName`, `{` `brace`; `STRICT GRAPH g {` → `keyword`s in any case; `  a -> b [label="x", weight=2.5];` → `->` `LinkOperator`, `[` `squareBracket`, `label` `attributeName`, `=` `definitionOperator`, `"x"` `string`, `,` `separator`, `2.5` `number`, `;` `separator`; `  rankdir=LR` → `rankdir` `propertyName`; `node [shape=box, color="#ff0000"]` → `node` `keyword`, `shape` `attributeName`, `box` plain, `#ff0000` `ColorLiteral` (quotes `string`); `color=red` → `red` `ColorLiteral`; `label="a\nb\l"` → `\n` and `\l` `escape`; `label=<<b>bold</b>>` → `<b>` and `</b>` `tagName`; `a:n -> b:s` → `:` `separator`; `// c`, `# c` at column 0, `/* a` / `b */` → `comment`; `subgraph cluster_0 {` → `cluster_0` `typeName`; Review Focus 4: `/* open` / `@enddot` / `@startuml` / `A -> B` → `@enddot` `keyword`, `->` `LinkOperator`; Review Focus 3: `#` line → `comment`, no swatch.

### Task 9: hcl (T23)

Tests: `service "http" "web_proxy" {` → `service` `typeName`, the labels `string`, `{` `brace`; `  listen_addr = "127.0.0.1:8080"` → `listen_addr` `propertyName`, `=` `definitionOperator`, `string`; `  port : 3` → `:` `definitionOperator`, `3` `number`; `  ok = true` → `true` `atom`; `  data = file("init.sh")` → `file` `FunctionName`, `(` `paren`; `  list = ["a", "b"]` → `[` `squareBracket`, `,` `separator`; `"a\"b"` → `\"` `escape`; Review Focus 3: `# a comment` → `comment`, no swatch; a `#` after a value → plain (only a line's start); Review Focus 1: `  map = { a = "x" }` → `map` `propertyName`; `title x` → `Title`; `skinparam x` → no `keyword`.

### Task 10: packetdiag and nwdiag (T24, T25)

Two files (`packetdiag.js`, `nwdiag.js`), one task: both are blockdiag line forms sharing `core.lex`'s attribute list.

Tests, packetdiag: `packetdiag {` → `keyword`, `brace`; `  colwidth = 32` → `propertyName`, `definitionOperator`, `number`; `  scale_direction = rtl;` → `rtl` `atom`, `;` `separator`; `  0-15: Source Port` → `0` `number`, `-` `separator`, `15` `number`, `:` `separator`, text plain (Review Focus 2); `  106: URG [rotate = 270]` → `rotate` `attributeName`, `270` `number`; `  * x [len = 8]` → `*` `atom`; `  8-15: data as text is #red` → no `keyword`, no `ColorLiteral` (description text).
Tests, nwdiag: `nwdiag {`, `network dmz {`, `group web {` → `keyword`s, `dmz` and `web` `typeName`; `  address = "210.x.x.x/24"` → `propertyName`, `string`; `  color = "#FFAAAA"` → `#FFAAAA` `ColorLiteral` with its quotes `string`; `  color = pink` → `pink` `ColorLiteral`; `  width = full` → `full` `atom`; `  web01 [address = "210.x.x.1", shape = database];` → `web01` `typeName`, `address` and `shape` `attributeName`, `database` `atom`, `;` `separator`; `  description = "db <b>master</b>"` → `string`; `inet -- router;` → `--` `LinkOperator`; `// c` → `comment`.

### Task 11: The live check and the spec's status

**Files:** Modify `docs/superpowers/specs/2026-10-14-editor-design.md` (T3, T7, T8, T17–T25 to `building`, then `shipped (#N)`; Known limitations: drop "Blocks of a type with no grammar are highlighted as uml …", now true of none but `def`, which keeps uml on purpose (T26); drop the "Bad JSON" item only if T10 has shipped, else keep it).

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build`; record the gzip size of each new chunk (P6).
- [ ] **Step 2:** After merge and deploy, on the selenium account's copy of UML_Fun.puml, light and dark: one screenshot per new type's block, each read against its T row; and Review Focus 1–5 by eye on those blocks.
- [ ] **Step 3:** Commit `Spec: twelve grammars shipped`.
