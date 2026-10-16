<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Hover docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a doc card for every known PlantUML element, on a 500 ms hover (pinned in place by a click) and beside the selected completion, built from PlantUML's licensed source, plantuml.com links and our own one-clause lines with examples.

**Architecture:** build scripts write JSON under `src/editor/data/` (the source's text, the server's word lists, plantuml.com links); `own.json` is hand-written. `src/editor/docs/` loads them as one lazy chunk into a `Docs` lookup, finds the element under a position from the syntax tree, draws a card, and runs the hover and pin; a wrapper gives every completion option its `detail` and `info` from the same lookup.

**Tech Stack:** CodeMirror 6 (`hoverTooltip`, `activateHover` in `@codemirror/view` 6.43.14, `Completion.info` in `@codemirror/autocomplete` 6.20.3, `tooltipFilter` in `@codemirror/lint`), vitest with jsdom, Node 24 scripts with `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-14-editor-design.md`, section "Documentation", rows I1–I8 (and K1). Designs: `docs/design/editor-hover-docs.png`, `editor-hover-pinned.png`, `editor-hover-lint.png`, `editor-hover-diagram.png`, `editor-completion-docs.png`, `editor-hover-docs-dark.png`, `style-guide-doc-card.png`. Research: `.superpowers/research/2026-10-16-hover-docs/` (git-ignored; `docs-research/parse.py` is a working plantuml.com section parser, `docs-research/site/pages/*.html` the crawled pages).

## Global Constraints

