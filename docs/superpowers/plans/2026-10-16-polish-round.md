<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Polish round — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close the gaps the salt-and-json round left and the live check found: a member's visibility with a space, a string after a link, two salt cells, sub-diagram lines read as the server reads them, and `{{json` checked.

**Architecture:** small changes to the lexicon's shared rules (`src/editor/lexicon/rules.js`), the salt profile, the outer grammar's sub-diagram reader (`src/editor/plantuml-mode.js`) and the JSON lint, which gets the sub-diagram scan through `core`.

**Tech Stack:** CodeMirror 6 stream modes through `core.lex.table`, `@codemirror/lint`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` rows H17, H23, X17, T10, T2 (each marked "polish round").

## Global Constraints

- Every token is a dictionary token (G1); a profile imports no core module (P2).
- What the server does is the authority, PlantUML 1.2026.8 at `http://plantuml.flow.svc/svg`; check a claim there before building on it.
- Dr K; SPDX `kubed-io`; branch `polish-round`; commit per task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A de-indented sub-diagram line** never changes what the body around it reads: the `{{`/`}}` lines, `end note`, and the lines after `}}` keep their tokens. Pinned in Task 2.
2. **The class/description recovery** fires only on a closer indented less than the `{{` line; salt's own `}` lines inside, indented as usual, never end it. Pinned in Task 2.
3. **A string after a link** never swallows the label: `A --> "x" B : "y"` keeps `"y"` in the label. Pinned in Task 1.
4. **A `{{json` error** is marked on the right document line and column with the indentation added back. Pinned in Task 3.
5. **`+ render()`** in a class body is a modifier, and `+` in a note or a link label is not. Pinned in Task 1.

---

### Task 1: visibility with a space, a string after a link, two salt cells (H17, H23, T2)

**Files:** Modify `src/editor/lexicon/rules.js` (the class members' visibility rule in `classStates`; `toColon`), `src/editor/profiles/salt.js`; tests in `tests/js/plantuml-mode.test.js` and `tests/js/salt-profile.test.js`.

- [ ] **Step 1: Failing tests.**
  - `class C {` / `  + render() : void` / `}` → `['+','modifier']`, `render` `FunctionName`; `  - x : int` → `-` `modifier`; `  # y` → `#` `modifier`; `  ~ z` → `~` `modifier`. The no-space forms keep passing.
  - Review Focus 5: `note left : + x` and `A -> B : + x` → no `modifier`.
  - H23: `A *-- "many" B` → `"many"` `string`; `A "1" -- "2" B` → both `string`; Review Focus 3: `A --> "x" B : "y"` → `"x"` `string`, then `"y"` in the label as the label reads it today.
  - T2: `[a] ]` → one button: `[` and the last `]` `squareBracket`, no `squareBracket` on the first `]`; `{T{+ a }` → `T` `modifier`, then `{` `brace`, `+` `modifier`, `}` `brace`.
- [ ] **Step 2:** the new tests FAIL.
- [ ] **Step 3:** the fixes.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `Visibility with a space, a string after a link, two salt cells`.

### Task 2: sub-diagram lines as the server reads them (X17)

**Files:** Modify `src/editor/plantuml-mode.js`; tests in `tests/js/sub-diagrams.test.js`.

The sub-diagram reader hands its mode each line with the leading whitespace cut off (as `innerToken` does for a comment closed mid-line), so a mode's line-start rules see column 0. A `<style>` line inside a non-uml sub-diagram opens a style block read as in an inner block (`styleStart`/`styleBody`), ending at `</style>`, the sub-diagram's `}}` or any of its exits. In `classBody` and `descBody`, an open sub-diagram also ends at a line that is `}` (class) or starts `]` (description) indented less than its `{{` line; that line is then read as ever.

- [ ] **Step 1: Failing tests.**
  - `class C {` / `  {{json` / `  #highlight "a"` / `  {"a": 1}` / `  }}` / `}` → `#highlight` `keyword`, `"a"` `string` on the highlight line.
  - Salt in a note, indented four spaces, tree `++ a` → `++` `list`.
  - `note right` / `{{salt` / `<style>` / `saltDiagram { BackGroundColor red }` / `</style>` / `{` / `[OK]` / `}` / `}}` / `end note` → the style lines carry the style grammar's tokens (as the same lines in a `@startsalt` block do), and `[OK]` keeps `squareBracket`.
  - Review Focus 2: `class C {` / `  {{salt` / `  {` / `    [OK]` / `  }` / `}` / `class D {` / `}` / `A -> B` → the indented `  }` is salt's `brace`; the column-0 `}` ends the sub-diagram and the class; `class` `keyword` on `class D`; `->` `LinkOperator`. The same with `rectangle R [` … `]`.
  - Review Focus 1: every existing sub-diagram test still passes.
- [ ] **Step 2:** the new tests FAIL.
- [ ] **Step 3:** the change.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `Sub-diagram lines as the server reads them`.

### Task 3: `{{json` checked (T10)

**Files:** Modify `src/editor/profiles/index.js` (`core` gains `subDiagrams: subDiagramsOf`), `src/editor/lint/json.js`; tests in `tests/js/json-check.test.js`.

**Interfaces:** `core.subDiagrams(text) → { start, end, type }[]` (Task 4 of the salt-and-json round's `subDiagramsOf`).

`jsonLint` also checks each `json` sub-diagram with an `end` that lies in a uml diagram (`core.scan`), its lines between the `{{json` and `}}` lines with their leading whitespace removed, then `jsonLines`, then `checkJson`; a mark's column adds the line's removed indentation back.

- [ ] **Step 1: Failing tests.** `note right` / `  {{json` / `  {"a" 1}` / `  }}` / `end note` in a uml block → one diagnostic `Expected ':'` from the `1`, column counted with the two spaces; a valid `{{json` → none; an indented `#highlight "a"` line inside → none; a `{{json` left open (no `}}`) → not checked; `@startjson` blocks unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** the change. **Step 4:** `npm test` passes, and `npm run build` with CI's chunk guard (`! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`).
- [ ] **Step 5:** Commit `JSON sub-diagrams checked too`.

### Task 4: CHANGELOG, the spec's status and the live check

**Files:** `CHANGELOG.md` (`### Fixed`: one line each for visibility with a space, the string after a link, sub-diagram lines; `### Added`: `{{json` checked), the spec (the five rows to `shipped (polish round, 2026-10-16)`).

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build`, the guard. Commit `Spec: the polish round shipped`.
- [ ] **Step 2:** After merge and deploy: on the selenium copy of UML_Fun.puml, the `subs` block's `+ render()`, an indented `#highlight` in its `{{json` legend, a broken `{{json`, and a `*-- "many"` link, light and dark.
