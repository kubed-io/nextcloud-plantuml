<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Grammars and colour names — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pencil after each colour swatch picks a named colour by name, and board, git, gantt/project, AsciiMath, LaTeX and sprite blocks get grammars of their own in Dr K's palette.

**Architecture:** W5 is one more entry in the value registry (`src/editor/values/`), so the existing W1 pencil and `completion/values.js` list serve it. Each grammar is a profile (`src/editor/profiles/<type>.js`, a factory `(core) => { type, mode, completions, lints, values }`, loaded as a chunk only when a file holds that type — P1–P5); `project` loads the gantt profile under its own type. Inline `<math>…</math>` and `<latex>…</latex>` hand their middle to the math/latex profile's mode the way a one-line `<style>…</style>` hands its middle to the style mode, and `needed()` loads those profiles when a file holds the tags. AsciiMath's names come from PlantUML's `ASCIIMathTeXImg.java` at v1.2026.8 through `scripts/vocabulary.mjs`.

**Tech Stack:** CodeMirror 6 legacy stream modes, `@lezer/highlight`, vitest + jsdom, Node 24 (generator).

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` rows T4, T12–T16, W5 (and H1, H8, H10, H11, X7, X14, C6, W1, P1–P6). Research behind them (syntax, every construct, live-verified examples, traps): `.superpowers/sdd/2026-10-15-grammars-and-colour-names/research-board-git-project.md`, `research-math-sprites.md`, `research-named-colour-picker.md`.

## Global Constraints

- Token roles map to the palette already in `src/editor/theme.js`; no new colour, no literal (H1): keyword (bold `--color-info-text`), operator (amber `towardText(warning)`), punctuation (`--color-text-maxcontrast`), string (green), number (`--color-info-text`), comment (grey italic), heading, link, `ColorLiteral` (green + swatch), tag/attribute (H9/H10), moss `MOSS` (selector role: `[Task]`, git refs, LaTeX environments), slate `variable` tag (`{Resource}`, AsciiMath symbols, sprite `$name`), muted ochre function tag (AsciiMath functions, LaTeX `\commands`). Sprite pixel data and git messages use the existing grey roles named in T13/T16.
- A grammar never crashes on what PlantUML rejects; it colours what it can and leaves the rest plain.
- Profiles import no core module (P2; the CI chunk guard); the editor entry imports no chunk statically. Each PR states the gzip size of the entry and of each new chunk (P6).
- PlantUML facts come from v1.2026.8; AsciiMath names are generated, never hand-copied.
- The maintainer is **Dr K**; SPDX `kubed-io`; no real names. One PR, branch `grammars-and-colour-names` (spec commit `6af653e` on it); commit after every task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A file with no such block loads no new chunk** (a uml-only file asks for no math, latex, gantt, board, git or sprites profile). Pinned in each profile task via `needed()`.
2. **`<math>` / `<latex>` inline in a uml note** before the profile has loaded leaves the rest of the line and the next lines highlighted as today. Pinned in Tasks 5 and 6.
3. **A colour pick in a style block** writes a bare name; after an element or in `<color:#…>` it keeps the `#`; a gradient's second part (`#Red/Yellow`) is never rewritten into a broken gradient. Pinned in Task 1.
4. **A gantt `[Task]` holding `'`** (`[End's committee]`) and `'s end` after it are not comments. Pinned in Task 4.
5. **A sprite's `{` rows in a uml block** (not `@startsprites`) are data-grey to the closing `}`, and the line after `}` reads as uml again. Pinned in Task 3.

---

### Task 1: Named colours by name (W5)

**Files:** Modify `src/editor/values/index.js` (a colour entry), `src/editor/completion/values.js` (the colour list: current first, swatches), `src/editor/swatches.js` only if the pencil must sit after the swatch (it does by order: swatch before the value, pencil after it). Test: `tests/js/values.test.js`, `tests/js/completion.test.js`.

