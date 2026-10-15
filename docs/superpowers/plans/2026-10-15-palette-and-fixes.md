<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Palette and fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Style blocks and the preprocessor get colours of their own (Dr K's option B), every `@start`/`@end` is coloured, the tabs stay right after a block with arguments and cope with forty diagrams, and two completion leftovers are fixed.

**Architecture:** Colours stay in `src/editor/theme.js` as Nextcloud-variable mixes keyed by `@lezer/highlight` tags; grammars only choose token names. The style mode (`profiles/style-grammar.js`) gives selectors a token of their own; the PlantUML mode (`plantuml-mode.js`) splits `!` lines and marks `$variables` and `$fn(`/`%fn(` everywhere. The block scanner (`blocks.js`) accepts any parenthesised arguments. The tab strip (`tabs.js`) gains an overflow menu.

**Tech Stack:** CodeMirror 6 (legacy simple-mode, `@lezer/highlight`), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md` rows H1, H2, H9, H11, X7, B1, B2, C2, W4.

## Global Constraints

- Colours (H11, X7), each a mix of Nextcloud variables, never a literal (H1; `tests/js/theme.test.js` forbids hex, `rgb()`, `hsl()`, `white`, `black`):
  - moss = `color-mix(in srgb, color-mix(in srgb, var(--color-element-success) 55%, var(--color-element-warning)) 72%, var(--color-main-text))` (`#4b700c` light, `#aec455` dark)
  - slate = `color-mix(in srgb, var(--color-primary-element) 55%, var(--color-main-text))` (`#0f4866`, `#6abaef`)
  - ochre (muted) = `color-mix(in srgb, var(--color-favorite) 55%, var(--color-text-maxcontrast))` (`#8a6f30` light, `#d1bf45` dark)
  - attribute orange = `color-mix(in srgb, color-mix(in srgb, var(--color-element-warning) 75%, var(--color-element-error)) 75%, var(--color-main-text))` (`#9a4d08`, `#fabc4a`) for `tags.attributeName` and `tags.className` (tag attributes, link attributes, style `.class`/`:depth`); `tags.operator` (arrows) keeps `towardText('--color-element-warning')`
- Style block: selectors moss; property names slate; `.class`/`:depth(n)` the attribute orange (the new mix above); every value, numbers included, the string green; colours keep their swatch.
- Preprocessor: directive word bold `--color-primary-element` (as now); `$variables` slate on every line; a procedure/function name declared or called (`$ask(`) and `%builtins(` ochre; strings and numbers as elsewhere; `<…>` after an include a link.
- Tags stay maroon (H9); HTML-like tag attributes stay orange (H10).
- The editor entry imports no chunk statically. The maintainer is **Dr K**; SPDX `kubed-io`; no real names. One PR, branch `palette-and-fixes`; commit after every task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A `$` that is not a variable** — a price in a label (`note: costs $5`), `<$sprite>`, `$` inside a string — must not turn slate mid-word or break the line's other tokens. Pinned in Task 3.
2. **YAML and other nested modes** must keep their colours: changing `tags.propertyName` or adding `tags.variableName` must not recolour YAML keys or values. Pinned in Task 2.
3. **`@startuml(id=legend)` and `@startdef(id=actors)`** keep their names; `@startjcckit(300,200)` gets the type label `jcckit`. Pinned in Task 1.
4. **The overflow menu with one or two tabs** never shows; with forty it lists all forty in file order. Pinned in Task 4.
5. **A `<font:` that is closed** (`<font:Dej|aVu Sans>x`) still replaces the whole family; only an unclosed one ends at the cursor. Pinned in Task 5.

---

### Task 1: Block lines — any arguments, every type coloured (B1, H2)

**Files:** Modify `src/editor/blocks.js` (`START`, ~line 8), `src/editor/plantuml-mode.js` (the `@(?:end|start)uml` rule in `base.start`). Test: `tests/js/blocks.test.js`, `tests/js/plantuml-mode.test.js`.

- [ ] **Step 1: Failing tests:** `scan('@startjcckit(300,200)\nx\n@endjcckit\n@startuml a\n@enduml')` gives two blocks, the first `type: 'jcckit'`, name null, the second named `a` — so `label()` of the second is `a` at index 1; `@startuml(id=legend)` and `@startdef(id=actors)` keep names `legend`, `actors`. Mode: `@startsalt login`, `@endsalt`, `@startmindmap`, `@endgantt`, `@startwire x` each give a `keyword` token on the `@start…`/`@end…` word (the name after it plain); `@startuml`, `@startcreole`, `@startfiles` unchanged.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** `START = /^\s*@start(\w+)(?:\((?:id=([^)]*)|[^)]*)\)|\s+(.*?))?\s*$/` (or equivalent: `(id=x)` names, any other `(…)` names nothing); the mode's rule becomes `atLineStart(/@(?:end|start)\w+\b/.source, 'keyword')`, placed after the creole/files rules.
- [ ] **Step 4:** PASS; `npm test`; lint. **Step 5:** commit `fix(editor): every @start/@end coloured; a block with arguments keeps the tabs in step`.

### Task 2: Style blocks' own colours (H11)

**Files:** Modify `src/editor/profiles/style-grammar.js` (selector token ~line 80; numbers ~line 19), `src/editor/theme.js`. Test: `tests/js/theme.test.js`, `tests/js/style-profile.test.js`.

- [ ] **Step 1: Failing tests:** in a `<style>` block, `node`, `arrow`, `mindmapDiagram` take a token styled with moss (assert the computed spec colour string via `highlightStyle`, as theme.test.js does for maroon), `BackgroundColor` slate, `14` and `bold` the string green, `#FFF3B0` still `ColorLiteral` (swatch), `.server` and `:depth(1)` orange; HTML-like tags (`<style>`, `<b>`) still maroon; Review Focus 2: a YAML block's keys and values keep today's colours (snapshot their style classes before the change).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** the style mode emits a selector token of its own (e.g. `typeName` → `tags.typeName`, or a `tokenTable` entry) instead of `tagName`, and its numbers as the string green's token; `theme.js` gains moss, slate and the attribute orange as named mixes (next to `towardText`) — selectors moss, `tags.propertyName` slate (split it out of the blue row; keep `number` and `definition(variableName)` as they are unless the tests show they are only used by the style mode).
- [ ] **Step 4:** PASS; `npm test`; lint. **Step 5:** commit `feat(editor): style blocks in moss and slate`.

### Task 3: Preprocessor colours (X7)

**Files:** Modify `src/editor/plantuml-mode.js` (the `atLineStart(/!.*/, 'meta')` rule; a `$`/`%` rule usable on every line), `src/editor/theme.js` (`tags.variableName` slate, `tags.function(tags.variableName)` ochre). Test: `tests/js/plantuml-mode.test.js`, `tests/js/theme.test.js`.

- [ ] **Step 1: Failing tests** (`[text, token]` pairs):
  - `!$app = "Nextcloud"` → `!` meta, `$app` variable, `=` punctuation or operator, `"Nextcloud"` string.
  - `!procedure $ask($from, $to, $what)` → `!procedure` meta, `$ask` function, `(`/`,`/`)` punctuation, `$from`/`$to`/`$what` variable.
  - `  $from -> $to : $what` (a body line) → `$from` variable, `->` operator, `$to` variable, `$what` variable (in the label, still variable).
  - `!if %strlen("stdlib") > 3` → `!if` meta, `%strlen` function, `"stdlib"` string, `3` number; `!endif` meta; `$ask(nc, db, "x")` on its own line → `$ask` function.
  - `!include <C4/C4_Container>` → `!include` meta, `<C4/C4_Container>` link; `!theme sunlust` → `!theme` meta, `sunlust` plain or atom.
  - Review Focus 1: `note right of A : costs $5` → `$5` not variable; `A -> B : <$foo>` stays the sprite tag; `"a $b"` stays one string.
  - theme: variable slate, function ochre (exact mix strings).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** replace the whole-line `meta` rule with a `preprocessor` state entered at a line-start `!` (word after `!` meta, then the rules above, popping at the line's end as `tagAttrs` does); add `\$[A-Za-z_]\w*(?=\s*\()`→`function`-style token and `\$[A-Za-z_]\w*`→ variable, and `%\w+(?=\s*\()` → function, to the general rule list so body lines get them (before the catch-all word rule; not inside strings or tags). Map tokens to `tags.variableName` and `tags.function(tags.variableName)` through the mode's `tokenTable` if their names are not legacy-mapped.
- [ ] **Step 4:** PASS; `npm test`; lint. **Step 5:** commit `feat(editor): the preprocessor's variables and functions in their own colours`.

### Task 4: The tab strip with many diagrams (B2)

**Files:** Modify `src/editor/tabs.js`, `css/editor.css`. Test: `tests/js/tabs.test.js`.

- [ ] **Step 1: Failing tests:** with 40 diagrams in a strip whose `scrollWidth > clientWidth` (stub the sizes), a button `aria-label="All diagrams"` with `aria-haspopup="menu"` is shown at the strip's end; clicking it opens a `role="menu"` listing 40 `role="menuitemradio"` items in file order (label, then type), the active one `aria-checked="true"`; picking item 12 calls `onActivate(12)` and closes the menu; Escape closes it and returns focus to the button. With 2 diagrams that fit, no button (Review Focus 4). A vertical wheel event over the strip scrolls it sideways (`scrollLeft` grows) and is prevented.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** build the button and menu as plain DOM in `tabs.js` (no Vue; the module already is), a list icon drawn in CSS or inline SVG with `currentColor`; ←/→ Home/End on the menu items as the tablist does; colours only from Nextcloud variables. Overflow is re-checked on `update()` and on a `ResizeObserver` of the strip.
- [ ] **Step 4:** PASS; `npm test`; lint. **Step 5:** commit `feat(editor): an "All diagrams" menu when the tabs overflow`.

### Task 5: Two completion leftovers (W4, C2)

**Files:** Modify `src/editor/values/index.js` (`fontFamilyValue`), `src/editor/completion/values.js` (a value may carry a `close` suffix), `src/editor/completion/names.js`. Test: `tests/js/values.test.js`, `tests/js/completion.test.js`.

- [ ] **Step 1: Failing tests:** `A -> B : <font:|hello</font>` + pick `Dialog` → `A -> B : <font:Dialog>hello</font>`; `<font:De| and more` + `Dialog` → `<font:Dialog> and more`; Review Focus 5: `<font:Dej|aVu Sans>x` + `Dialog` → `<font:Dialog>x`. Names: `Hello <font color=|` (with an element `api` declared) offers no element names; `<&|`, `<color:|`, `<img src=|` likewise; names still offered after `A -> |`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** an unclosed `<font:` value spans from after `:` to the cursor (from `state.selection.main.head` when on that line) and carries `close: '>'`, which `values.js` appends to the inserted label; `names.js` returns null while the cursor is inside an open `<…` tag on its line (C2 already says "not … in a Creole tag").
- [ ] **Step 4:** PASS; `npm test`; lint. **Step 5:** spec: drop nothing (W4 already says it). Commit `fix(editor): an unclosed <font: pick closes the tag; no names inside a tag`.

### Task 6: Ship

- [ ] Specs: H2, H11, X7, B1, B2, W4 statuses → `shipped (#PR)`; CHANGELOG `[Unreleased]`: Changed (style blocks moss/slate; preprocessor variables and functions; every `@start`/`@end` coloured), Added (All diagrams menu), Fixed (tabs after a block with arguments; unclosed `<font:` pick; names inside tags).
- [ ] Update the palette preview artifact only if a colour changed from option B.
- [ ] All checks; PR; bot threads; merge on green; deploy with `dist/chunks`; live check in light and dark on the selenium copy of UML_Fun (style block, `!procedure` lines, `@startsalt`, the plan/icons/wiring tabs, the All diagrams menu).
