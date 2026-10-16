<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Salt and JSON — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** salt and json blocks each get a grammar of their own, JSON is checked in the editor as PlantUML reads it, and a `{{type` … `}}` sub-diagram inside a note, legend, description or class body is read with its type's grammar.

**Architecture:** json and salt are profiles (`src/editor/profiles/<type>.js`, a factory `(core) => { type, mode, completions, lints, values }`, lazy chunks, P1–P5). json wraps CodeMirror's legacy `json` mode and renames its tokens; salt is a `core.lex.table` of its own. The JSON check is a port of PlantUML's reader in the json chunk. Sub-diagrams are core: a small module of their lines' shapes (`src/editor/sub-diagrams.js`) read by the outer grammar, `needed()`, folding and one completion source.

**Tech Stack:** CodeMirror 6 legacy modes (`simple-mode` through `core.lex.table`, `json` from `@codemirror/legacy-modes/mode/javascript`), `@codemirror/lint`, `@codemirror/autocomplete`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` rows T2, T5, T10, X17, with G1–G6 and the dictionary (Y1–Y38). Research: `.superpowers/research/2026-10-16-salt-json/salt-json.md` (§1 salt, §2 json, §3 the check), `examples/salt-1..5.puml`, `json-1..4.puml` (each drawn by the live server), `examples/plantuml-json.mjs` (the reader's port: `checkJson`, `jsonBody`), `examples/probe/*.puml` with `probe-live.txt` (53 verdicts from the live server).

## Global Constraints

- Every token is a dictionary token (G1). The dictionary test reads every fixture with every profile loaded and needs no change.
- A profile imports no core module (P2, CI's chunk guard); `src/editor/lint/json.js` is imported by the json profile only, as `lint/yaml.js` is by yaml's.
- Lines and cells follow PlantUML 1.2026.8 as the research cites it (G6). A grammar never throws on what the server refuses.
- Fixtures copied from the research examples carry no real person's name: `"Kelly"` in `json-1.puml` becomes `"Ada"`.
- Dr K; SPDX `kubed-io`; branch `salt-and-json`; one PR; commit per task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A salt `{` or `}` inside a sub-diagram in a class body** never opens or closes the class body; the class's own `}` after `}}` still does. Pinned in Task 4.
2. **A sub-diagram left open** (`{{salt` with no `}}`) ends at `end note` or `@enduml`; the next diagram reads normally. Pinned in Task 4.
3. **A salt separator cell** (`--`, `==`, `..`, `~~`, with or without text between) is a heading, never a `LinkOperator`; `a --> b` in a cell is plain. Pinned in Task 3.
4. **A JSON key after a `//` comment line, and in an object inside an array,** is a property and its value a string. Pinned in Task 1.
5. **`title` after the second JSON data line** is JSON text, not a keyword, and the check marks it. Pinned in Tasks 1 and 2.

---

Tests read tokens as `tests/js/hcl-profile.test.js` does: `tokens(type, ...lines)` builds `plantumlLanguage({ [type]: profile.mode })` with the factory called with `core` (`tests/js/helpers/core.js`), and lists `[text, node name]` for each named node between the `@start` and `@end` lines. Whitespace and plain text make no node.

### Task 1: json (T5)

**Files:** Create `src/editor/profiles/json.js`, `tests/js/json-profile.test.js`, `tests/js/fixtures/grammars/json.puml` (`json-1`, `json-2`, `json-3` from the research, one after another); modify `src/editor/profiles/index.js` (`PROFILES.json`).

**Interfaces:** Produces `export default (core) => ({ type: 'json', mode, completions: [], lints: [], values: [] })`; Task 2 fills `lints`.

The mode wraps `json` (`@codemirror/legacy-modes/mode/javascript`) and keeps its state (key or value position) by letting it read every JSON character; the wrapper renames what it returns: `string property` → `propertyName`; `string`, `number`, `atom`, `comment` kept; `operator` on a `-` before a digit → `number`; a null token on `{`/`}` → `brace`, `[`/`]` → `squareBracket`, `,`/`:` → `separator`; anything else (`variable`, `error`, …) → null. Its own state counts data lines (a line the json mode read with a token on it). While that count is at most 1, a line starting (after indentation, any case) `title`, `scale`, `skin`, `skinparam` or `hide` is read by a table of `core.lex.common()`'s rules and states, plus `skin` as a keyword with the rest of the line `commonArgs`, until that table is back in `start` at a line's start. A line starting at column 0 with `#highlight ` (one space) is a highlight line: `#highlight` `keyword`, `/` `separator`, a quoted part `string`, `*` or `**` `atom`, a part of digits `number`, any other part `propertyName` (trimmed), a final `<<name>>` the lexicon's stereotype tokens.

- [ ] **Step 1: Write the failing tests** in `tests/js/json-profile.test.js`:
  - `{"a": -1, "b": [true, null], "c": "x"}` → `['{','brace'], ['"a"','propertyName'], [':','separator'], ['-','number'], ['1','number'], [',','separator'], ['"b"','propertyName'], [':','separator'], ['[','squareBracket'], ['true','atom'], [',','separator'], ['null','atom'], [']','squareBracket'], [',','separator'], ['"c"','propertyName'], [':','separator'], ['"x"','string'], ['}','brace']`.
  - Review Focus 4: `[`, `  {"k": "v"}`, `]` → `"k"` `propertyName`, `"v"` `string`; `{`, `  // note`, `  "k": "v"`, `}` → `// note` `comment`, `"k"` `propertyName`, `"v"` `string`.
  - `title A <b>titled</b> json` then `{}` → `title` `keyword` and no `propertyName`; `scale 2` → `scale` `keyword`, `2` `number`; `skin rose` → `skin` `keyword`.
  - Review Focus 5: `{`, `"a": 1,`, `title x`, `}` → no `keyword` token.
  - `#highlight "phones" / "1" <<important>>` → `['#highlight','keyword'], ['"phones"','string'], ['/','separator'], ['"1"','string'], …` then the stereotype tokens the core grammar gives `<<important>>`; `#highlight a / 0 / * / **` → `a` `propertyName`, `0` `number`, `*` `atom`, `**` `atom`; ` #highlight "a"` (indented) → no `keyword`.
  - `"string 'single'"` value and bare `nope` → no token outside the dictionary (`nope` none).
  - the profile is `{ type: 'json', completions: [], values: [] }`.
- [ ] **Step 2:** `npx vitest run tests/js/json-profile.test.js` FAILS (no module).
- [ ] **Step 3:** Write `src/editor/profiles/json.js` and `PROFILES.json = () => import('./json.js')`.
- [ ] **Step 4:** `npx vitest run tests/js/json-profile.test.js tests/js/dictionary.test.js tests/js/profiles.test.js` passes; `profiles.test.js` gains: `needed()` asks for `json` only when a `@startjson` block is in the file.
- [ ] **Step 5:** Commit `JSON: a grammar of its own (T5)`.

### Task 2: the JSON check (T10)

**Files:** Create `src/editor/profiles/json-check.js`, `src/editor/lint/json.js`, `tests/js/json-check.test.js`, `tests/js/fixtures/json-probes/` (the 53 probe files named in `probe-live.txt`, and `probe-live.txt` itself as `verdicts.txt`); modify `src/editor/profiles/json.js` (`lints: [jsonLint(core)]`).

**Interfaces:**
- Consumes: Task 1's profile.
- Produces: `checkJson(text: string) → null | { message: string, offset: number }` and `jsonLines(lines: string[]) → string[]` (the research's `jsonBody`, renamed, each dropped line blanked) in `profiles/json-check.js`; `jsonLint(core) → (state) => Diagnostic[]` in `lint/json.js`, shaped as `yamlLint`.

`json-check.js` is the research port, made to the repo's style (JSDoc, a header naming minimal-json (MIT) and PlantUML's `//` extension). `jsonLint` runs for each json diagram's first page with a start (as `yamlLint`): its body lines through `jsonLines`, joined with `\n`, through `checkJson`; an error at `offset` is marked from that line and column to the line's end, `severity: 'error'`, with the reader's message; an offset past the last data character (`Unexpected end of input`) marks the last line that is not blank after `jsonLines`, from its last character.

- [ ] **Step 1: Write the failing tests** in `tests/js/json-check.test.js`:
  - every probe: `checkJson(jsonLines(body).join('\n') + '\n')` is null exactly when `verdicts.txt` says `ACCEPT` (body = the file's lines between `@startjson` and `@endjson`); one `it` per probe, named after it.
  - `{"a" 1}` → message `Expected ':'`, marked on line 1 from the `1`; `{"a": 1,}` → `Expected name` at the `}`; `{` then `"a": 1` → `Unexpected end of input` on the `"a": 1` line; `{"a": 1}` with a `title x` line before it, a `<style>` block inside it and a column-0 `#highlight "a"` → no diagnostic.
  - Review Focus 5: `{`, `"a": 1,`, `"b": 2,`, `title x`, `}` → one diagnostic on the `title` line.
  - a uml block holding `{` is never checked; a second `@startjson` block's error lands in that block.
- [ ] **Step 2:** `npx vitest run tests/js/json-check.test.js` FAILS.
- [ ] **Step 3:** Write both modules; add the lint to the profile.
- [ ] **Step 4:** `npx vitest run tests/js/json-check.test.js tests/js/json-profile.test.js tests/js/lint.test.js` passes.
- [ ] **Step 5:** Commit `JSON: checked as PlantUML reads it (T10)`.

### Task 3: salt (T2)

**Files:** Create `src/editor/profiles/salt.js`, `tests/js/salt-profile.test.js`, `tests/js/fixtures/grammars/salt.puml` (`salt-1`, `salt-2`, `salt-3` from the research); modify `src/editor/profiles/index.js` (`PROFILES.salt`).

**Interfaces:** Produces `export default (core) => ({ type: 'salt', mode, completions: [], lints: [], values: [] })`; Task 4 reads salt sub-diagrams with this `mode`.

A `core.lex.table`. Each opener pushes a state for its kind, and `}` pops it: tables (`{`, `{+`, `{#`, `{!`, `{-`, `{^`), a tree, a menu, and the rest (scroll, tabs). Each kind has a cell-start state and a mid-cell state (`|` and an opener go back to cell start; each line starts at cell start, `nextLine`), so the widget rules see a whole cell: a rule matches only when the cell ends right after it (`(?=[ \t]*(?:\||\}|$))`). The top state has `core.lex.common()`'s lines, the lexicon's sprite lines (T16) and `salt` alone on its line plain. Mid-cell is `\|`, `\{`, `\}` escapes, then Creole (`core.lex.creole(null)`), never reading past a `|`, `}` or `\`.

- [ ] **Step 1: Write the failing tests** in `tests/js/salt-profile.test.js` (each block opened with `{` and closed with `}` unless the test says otherwise):
  - openers: `{+` → `['{','brace'], ['+','modifier']`; `{ T+` → `['{','brace'], ['T+','modifier']`; `{T` → `T` `modifier`; `{ Text` → no `modifier`; `{SI`, `{S-`, `{S`, `{*`, `{/`, `{#`, `{!`, `{-` → the kind `modifier`; `{S+` → `S` `modifier`, `+` plain; `{^"Group box"` → `{` `brace`, `^` `modifier`, `"Group box"` `string`; `}` → `brace`.
  - widgets: `Login | "MyName   "` → `|` `separator`, `"MyName   "` `string`, `Login` plain; `[X] Remember | [ ] Not | [] No` → `['[','squareBracket'], ['X','atom'], [']','squareBracket']`, `['[ ]','squareBracket']`, `['[]','squareBracket']`; `[x] lower` → no `atom`; `(X) on | ( ) off` → `(` `paren`, `X` `atom`, `)` `paren`, `( )` `paren`; `[Cancel] | [**OK**]` → `[`/`]` `squareBracket`, `**OK**` `strong`; `[[https://x.io]]` → no `squareBracket`; `^Droplist^` → both `^` `squareBracket`.
  - Review Focus 3: `..Dotted.. | == | ~~wavy~~ | --` → four `heading`s; `a --> b` → no `LinkOperator`.
  - `. | *` → two `punctuation`; in `{T`: `++ America | "x"` → `++` `list`, `"x"` `string`; in `{*`: `File | - | Open` → `-` `heading`; `N= [North]` → `N` `attributeName`, `=` `definitionOperator`, `[` `squareBracket`.
  - `<<smile`, `..XX..`, `>>`, `<<smile>>` → `<<` `angleBracket`, `smile` `typeName`, `..XX..` `SpriteData`, `>>` `angleBracket`, then `<<`, `smile`, `>>`.
  - `a \{ escaped \| pipe \}` → three `escape`; `<&person> me` → `<&person>` `tagName`; `<color:red>x</color>` → the core grammar's Creole tokens for it in a note.
  - mid-line openers and closers: `{# a | b | *` then `c | d | e }` → `{` `brace`, `#` `modifier`, `*` `punctuation`, `}` `brace`, and the next line back in the top state.
  - top state: `title Login` → `title` `keyword`; `salt` alone → no token; `skinparam x y` → `skinparam` `keyword`.
  - an unclosed `{` then `@endsalt`, `@startuml`, `A -> B` → `->` `LinkOperator` (P5).
- [ ] **Step 2:** `npx vitest run tests/js/salt-profile.test.js` FAILS.
- [ ] **Step 3:** Write `src/editor/profiles/salt.js` and `PROFILES.salt`.
- [ ] **Step 4:** `npx vitest run tests/js/salt-profile.test.js tests/js/dictionary.test.js tests/js/profiles.test.js` passes; `needed()` asks for `salt` only with a `@startsalt` block (Task 4 adds `{{salt`).
- [ ] **Step 5:** Commit `Salt: a grammar of its own (T2)`.

### Task 4: sub-diagrams (X17)

**Files:** Create `src/editor/sub-diagrams.js`, `src/editor/completion/sub-diagrams.js`, `tests/js/sub-diagrams.test.js`, `tests/js/fixtures/grammars/sub-diagrams.puml` (`salt-4`, `salt-5`, and a class body holding `{{salt` and a legend holding `{{json`); modify `src/editor/plantuml-mode.js`, `src/editor/profiles/index.js` (`needed`), `src/editor/folding.js`, `src/editor/completion/index.js` (`sources`).

**Interfaces:**
- Consumes: Task 1's and Task 3's modes, through `plantumlLanguage(inner)`.
- Produces, in `src/editor/sub-diagrams.js`: `SUB_OPEN = /^([ \t]*)(\{\{)(\w*)[ \t]*$/`, `SUB_CLOSE = /^([ \t]*)(\}\})[ \t]*$/`, `SUB_TYPES = ['salt', 'json', 'yaml', 'wbs', 'mindmap', 'gantt', 'regex', 'ebnf', 'chronology']`, and `subDiagramsOf(text: string) → { start: number, end: number|null, type: string }[]` (1-based lines; `type` `uml` for a bare `{{`; nesting counted; one left open has `end` null).

The outer grammar opens a sub-diagram on a `SUB_OPEN` line read in `noteBody`, `legendBody`, `descBody` or `classBody` (`{{` `brace`, the type `keyword`), keeps the body's state underneath, and reads each following line with `inner[type]`, the base grammar with a state of its own for `uml`, or plain for a type with no mode loaded; `'` and `/' '/` comments and `!` lines stay PlantUML's, as in an inner block. A `SUB_OPEN` line inside counts one deeper and is the sub-diagram's own line; the `SUB_CLOSE` line at depth one ends it (`}}` `brace`), back in the body. A `@start`/`@end` line ends it, as does `end note` in a note body and `end legend` in a legend body, each then read as ever. `copyState` copies it. `needed()` adds each `SUB_OPEN` type found in a uml block. Folding folds a sub-diagram from its `{{` line to the line before `}}`. The completion source offers `SUB_TYPES` after a line's `{{` in a uml block (`validFor: /^\w*$/`); a pick inserts the type, a body line with the cursor and a `}}` line, as B8 does for a block.

- [ ] **Step 1: Write the failing tests** in `tests/js/sub-diagrams.test.js`, the language built with the salt and json profiles' modes:
  - `subDiagramsOf`: `note right`, `{{salt`, `{`, `}`, `}}`, `end note` → `[{ start: 2, end: 5, type: 'salt' }]`; `{{`, `{{json`, `}}`, `}}` → the outer `{ start: 1, end: 4, type: 'uml' }` and the inner `{ start: 2, end: 3, type: 'json' }`; `{{salt` alone → `end: null`.
  - a note: `note right`, `{{salt`, `{+`, `[OK]`, `}`, `}}`, `end note`, `A -> B` → `['{{','brace'], ['salt','keyword']`, `{` `brace`, `+` `modifier`, `[`/`]` `squareBracket`, `}` `brace`, `['}}','brace']`, `end note` `keyword`, `->` `LinkOperator`.
  - Review Focus 1: `class C {`, `{{salt`, `{`, `[OK]`, `}`, `}}`, `+ field : int`, `}`, `A -> B` → the salt `}` is `brace` inside, `+ field : int` read as a class member as today, and `->` `LinkOperator` after the class's `}`.
  - a bare `{{` in a legend: `A -> B` inside → `LinkOperator`; nesting: `{{`, `{{salt`, `}}`, `A -> B`, `}}` → `->` `LinkOperator` (still in the uml sub-diagram).
  - Review Focus 2: `note right`, `{{salt`, `{`, `end note`, `A -> B` → `end note` `keyword`, `->` `LinkOperator`; `{{salt`, `{` in a note then `@enduml`, `@startuml`, `A -> B` → `LinkOperator`.
  - `{{json` in a legend with `{"a": 1}` → `"a"` `propertyName`; with no json mode loaded → no token on that line; `{{chronology` lines → `Inactive`; `{{salt` at the top level of a uml block → not a sub-diagram (no `brace` on `{{`).
  - `needed()`: a uml block with a `{{salt` line → has `salt`; `{{json` → `json`; `{{` → nothing added.
  - folding: in `note right`, `{{salt`, `{`, `}`, `}}`, `end note`, the `{{salt` line folds from its end to the end of line 4.
  - completion: `  {{` on a note line in a uml block → options are `SUB_TYPES`; `{{sa` → `from` after `{{`; outside a uml block (`@startjson`) → null; picking `salt` gives `{{salt`, an indented empty line with the cursor, `}}`.
- [ ] **Step 2:** `npx vitest run tests/js/sub-diagrams.test.js` FAILS.
- [ ] **Step 3:** Write `src/editor/sub-diagrams.js` and the source; change the outer grammar, `needed`, folding and `sources`.
- [ ] **Step 4:** `npm test` passes (the whole suite: the outer grammar is shared).
- [ ] **Step 5:** Commit `Sub-diagrams read with their type's grammar (X17)`.

### Task 5: CHANGELOG, the spec's status and the live check

**Files:** Modify `CHANGELOG.md` (`[Unreleased]`, `### Added`: one line each for salt and JSON highlighting, the JSON check, sub-diagrams), `docs/superpowers/specs/2026-10-14-editor-design.md` (T2, T5, T10, X17 to `shipped (salt-and-json round, 2026-10-16)`; H21's "once salt has its grammar (T2)" to say it has; Known limitations: drop "salt and json blocks are highlighted as uml until T2 and T5 land" and "A JSON diagram line ending in `[` opens a Creole description body", and the "Bad JSON" item if one is there).

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build`; record the gzip size of the json and salt chunks (P6) and that the entry did not grow by more than the sub-diagram module.
- [ ] **Step 2:** Commit `Spec: salt, json and sub-diagrams shipped`.
- [ ] **Step 3:** After merge and deploy, on the selenium account's copy of UML_Fun.puml with a salt block, a json block (one bad line) and a note holding `{{salt` added to that copy only, light and dark: one screenshot each, read against T2, T5, T10 and X17, and Review Focus 1–5 by eye.