- Nothing from plantuml.com's prose ships: links and section titles only (I1, I7). Text from PlantUML's source (`tim/builtin/readme.md`, theme front matter) and stdlib README facts may ship.
- Every token is a dictionary token (G1); a profile imports no core module (P2); the entry never imports a chunk statically (CI guard: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`).
- Every colour is a Nextcloud variable or one of `theme.js`'s existing mixes; no colour literal (theme test).
- A summary is one clause, at most 80 characters, no full stop. An example is at most 6 lines and draws on PlantUML 1.2026.8 (`http://plantuml.flow.svc`).
- Doc text is English; UI strings (the ×'s label, the dialog name) go through `t(APP_ID, …)`.
- Dr K, never a real name; SPDX `kubed-io`; branch `hover-docs`; a commit per task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pinning moves nothing.** After a pin the card is the same DOM node with the same tooltip object, and a lint section that shared the box is still there. Pinned in Task 5.
2. **Escape order (K1).** With a pinned card, Escape closes the card and the editor stays open; the next Escape closes the editor. With the completion list and a card both open, Escape closes the list first. Pinned in Task 5.
3. **A keyword-looking word that is text** never opens a card: `A -> B : alt paid` (a label), `' alt` (a comment), `"alt"` (a string), `note left : end` (note text), `participant alt` (a name). Pinned in Task 3.
4. **The docs chunk fails to load:** hovering shows nothing, completion still lists every option (without its detail), no error escapes, and the next `loadDocs()` tries again. Pinned in Tasks 3 and 6.
5. **Odd forms of a known word:** `end note` is `note`'s, `@endgantt` and `@startuml(id=x)` are their diagram's, `</back>` is `back`'s, `skinparam BackgroundColor` is case-insensitive, a keyword in a gantt block takes `keyword:<w>@gantt` before `keyword:<w>`. Pinned in Task 3.

---

### Task 1: The source's text and the server's words (I1)

**Files:** Modify `scripts/vocabulary.mjs`, `src/editor/data/builtins.json` (regenerated); Create `src/editor/data/language.json`, `src/editor/data/docs/source.json`; Test `tests/js/vocabulary.test.js`.

**Interfaces — Produces:**
- `builtins.json` entries gain `min: number` and `max: number | null` (null = no upper bound): `{ name, args, min, max, description, example }`.
- `language.json`: `{ plantuml: '1.2026.8', types: string[], keywords: string[], skinparameters: string[] }` from the server's `GET /language` (`;type`, `;keyword`, `;skinparameter` sections; the `@start…`/`@end…` words stay in `keywords`).
- `docs/source.json`: `{ plantuml: '1.2026.8', stdlib: '7167ca0', themes: { [name]: { title, summary } }, libraries: { [folder]: { title, summary?, source? } } }`.

- [ ] **Step 1: Failing tests** in `vocabulary.test.js`, on inline Java/Markdown strings:
  - `arities(java)`: `return nbArg == 2 || nbArg == 3;` → `{ min: 2, max: 3 }`; `return nbArg == 0;` → `{ min: 0, max: 0 }`; `nbArg >= 1` → `{ min: 1, max: null }`; no `canCover` → `null` (the caller then uses the signature's count for both).
  - `languageLists(text)` on `';type\n;2\nactor\nclass\n;keyword\n;1\nalt\n;skinparameter\n;1\nBackgroundColor\n;color\n;1\nRed\n;EOF'` → `{ types: ['actor','class'], keywords: ['alt'], skinparameters: ['BackgroundColor'] }`.
  - `frontMatter(text)` on the cerulean header (`---\nname: cerulean\ndisplay_name: Cerulean\ndescription: Cerulean theme based off of the bootstrap theme of the same name\n…\n---`) → `{ name: 'cerulean', display_name: 'Cerulean', description: '…' }`; no front matter → `{}`.
- [ ] **Step 2:** `npx vitest run tests/js/vocabulary.test.js` FAILS (not exported).
- [ ] **Step 3:** export `arities(java) → { min, max } | null`, `languageLists(text) → { types, keywords, skinparameters }`, `frontMatter(text) → Record<string, string>` from `scripts/vocabulary.mjs`; `builtins()` adds `min`/`max`; new builders: `language` (fetches `${process.env.PLANTUML_URL ?? 'http://plantuml.flow.svc'}/language`), `docsSource` (themes: list `src/main/resources/themes/puml-theme-*.puml` at the tag through the GitHub contents API, `title` = `display_name`, `summary` = `description`; libraries: the README front matter `stdlib()` already fetches, `title` = `display_name ?? folder`). Add both files to the outputs list.
- [ ] **Step 4:** `node scripts/vocabulary.mjs` (needs network and the in-cluster server), then `npm test` passes; `language.json` holds 53 types, 196 keywords, 478 skin parameters; `source.json` 44 themes.
- [ ] **Step 5:** Commit `Docs: the source's descriptions, argument counts and the server's word lists`.

### Task 2: Links from plantuml.com (I7)

**Files:** Create `scripts/doclinks.mjs`, `src/editor/data/docs/links.json`, `tests/js/doclinks.test.js`, `tests/js/fixtures/doclinks/page.html` (a small hand-written page in plantuml.com's markup: two `<h2 class="chap">` sections with their `<a name>` anchors and code, one `<h3>` ending `[!if, !else]`; no copied prose).

**Interfaces — Consumes:** Task 1's `language.json`, `directives.json`, `builtins.json`. **Produces:** `links.json` = `{ read: 'YYYY-MM-DD', links: { [key]: { page, anchor?, section } } }`, keys as Task 3 defines them (`directive:!if`, `keyword:alt`, `keyword:lasts@gantt`, `diagram:yaml`, `function:%strlen`, `tag:back`, `connector:-->`, `property:BackgroundColor`, `theme:cerulean`, `library:C4`).

- [ ] **Step 1: Failing tests:** `sectionsOf(html)` on the fixture → `[{ anchor, title, level, codes }]` with the real anchors; `headingWords('Conditions [!if, !else, !elseif, !endif]')` → `['!if','!else','!elseif','!endif']`, and `'Basic Examples'` → `[]`; `linkFor(word, page, sections)` prefers a heading naming the word, then the first section whose `codes` hold it, then `{ page, section: <page title> }`; a page title is the `<h1>`'s text.
- [ ] **Step 2:** FAIL. **Step 3:** implement (port `parse.py`'s section reading). `PAGES`: `/sitemap-language-specification`'s links plus `preprocessing`, `creole`, `style`, `theme`, `stdlib`, `skinparam`. `DIAGRAM_PAGES`: each `@start` type → its page (`uml` → `sitemap-language-specification`, `gantt`/`project` → `gantt-diagram`, `mindmap` → `mindmap-diagram`, `yaml` → `yaml`, … all 30 of `language.json`'s `@start` words; a type with no page links `sitemap-language-specification`). A word found on a page of a non-uml type is keyed `@<type>`. Selectors link `style`, skin parameters `skinparam`, themes `theme`, libraries `stdlib` (a heading naming the library first).
- [ ] **Step 4:** `node scripts/doclinks.mjs` writes `links.json`; `npm test` passes; spot-check: `directive:!if` → section `Conditions`, `keyword:alt` → `Grouping message`, `diagram:yaml` → `Display YAML Data`.
- [ ] **Step 5:** Commit `Docs: links to the plantuml.com section for each word`.

### Task 3: The docs index and the element under a position (I1, I6)

**Files:** Create `src/editor/docs/index.js`, `src/editor/docs/element.js`, `src/editor/data/docs/own.json` (`{}` for now); Test `tests/js/docs.test.js`, `tests/js/hover.test.js`.

**Interfaces — Produces:**
- Keys: `<kind>:<name>`, optionally `@<type>` for a block type; kinds `diagram`, `keyword`, `directive`, `function`, `selector`, `property`, `skinparam`, `tag`, `connector`, `helper`, `theme`, `library`. Names as written (`!include`, `%strlen`, `-->`), but a tag is its bare word (`back`), a diagram its type (`yaml`), a property and a skin parameter lower-cased.
- `type Entry = { name: string, kind: string /* label: 'keyword · sequence' */, look: string /* the kind key, for the card's colour */, signature?: string, summary?: string, example?: string, icon?: string, link?: { page: string, anchor?: string, section: string } }`.
- `buildDocs({ own, links, source, builtins, language, vocabulary }) → Docs`, with `Docs.get(key: string, type?: string) → Entry | undefined` (tries `key@type`, then `key`). Merge: the source's text (builtins' `description`/`example`, themes, libraries) wins; `own` fills the rest; `links` adds `link`. Selectors (`vocabulary.style.selectors`) and skin parameters (`language.skinparameters`) get generated entries: summary `Styles every <name> in a <style> block` / `Skin parameter, replaced by <style>`, a selector's example `<style>\n<name> {\n  BackgroundColor LightBlue\n}\n</style>`. A `function` entry with no `signature` in `own` shows its bare name. Kind labels: `diagram`, `keyword` (+ ` · <home>` when `own` gives `home`), `directive`, `function`, `style selector`, `style property`, `skin parameter`, `Creole tag`, `connector`, `command`, `theme`, `library`; `own` may override `kind`.
- `loadDocs() → Promise<Docs>`: dynamic-imports the six JSON files once; a failed load is forgotten so the next call retries (as `completion/builtins.js` does).
- `elementAt(state, pos, side: -1 | 1) → { key: string, type: string, from: number, to: number } | null`, `type` = `diagramAt(state, pos)`'s type or `'uml'`.

- [ ] **Step 1: Failing tests.** `docs.test.js`: `buildDocs` on small inputs: merge precedence, `@type` before plain, a selector's generated entry, `link` attached, unknown key `undefined`; `loadDocs` retries after a rejected import (mock one JSON import to throw once).
  `hover.test.js` (`elementAt` over a real `EditorState` with `plantumlLanguage`, the style profile loaded through `profileExtension` for style lines): `@startyaml` → `diagram:yaml`; `@startuml(id=x)` → `diagram:uml`; `@endgantt` → `diagram:gantt`; `alt` → `keyword:alt`; `end note` → `keyword:note`; `!include` → `directive:!include`; `%strlen` → `function:%strlen`; `<back` / `</back>` → `tag:back`; `-->` → `connector:-->`; `<style>` lines: a selector → `selector:…`, `BackgroundColor` → `property:backgroundcolor`; `skinparam BackgroundColor red`: the name → `skinparam:backgroundcolor`, `red` → null; `!theme cerulean` → `theme:cerulean`; `!include <C4/C4_Container>` on `C4` → `library:C4`; `listfonts` alone on a line → `helper:listfonts`; a keyword in a gantt block → `type: 'gantt'`. Review Focus 3 and the I6 never-list: `A -> B : alt paid` on `alt`, `' alt`, `"alt"`, `note left : end`, `participant alt` on its name, a number, `#Red`, `<&star>`, `<:smile:>`, a `$var` → each null.
- [ ] **Step 2:** FAIL. **Step 3:** implement. `elementAt` reads `ensureSyntaxTree(state, pos, 50)?.resolveInner(pos, side)` and maps the node name: `keyword` → diagram (text `@start…`/`@end…`, type after it up to `(` or a space) or keyword (last word); `meta` → directive (bare `!` is null); `FunctionName` starting `%` → function; `tagName` → tag (its word between `</?` and `>`/`:`); `LinkOperator` → connector, only for C4's 19 (`CONNECTORS` from `completion/connectors.js`); `url` inside `!include <…>` → library (first path segment); in a style body (`inStyleBody`) `typeName` → selector, `propertyName` → property. A position on no token: the line's form decides (`^\s*!theme\s+(\S+)`, `^\s*skinparam\s+(\w+)`, a line that is exactly a helper word from `completion/keywords.js`'s `HELPERS`). Everything else null.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `Docs: the index and the element under a position`.

### Task 4: The card (I5)

**Files:** Create `src/editor/docs/card.js`; Modify `src/editor/theme.js`; Test `tests/js/doc-card.test.js`, `tests/js/theme.test.js`.

**Interfaces — Consumes:** `Entry`. **Produces:** `renderDoc(entry: Entry) → { dom: HTMLElement, destroy(): void }`; `dom` is `div.cm-doc` holding `div.cm-doc-head` (`span.cm-doc-icon` empty and hidden unless `entry.icon`; `code.cm-doc-name.cm-doc-<look>` with `entry.signature ?? entry.name`; `span.cm-doc-kind`; `button.cm-doc-close` with `aria-label` "Close", present always, `visibility: hidden` until the card is pinned), `div.cm-doc-summary`, `pre.cm-doc-example`, `a.cm-doc-link` (`https://plantuml.com/<page>#<anchor>`, text `plantuml.com › <section>`, `target="_blank"`, `rel="noopener noreferrer"`). Missing parts are left out, never empty.

- [ ] **Step 1: Failing tests:** every part for a full entry, in that order; a function shows its signature; no `summary`/`example`/`link` → no such element; the close button is in the head of every card; the link's `href`, `target` and `rel`; theme test: `.cm-doc` rules use no colour literal.
- [ ] **Step 2:** FAIL. **Step 3:** implement; `theme.js`: `.cm-doc` (padding `8px 12px`, `max-width: 400px`, `max-height: 20em`, `overflow: auto`), head flex row with the close button in the top-right corner, kind `--color-text-maxcontrast`, example monospace on `--color-background-dark` with `--border-radius`, link `--color-primary-element`, underlined on hover; name colour per look from the existing highlight colours (diagram, keyword, helper, skinparam: keyword's; directive: directive's; function: ochre; selector: moss; property: slate; tag: maroon; connector: amber; theme, library: the string green). Pinned: `.cm-tooltip-hover.cm-doc-pinned { outline: 2px solid var(--color-primary-element) }` (an outline, so the box keeps its size) and `.cm-doc-pinned .cm-doc-close { visibility: visible }`. Inside `.cm-completionInfo`, the info box keeps its own border and the card adds none.
- [ ] **Step 4:** `npm test` passes. **Step 5:** Commit `Docs: the card`.

### Task 5: Hover, pin and keys (I2, I3, K1)

**Files:** Create `src/editor/docs/hover.js`; Modify `src/editor.js` (extensions; `loadDocs()` once the view exists, errors ignored), `src/editor/lint/index.js` (`tooltipFilter`); Test `tests/js/hover.test.js`.

**Interfaces — Consumes:** `elementAt`, `loadDocs`/`Docs`, `renderDoc`. **Produces:** `plantumlDocs: Extension[]`; commands `pinDocAt(view, pos) → boolean` and `closeDoc(view) → boolean`; `docSource(view, pos, side) → Tooltip | null`; `docPinned: StateField<{ pos: number } | null>`.

- [ ] **Step 1: Failing tests** (real `EditorView` in jsdom, `vi.mock('../../src/editor/docs/index.js')` so `loadDocs` resolves a `buildDocs` of a few entries). Where jsdom cannot mount a tooltip (it has no layout), assert on `docPinned`, the hover field's tooltips and the tooltip object instead, and leave the DOM checks to Task 10's live check:
  - `docSource` returns a tooltip at the element's `from` for `alt`, and null for a string, a name and an unknown word; the same tooltip object for the same element twice (memoised by key and range).
  - `hoverTooltip` options: `hoverTime: 500`, `hideOnChange: true` (assert through the exported options object `DOC_HOVER`).
  - Review Focus 1: open the hover through `activateHover`, record its `.cm-doc` node and a lint section on the same word; `pinDocAt` → the same `.cm-doc` node is still in the DOM, the lint section is still there, the tooltip has `cm-doc-pinned`, `role="dialog"` and `aria-label` = the name, and it holds focus.
  - Pinned: a doc-changing transaction closes it; `closeDoc` closes it and focuses the source with the selection unchanged; a `mousedown` outside the tooltip closes it, one inside does not; `docSource` returns null while pinned.
  - Review Focus 2: Escape with a pinned card → card closed, `defaultPrevented` true (the editor's overlay handler then stays open); Escape with the completion list open and a card pinned → the list closes, the card stays.
  - `Mod-k Mod-i` with the caret on `%strlen` pins its card; again → focus moves into it.
- [ ] **Step 2:** FAIL. **Step 3:** implement. Pin = `activateHover(view, pos, 1, { until })` with no `tooltip` option, so every hover at the spot (the doc and a lint message) locks and stays; `until` = a doc change or the close effect. `docPinned` set on pin; the tooltip's `mount`/`update` toggles `cm-doc-pinned`, `role`, `tabindex="-1"` and focus. Escape and `Mod-k Mod-i` in a `keymap` at default precedence (after `completionKeymap`, which is `Prec.highest`). Unpinned role `tooltip`. Lint's `tooltipFilter`: while `docPinned` is set, keep only the diagnostics covering its position. A click on the card (not on its link) pins.
- [ ] **Step 4:** `npm test` passes; `npm run build` and the chunk guard pass. **Step 5:** Commit `Docs: hover after 500 ms, pinned in place by a click`.

### Task 6: Docs beside the completion list (I4, I8's details)

**Files:** Create `src/editor/completion/docs.js`; Modify `src/editor/completion/index.js`, `src/editor/profiles/index.js` (wrap profile sources too), and each source that offers a documented word to set `docKey` and drop its own `detail` text: `directives.js`, `keywords.js` (`DETAILS` and `HELPERS` texts move to `own.json` as summaries in this task; the word lists stay), `builtins.js` (drop `detail` and `info`), `connectors.js`, `creole.js`, `themes.js`, `stdlib.js` (library level), the style profile's selector and property sources (in `profiles/style.js`, a plain string key: no core import); Modify `theme.js` (`.cm-completionInfo` max-height `20em`, `overflow: auto`); Test `tests/js/completion.test.js`.

**Interfaces — Consumes:** `loadDocs`, `renderDoc`, keys. **Produces:** `withDocs(source) → source`: awaits the source and `loadDocs()` (a failed load → options unchanged), and for each option with a `docKey` and an entry, sets `detail` = `entry.summary` (unless the option has its own) and `info` = `() => renderDoc(entry)`. The diagram type for `@type` keys is `diagramAt(context.state, context.pos)`.

- [ ] **Step 1: Failing tests:** `alt` offered with detail = its summary and an `info` that returns a `.cm-doc`; `%strlen`'s info shows its signature; an option without a key (a name) has no `info`; Review Focus 4: with `loadDocs` rejecting, the keyword source still returns every option, without detail; the connector `-->` keeps its detail via its entry.
- [ ] **Step 2:** FAIL. **Step 3:** implement, and move every detail text a source drops into `own.json` as that word's `summary` (keys per Task 3), so no option loses its detail; Tasks 7–9 add the examples. **Step 4:** `npm test` passes. **Step 5:** Commit `Docs: the card beside the completion list`.

### Task 7: Our own lines — diagram types, directives, functions (I8)

**Files:** Modify `src/editor/data/docs/own.json`; Create `scripts/doc-examples.mjs`; Test `tests/js/docs.test.js`.

**Interfaces — Produces:** `own.json` entries `{ "<key>": { summary?, example?, signature?, home?, kind? } }`; `scripts/doc-examples.mjs`: for each entry with an `example`, the source = the example when it starts with `@start`, else wrapped in `@start<type>`/`@end<type>` (`type` from the key's `@type`, else `uml`); POST to `${PLANTUML_URL ?? 'http://plantuml.flow.svc'}/svg` (body = source); prints each key whose answer carries `X-PlantUML-Diagram-Error`, exits 1 if any.

- [ ] **Step 1: Failing test** in `docs.test.js`: every `diagram:<type>` (30 types from `language.json`'s `@start` words), every `directive:` in `directives.json`, and every `function:` has a summary and an example (functions: the source's or ours) and a `signature`; each signature's argument count (optional ones in `[ ]`) fits `min`/`max`; every summary ≤ 80 characters with no full stop; every example ≤ 6 lines. The test names the keys that fail.
- [ ] **Step 2:** FAIL, listing them. **Step 3:** write the entries (`diagram:yaml`: summary `YAML data, drawn as a tree`, example as in `editor-hover-diagram.png`; `function:%substr` signature `%substr(text, start[, length])`; `%now()` for none) and the script. **Step 4:** `npm test` passes; `node scripts/doc-examples.mjs` reports nothing (chronology and jcckit draw "not supported" on 1.2026.8 (T26): their examples are listed in the script's `UNDRAWN` and skipped).
- [ ] **Step 5:** Commit `Docs: diagram types, directives and functions in our own words`.

### Task 8: Our own lines — keywords (I8)

**Files:** Modify `src/editor/data/docs/own.json`, `tests/js/docs.test.js`.

- [ ] **Step 1: Failing test:** every word of `language.json`'s `keywords` (not `@start`/`@end`) and of `KEYWORDS` (`completion/keywords.js`) has a summary and an example, plain or `@<type>`; a uml keyword has `home` (`sequence`, `activity`, `class`, `component`, `state`, `usecase`, `timing`, `object`, `deployment`, or `any`, whose label then reads `keyword`). The `alt` entry is exactly: summary `Alternatives, one drawn per else`, home `sequence`, example `alt paid\n  Shop -> Customer : receipt\nelse declined\n  Shop -> Customer : retry\nend`.
- [ ] **Step 2:** FAIL. **Step 3:** write the entries (the summaries Task 6 moved stay unless they break the 80-character rule). **Step 4:** `npm test` passes; `node scripts/doc-examples.mjs` reports nothing. **Step 5:** Commit `Docs: the keywords in our own words`.

### Task 9: Our own lines — element types, Creole tags, connectors, commands, style properties (I8)

**Files:** Modify `src/editor/data/docs/own.json`, `tests/js/docs.test.js`.

- [ ] **Step 1: Failing test:** a summary and an example for every word of `language.json`'s `types`, every Creole tag `creole.js` offers (and `style` for `<style>`, kind `style block`), C4's 19 connectors, every `HELPERS` command and every `vocabulary.style.properties` entry. `tag:back` has example `<back:LightBlue>paid</back>` (wrapped by the script in a message line).
- [ ] **Step 2:** FAIL. **Step 3:** write them, keeping the summaries Task 6 moved. **Step 4:** `npm test`; `node scripts/doc-examples.mjs` clean. **Step 5:** Commit `Docs: element types, tags, connectors, commands and style properties`.

### Task 10: Status, CHANGELOG, live check

**Files:** the spec (I1–I8 `shipped (hover-docs round, <date>)`), `CHANGELOG.md` (`### Added`: hover docs with pinning; docs beside the completion list).

- [ ] **Step 1:** `npm test`, `npm run lint`, `npm run build`, the chunk guard; the docs chunk's gzip size goes in the report. Commit `Spec: the hover-docs round shipped`.
- [ ] **Step 2:** After merge and deploy, on the selenium copy of `UML_Fun.puml`, light and dark: a card after ~500 ms on `alt`, `@startyaml`, `!include`, `%strlen`, a style property; none on a label, a string, a colour; a click pins it with no shift (compare `getBoundingClientRect()` before and after); Escape, ×, a click outside; `Ctrl+K Ctrl+I`; the completion pane on `%str` and its link opening plantuml.com.
