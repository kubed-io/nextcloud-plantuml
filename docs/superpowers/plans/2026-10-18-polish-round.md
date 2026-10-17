<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Polish Round (2026-10-18) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the eight items Dr K approved on 2026-10-18 (style-file pencils, the Wall's click and centring, template descriptions, linked paths as links, the missing keywords, the Viewer's double-click) and the sweep's top ten with its leftovers, each small and pinned by a test.

**Architecture:** no new module and no PHP. The editor changes in `src/editor/linked/`, `src/editor/theme.js`, the lexicon (`lexicon/rules.js`, `plantuml-mode.js`) and the bar (`src/editor.js`, `css/editor.css`); the add chunk in `src/editor/add/` (data and the modal's card); the Viewer in `src/viewer/` (`diagram-view.js`, `sheets.js`, `wall-layout.js`, `menu.js`), `src/open-editor.js` and `css/viewer.css`. Two items (the focus on close, the bar at phone width) are probed on the live instance first, and their fix steps run only on what the probe finds.

**Tech Stack:** vanilla-DOM editor on CodeMirror 6 stream languages, Vite 8, Vitest + jsdom; the Nextcloud 34 Viewer.

**Spec:** `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (VW1, VW2, VW5–VW7, VW10, VW12, VW14, the polish-round rulings after the Viewer's table) and `docs/superpowers/specs/2026-10-14-editor-design.md` (O3, L9, L10, H15, H24, K3, T1, R10, R12, A1, A3, A8, the add-diagram rulings and the Example descriptions table). Every row this plan builds reads "agreed (polish round)". Evidence with file:line: `.superpowers/sdd/2026-10-18-polish-round/investigate-live.md`, `investigate-code.md` and `sweep.md` (git-ignored; read the section a task names).

**Built with** the superpowers skills `writing-plans` and `test-driven-development`, read from the superpowers plugin on disk (this session had no reader for the kb MCP's `skill://superpowers/…` resources).

## Global Constraints

- Repo `/projects/kubed-io/nextcloud-plantuml`, branch `polish-round` off `main` 9d09044. JS tests `npx vitest run`; lint `npm run lint`; build `npm run build`. No PHP changes, so no `composer` run is needed; in the pod, never Behat, psalm or cs-fixer.
- **Budgets** (measured with `gzip -c <file> | wc -c` after `npm run build`): `dist/plantuml-files.js` ≤ **106000** B (100606 on main); `dist/plantuml-editor.js` < **246530** B, so it grows less than 2000 B over 244530 for the whole round (244520 on main). Each task that touches either prints both numbers.
- **The chunk guard stays green:** `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`.
- **The add chunk takes editor modules only through `core`** (`src/editor/add/index.js`'s Core): nothing under `src/editor/add/` other than `button.js` and `insert.js` imports from outside `src/editor/add/` and `src/editor/data/`.
- No new dependency. Every colour is a Nextcloud variable, except the Wall stage's `#000` (the Viewer mask's own black, app spec rulings).
- UI copy, exactly: "Could not open the file" (existing, now also the Viewer's unread file), "Could not open the editor" (new, VW7), "Could not open Add diagram" (new, A1), "Just the start and end lines" (Empty, A8), and the 27 Example descriptions and four UML descriptions of Task 3, verbatim. Strings go through `t(APP_ID, '…')` as literals, except A8's descriptions, which ship untranslated as the titles do.
- **No `.feature` change.** Every item is browser-only or editor-internal; none becomes API-visible, so no scenario is proposed.
- Never write a real name or a homelab hostname; the maintainer is Dr K; fixture users are `drk` and `alice`.
- Commits are `<Area>: <one plain sentence>` (Areas used below: `Linked files`, `Wall`, `Add diagram`, `Grammar`, `Viewer`, `Editor`, `Docs`), ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- **The refactor round comes after this one.** `docs/superpowers/plans/2026-10-17-refactor-round.md` is agreed but unstarted and touches the same files as Task 4 (`src/editor/lexicon/rules.js`, `src/editor/plantuml-mode.js`: its Tasks 4, 6, 7, 8, 10 and 13). It must build on top of this round: whoever starts it rebases its file moves onto this round's `lineKeywords`, `elements` and archimate rule, and keeps H24's `it.each` green.

## Rulings (where the spec is silent)

- **A failure worth asking again** (VW10): the fetch threw without being aborted, or the route answered 500 or more. Any 4xx (404 no image, 404 no such diagram, 413, 400) is the route's decision and is not asked again. A failed re-check of a kept drawing still shows the kept drawing and is not a failure.
- **Where the bar's focus goes** (L9): the source (`view.focus()`), else Save when the source is hidden, else close. The hand-over runs in `showButtons()` before it hides or disables anything.
- **`floating note`** is one keyword token: the note rules take an optional `floating\s+` before `note`, so its text is still a note's. **`repeatwhile`** joins the condition rule (`repeat[ \t]*while`), so its parentheses are brackets as `repeat while (x)`'s are.
- **The Wall's opaque stage** is `.plantuml-viewer__stage--wall { background: #000 }` only; Tabs and Stack keep the Viewer's own see-through mask, as Nextcloud's image viewer does.
- **The Export menu's margins** are 8 px from either window edge; the menu also gets `max-width: calc(100vw - 16px)`.
- **The modal's card** (A3): its `max-width` becomes the room right of the dialog (`innerWidth − dialog right − 16 − 8`) when that is 220 px or more, else CSS's own 360 px and today's clamp.
- **K3 has no unit test**: jsdom has no layout, so CodeMirror cannot map a press to a word there. It is a live check (Task 9), and Tasks 6 and 7 add no listener to the editor.
- **The 16 kinds without a moss name** (`agent`, `artifact`, …) stay as they are: an open proposal in the editor spec, not this round.

## Review Focus

1. **A server that stays down** is not asked in a loop: a failed sheet's own settled event, the Wall's re-pack it causes and the observer firing again must not ask again; only a later `request()` does. Pinned in Task 6.
2. **A single press still does everything** after the double-click guard: a click on a card's checkbox toggles it, a link in a diagram opens, Export and the tabs work; only a `mousedown` with `detail > 1` is prevented. Pinned in Task 5.
3. **A wall that does not fill its columns, or overfills the stage**: three waiting cards on a five-column stage use three columns, centred; a card spanning the whole wall keeps the full count; a resize packs again with the new column width. Pinned in Task 2.
4. **A name that is now a keyword elsewhere**: `process -> Bob : go` keeps `process` plain (a message, not a declaration), and `archimate #Business "x" as a` still gets no pencil and `archimate #|` still completes. Pinned in Task 4.
5. **The source hidden (L8) when a focused bar button is disabled**: the focus goes to Save, not to the hidden source and not to the body. Pinned in Task 7.

---

## Live verification (required, however long it takes)

A green suite proves the repo, not the instance. This round is finished only when an agent has deployed it to the live Nextcloud and checked every user-visible behaviour of this round in a real browser. If the browser, the Grid or a sign-in is unavailable, the live check is recorded as outstanding in the ledger and the final report, never skipped; any later agent can pick it up from this section alone.

1. **Deploy.** As AGENTS.md "Trying it on the live instance" says: `P=$(kubectl -n cloud get pod -l app.kubernetes.io/name=nextcloud -o name | head -1)`, then `tar -C . --exclude=node_modules --exclude=vendor --exclude=.git --exclude=.superpowers --exclude=.signing --exclude='*.map' --exclude=./docs -cf - . | kubectl -n cloud exec -i $P -c nextcloud -- tar -C /var/www/html/custom_apps/plantuml -xf -`, then `chown -R www-data:www-data` on the app folder. Compare the md5 sums of this build's `dist/plantuml-*.js dist/chunks/*.js` only (the pod keeps stale hashed chunks; maps are excluded). In the pod: `occ` commands only; never Behat, psalm or cs-fixer.
2. **Drive the browser with selenium-flow's own skills.** Read them from the selenium-flow MCP server before the first call, and follow them:
   - `skill://selenium-flow/SKILL.md`: workspaces, the five rules, every tool;
   - `skill://selenium-flow/references/SECRETS.md`: typing a password you never see;
   - `skill://selenium-flow/references/SITE_DATA.md`: staying signed in across browsers;
   - `skill://selenium-flow/references/INTERACTION.md`: clicks, hovers, keys, dialogs;
   - `skill://selenium-flow/references/READING_PAGES.md`: `extract` and `outline` before screenshots;
   - `skill://selenium-flow/references/TROUBLESHOOTING.md`: a timeout, an empty screenshot, a click that did nothing;
   - `skill://selenium-flow/references/WORKSPACES.md`: the shared workspace.
3. **Sign in with the `grafana` secret.** selenium-flow's secret `grafana` (keys `username`, `password`) is the `selenium` LDAP service account, which is a Nextcloud user too: the secret allows the Nextcloud site as well as Grafana (`secret://secrets` lists its allowed URLs, which is where the instance's address comes from; never write the address into a file). Open the Nextcloud login page, `write` the `username` and `password` keys of `grafana` into `#user` and `#password` (`submit: true` on the password), confirm the Dashboard loaded, then `save_site_data()`. Never put a password in `text`, and never read the secret any other way.
4. **What the account can and cannot do.** `selenium` is a plain user, not an admin. Nothing in this round needs an admin.
5. **Known quirks** from earlier rounds:
   - The `claudecode` workspace is one browser shared by every Claude session; take it only for this check, and `end_browser()` when done, failures included.
   - `press_key` without a selector types into the page body, not the editor: aim keys at `{"css": ".cm-content"}` after clicking into a line's text.
   - A hover card or a completion list needs a moment (the hover delay is 500 ms): check with `execute_script` for `.cm-tooltip-hover` / `.cm-tooltip-autocomplete` rather than an early screenshot.
   - Selenium's `double_click` spaces its presses about 33 ms apart, so both land on a Files row before the Viewer exists, and two flow steps are too far apart for a `detail` of 2. A person's double-click on a row cannot be replayed: check VW14 on the Viewer itself (step 7 of Task 9).
   - The dark theme: `PUT /ocs/v2.php/apps/theming/api/v1/theme/dark/enable` from the page (with `requesttoken` and `OCS-APIREQUEST`), and `DELETE …/theme/dark` afterwards to restore it.
   - Work in a scratch folder of the `selenium` user's own files (made over WebDAV from the page), and delete it afterwards, trash included.
6. **Record it.** Screenshots go to `workspace://files/screenshots`; the report lists each behaviour checked with pass or fail, the screenshot links, anything outstanding and why.

### Probes first (on main, before Task 8)

The live instance runs main until Task 9 deploys, so these read today's behaviour. Run them as soon as the round starts; Task 8 waits for their answers, and writes them into `.superpowers/sdd/2026-10-18-polish-round/probes.md`.

- **P1, the focus on close (O3, sweep #3).** Open a scratch `.puml` in the editor three ways: the Viewer's Edit; the row's ⋯ menu → Edit diagram; + New → New puml File. Close each with ×, then read `document.activeElement` (`tagName`, `className`, its `data-cy-*` attributes, `=== document.body`). Also read the attributes Files 34 puts on that file's row and its name link (`data-cy-files-list-row-fileid`, `data-cy-files-list-row-name`, `data-cy-files-list-row-name-link` expected; record what is really there) and on the list (`data-cy-files-list`).
- **P2, the bar at phone width (L10, sweep #9).** `resize` to 360 × 740, open the editor on a scratch file, and read `getBoundingClientRect()` of every child of `.plantuml-editor__bar` against `innerWidth`: once saved, once with a status line, and once in a conflict (change the file over WebDAV from the page while the editor holds an unsaved change). Repeat at 390. Record which control's right edge passes `innerWidth`.

---

## File Structure

| File | Does |
|---|---|
| `src/editor/linked/sheet.js` | Task 1: the style file's completion sources gain `values`. |
| `src/editor/theme.js` | Task 1: the linked path's look (R10). |
| `src/viewer/wall-layout.js`, `src/viewer/diagram-view.js`, `css/viewer.css` | Task 2: `pack()`'s used columns and column width; the card click gone; the centred grid; the opaque stage. |
| `src/editor/add/types.js`, `catalog.js`, `modal.js`, `src/editor/data/templates.json`, `css/editor.css` | Task 3: descriptions in words; the card kept off the dialog. |
| `src/editor/lexicon/rules.js`, `src/editor/plantuml-mode.js` | Task 4: the element kinds, the archimate rule, the line-start words. |
| `src/viewer/diagram-view.js`, `src/viewer/menu.js`, `css/viewer.css` | Task 5: the double-click guard, the export line's end, the unread file's words, the menu inside the window, the focus ring. |
| `src/viewer/sheets.js`, `src/viewer/diagram-view.js`, `src/open-editor.js` | Task 6: failures asked again, problems read as text, Edit after the editor loads. |
| `src/editor.js` | Task 7: the bar's focus hand-over; Add's failed load said. |
| `src/editor.js`, `css/editor.css` | Task 8 (gated): the focus on close; the bar at phone width. |
| `CHANGELOG.md`, both specs | Task 9. |

---

### Task 1: A linked style file is a style file, and its paths are links (R12, R10) — Haiku

**Files:** Modify `src/editor/linked/sheet.js`, `src/editor/theme.js`; Test `tests/js/style-sheet.test.js`, `tests/js/theme.test.js`, `tests/js/chips.test.js`.

**Interfaces — Produces:** `sheetExtension(profile)` registers `[...profile.completions, colors, values]` (each through `withDocs`, as now). `surfaceRules` gains `'.cm-plantuml-link, .cm-plantuml-link *'` and narrows the Ctrl rule to the pointer.

- [ ] **Step 1: Failing tests.** In `style-sheet.test.js`, beside "completes a named colour":
  - `it('lists a property\'s values on an explicit request, as inside <style> (R12, W1)')`: `labels(await sheet('root {\n  FontStyle bold\n}'), <pos inside bold>)` contains `'bold'`, `'plain'`, `'italic'`, `'underline'`, `'strike'`, `'wave'`.
  - `it('opens the list from a value\'s pencil, the value selected (R12, W1)')`: an `EditorView` of `sheetExtension(profile)` plus `valueWidgets`, cursor in `bold`; a click on `.cm-plantuml-chooser` → `currentCompletions(view.state)` labels start `['bold', 'plain', …]` and `selectedCompletion` is `bold`. A second case: `FontColor red`, `startCompletion(view)` → the colour list, non-empty.
  In `theme.test.js`: `it('underlines a linked path always, in the primary colour, and gives it the hand only while Ctrl is held (R10)')`: `surfaceRules['.cm-plantuml-link, .cm-plantuml-link *']` has `color` and `textDecorationColor` `'var(--color-primary-element)'`, `textDecoration: 'underline'` and no `cursor`; `surfaceRules['&.cm-plantuml-ctrl .cm-plantuml-link:hover, &.cm-plantuml-ctrl .cm-plantuml-link:hover *']` equals `{ cursor: 'pointer' }`. Update the `it.each` row "a linked file's chip, and its path while Ctrl is held" to list both selectors.
  In `chips.test.js`, keep 'opens the file on a Ctrl+click on its path' and add `it('marks a linked path whether or not Ctrl is held (R10)')`: the path's text sits in a `.cm-plantuml-link` with no key pressed.
- [ ] **Step 2:** `npx vitest run tests/js/style-sheet.test.js tests/js/theme.test.js tests/js/chips.test.js` FAILS on those (empty list, missing rule).
- [ ] **Step 3: Implement.** Import `values` from `../completion/values.js` in `sheet.js` (core modules only, no chunk); split the R10 theme rule as the test says.
- [ ] **Step 4:** the three files pass, then `npx vitest run`; `npm run build`, the guard, both sizes. Commit `Linked files: a style file's pencils open their lists, and its paths always read as links`.

### Task 2: The Wall: no card click, centred columns, an opaque stage (VW5, VW12) — Sonnet

**Files:** Modify `src/viewer/wall-layout.js`, `src/viewer/diagram-view.js` (`card()`, `arrange()`), `css/viewer.css` (`.plantuml-viewer__stage--wall`); Test `tests/js/viewer/wall-layout.test.js`, `tests/js/viewer/diagram-view.test.js`.

**Interfaces — Produces:** `pack(items, options)` returns `{ columns: number, used: number, columnWidth: number, placements }`: `used` is the highest `column + span` over the placements, at least 1; `columnWidth` is the `(width − (columns − 1) × gap) / columns` it already computes. Placements and scales are unchanged. The stage gets `--plantuml-wall-columns: <used>` and `--plantuml-wall-column: <columnWidth>px`.

- [ ] **Step 1: Failing tests.**
  - `wall-layout.test.js`: `it('says how many columns the cards use, and how wide a column is')`: four `{ width: 200, height: 150 }` at `{ width: 1863 }` → `columns: 7`, `used: 4`, `columnWidth: (1863 - 6 * 16) / 7`; a card that spans the whole wall → `used === columns`; `[null, null, null]` at the same width → `used: 3`. In "the Wall's CSS": `.plantuml-viewer__stage--wall` has `grid-template-columns: repeat(var(--plantuml-wall-columns, 1), var(--plantuml-wall-column, minmax(0, 1fr)));`, `justify-content: safe center;` and `background: #000;`.
  - `diagram-view.test.js`: rename 'opens a Wall card in Tabs on a click outside its checkbox' to `it('stays in the Wall on a click on a card outside its checkbox (VW5)')`: mode stays `wall`, no tab bar. Beside 'places every card at once, in file order, while no size is known': the stage's `--plantuml-wall-columns` is `'3'` for three waiting cards on the 1232 px stage and `--plantuml-wall-column` is `'233.6px'`. Update the `'5'` expectations at the cases near lines 603 and 910 to the columns those cards use; the `'2'`/`'3'` ones that fill the wall stay.
- [ ] **Step 2:** the two files FAIL (no `used`, the click still switches).
- [ ] **Step 3: Implement.** Remove the card's click listener (the caption's own label click still checks the box); `arrange()` sets the two properties from `pack()`; the CSS as the test pins. The packer keeps measuring the whole stage (spec ruling); `scrollbar-gutter` is unchanged.
- [ ] **Step 4:** `npx vitest run`; build, guard, sizes. Commit `Wall: a card's click does nothing, the used columns sit centred, and the stage hides the Files page`.

### Task 3: Add diagram describes in words, and its card stays off the dialog (A8, A3) — Haiku

**Files:** Modify `src/editor/add/types.js`, `src/editor/add/catalog.js`, `src/editor/data/templates.json`, `src/editor/add/modal.js` (`place()`); Test `tests/js/add-catalog.test.js`, `tests/js/add-data.test.js`, `tests/js/add-modal.test.js`.

**Interfaces — Produces:** `TYPES: { type, name, icon, description }[]`. `builtins()` gives Empty `description: 'Just the start and end lines'` and Example its type's `description`; `firstLine` is removed.

Exact copy. `types.js` `description`, in A6's order: uml "Classes, sequences, states and more"; bpm "Business process steps and branches"; board "Cards under column headings"; chart "Bar, line and area charts"; chen "Entities, attributes and relationships, Chen style"; creole "Formatted text, lists and tables"; dot "Graphviz graph of nodes and edges"; ditaa "ASCII art drawn as boxes"; ebnf "Grammar rules as railroad diagrams"; files "Folders and files as a tree"; flow "Boxes and the links between them"; gantt "Tasks and milestones on a timeline"; git "Commits and branches of a history"; hcl "HCL configuration drawn as a tree"; json "JSON data drawn as a tree"; latex "A formula typeset with LaTeX"; math "A formula written in AsciiMath"; mindmap "Ideas branching from one topic"; project "A project's tasks on a timeline"; regex "A regular expression as a railroad diagram"; salt "Wireframe of windows, buttons and fields"; sprites "Small pictures drawn pixel by pixel"; wbs "Work broken down into a tree"; wire "Components wired together on a grid"; yaml "YAML data drawn as a tree"; nwdiag "Networks and the servers on them"; packetdiag "A packet's fields, bit by bit". `templates.json`: Sequence "Messages between participants over time", Deployment "Machines and what runs on them", Object "Objects and their links at one moment", Timing "Each participant's state over time"; the other five unchanged.

- [ ] **Step 1: Failing tests.**
  - `add-catalog.test.js`, 'names Empty and Example by the type\'s word and describes them as the board does' → Empty `description: 'Just the start and end lines'`, Example `description: TYPES.find((t) => t.type === 'uml').description`.
  - `add-data.test.js`: `it('describes every built-in in words, never its code (A8)')` over `builtins(own, { BRACED })` with the real `own.json`: length `27 * 2 + 9`; each description has 3 to 8 words, starts `/^[A-Z]/`, and does not match `/[{}[\]();=*:/<>@$#^]/` (the assertion message names the type and title). And `it('describes each type as the spec\'s table does')`: the 27 strings above, by type.
  - `add-modal.test.js`: `it('narrows the card to the room right of the dialog rather than lie over it (A3)')`: `innerWidth` 1432, the dialog's rect right 1156 → the card's `style.maxWidth` `'252px'` and `style.left` `'1172px'`; with the dialog's right at 1300 (room 108) → `style.maxWidth` `''` and the clamp as today.
- [ ] **Step 2:** FAIL. **Step 3:** implement; `place()` sets `maxWidth` before it reads `offsetWidth`.
- [ ] **Step 4:** `npx vitest run`; build, guard, sizes. Commit `Add diagram: every built-in is described in words, and the text card keeps off the dialog`.

### Task 4: Every element type and line-start word is a keyword (T1, H15, H24) — Sonnet

**Files:** Modify `src/editor/lexicon/rules.js` (`elements`, `declarations`), `src/editor/plantuml-mode.js` (`lineKeywords`, the condition rule, the two note rules); Test `tests/js/plantuml-mode.test.js`, `tests/js/hover.test.js`.

**Interfaces — Produces:** `elements` adds `action`, `analog`, `dataclass`, `exception`, `metaclass`, `process`, `record`. `declarations` gains, first, the archimate rule of investigate-code.md §1 "Smallest fix" (14 groups, 14 tokens: `null, 'keyword', null, 'ColorLiteral', null, ...declaredTokens, 'string', 'tagName', null, null, 'keyword', null, 'typeName'`). `lineKeywords` adds `archimate`, `packetdiag`, `partition`, `left\s+to\s+right\s+direction`, `top\s+to\s+bottom\s+direction`, `allowmixing`, `allow_mixing`, `kill`, `skin`, `end(?:fork|merge|legend|title|header|footer|caption)`. The condition rule reads `repeat[ \t]*while`; both note rules take `(?:floating\s+)?` before `[hr]?note`.

- [ ] **Step 1: Failing tests** in `plantuml-mode.test.js`, under 'declarations and class bodies (H15, H17)':
  - `it('reads an archimate element: the keyword, its layer colour, then the name or alias (T1, H15)')` with the two expectations of investigate-code.md §1 "Tests that pin it", verbatim.
  - `it.each(language.types.filter((type) => type !== 'relationship'))('names the element type %s a keyword at a line\'s start (H24)')`: `tokens(\`${type} Foo\`)[0]` equals `[type, 'keyword']`, `language` imported from `../../src/editor/data/language-words.json`.
  - `it.each([...])('reads %s at a line\'s start as a keyword (H24)')` over `partition Checkout`, `left to right direction`, `top to bottom direction`, `allowmixing`, `allow_mixing`, `kill`, `skin rose`, `packetdiag {`, `endfork`, `endmerge`, `endlegend`, `endtitle`, `endheader`, `endfooter`, `endcaption`: the first token is the keyword word or phrase.
  - `it('reads floating note as a note, and repeatwhile with its condition (H24)')`: `tokens('floating note left: hi')[0]` is `['floating note', 'keyword']`; `tokens('repeatwhile (more)').slice(0, 2)` is `[['repeatwhile', 'keyword'], ['(', 'paren']]`.
  - Review Focus 4: `it('keeps a new kind plain where it starts a message (H15)')`: `tokens('process -> Bob : go')` equals `[['->', 'LinkOperator'], ['go', 'labelName']]`.
  In `hover.test.js`: `key(['archimate #Business customer'], 'archimate')` is `'keyword:archimate'` and `key(['partition Checkout {'], 'partition')` is `'keyword:partition'` (with those entries in the suite's docs fixture).
- [ ] **Step 2:** FAIL (ten types plain, the archimate line wrong).
- [ ] **Step 3: Implement.** Must stay green unchanged: `values.test.js` (no pencil on `archimate #Business "x" as a`), `completion.test.js` (`archimate #|`), `profiles.test.js`, `dictionary.test.js`.
- [ ] **Step 4:** `npx vitest run`; build, guard, sizes. Commit `Grammar: archimate and every element type the server knows are keywords, with the line-start words that were missed`.

### Task 5: The Viewer's small fixes (VW14, VW6, VW1, VW2) — Sonnet

**Files:** Modify `src/viewer/diagram-view.js` (the root's listeners, `show()`, the box's change, the read failure), `src/viewer/menu.js` (`open()`), `css/viewer.css`; Test `tests/js/viewer/diagram-view.test.js`, `tests/js/viewer/menu.test.js`, `tests/js/viewer/toolbar.test.js`.

**Interfaces — Produces:** a `mousedown` listener on the view's root that calls `preventDefault()` when `event.detail > 1`, nothing else; `say('')` from `show()` and the box's `change`; the menu's left edge kept inside the window by a private `keepInside()` called from `open()`; one viewer.css rule `.plantuml-viewer .plantuml-viewer__head button:not(:disabled):focus-visible { outline: 2px solid var(--color-primary-element) !important; box-shadow: none !important; }`, the toolbar button's own `outline` line removed, and `outline-offset: -2px` on the menu rows.

- [ ] **Step 1: Failing tests.**
  - `diagram-view.test.js`: `it('starts no selection on a second press, and leaves a first press alone (VW14)')`: a `MouseEvent('mousedown', { detail: 2, bubbles: true, cancelable: true })` on the Tabs sheet and on a Wall card is `defaultPrevented`; `detail: 1` is not. `it('still checks a box whose second press was prevented (VW14)')`: a detail-2 mousedown, then `click()` on the checkbox → checked. `it('clears a failed export\'s line on a change of mode, of tab, or a check (VW6)')`. Rename 'says it could not draw when the file cannot be read, and is ready' to `it('says it could not open the file when the file cannot be read, and is ready (VW1)')`, expecting "Could not open the file".
  - `menu.test.js`: `it('moves left to keep its right edge 8 px inside the window, never past 8 px from its left (VW6)')`: `innerWidth` 390, the anchor's `offsetLeft` 200, the menu's rect `{ left: 200, right: 460 }` → `style.left` `'122px'`; rect `{ left: 100, right: 460 }` at `innerWidth` 300 → `style.left` is `offsetLeft − 92`, i.e. `'108px'`; a menu that fits keeps `'200px'`.
  - `toolbar.test.js`: `describe('the Viewer\'s focus ring (VW2)')` reading `css/viewer.css` as `add-menu.test.js` reads editor.css: the shared rule exists with that selector and both `!important` lines; and `it('leaves no button an outline of the app\'s that core\'s !important one would beat')` as the editor's test does, over viewer.css.
- [ ] **Step 2:** FAIL. **Step 3:** implement. The guard goes on the view's root only (the Viewer's bar and mask are Nextcloud's).
- [ ] **Step 4:** `npx vitest run`; build, guard, sizes. Commit `Viewer: a double-click selects nothing, the export line clears, the menu stays on screen and the focus ring is the app's`.

### Task 6: A failed sheet is asked again and read as text; Edit waits for the editor (VW10, VW1, VW7) — Sonnet

**Files:** Modify `src/viewer/sheets.js` (`settle()`, `draw()`), `src/open-editor.js`, `src/viewer/diagram-view.js` (`edit()`); Test `tests/js/viewer/sheets.test.js`, `tests/js/viewer/diagram-view.test.js`, `tests/js/open-editor.test.js`.

**Interfaces — Produces:** `export function ensureEditor(): Promise<void>` from `open-editor.js` (unchanged body, now exported; `openEditor` still uses it). A settled problem sheet has no `role` and no `aria-label`; a drawn one has `role="img"` and `aria-label` = `labelOf(position)`, restored after a retry. A failure of the Rulings' kind deletes the position from `started` once settled.

- [ ] **Step 1: Failing tests.**
  - `sheets.test.js`: `it('asks again, when next asked, for a sheet that got no answer or a 5xx (VW10)')`: a rejected fetch, then a 503; each time `request(1)` again → a second fetch, and a 200 then draws it. `it('never asks again for the route\'s own refusal (VW10)')`: a 404 `{"problem":"no image for three"}` and a 413 → `request(1)` again asks nothing. `it('asks nothing again by itself after a failure (VW10)')`: after the failure, `vi.advanceTimersByTimeAsync(5000)` and a re-dispatched settled event → still one fetch (Review Focus 1). `it('reads a problem as text, not as an image (VW1)')`: no `role`, no `aria-label`, the text is the problem; after a retried success, `role` `img` and the label are back. 'keeps no failure' stays green.
  - `diagram-view.test.js` (the mock gains `ensureEditor: seams.ensureEditor`): `it('closes the Viewer only once the editor has loaded (VW7)')`: with `ensureEditor` pending, Edit → `Viewer.close` not called; resolved → called, then `openEditor` with the diagram. `it('stays as it was and says so when the editor will not load, and the next Edit tries again (VW7)')`: rejected → no close, the notice reads "Could not open the editor", the mode and checks unchanged; the next Edit calls `ensureEditor` again. `it('does nothing on a second Edit while the editor loads (VW7)')`. `it('describes a disabled box by its sheet\'s problem (VW1)')`: the element `aria-describedby` names has the problem's text and no `role`. The three existing Edit tests await the load.
  - `open-editor.test.js`: `it('exports the one bundle loader, which loads once')`: two `ensureEditor()` calls append one script.
- [ ] **Step 2:** FAIL. **Step 3:** implement; `edit()` keeps a `editing` flag for the second press.
- [ ] **Step 4:** `npx vitest run`; build, guard, sizes. Commit `Viewer: a failed drawing is asked again when wanted and read as text, and Edit keeps the Viewer until the editor has loaded`.

### Task 7: The bar hands on the focus, and a failed Add says so (L9, A1) — Sonnet

**Files:** Modify `src/editor.js` (`showButtons()`, `withAdd()`); Test `tests/js/editor.test.js`.

**Interfaces — Produces:** a private `handOn(leaving: HTMLButtonElement[])` in `editor.js`, called at the top of `showButtons()` with the buttons about to be hidden or disabled: when `document.activeElement` is one of them, it focuses the source (`view.focus()`) if the source is shown, else Save if shown, else close. `withAdd`'s rejection also calls `main?.session.say(t(APP_ID, 'Could not open Add diagram'))`.

- [ ] **Step 1: Failing tests**, `describe('the focus in the bar (L9)')`:
  - `it('hands the focus to the source when Refresh, focused, is disabled while it reloads')`: `loadFile` held by `deferred()`; focus Refresh, click → `view().contentDOM.contains(document.activeElement)`.
  - `it('hands it to the source when Ctrl+S is pressed on a focused Refresh')`: a held `saveFile`.
  - `it('hands it to the source when Reload or Save as copy, focused, goes as the conflict clears')`: through `conflict()`, each button in turn.
  - `it('hands it to Save when the source is hidden')`: toggle the source off first (Review Focus 5).
  - `it('leaves the focus on a button that stays usable')`: Save, focused and clicked, keeps it.
  - Extend 'tries the chunk again after it failed to load: the next click opens the menu' (last in the file): after the failure, `status()` is "Could not open Add diagram".
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npx vitest run`; build, guard, sizes. Commit `Editor: a bar button that goes hands the focus on, and a failed Add diagram says so`.

### Task 8 (gated on P1 and P2): The focus on close, and the bar at phone width (O3, L10) — Sonnet

**Files:** Modify `src/editor.js` (`close()`), `css/editor.css`; Test `tests/js/editor.test.js`, new `tests/js/editor-css.test.js`.

Read `probes.md` first. Each half runs only if its probe found the fault; a half whose probe passed is recorded in `probes.md` and in the final report as already true, and its spec row is marked shipped in Task 9 with "(already true, probed 2026-10-18)".

**Interfaces — Produces (O3 half):** a private `returnFocus(opener, node)` in `editor.js`, called last in `close()`: the opener when `opener?.isConnected` and `opener.checkVisibility?.() !== false`; else the name link of the file's row (by `node.fileid` when known, else by `node.basename`, through the attributes P1 recorded); else the first row name link in the Files list; never `document.body`.

- [ ] **Step 1 (O3, only if P1 found the body):** failing tests: `it('returns the focus to the file\'s row when what opened the editor is gone (O3)')`: the opener button removed before close; a fake Files row with P1's attributes → the focus is on its name link; with no row, on the list's first name link; with an opener still there, on the opener (the existing 'saves a change on Escape, then closes back to where it was opened' stays green).
- [ ] **Step 2:** FAIL; implement `returnFocus`; PASS.
- [ ] **Step 3 (L10, only if P2 found a control past the window):** failing tests in `editor-css.test.js`, reading `css/editor.css` with the comment-stripping parser of `add-menu.test.js`: `.plantuml-editor__status` has `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`; `.plantuml-editor__name` has `min-width: 0`; the bar's buttons have `flex-shrink: 0`. **Only if P2's conflict state still overflowed once those are in** (re-measure live, or by the arithmetic in sweep #9): an `@media (max-width: 600px)` block where `.plantuml-editor__bar` has `flex-wrap: wrap`, `height: auto`, `min-height: 50px`; `.plantuml-editor__bar::after` has `content: ''`, `order: 1`, `flex-basis: 100%`; the status, Reload and Save as copy have `order: 2`. Test those declarations too.
- [ ] **Step 4:** FAIL; implement; PASS. `npx vitest run`; build, guard, sizes. Commit `Editor: closing returns the focus to the file's row when its opener is gone, and the bar fits a phone` (name only the halves that ran).

### Task 9: Docs, deploy and the live check — Sonnet

The deploy and the browser check follow **Live verification** at the top of this plan, step by step: selenium-flow's skills from `skill://selenium-flow/SKILL.md` and its references, sign-in with its `grafana` secret (valid for Nextcloud). The check is not done until every behaviour below is passed or recorded as outstanding with its reason.

**Files:** `CHANGELOG.md`, `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`, `docs/superpowers/specs/2026-10-14-editor-design.md`.

- [ ] **Step 1: Docs.** `CHANGELOG.md`, Unreleased: under Fixed, one plain line each for the style file's pencils, the Wall's centring, the Viewer's double-click, the keywords, focus never falling to the page, a failed drawing asked again; under Changed, the Wall card's click, linked paths always underlined, the template descriptions.
- [ ] **Step 2: Spec status.** Every "agreed (polish round)" in both specs becomes "shipped (polish round, 2026-10-18)" (or Task 8's "already true" wording). Check: `grep -c "agreed (polish round)" docs/superpowers/specs/*.md` → 0 for each.
- [ ] **Step 3: Run everything.** `npx vitest run && npm run lint && npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js && gzip -c dist/plantuml-files.js | wc -c && gzip -c dist/plantuml-editor.js | wc -c` → green, ≤ 106000 and < 246530. Commit `Docs: the polish round shipped`.
- [ ] **Step 4: Deploy** as Live verification step 1.
- [ ] **Step 5: Live check**, in light, and dark where a colour is involved:
  1. A `.puml` with `<style file=look.css>`: open `look.css` from its chip; the pencil after `FontStyle bold` opens bold, plain, italic, …; Ctrl-Space in `bold` too; the colour pencil on `FontColor red` opens the colours (R12).
  2. The `look.css` path in the main file is underlined in the primary colour with no key held; with Ctrl held the pointer is a hand; Ctrl+click opens it (a modified click as INTERACTION.md describes); a plain click only places the cursor (R10).
  3. Wall at 1920 px with 4 diagrams: the cards' left and right gaps equal within the gutter's 15 px; with 10 diagrams as before; a card click stays in the Wall; no Files text visible between cards in a screenshot (VW5, VW12).
  4. Add diagram at 1440 px: every built-in's description is words; hovering Use case shows its card right of the dialog, not over it (A8, A3).
  5. `archimate #Technology "VPN Server" as vpnServerA <<technology-device>>`: `archimate` blue, the alias moss; hovering `archimate` opens its card; `left to right direction` in the Use case template blue (H15, H24).
  6. The Viewer: at 390 and 360 px the Export menu is whole inside the window; a refused export's line goes on a mode change; Tab through the toolbar, tabs, "All diagrams" and both menus shows the app's ring, not core's (VW6, VW2).
  7. VW14, as investigate-live.md Bug 2's table: open the Viewer, then `double_click` on the Tabs stage (it selected `hi` on main) and on a Wall card (it selected `A`): `getSelection().toString()` is `''` both times; a drag across a diagram's text still selects it. In the editor, `double_click` on a word of the source selects that word (K3).
  8. A failed drawing: hold `/render` with a fetch wrapper answering 503 once, then let it through; switching tabs away and back draws it (VW10). Edit from the Viewer with the editor bundle blocked once (a wrapper failing the script): the Viewer stays and says "Could not open the editor" (VW7).
  9. The editor bar: focus Refresh and press Enter, then read `document.activeElement` (the source); with the source hidden, Save (L9).
  10. P1 and P2 again on the new build, for whichever halves Task 8 ran (O3, L10).
  `end_browser` when done; delete the scratch folder and purge it from the trash.
- [ ] **Step 6: Penpot.** The board `screens / viewer-wall`'s card-to-Tabs prototype link and `screens / linked-ctrl`'s Ctrl-only state are now stale. Through `skill://penpot/penpot-router/SKILL.md` (the kb MCP), remove the Wall card's link and note on `linked-ctrl` that the path is always underlined; if Penpot cannot be reached, record it outstanding for Dr K.
