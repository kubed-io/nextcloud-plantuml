<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Styling dictionary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every grammar emits one dictionary of categories built from one shared lexicon, a diagram's name is underlined and read as PlantUML reads it, paths are a component, uml lines gain stereotypes, numbers, declarations, calls, class bodies, activity boxes and operators by kind, the types the server cannot draw turn grey, and the Creole colour-tag bug and the icon/emoji pencil land.

**Architecture:** The shared grammar pieces move out of `src/editor/plantuml-mode.js` into a core folder `src/editor/lexicon/` (tags and token table, rule components, a `table()` wrapper that adds line-end state changes to `simpleMode`, a `match()` helper and a Creole `textMode()` for hand-written profiles). The core grammar is assembled from it, and profiles receive it as `core.lex` (a profile still imports no core module, P2). `src/editor/theme.js` gives each dictionary category its look. The twelve new grammars are the next plan (`2026-10-15-twelve-grammars.md`), built on this one.

**Tech Stack:** CodeMirror 6 (`StreamLanguage`, legacy `simpleMode`), `@lezer/highlight` 1.2.5 tags, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md`: the Styling dictionary (Y1–Y38, G1–G6), H12–H22, C10, T26, W6, W7, the name and include fixes in B1, R2 and R8, and the rows they amend (H8, H10, X7, X19, T1, T4, T12, T16, P2). Research (git-ignored, in this repo): `.superpowers/research/2026-10-15-dictionary/` (`taxonomy.md` for tags and the theme evidence, `stereotypes.md` for H13, `patterns.md` for the shared rules and where each must not apply, `syntax-a.md`/`syntax-b.md` per type, `examples/*.puml`, each drawn by the live server).

## Global Constraints

- No new colour and no literal (H1); every look is a palette constant already in `theme.js` (`MOSS`, `SLATE`, `ATTRIBUTE`, `OCHRE`, `towardText(...)`, `--color-info-text`, `--color-text-maxcontrast`). Weight and decoration are the only additions.
- A grammar emits only dictionary tokens (G1): `keyword`, `meta`, `modifier`, `typeName`, `VariableName`, `propertyName`, `attributeName`, `annotation`, `FunctionName`, `tagName`, `labelName`, `DiagramName`, `heading`, `string`, `number`, `Date`, `ColorLiteral`, `atom`, `escape`, `link`, `url`, `LinkOperator`, `arithmeticOperator`, `compareOperator`, `logicOperator`, `definitionOperator`, `Quantifier`, `list`, `operator`, `paren`, `squareBracket`, `brace`, `angleBracket`, `bracket`, `separator`, `punctuation`, `comment`, `Inactive`, `strong`, `emphasis`, `monospace`, `underline`, `SpriteData`, `StyleNumber` (the style profile's own number, a string to the theme), and space-joined pairs of a text style with a base (`strong labelName`), and `DiagramName url`. A node's name is its token with spaces as `_`.
- `ColorLiteral` stays the node name the swatches (`swatches.js`) and the pencil (`values/index.js`) look for; `StyleNumber` stays the style profile's.
- Profiles import no core module (P2, CI's chunk guard); the editor entry imports no chunk statically. The PR states the gzip size of the entry and of each chunk (P6); the entry may grow by the lexicon's new rules only (moved code is not growth).
- PlantUML facts are 1.2026.8's (G6).
- The maintainer is **Dr K**; SPDX `kubed-io`; no real names. One PR, branch `styling-dictionary` (spec commit `40f9176` on it); commit after every task; trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`<<` that starts an arrow** (`A <<-- B`, `A <<.. B`, `<<==`) stays a link and never opens a stereotype; `<<x>>` inside a label or a note's text stays text. Pinned in Task 8.
2. **A `!` line or a `'` line inside a class body or a note** leaves the body's state intact on the next line (`enum Kind {` / `!foreach …` / `$k` / `!endfor` / `}`). Pinned in Task 10.
3. **An unclosed `(` after a function name** (`Foo(a,` at a line's end) ends with its line; the next line reads as uml. Pinned in Task 9.
4. **`:Dr K: as drk`** (an actor's shorthand) is not an activity box, while `:Step 1: open;` is. Pinned in Task 11.
5. **A digit inside a name** (`node1`, `Q4`, `$v2`, `#ff0000`, `2x_ARM`) is never a number. Pinned in Task 9.

---

### Task 1: The lexicon, moved out of the core grammar

**Files:**
- Create: `src/editor/lexicon/tags.js`, `src/editor/lexicon/rules.js`, `src/editor/lexicon/table.js`, `src/editor/lexicon/index.js`
- Modify: `src/editor/plantuml-mode.js` (imports from the lexicon; re-exports `underline`, `spriteData`, `variable` for existing importers), `src/editor/profiles/index.js` (`core` gains `lex`; `export const core`)
- Create: `tests/js/helpers/core.js` (`export { core } from '../../../src/editor/profiles/index.js'`), `tests/js/lexicon.test.js`
- Modify: every `tests/js/*-profile.test.js` that calls a factory with `{ scan }` to call it with `core`

**Interfaces:**
- Produces, `lexicon/tags.js`: `underline`, `spriteData`, `variable` (unchanged), and new `diagramName = Tag.define(tags.name)`, `date = Tag.define(tags.number)`, `linkOperator = Tag.define(tags.operator)`, `quantifier = Tag.define(tags.operator)`, `inactive = Tag.define(tags.comment)`; `tokenTable = { SpriteData, ColorLiteral, StyleNumber, VariableName, FunctionName, underline, DiagramName, Date, LinkOperator, Quantifier, Inactive }`.
- Produces, `lexicon/rules.js`: the arrays and builders now in `plantuml-mode.js`, moved without change: `patterns` (`{ hexDigits, colourName, colourPart, notStylePart }` as regex sources), `arrow`, `colours`, `names`, `creole(base)`, `attributes(end)`, `lines(code)`, `codeLines(closer, back)`, `body(key, closer, token = 'keyword')`, `head`, `toColon(next)`, `atLineStart(pattern, token, extra)`, and `spriteStates` (`{ spriteHead, spriteRows, spriteSvg }`).
- Produces, `lexicon/table.js`: `table(states, { nextLine = {}, lineStates = [] }) => StreamMode`: `simpleMode(states)` whose token, at the start of a line, first pops every state in `lineStates` off the stack, then maps a state in `nextLine` to its successor. The core's `nextLine` and `tagStates` logic moves here; `plantumlLanguage` uses `base = table(...)`.
- Produces, `lexicon/index.js`: `lex = { simpleMode, table, match, textMode, ...rules }` where `match(stream, rules) => string | null` tries each rule whose `token` is a string (a rule with group tokens is skipped) at the stream's position and returns the first match's token, and `textMode(base) => StreamMode` reads a line as Creole with `base` (`table({ start: creole(base), tagAttrs, tagBraces, math: [], latex: [] }, { lineStates: ['tagAttrs', 'tagBraces'] })`; an inline `<math>` in a profile's text is left plain).
- Produces, `profiles/index.js`: `export const core = { scan, t: translate, lex }`.

- [ ] **Step 1: Failing tests** in `tests/js/lexicon.test.js`: `lex.match(new StringStream('#red x', 4, 2), lex.colours)` returns `'ColorLiteral'` and leaves `pos` at 4; on `'plain'` it returns `null` and leaves `pos` at 0; `table({ start: [{ regex: /a/, token: 'keyword', push: 'inner' }, { regex: /./, token: null }], inner: [{ regex: /./, token: 'string' }] }, { lineStates: ['inner'] })` reads `a b` / `c` as `keyword`, `string`, `string` then plain `c` (the pushed state ended with its line); `textMode('labelName')` reads `**b** x` as `strong labelName`, `labelName`.
- [ ] **Step 2:** `npx vitest run tests/js/lexicon.test.js`: FAIL (no module).
- [ ] **Step 3:** Move the code; `plantuml-mode.js` builds `base` with `table(states, { nextLine, lineStates: ['tagAttrs', 'tagBraces'] })` and keeps `plantumlLanguage`, the style, math and latex regions and `inStyleBody`. No token changes.
- [ ] **Step 4:** `npm test`: every existing test passes unchanged (only the factory calls changed to `core`); `npm run lint` clean; `npm run build` passes CI's chunk guard.
- [ ] **Step 5:** Commit `Lexicon: the core grammar's shared rules in one module, handed to profiles`.

### Task 2: The dictionary, its looks and its test (G1)

**Files:**
- Create: `src/editor/lexicon/dictionary.js`, `tests/js/dictionary.test.js`, `tests/js/fixtures/grammars/` (one `.puml` per type that has a grammar today: `uml.puml` from `.superpowers/research/2026-10-15-dictionary/` and the UML_Fun stress blocks, plus `yaml`, `board`, `git`, `gantt`, `project`, `math`, `latex`, `sprites`, `style`, `creole`, `files`; each checked to draw on the live server before it is added)
- Modify: `src/editor/theme.js`, `tests/js/theme.test.js`

**Interfaces:**
- Produces: `DICTIONARY: { id: string, tokens: string[], look: string }[]`, Y1–Y38 as the spec's table, `look` naming the theme rule (`'keyword'`, `'moss'`, `'amber bold'`, …); `DICTIONARY_TOKENS: Set<string>`, the flat token set plus the text-style pairs of the Global Constraints.

- [ ] **Step 1: Failing tests.** `dictionary.test.js`: for every fixture, with every profile loaded (`plantumlLanguage` with all profile modes, factories called with `core`), every node name (spaces restored from `_`) is in `DICTIONARY_TOKENS`, ignoring the YAML mode's own tokens inside a yaml block (`atom`, `def`, `meta`, `string`, `number`, `comment`, `keyword`, `variable-2`, `operator`, `punctuation` as YAML emits them). `theme.test.js`, one assertion per new look: `annotation` → color `ATTRIBUTE`, `fontStyle: 'normal'`, `fontWeight: 'normal'`; `list` → amber (`towardText('--color-element-warning')`); `bracket` (and so `paren`, `squareBracket`, `brace`, `angleBracket`) → `--color-text-maxcontrast`, bold; `definitionOperator` → `--color-text-maxcontrast`; `logicOperator` → amber, bold; `escape` → `OCHRE`; `diagramName` → `textDecoration: 'underline'` and no colour; `url` → `towardText('--color-primary-element')`, no decoration; `inactive` → `--color-text-maxcontrast`, `fontStyle: 'normal'`; `date`, `linkOperator`, `quantifier`, `arithmeticOperator`, `compareOperator`, `separator`, `modifier` take their parent's rule (no rule of their own). The literal check (H1) covers the new rules.
- [ ] **Step 2:** `npx vitest run tests/js/dictionary.test.js tests/js/theme.test.js`: FAIL.
- [ ] **Step 3:** Add the rules to `highlightStyle` (each child rule restates what it keeps of its parent: Lezer does not merge); write `dictionary.js`; add the fixtures.
- [ ] **Step 4:** Both test files pass; `npm test` green.
- [ ] **Step 5:** Commit `Dictionary: Y1-Y38 as code, a look per category, every grammar held to it`.

### Task 3: The core grammar speaks the dictionary

**Files:** Modify `src/editor/lexicon/rules.js`, `src/editor/plantuml-mode.js`; test `tests/js/plantuml-mode.test.js` (and the expectations in `completion.test.js`/`values.test.js` that name these nodes, if any).

**Interfaces:** Consumes Task 1's rules. Produces the new token of each construct below; later tasks rely on `LinkOperator` for links and the bracket tokens.

- [ ] **Step 1: Failing tests** (`tokens(...)` as in the file):
  - `A -> B`: `['->', 'LinkOperator']`; `A -[#red,dashed]-> B`: the strokes and brackets `LinkOperator`, `#red` `ColorLiteral`, `dashed` `attributeName`.
  - `A : <size:12>x</size>`: `<size` `tagName`, `:` `separator`, `12` `string`, `>` `tagName` (H10's value stays a string).
  - `A : <&star{scale=2}>`: `{` `brace`, `scale` `attributeName`, `=` `definitionOperator`, `2` `string`, `}` `brace`, `>` `tagName`; `<font size=12 color=red>`: `=` `definitionOperator` both times.
  - In a note body: `* item` → `['*', 'list']`; `## two` → `['##', 'list']`; `|_ leaf` → `['|_', 'list']`; `| a | b |` → `|` `separator`.
  - `!if $a == 1 && $b != 2`: `==` `compareOperator`, `&&` `logicOperator`, `!=` `compareOperator`; `!$x = $a + 1`: `=` `definitionOperator`, `+` `arithmeticOperator`, `1` `number`; `!$y ?= 2`: `?=` `definitionOperator`; `!$z = $f(1, 2)`: `(` `paren`, `,` `separator`, `)` `paren`.
  - `sprite $s [16x16/16] {`: `[` `squareBracket`, `16` `number`, `x` `separator`, `/` `separator`, `]` `squareBracket`, `{` `brace`; its closing `}` line `brace`.
- [ ] **Step 2:** `npx vitest run tests/js/plantuml-mode.test.js`: those FAIL.
- [ ] **Step 3:** Re-token the rules: `arrow`, `styledOpen`, `styledClose` → `LinkOperator`; tag-part `:` and `,` → `separator`, `{`/`}` → `brace`, `=` (in `attributes()` and the style import line) → `definitionOperator`; Creole list and tree markers → `list`; table bars → `separator`; the preprocessor state split per H19 (`[+\-*/]` arithmetic, `==|!=|<=|>=|<|>` compare, `&&|\|\|` logic, `\?=|=` assignment, `(`/`)` `paren`, `,` `separator`); sprite head brackets and separators as above.
- [ ] **Step 4:** `npm test` green, the dictionary test included.
- [ ] **Step 5:** Commit `Core grammar: links, tag parts, list markers and preprocessor operators by category`.

### Task 4: The profiles speak the dictionary

**Files:** Modify `src/editor/profiles/board.js`, `git.js`, `gantt.js`, `math.js`, `latex.js`, `sprites.js`, `style-grammar.js`; tests `board-git-profile.test.js`, `gantt-profile.test.js`, `math-profile.test.js`, `latex-profile.test.js`, `sprites-profile.test.js`, `style-profile.test.js`.

- [ ] **Step 1: Failing tests:** board `++ card` → `['++', 'list']`; git `* a1b2 (main)`: `*` `LinkOperator`, `a1b2` `number`, `(` `paren`, `main` `typeName`, `)` `paren`; gantt `[Task] lasts 3 days`: `[` `squareBracket`, `Task` `typeName`, `]` `squareBracket`; `{Alice:50%}`: `{` `brace`, `Alice:50%` `propertyName`, `}` `brace`; `[A] -> [B]`: `->` `LinkOperator`; `is colored in Red/Blue`: `/` `separator`; `<<x>>` → `<<` `angleBracket`, `x` `annotation`, `>>` `angleBracket`; AsciiMath `a and b` → `and` `logicOperator`, `x <= y` → `<=` `compareOperator`, `a + b` → `+` `arithmeticOperator`, `(` `paren`, `[` `squareBracket`, `{` `brace`, `,` `separator`; LaTeX `{`, `[`, `(` the bracket tokens, `$` `punctuation`; sprites as Task 3's sprite head; style blocks `node {` → `{` `brace`, `;` `separator`, `}` `brace`, a `LineStyle 8-3` dash `-` `separator`.
- [ ] **Step 2:** those FAIL.
- [ ] **Step 3:** Re-token. AsciiMath's split is two sets in `math.js`, applied to the `operators` role: `LOGIC = ['and', 'or', 'not', 'if', 'iff']`, `COMPARE = ['=', '!=', '<', '>', '<=', '>=', 'lt', 'gt', 'le', 'ge', 'lt=', 'gt=', '-<', '>-', '-<=', '>-=', 'in', '!in', 'sub', 'sup', 'sube', 'supe', '-=', '~=', '~~', 'prop']`; every other operator stays `operator` (Y29) or `arithmeticOperator` for `+`, `-`, `*`, `**`, `xx`, `-:`, `/`.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Profiles: board, git, gantt, math, LaTeX, sprites and style by category`.

### Task 5: A diagram's name underlined (H12)

**Files:** Modify `src/editor/lexicon/rules.js` (a `startLine` reader), `src/editor/plantuml-mode.js` (every `@start` line, a profile's block included, goes through it; `mainframe` joins `caption`); test `plantuml-mode.test.js`.

**Interfaces:** Produces `startLine(stream, state) => string | null`, used by `base`'s `@start` rule and by `plantumlLanguage` where it opens a profile's block (today `emit(... [start[4], null])`), so the name is read the same way for every type. It reads: `@start<type>` (`keyword`, or `FunctionName` when `(` follows straight after), then `(` … `)` as a call's arguments (Task 9's `args` rules; until Task 9 lands, `(`/`)` `paren`, `,` `separator`, `id` `attributeName`, `=` `definitionOperator`, digits `number`, the rest plain), then the name per B1 (the spaces, quotes and braces around it `punctuation`/`brace`, the name `DiagramName`; a name starting `file://` is `DiagramName url`).

- [ ] **Step 1: Failing tests:** `@startuml My Fun Diagram` → `['@startuml', 'keyword'], ['My Fun Diagram', 'DiagramName']`; `@startchart revenue` (with the chart block's lines) → `revenue` `DiagramName`; `@startuml "quoted name"` → `"` `punctuation`, `quoted name` `DiagramName`, `"` `punctuation`; `@startuml{fun_file.png}` → `{` `brace`, `fun_file.png` `DiagramName`, `}` `brace`; `@startuml(id=fun) Fun name` → `@startuml` `FunctionName`, `(` `paren`, `id` `attributeName`, `=` `definitionOperator`, `fun` plain, `)` `paren`, `Fun name` `DiagramName`; `@startjcckit(300,200)` → `FunctionName`, `paren`, `300` `number`, `,` `separator`, `200` `number`, `paren` (and the body still `Inactive` once Task 12 lands); `@startuml file://out/diagram` → `file://out/diagram` `DiagramName_url`; `@startyaml config` with the yaml profile loaded → `config` `DiagramName`; `@enduml` → `keyword` alone; `title My **diagram**` → `title` `keyword`, `**diagram**` `strong`, no `DiagramName`; `mainframe **activity** x` → `mainframe` `keyword`, `**activity**` `strong`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `A diagram's name underlined; @start(…) read as a call (H12)`.

### Task 6: Names and ids agree (B1, R2, R8)

**Files:** Modify `src/editor/blocks.js` (the name rule and `id`), `tests/fixtures/diagrams/named-forms.puml` and `expected.json` (the shared fixtures), `lib/Service/IncludeResolver.php` (`block()`: no bare-name selector; the mistake), `src/editor/completion/local-files.js` (`BLOCK`: ids, then indexes, with the name as detail); tests `blocks.test.js`, `completion.test.js`, `tests/unit/Service/IncludeResolverTest.php`.

**Interfaces:** Produces `Diagram.id: string | null` beside `Diagram.name`; consumes nothing new. The resolver's mistake text exactly: `<path> has no block with id=NAME: write @startuml(id=NAME) to include it by name`.

- [ ] **Step 1: Failing tests:** `scan` names: `@startuml My Fun Diagram` → `My Fun Diagram`; `@startuml "quoted name"` → `quoted name`; `@startuml{fun_file.png}` → `fun_file.png`; `@startuml(id=fun) Fun name` → name `Fun name`, id `fun`; `@startuml(id=fun)` → name `fun`, id `fun`; `@startjcckit(300,200)` → name `''`, id null; `@startuml a, b` → `a, b`; `@startuml file://out/diagram` → `file://out/diagram`; every `render` index unchanged. Completion after `!include parts.puml!` on a file holding `@startuml(id=bar) Bar diagram`, `@startuml foo` and `@startsalt`: options `bar` (detail `Bar diagram`), then `0` (detail `bar`'s name), `1` (`foo`), `2` (`salt`), and no `foo` option. PHP: `!include parts.puml!bar` takes the `(id=bar)` block; `!include parts.puml!1` the second block; `!include parts.puml!foo` (a block `@startuml foo`, no id) is the mistake above on that line; `!include parts.puml!nothere` keeps today's mistake.
- [ ] **Step 2:** `npx vitest run tests/js/blocks.test.js tests/js/completion.test.js` and `vendor/bin/phpunit tests/unit/Service/IncludeResolverTest.php` (in the code-server pod; never psalm, cs-fixer or Behat in a service pod): FAIL.
- [ ] **Step 3:** Implement. The tab label (B2) needs no change: it shows `name`, now PlantUML's.
- [ ] **Step 4:** both suites green; the shared fixtures pass in both.
- [ ] **Step 5:** Commit `Names as PlantUML reads them; includes by index or id only (B1, R2, R8)`.

### Task 7: Paths and protocols (H22, C10)

**Files:** Modify `src/editor/lexicon/rules.js` (`paths`: the scheme rule, and a path rule for path slots), `src/editor/plantuml-mode.js` (the `preprocessor` state's include, import and theme lines; Creole's URL rule; `<img:`, `<img src=`, `<style file=`), `src/editor/completion/local-files.js` and `src/editor/completion/stdlib.js` (`http://` beside `https://`), a new `src/editor/completion/protocols.js` (registered in `completion/index.js`); tests `plantuml-mode.test.js`, `completion.test.js`.

**Interfaces:** Produces `paths.url`: `[a-z][\w+.-]*:\/\/[^\s"'>\]]*` → `url`; `paths.slot`: `[^\s"'>!]+` → `url`, then `(!)(\d+|[\w.-]+)` → `separator`, `number` or `typeName`; `protocols(context)`, a completion source.

- [ ] **Step 1: Failing tests:** `!include ./parts.puml!ACTORS` → `!include` `meta`, `./parts.puml` `url`, `!` `separator`, `ACTORS` `typeName`; `!include parts.puml!2` → `2` `number`; `!include <C4/C4>` → `<` `angleBracket`, `C4/C4` `url`, `>` `angleBracket`; `!include https://x.org/a.puml` → `url`; `!theme mars from ./themes` → `./themes` `url`; `!import lib.zip` → `url`; `A -> B : see https://plantuml.com/x` → `https://plantuml.com/x` `url`, the rest `labelName`; `note : and/or` → `and/or` plain (no slot, no scheme); `<img:icons/a.png>` → `icons/a.png` `url`; `<style file=./a.css>` → `./a.css` `url`; `[[https://x label]]` → `link` (unchanged); `"https://x"` → `string`. Completion: after `@startuml ` the options hold `file://`, applying `file://` and nothing more; after `!include ` they hold `https://` and `http://` beside `<` and the local files; after `[[`, `<img:` and `<img src=`, `https://` and `http://`; none of these after `@startuml x` (a name already typed) or inside a comment.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Paths and protocols: a component, and the scheme offered (H22, C10)`.

### Task 8: Stereotypes (H13)

**Files:** Modify `src/editor/lexicon/rules.js` (a `stereotypes` rule and a `stereotype` state), `src/editor/plantuml-mode.js` (in `start`, `head`, `classBody` once Task 10 lands, before the arrow rule); test `plantuml-mode.test.js`.

**Interfaces:** Produces `stereotypes` (rules opening the state `stereotype` on `<<` not followed by `-`, `.`, `=`, `~` or `<` and closed by `>>` on the line) and `stereotypeState`: `>>` `angleBracket` pop; `(` `paren` then a letter `atom`, `,` `separator`, a colour `ColorLiteral`, `)` `paren`; `$name` `tagName`, `*N` `number`, `{` pushes `tagBraces`; `,` `separator`; any other run `annotation`. `stereotype` is a `lineStates` entry (ends with its line).

- [ ] **Step 1: Failing tests:** `class Foo <<entity>>` → `<<` `angleBracket`, `entity` `annotation`, `>>` `angleBracket`; `<<a>> <<b>>` → two of each; `<<(C,#FF7700) Control>>` → `<<`, `(` `paren`, `C` `atom`, `,` `separator`, `#FF7700` `ColorLiteral`, `)` `paren`, `Control` `annotation`, `>>`; `<<$cog*2>>` → `$cog` `tagName`, `*2` `number`; `<<$cog{scale=2}>>` → braces as H10; `hide <<x>> circle` → `x` `annotation`; `skinparam classBackgroundColor<<Foo>> Red` → `Foo` `annotation`; Review Focus 1: `A <<-- B`, `A <<.. B` → `<<--`, `<<..` `LinkOperator`, no `annotation`; `A -> B : <<x>>` → `<<x>>` inside `labelName` text, no `annotation`; `<<x` with no `>>` → plain.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. (Gantt's hand-written `<<…>>` already emits the same three tokens, Task 4.)
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Stereotypes: guillemets as brackets, the name orange in plain face (H13)`.

### Task 9: Numbers and calls (H14, H16)

**Files:** Modify `src/editor/lexicon/rules.js` (`numbers`, `calls`, an `args` state), `src/editor/plantuml-mode.js` (`start` and `head`, after colours and names, before `\w+`); test `plantuml-mode.test.js`.

**Interfaces:** Produces `numbers`: `@[+-]?\d+(?:\.\d+)?` and `\d+(?:\.\d+)?%?(?![\w.])` → `number`, `(\|\|)(\d+)(\|\|)` → `separator`, `number`, `separator`; `calls`: `[A-Za-z_]\w*(?=\()` → `FunctionName` unless one of `if|elseif|while|repeat|switch|case|equals|not|is|backward` (left to the keyword rules, which come first), then `(` `paren` pushing `args`; `args`: `)` `paren` pop, `(` `paren` push, `,` `separator`, strings, names, numbers, H19's operators, `\w+` plain; `args` is a `lineStates` entry.

- [ ] **Step 1: Failing tests:** `scale 1.5` → `1.5` `number`; `autonumber 10 5` → two numbers; `skinparam defaultFontSize 12` → `12` `number`; `@100` and `@+50` → `number`; `||45||` → `separator`, `number`, `separator`; Review Focus 5: `node node1`, `[Q4]`, `$v2`, `#ff0000`, `2x_ARM -> b` give no `number` (`2x_ARM` plain); `A -> B : 3 apples` → `3` inside the label, no `number`; `Business_Service(id, "x")` → `Business_Service` `FunctionName`, `(` `paren`, `,` `separator`, `"x"` `string`, `)` `paren`; `if (x > 5) then (yes)` → `if` `keyword`, no `FunctionName`; Review Focus 3: `Foo(a,` then `B -> C` → the second line `->` `LinkOperator`, no `paren`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Numbers and calls on uml lines (H14, H16)`.

### Task 10: Declarations and class bodies (H15, H17)

**Files:** Modify `src/editor/lexicon/rules.js` (a `declaration` rule, the `classBody` state), `src/editor/plantuml-mode.js` (`!` lines push and pop instead of `next`); test `plantuml-mode.test.js`.

**Interfaces:** Produces `DECLARING`, the element keywords of H15 as one alternation in `rules.js`: C2's `PARTICIPANTS` and `STRUCTURES` (`completion/keywords.js`) with `abstract class`, `abstract`, `annotation`, `struct`, `protocol`, `object`, `map`, `json`, longest first, `declaration`: at a line's start `(${DECLARING})(\s+)([A-Za-z_][\w.:]*)` → `keyword`, plain, `typeName`; `alias`: `\b(as)(\s+)([A-Za-z_][\w.]*)` → `keyword`, plain, `typeName`; a declaration of `class`, `interface`, `enum`, `abstract class`, `abstract`, `annotation`, `entity`, `struct`, `protocol`, `object` or `map` whose line ends `{` pushes `classBody`. `classBody`: `^\s*\}` `brace` pop; `@end` back to start; the comment rules; dividers `^\s*(?:--|\.\.|==|__)(?:.*?(?:--|\.\.|==|__))?\s*$` `heading`; a visibility `^(\s*)([-+#~])(?=\S)` → plain, `modifier`; `(\{)(static|abstract|field|method|classifier)(\})` → `brace`, `modifier`, `brace`; `(\s*:\s*)([A-Za-z_][\w.<>\[\],]*)` → `separator`, `typeName`; then calls, names, strings, stereotypes, `\w+` plain. A `!` line pushes `preprocessor` and pops at the next line's start (a `lineStates` entry), so the state before it survives.

- [ ] **Step 1: Failing tests:** `class Foo` → `Foo` `typeName`; `participant Alice` → `Alice` `typeName`; `actor "Dr K" as drk` → `"Dr K"` `string`, `as` `keyword`, `drk` `typeName`; `abstract class Block` → `abstract class` `keyword`, `Block` `typeName`; `Alice -> Bob` → no `typeName`; the class body `class Diagram {` / `  +name : String` / `  +render() : Svg` / `  {static} count : int` / `  -- private --` / `}`: `+` `modifier`, `:` `separator`, `String` `typeName`, `render` `FunctionName`, `{` `brace`, `static` `modifier`, `-- private --` `heading`, `}` `brace`; the line after `}` reads uml (`A -> B` `LinkOperator`); Review Focus 2: `enum Kind {` / `!foreach $k in $kinds` / `  $k` / `!endfor` / `}` → `!foreach` and `!endfor` `meta`, `$k` `VariableName`, `}` `brace`; a note body with a `!` line inside keeps reading Creole after it.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Declarations moss, class bodies read as members (H15, H17)`.

### Task 11: Activity boxes (H18)

**Files:** Modify `src/editor/lexicon/rules.js` (`box(closer)`), `src/editor/plantuml-mode.js` (`start`); test `plantuml-mode.test.js`.

**Interfaces:** Produces `box(closer)`: a rule at a line's start `([ \t]*)(#${colourPart})?(:)` → plain, `ColorLiteral`, `bracket`, into the state `boxText`, unless the line is an actor's shorthand `^\s*:[^:]+:(?=\s+as\b|\s*[-.=<>]|\s*$)`; `boxText`: `closer` at the line's end (`(?:[;|<>/\\\]}])(?=\s*$)` for activity) → `bracket`, back to `start`; else `creole(null)`, over lines. Plan B passes `/;(?=\s*(?:<<[^>]*>>)?\s*$)/` for mindmap, wbs and bpm.

- [ ] **Step 1: Failing tests:** `:Split into blocks;` → `:` `bracket`, the text plain, `;` `bracket`; `#pink:**bold** step;` → `#pink` `ColorLiteral`, `**bold**` `strong`; `:Step 1: open;` → a box (`;` `bracket`); `:first` / `second;` → `;` `bracket` on the second line; `:send|` → `|` `bracket`; Review Focus 4: `:Dr K: as drk` → no `bracket` (the actor form); `:Main Admin: --> (Use)` → no `bracket`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Activity boxes: delimiters as brackets, Creole inside (H18)`.

### Task 12: What the server cannot draw is grey (T26)

**Files:** Modify `src/editor/plantuml-mode.js` (`plantumlLanguage`); test `plantuml-mode.test.js`.

**Interfaces:** Produces `INACTIVE = new Set(['chronology', 'jcckit'])` and `PLAIN = new Set(['ditaa'])` in `plantuml-mode.js`. An inactive block reads every line up to its `@end` as one `Inactive` token, `'` and `!` lines included, ahead of P5's shared rules; a plain block is an inner mode that skips each line (P5's comment and `!` rules still apply).

- [ ] **Step 1: Failing tests:** `@startchronology x` / `[A] happens on 2026-10-14` / `' note` / `@endchronology` → `@startchronology` `keyword`, the two middle lines `Inactive`, `@endchronology` `keyword`; `@startjcckit(300,200)` / `data/curves = curve` / `@endjcckit` likewise; `@startditaa` / `+--+   +--+` / `|ab|-->|cd|` / `@endditaa` → no `LinkOperator` and no `list` inside; `@startdef(id=a)` / `actor Bob` / `@enddef` → `actor` `keyword`, `Bob` `typeName` (def keeps uml).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Chronology and jcckit grey, ditaa plain (T26)`.

### Task 13: Common lines, Creole in profiles, copies removed (G2, G4, G5)

**Files:** Modify `src/editor/lexicon/rules.js` (`common(options)`, `setting`), `src/editor/profiles/board.js` (a `table`), `gantt.js` (bodies through `textMode`), `sprites.js` (the lexicon's sprite states), `math.js` and `latex.js` (the shared `setting`); tests `board-git-profile.test.js`, `gantt-profile.test.js`, `sprites-profile.test.js`, `math-profile.test.js`, `latex-profile.test.js`, `lexicon.test.js`.

**Interfaces:** Produces `common({ legend = 'block', title = true, all = true } = {}) => { rules: Rule[], states: Record<string, Rule[]> }`: with `all`, the keyword lines `header`, `footer`, `caption`, `mainframe`, `skinparam`, `scale`, `hide`, `show`, `left to right direction`, `top to bottom direction` (H8's Creole after the text forms), `title` with Creole (H8), `legend` as a body down to `end legend` (`'block'`) or one keyword line (`'line'`, chart) or none (`false`); `{ all: false, title: true }` is hcl's; and `setting(stream, state)`, math's and LaTeX's setting-line reader moved as is (it reads and writes `state.value`).

- [ ] **Step 1: Failing tests:** `lex.common()` read through `lex.table` reads `title x **y**` with `strong` and no `DiagramName`, `legend` / `**l**` / `end legend` with `strong` inside, `scale 2` with `number`; `lex.common({ legend: 'line' })` reads `legend right` / `bar` as `keyword` then a plain next line; board `+ a **card**` → `+` `list`, `**card**` `strong`; board `title My board` → `title` `keyword`, the text plain; gantt `note bottom` / `**n**` / `end note` → `strong` inside; gantt `title **Rounds**` → `strong`; the sprites profile's tokens unchanged by the move (its tests stay green); math and LaTeX setting lines unchanged.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; delete the copies (sprites' states, gantt's `NAME` colour pattern in favour of `lex.patterns.colourPart`, gantt's `$`/`%` regexes in favour of `lex.match(stream, lex.names)`, math's and LaTeX's `setting`).
- [ ] **Step 4:** `npm test` green; `npm run build` passes the chunk guard (the profiles still import nothing from core).
- [ ] **Step 5:** Commit `Common lines and Creole for profiles; the copies go (G2, G4, G5)`.

### Task 14: A colour name in a Creole colour tag is bare (W6)

**Files:** Modify `src/editor/values/index.js` (`BARE_AFTER`), `src/editor/completion/colors.js` (the option range takes the `#`), `src/editor/completion/creole.js` (the snippets); create `src/editor/lint/creole-colour.js`; modify `src/editor/lint/index.js`; tests `values.test.js`, `completion.test.js`, `lint.test.js`.

**Interfaces:** Produces `BARE_AFTER = /(?:\bcolor\s*=\s*["']?|<(?:color|back|u|s|w):)$/i`; `creoleColour(state) => Diagnostic[]` in `rules`.

- [ ] **Step 1: Failing tests:** the pencil on `<back:#ff0000>x</back>` picking `Red` writes `<back:Red>`; on `<u:#Red>x</u>` picking `Blue` writes `<u:Blue>`; on `node a #ff0000` picking `Red` still writes `#Red`; completion after `<back:#Re` applies `Red` over `#Re` (`<back:Red`), after `<back:Re` likewise; C7's snippets read `<color:${}>` and `<back:${}>`; the check marks `#Red` in `<back:#Red>x</back>` (from the `#` to the name's end) as an error with the message "PlantUML draws this tag as text: write the colour name without #" and the action **Remove #**, which leaves `<back:Red>`; `<back:#BUSINESS>`, `<s:#Red>`, `<w:#Red>` marked too; `<back:#ff0000>`, `<back:#FFF>`, `<color:#Red>` and `<back:Red>` not marked; a `'` comment line not checked.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Creole colour tags: names bare, a check for #Name (W6)`.

### Task 15: Icons and emoji by name (W7)

**Files:** Modify `src/editor/values/index.js` (two entries in `coreValues`); test `values.test.js`.

**Interfaces:** Produces `iconValue`: for `<&([\w.-]+)` the name's range, `{ kind: 'list', options: () => serverList('icons') }`; `emojiValue`: for `<(?:#\w+)?:([\w+-]+):` the name's range, `options: () => serverList('emoji')`; each none once `serverListNow(...)` is `[]`, as `fontFamilyValue`.

- [ ] **Step 1: Failing tests:** on `A : <&document> x`, a `list` value over `document`; `<&cog*4>` over `cog`; `<&star{scale=2}>` over `star`; `<:rocket:>` over `rocket`; `<#green:sunny:>` over `sunny`; a pick of `file` on `<&document>` writes `<&file>`; with `serverListNow('icons')` `[]`, no icon value; the list shows the current name first (as W4's lists do).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` green.
- [ ] **Step 5:** Commit `Icons and emoji by name: the pencil (W7)`.

### Task 16: Live check and the spec's status

**Files:** Modify `docs/superpowers/specs/2026-10-14-editor-design.md` (each row of this plan to `building`, then `shipped (#N)` at merge), the Known limitations (drop "Blocks of a type with no grammar …" for the types this round covers; keep the rest).

- [ ] **Step 1:** `npm run build`; record the gzip sizes of the entry and each chunk for the PR (P6).
- [ ] **Step 2:** After merge and deploy (the repo's usual `tar | kubectl exec` into `cloud/nextcloud`, `dist/chunks` included, no `rm -rf` in the remote script), open UML_Fun.puml on the selenium account in light and dark: each block's name underlined and its tab showing the same name; the include paths and their selectors; an `!include` by id; `<<entity>>` orange in plain face; `class Diagram {` members; `:Split into blocks;` brackets; the `!if` operators; chronology and jcckit grey; the `<back:` check and its fix; the icon and emoji pencils. A screenshot of each for the PR.
- [ ] **Step 3:** Commit `Spec: dictionary round shipped`.