- [ ] **Step 1: Failing tests:** on the cursor's line, `node a #gold`, `skinparam backgroundColor #FFF3B0`, `<color:red>x`, `<font color=#336699>`, a style block's `BackgroundColor gold` each yield a `list` value over the colour (the `#` outside the range) whose options are the server's names (stub `serverColors()`), so W1 draws a pencil after it; the explicit list puts the current name first, or the name whose hex equals a hex value (`#FFD700` → `gold`); each option shows its swatch (reuse `swatchOption` from `completion/colors.js`). Picks: `node a #|FFF3B0` + `gold` → `#gold`; in a style block `BackgroundColor #FFF3B0` + `gold` → `BackgroundColor gold`; `<font color=#336699>` + `navy` → `<font color=navy>` (after `color=` the name is bare); Review Focus 3: `#Red/Yellow` gives two values, each picked on its own, the second written without `#`. With `serverColors()` failing, no pencil and no error.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** one `ValueEntry` that finds colour values with the same rules the mode uses for `ColorLiteral` (reuse the colour patterns `completion/colors.js` and C6 already have; do not write a third set), `kind: 'list'`, `options: () => serverColors() names`, and a `prefix` rule: in a style block or after `color=` the name is written bare, elsewhere `#` stays. `values.js` orders the current name first for colour values.
- [ ] **Step 4:** PASS; `npm test`; lint. **Step 5:** commit `feat(editor): pick a named colour by name`.

### Task 2: board and git (T12, T13)

**Files:** Create `src/editor/profiles/board.js`, `src/editor/profiles/git.js`; modify `src/editor/profiles/index.js` (`PROFILES`). Test: `tests/js/profiles.test.js` and a new `tests/js/board-git-profile.test.js`.

- [ ] **Step 1: Failing tests** (token pairs through `plantumlLanguage({ board: …mode, git: …mode })`, as yaml-profile.test.js does):
  - board: `Editor` → heading (bold); `+Completion` → `+` operator, text plain/Creole; `++Directives` → `++` operator; `  + x` (indented) → all one activity heading; `' note` → comment; `title Stories` → keyword.
  - git: `* a1b2c3 Merge feature` → `*` operator, `a1b2c3` number, `Merge feature` comment; `* d4e5 (HEAD -> main, tag: v1) Add` → `(HEAD -> main, tag: v1)` moss role; `|\` and `| * d4e5f6 Add stdlib` → `|`, `\`, `*` operator; `|/` operator.
  - `needed()` adds `board`/`git` only for files with those blocks (Review Focus 1).
- [ ] **Step 2:** run → FAIL. **Step 3:** two small stream modes per the research file; register in `PROFILES`. **Step 4:** PASS; `npm test`; lint; `npm run build` (two new chunks, sizes noted). **Step 5:** commit `feat(editor): board and git grammars`.

### Task 3: sprites (T16)

**Files:** Create `src/editor/profiles/sprites.js`; modify `src/editor/profiles/index.js`, `src/editor/plantuml-mode.js` (a `sprite … {` state in uml so pixel rows are data to `}`). Test: a new `tests/js/sprites-profile.test.js`, `tests/js/plantuml-mode.test.js`.

- [ ] **Step 1: Failing tests:** in `@startsprites`: `sprite $bar [8x4/16] {` → `sprite` keyword, `$bar` slate variable, `8x4` numbers, `[`/`/`/`]` punctuation, `16` number, `{` punctuation; the rows `FFFFFFFF` data grey; `}` punctuation; `sprite $c [16x16/16z] xTL…` → `z` keyword-ish marker, payload data grey; `sprite dot <svg viewBox="0 0 10 10"><circle r="4"/></svg>` → H10 tag/attribute/string parts; `listsprites` keyword. In a uml block (Review Focus 5): `sprite $bar [8x4/16] {` … rows … `}` then `A -> B` — the rows grey, `A -> B` as today.
- [ ] **Step 2:** FAIL. **Step 3:** the profile's mode for `@startsprites`; the shared row rules exported from a small module both use, or duplicated minimally with a comment if the profile/core boundary forbids sharing (profiles import no core module). **Step 4:** PASS; `npm test`; lint; build. **Step 5:** commit `feat(editor): sprite blocks and sprite rows`.

### Task 4: gantt and project (T4)

**Files:** Create `src/editor/profiles/gantt.js`; modify `src/editor/profiles/index.js` (`gantt` and `project`, the latter loading the same module under `type: 'project'`). Test: a new `tests/js/gantt-profile.test.js`.

- [ ] **Step 1: Failing tests** (both `@startgantt` and `@startproject`): `Project starts 2026-10-13` → `Project starts` keyword, date number; `[Build] lasts 3 days` → `[Build]` moss, `lasts` keyword, `3 days` number; `[Build] starts at [Spec]'s end` → `starts at` keyword, `[Spec]` moss, `'s end` keyword; `[End's committee] requires 2 days` (Review Focus 4) → the bracket a whole moss name, no comment; `{Alice:50%} is off on 2026-10-20` → `{Alice:50%}` slate; `[A] is colored in Lavender/LightBlue` → colours `ColorLiteral`; `-- Phase 2 --` heading; `[A] -> [B]` → `->` operator; `printscale weekly` keyword; `' note` comment; `!$start = "2026-10-13"` and `Project starts $start` as X7 (meta, variable).
- [ ] **Step 2:** FAIL. **Step 3:** the mode per the research file's construct list; include the preprocessor and Creole handling the uml mode already offers where the research shows gantt reads them (notes, legends). **Step 4:** PASS; `npm test`; lint; build. **Step 5:** commit `feat(editor): gantt and project grammar`.

### Task 5: AsciiMath (T14)

**Files:** Modify `scripts/vocabulary.mjs` (an `asciimath` artifact from `src/main/java/net/sourceforge/plantuml/math/ASCIIMathTeXImg.java` at v1.2026.8: function, symbol, operator/relation/arrow lists); create `src/editor/data/asciimath.json`, `src/editor/profiles/math.js`; modify `src/editor/profiles/index.js` (`math`, and `needed()` adds it when a line holds `<math>`), `src/editor/plantuml-mode.js` (inline `<math>…</math>` middle handed to `inner.math` when loaded, as `styleMiddle` does). Test: `tests/js/vocabulary.test.js`, a new `tests/js/math-profile.test.js`, `tests/js/plantuml-mode.test.js`.

- [ ] **Step 1: Failing tests:** generator: from a fixture of the Java symbol table it yields the lists (a few named entries each), and the committed JSON has `"plantuml": "1.2026.8"`. Mode in `@startmath`: `f(t)=(a_0)/2 + sum_(n=1)^ooa_ncos((npit)/L)` → `f` plain, `(` punctuation, `=` operator, `_` operator, `/` operator, `sum` function, `oo` symbol (slate), `cos` function, numbers numbers; `sinx` → `sin` function + `x` plain (longest match); `"text"` string; `color red` → keyword + value; `(: a :)` brackets grey. Inline: `note: area <math>pi r^2</math>` → `<math>` tag, `pi` slate, `^` operator, `</math>` tag; Review Focus 2: the same line before the profile loads keeps `<math>`/`</math>` tags and the next line unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** run the generator (network) and commit the JSON; the mode reads it (static import inside the profile chunk, never the entry). **Step 4:** PASS; `npm test`; lint; build (entry unchanged by the JSON). **Step 5:** commit `feat(editor): AsciiMath grammar`.

### Task 6: LaTeX (T15)

**Files:** Create `src/editor/profiles/latex.js`; modify `src/editor/profiles/index.js` (`latex`; `needed()` when a line holds `<latex>`), `src/editor/plantuml-mode.js` (inline `<latex>…</latex>` and a `<latex>` … `</latex>` block handed to `inner.latex`). Test: a new `tests/js/latex-profile.test.js`, `tests/js/plantuml-mode.test.js`.

- [ ] **Step 1: Failing tests:** `\sum_{i=0}^{n-1} i = \frac{n(n-1)}{2}` → `\sum`, `\frac` function, `_`/`^` operator, `{`/`}` punctuation, numbers numbers, `=` operator; `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` → `\begin`/`\end` function, `pmatrix` moss, `&` and `\\` operator; `% note` comment; inline `<latex>\alpha^2</latex>` in a note; a `<latex>` line … `</latex>` line block; Review Focus 2 as Task 5.
- [ ] **Step 2:** FAIL. **Step 3:** the mode (no name list: any `\name` is a command). **Step 4:** PASS; `npm test`; lint; build. **Step 5:** commit `feat(editor): LaTeX grammar`.

### Task 7: Ship

- [ ] Specs: T4, T12–T16, W5 → `shipped (#PR)`; P6 sizes in the PR; CHANGELOG `[Unreleased]` Added (named colours by name; grammars for board, git, gantt/project, AsciiMath, LaTeX, sprites).
- [ ] All checks; PR; bot threads; merge on green; deploy with `dist/chunks`; live check in light and dark on the selenium copy of UML_Fun (each block type, the colour pencil on `#4879a8` and a style `BackgroundColor`).
- [ ] Penpot boards stay blocked until the plugin is on "NXT PlantUML".
