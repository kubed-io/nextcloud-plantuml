# Viewer Polish Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Viewer shows a spinner on each sheet until it is drawn, draws a Stack or Wall only as it scrolls into view, keeps what it drew for the Files page, steps to the previous and next `.puml`, and fixes what the viewer round's live check and final review left open.

**Architecture:** `src/viewer/sheets.js` stops drawing a sheet the moment it is made: a sheet starts as a placeholder with the spinner and is drawn only once `request()`ed, at most 3 at a time, the lowest position waiting first. `diagram-view.js` asks for the open tab in Tabs, and in Stack and Wall for the cards an `IntersectionObserver` on the scrolling stage reports within one stage height; a hidden view asks for nothing. A new `src/viewer/page-cache.js` keeps the server's SVG text and drawn size per file path + WebDAV ETag + index for the page, and every kept drawing still goes through `toInlineSvg` with the view's prefix. B1's `drawn` moves into the JS scan through the shared fixture; the PHP twin learns JavaScript's `.`; export names keep the joiners and are capped at 200 bytes.

**Tech Stack:** PHP 8.4 (Nextcloud 34 OCP, PHPUnit), plain ES modules in the IIFE Files bundle (Vite 8 / Rolldown), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (the Viewer section, VW1–VW11, VW9–VW11 added by Task 1; the `GET /apps/plantuml/export` routes row; the `viewer-component.js` units row) and `docs/superpowers/specs/2026-10-14-editor-design.md` (B1). Dr K approved this round's design in chat on 2026-10-17. Task 1 writes it into the spec as agreed; Task 11 flips it to shipped.

**Built with (kb MCP skills):** `skill://superpowers/writing-plans/SKILL.md` and `skill://superpowers/test-driven-development/SKILL.md` were asked for. The kb MCP server was not connected in the planning session (no MCP resource tool, and its HTTP endpoint answers 401 without the OAuth sign-in), so the same-named skills of the superpowers plugin were followed instead (`superpowers:writing-plans`, `superpowers:test-driven-development`). The executor reads the selenium-flow skills named in **Live verification** from the selenium-flow MCP server itself. Every code block below was run on a scratch copy of `main` (f6cbe33) while planning: all PHP and JS suites, eslint, cs-fixer and psalm green, the Files bundle 98377 bytes gzipped.

## Global Constraints

- Work on a branch `viewer-polish-round` in its own worktree, cut from `main` (f6cbe33 or later); never on `main`. The open branch `linked-files-round` (ca1c83e, `POST /render` overrides) touches none of this round's files.
- `.feature` files: Dr K approved edits this round only for removing `@unbuilt`, and no scenario of this round carries it, so no `.feature` file changes. None of this round is API-visible except the export names, which no scenario pins past 200 bytes or with a joiner. A new scenario is proposed in the final report, never written.
- Behat runs in CI only, never in the code-server pod or the Nextcloud pod; locally run `tests/integration/bin/check-step-definitions.sh`, `check-suites.sh` and `check-notes-anchors.sh`.
- The maintainer is **Dr K**; SPDX headers say `kubed-io`; fixture users are `drk`; no homelab hostnames in any file.
- PHP: `declare(strict_types=1)`, tabs, `final` classes.
- The Viewer component stays a Vue 2 options object drawn with `render(h)` that imports no Vue. Viewer stable34 mounts the previous and next files' components hidden and without `active`; the view is built only once `active` is true, and is told `setActive(false)` while hidden.
- Viewer stable34's handler contract (its `viewer-main.mjs` on the live pod, read 2026-10-17): `registerHandler({ id, group, mimes, component })`; `registerGroups({ mime, group })` lists each mime under its group, and on open the Viewer fetches the file's folder only when the mime has a group (and the Viewer is not mounted in an element), keeping the entries whose mime is in that group. Images and videos share the group `media`; this app's group is its own, `plantuml`.
- Copy: no new strings. Only the existing ones, through `t(APP_ID, …)` / `n(APP_ID, …)`: "Tabs", "Stack", "Wall", "Export", "Export all", "Export %n", "Edit", "SVG", "PNG", "PDF", "EPS", "ASCII art", "%n diagrams, as .zip", "Could not draw the diagram", "Could not export the diagram", "Diagram toolbar". The spinner has no words; `aria-busy` says it.
- Every SVG on a sheet still comes through `toInlineSvg(svgText, { idPrefix: `${view prefix}${position}-` })`, a drawing from the page cache included: the cache keeps the server's text, never an element.
- The Wall keeps its layout and order (flex-wrap, file order). A later task, being researched now, packs it by size; this round records each sheet's drawn size for it: `sheets.sizeOf(position)`, the `plantuml-viewer:settled` event's `detail.size`, and the cache entry's `size`, each `{ width, height }` in CSS pixels or `null`.
- Design values (Penpot boards, as the viewer round read them): the card checkbox is 14 px, radius 4, `--color-primary-element` when checked; Stack cards are 720 px wide with the diagram centred in its sheet (`docs/design/viewer-stack.png`).
- The spinner is core's `icon-loading` look, read off the live pod's `core/css/server.css` and `apps/theming/lib/Themes/*.php` on 2026-10-17: a ring `2px solid var(--color-loading-light)`, its top `var(--color-loading-dark)`, round, turning in 0.8 s linear, `filter: var(--background-invert-if-dark)`. Light theme `#cccccc`/`#444444`; dark `#777`/`#CCC` inverted, so it reads dark on the always-white sheet in both. Drawn at 44 px.
- Budgets: the Files bundle stays at most 106000 bytes gzipped (97538 on `main`; 98377 with this plan's code). CI's chunk guard stays green: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`.
- Commands: `composer run test:unit`, `composer run lint && composer run cs:check && composer run psalm`, `npx vitest run`, `npm run lint`, `npm run build`. Psalm and cs-fixer run in the code-server pod, never in the Nextcloud pod.
- Commit messages: `<Area>: <one plain sentence>`, ending with the session's attribution line.
- Line numbers in **Files** are `main`'s (f6cbe33). Earlier tasks shift them: find the anchor text each step quotes.

## Review Focus

1. **A file changed between two opens** (edited, then opened again on the same page): its new ETag finds no kept drawing, so nothing stale is shown. Tests: Task 6 ("asks again once the file has a new ETag"), Task 6's view-level "asks again for a file changed since".
2. **Arrowing between files in a folder**: the hidden neighbour asks for no drawing while hidden and goes on where it was once shown again; going back to a file draws from memory. Tests: Task 7 ("asks for nothing more while the view is hidden…"), Task 6 ("draws a file opened again from memory").
3. **A 40-diagram Stack scrolled fast to the bottom**: the cards passed over before their turn are not drawn; at most 3 requests in flight. Tests: Task 7 ("lets a card go that scrolled away before its turn", "asks only for the cards near what is in view…").
4. **A Persian, emoji or very long name** exported in a zip: the joiners stay, every entry fits 255 bytes with its ` (n)` and extension. Tests: Task 4.
5. **A page that draws many large diagrams**: the cache stays bounded by count and by characters, least recently used first. Tests: Task 5.

## Rulings

Each as `Ruling: <what> — <why> — <cost if wrong>`.

- Ruling: `drawn` joins the JS scan (`src/editor/blocks.js`) and the shared fixture `tests/fixtures/diagrams/expected.json`, rather than being worked out in the Viewer — the rule "this diagram has no image" then lives once per language and the fixture holds the two to the same answer, as it does `render`; the Viewer would otherwise re-derive `render < images` from fields it does not have — every fixture row gains a field.
- Ruling: a line holding U+2028 or U+2029 opens no block and starts no page, in both scans: JavaScript's `.` stops at both, so the PHP twin's `START` and `NEWPAGE` use a `DOT` class that does too — the simplest agreement, and a name carrying a line separator is a mistake anyway — a diagram whose `@start` line carries one is not a tab of its own (PlantUML's own reading of such a line is untested).
- Ruling: the page cache keeps the server's SVG text and drawn size, at most 200 drawings and 32 MiB of text, least recently used first, and keeps nothing for a file read without an ETag — the text is what lets each view run `toInlineSvg` with its own prefix; the character bound keeps a page of huge diagrams from holding hundreds of MB — a few drawings fall out early on a page of very large diagrams.
- Ruling: a card that leaves the observer's margin before its request starts is let go (`sheets.release`), and every mode switch or hide clears what waits — the brief queues only what comes near the view; a card flown past is no longer near it — a card scrolled past and back is asked for again, once.
- Ruling: `rootMargin: '100%'` on every side, rooted at the stage — one stage height ahead and behind, and the Wall can be wider than its stage — none.
- Ruling: without `IntersectionObserver` (jsdom; no supported browser) Stack and Wall ask for every card, as before — a test environment without one keeps the old behaviour — none in a browser.
- Ruling: the spinner is the app's own CSS in core's look, not core's `icon-loading` class — that class also sets a `loading.gif` background on the element and draws its 32 px ring absolutely at the element's centre — a later change of core's look is not followed.
- Ruling: the loading sheet is 320 × 240 px (in Stack, the card's full width × 240 px) — the brief asks for a fixed placeholder height; 240 px is a typical small diagram's sheet — a page scrolls a little differently once drawn.
- Ruling: the card checkbox stays a native `<input type="checkbox">`, transparent, over a drawn `span.plantuml-viewer__check`; the tick is `check.svg`'s path as a CSS mask — native semantics and keys stay; an inline SVG's whitespace would enter the caption's text, which the existing tests read — none.
- Ruling: the Export menu prevents the default of a `pointerdown` anywhere in it but on an item (the heading and the menu's own padding) — either would move focus out of the menu to the Viewer — none.
- Ruling: names are cut to 200 bytes before the extension (`ExportController::MAX_STEM`), for the one-file download, each zip entry and the zip's own name; the 150-character label cap stays — 200 + ` (100)` + `.svg` is 210 bytes, under the 255 a file system allows, and the label cap keeps the file's name in the entry — a very long file name leaves less of the label.
- Ruling: the handler's group is `plantuml`, not `media` — `media` would put photos and videos among a `.puml`'s neighbours — none.
- Ruling: CHANGELOG — the Viewer is unreleased, so this round's fixes amend its `[Unreleased]` lines and add two, rather than listing fixes to a feature no release had — none.

---

## Live verification (required, however long it takes)

A green suite proves the repo, not the instance. This round is finished only when an agent has deployed it to the live Nextcloud and checked every user-visible behaviour of this round in a real browser. If the browser, the Grid or a sign-in is unavailable, the live check is recorded as outstanding in the ledger and the final report, never skipped; any later agent can pick it up from this section alone.

1. **Deploy.** As AGENTS.md "Trying it on the live instance" says: `P=$(kubectl -n cloud get pod -l app.kubernetes.io/name=nextcloud -o name | head -1)`, then `tar -C . --exclude=node_modules --exclude=vendor --exclude=.git --exclude=.superpowers --exclude=.signing --exclude='*.map' --exclude=./docs -cf - . | kubectl -n cloud exec -i $P -c nextcloud -- tar -C /var/www/html/custom_apps/plantuml -xf -`, then `chown -R www-data:www-data` on the app folder. Compare the md5 sums of this build's `dist/plantuml-*.js dist/chunks/*.js` only (the pod keeps stale hashed chunks; maps are excluded). In the pod: `php -l` on new PHP files and `occ` commands only; never Behat, psalm or cs-fixer.
1a. **Clear the route cache.** Right after the deploy, as CONTRIBUTING.md "Routes" says (the route table is cached in APCu inside the web server and can outlive its TTL, so a new or changed route answers 404): `kubectl -n cloud exec $P -c nextcloud -- apachectl -k graceful`. If the session's permission check refuses it, do not work around it (no other shell, no restart of the pod): record it as outstanding for Dr K in the ledger and the report, and note which checks it blocks.
2. **Drive the browser with selenium-flow's own skills.** Read them from the selenium-flow MCP server before the first call, and follow them:
   - `skill://selenium-flow/SKILL.md`: workspaces, the five rules, every tool;
   - `skill://selenium-flow/references/SECRETS.md`: typing a password you never see;
   - `skill://selenium-flow/references/SITE_DATA.md`: staying signed in across browsers;
   - `skill://selenium-flow/references/INTERACTION.md`: clicks, hovers, keys, dialogs;
   - `skill://selenium-flow/references/READING_PAGES.md`: `extract` and `outline` before screenshots;
   - `skill://selenium-flow/references/TROUBLESHOOTING.md`: a timeout, an empty screenshot, a click that did nothing;
   - `skill://selenium-flow/references/WORKSPACES.md`: the shared workspace.
3. **Sign in with the `grafana` secret.** selenium-flow's secret `grafana` (keys `username`, `password`) is the `selenium` LDAP service account, which is a Nextcloud user too: the secret allows the Nextcloud site as well as Grafana (`secret://secrets` lists its allowed URLs, which is where the instance's address comes from; never write the address into a file). Open the Nextcloud login page, `write` the `username` and `password` keys of `grafana` into `#user` and `#password` (`submit: true` on the password), confirm the Dashboard loaded, then `save_site_data()`. Never put a password in `text`, and never read the secret any other way.
4. **What the account can and cannot do.** `selenium` is a plain user, not an admin. Check admin-only behaviour through `occ` in the pod, or note it for Dr K. A share with download forbidden must come from another account (Dr K's); without one, that check is outstanding, not skipped.
5. **Known quirks** from earlier rounds:
   - The `claudecode` workspace is one browser shared by every Claude session; take it only for this check, and `end_browser()` when done, failures included.
   - `press_key` without a selector types into the page body, not the editor: aim keys at `{"css": ".cm-content"}` after clicking into a line's text.
   - A hover card or a completion list needs a moment (the hover delay is 500 ms): check with `execute_script` for `.cm-tooltip-hover` / `.cm-tooltip-autocomplete` rather than an early screenshot.
   - The dark theme: `PUT /ocs/v2.php/apps/theming/api/v1/theme/dark/enable` from the page (with `requesttoken` and `OCS-APIREQUEST`), and `DELETE …/theme/dark` afterwards to restore it.
   - Work in a scratch folder of the `selenium` user's own files (made over WebDAV from the page), and delete it afterwards.
6. **Record it.** Screenshots go to `workspace://files/screenshots`; the report lists each behaviour checked with pass or fail, the screenshot links, anything outstanding and why.

## File Structure

| File | Responsibility |
|---|---|
| `src/editor/blocks.js` (modify) | B1's scan gains `drawn`. |
| `lib/Service/Diagrams.php` (modify) | `DOT`, JavaScript's `.`, in `START` and `NEWPAGE`; `drawn` documented as shared. |
| `tests/fixtures/diagrams/expected.json`, `tests/fixtures/diagrams/line-separator.puml` (modify, create) | `drawn` on every row; the U+2028/U+2029 case. |
| `lib/Controller/ExportController.php` (modify) | `stem()`: names cut at 200 bytes; `safe()` keeps the joiners. |
| `src/viewer/page-cache.js` (create) | Drawings kept for the Files page: `sheetKey`, `createPageCache`, `pageCache`. |
| `src/viewer/sheets.js` (rewrite) | Placeholder with spinner; `request`/`release`/`clear`; the queue, lowest first; the page cache; `sizeOf`. |
| `src/viewer/diagram-view.js` (modify) | `want()`: what is on screen is asked for; `setActive`; the Export heading counts `drawn`; the drawn checkbox. |
| `src/viewer-component.js` (modify) | Tells the view when it is hidden or shown. |
| `src/viewer/menu.js` (modify) | A press outside the items keeps the focus. |
| `src/files.js` (modify) | The Viewer handler's `group`. |
| `css/viewer.css` (modify) | Spinner and loading sheet; checkbox; Stack centring; the tab strip shrinks. |
| `tests/js/helpers/intersection.js` (create) | A fake `IntersectionObserver` for jsdom. |
| `docs/superpowers/specs/…` , `CHANGELOG.md`, `AGENTS.md` (modify) | VW9–VW11 and the changed rows; the round's lines. |

---

### Task 1: The spec says what this round adds

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (the Viewer table, lines 313–322; the export routes row, line 189; the `viewer-component.js` units row, line 233; after the rulings paragraph, line 336)
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (B1, line 185)

**Interfaces:**
- Consumes: nothing.
- Produces: VW9, VW10, VW11 (status `agreed (viewer-polish round)`), which every later task cites; Task 11 flips them.

- [ ] **Step 1: Add VW9–VW11 after the VW8 row**

```markdown
| VW9 | **A sheet shows Nextcloud's loading spinner until its diagram lands**: core's `icon-loading` look (a ring in `--color-loading-light`, its arc in `--color-loading-dark`, a 0.8 s turn, the dark theme's filter) at 44 px, centred on the white sheet, which holds a fixed 320 × 240 px place (in Stack the card's width × 240 px) and is announced busy (`aria-busy`). A failure replaces it with the problem line, as VW1 says. In Tabs, Stack and Wall. | Dr K, 2026-10-17 | agreed (viewer-polish round) |
| VW10 | **Only what is on screen is drawn.** In Stack and Wall a card's diagram is asked for once the card comes within one stage height of the stage's visible part (an `IntersectionObserver` rooted at the scrolling stage, `rootMargin: 100%`), at most 3 requests at a time, the lowest position waiting first; a card that leaves before its turn is no longer asked for. Cards keep the placeholder's height, so the stage scrolls before they are drawn. Tabs asks only for the open tab. A view the Viewer keeps hidden beside the one shown asks for nothing until it is shown again. | Dr K, 2026-10-17 | agreed (viewer-polish round) |
| VW11 | **Drawn sheets are kept for the Files page**, by the file's path, the WebDAV ETag the Viewer read it with and the diagram's 0-based place: switching modes, reopening the file or arrowing back to it draws from memory, with no request. A changed file, with its new ETag, never meets an old drawing; a failure is not kept, nor anything for a file read without an ETag. At most 200 drawings and 32 MiB of SVG text, the least recently used going first. What is kept is the server's SVG text and the size it was drawn at; each sheet still makes its own through `inline-svg.js` with its view's prefix. The browser's ETag revalidation of `GET /render` is unchanged. | Dr K, 2026-10-17 | agreed (viewer-polish round) |
```

- [ ] **Step 2: Amend VW3, VW4 and VW6**

VW3: after `(the editor's B2 tabs, the "All diagrams" menu included)` insert:

```markdown
, the strip scrolling inside the bar with "All diagrams" at its end when the tabs overflow
```

VW4: after `the card outlined as VW2's pill.` add:

```markdown
 The diagram is centred in its card. The checkbox is drawn 14 px, radius 4, filled `--color-primary-element` when checked, over the native one, which keeps its keys and its name for a screen reader.
```

VW6: `(the diagram's name, or "N diagrams, as .zip")` becomes:

```markdown
(the diagram's name, or "N diagrams, as .zip"; with none checked, N counts only the diagrams PlantUML draws an image for, as the zip holds)
```

- [ ] **Step 3: The export row's names**

In the `GET /apps/plantuml/export…` row, the clause that starts `and unsafe characters (` and runs to that sentence's full stop becomes:

```markdown
and unsafe characters (`/ \ : * ? " < > |`, C0 and C1 controls, and `\p{Cf}` such as a bidi override, but not the joiners U+200C and U+200D), with the spaces around them, become ` - `; the whole name before its extension is then cut at 200 bytes on a character's edge, which leaves room for ` (n)` and the extension.
```

- [ ] **Step 4: The units row and a rulings paragraph**

In the `viewer-component.js` row, the parenthesis that starts `(VW1–VW8:` becomes:

```markdown
(VW1–VW11: `diagram-view.js`, `sheets.js`, `page-cache.js`, `toolbar.js`, `menu.js`)
```

and after its closing `Shipped (viewer round).` add:

```markdown
 **Agreed (viewer-polish round):** VW9–VW11, and the handler registered with `group: 'plantuml'`, so the Viewer lists the folder's `.puml` files and ← and → step to the previous and next one.
```

After the viewer round's rulings paragraph (the one ending `The toolbar group is labelled "Diagram toolbar".`), add:

```markdown
**Rulings (viewer-polish round, Dr K approved 2026-10-17).** The page cache keeps the
server's SVG text, never an element, so every sheet is still sanitised with its own
view's prefix; it also bounds itself at 32 MiB of text. A card that leaves the
observer's margin before its turn is let go; a mode switch or a hidden view clears
what waits. Without `IntersectionObserver` every card is asked for. The spinner is
the app's own CSS in core's look. The card's checkbox is the native one, unseen,
over a drawn box. A press on the Export menu outside its items keeps the focus in
it. Export names are cut at 200 bytes before the extension (`ExportController::MAX_STEM`),
the one-file download, each zip entry and the zip alike.
```

- [ ] **Step 5: B1 in the editor spec**

In B1, after `past the last image).` insert:

```markdown
 Each also carries `drawn`, false for such a diagram: PlantUML draws it no image, an export of every diagram leaves it out, and the Viewer's Export all does not count it. A line holding U+2028 or U+2029 opens no block and starts no page, as JavaScript's `.` stops at both; the PHP twin reads it the same.
```

and its status cell `shipped (#36; arguments in parentheses #42)` becomes:

```markdown
shipped (#36; arguments in parentheses #42); `drawn` and line separators agreed (viewer-polish round)
```

- [ ] **Step 6: Check and commit**

Run: `git diff --stat docs/superpowers/specs/`
Expected: the two spec files only.

```bash
git add docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md docs/superpowers/specs/2026-10-14-editor-design.md
git commit -m "Spec: the Viewer draws what is on screen, keeps it for the page, and shows a spinner meanwhile"
```

### Task 2: B1's `drawn`, in the editor's scan too

**Files:**
- Modify: `src/editor/blocks.js:58-59` (the `Diagram` typedef), `src/editor/blocks.js:109-114` (the `render` loop)
- Modify: `tests/fixtures/diagrams/expected.json` (every row)
- Modify: `lib/Service/Diagrams.php:18-20` (docblock only)
- Test: `tests/js/blocks.test.js:21-25` and one new test; `tests/unit/DiagramsTest.php:26`, `:38-42`

**Interfaces:**
- Consumes: nothing.
- Produces: `scan(text)` rows carry `drawn: boolean`: `true` unless the diagram's `render` is past the last image (the same value as `Diagrams::scan`'s `drawn`). Task 8 reads it.

- [ ] **Step 1: Put `drawn` in the shared fixture**

Every row of `tests/fixtures/diagrams/expected.json` gains `"drawn"` after `"render"`; it is `true` for every row but `render-past-end.puml`'s second (`"name": "b"`), which is `false`:

```bash
sed -i 's/"render": \([0-9]*\) }/"render": \1, "drawn": true }/' tests/fixtures/diagrams/expected.json
```

then in the `render-past-end.puml` block change the `"name": "b"` row's `"drawn": true` to `"drawn": false`:

```json
  "render-past-end.puml": [
    { "index": 0, "type": "uml", "name": "a", "id": null, "page": 1, "pages": 1, "from": 1, "to": 2, "start": 1, "end": 3, "render": 0, "drawn": true },
    { "index": 1, "type": "uml", "name": "b", "id": null, "page": 1, "pages": 1, "from": 4, "to": 5, "start": 4, "end": null, "render": 1, "drawn": false }
  ],
```

- [ ] **Step 2: Hold PHP to the fixture's `drawn` too**

In `tests/unit/DiagramsTest.php`, `cases()` keeps `drawn`:

```php
		$keep = array_flip(['index', 'type', 'name', 'id', 'page', 'pages', 'render', 'drawn']);
```

and `testScansAsTheEditorDoes` compares the whole scan (its docblock about `drawn` being the server's own goes):

```php
	#[DataProvider('cases')]
	public function testScansAsTheEditorDoes(string $text, array $diagrams): void {
		self::assertSame($diagrams, Diagrams::scan($text));
	}
```

- [ ] **Step 3: The JS tests**

In `tests/js/blocks.test.js`, the empty document's row gains `drawn: true`:

```js
      { index: 0, type: 'uml', name: '', id: null, page: 1, pages: 1, from: 1, to: 1, start: null, end: null, render: 0, drawn: true },
```

and before `it('gives an empty document one diagram', …)`:

```js
  it('marks which diagrams PlantUML draws an image for, as Diagrams::scan does', () => {
    const drawn = (text) => scan(text).map((d) => d.drawn)
    expect(drawn('@startuml a\n@enduml\n@startuml b\n')).toEqual([true, false])
    expect(drawn('@startuml a\n@enduml\n@startuml b\nA\nnewpage\nB\n')).toEqual([true, false, false])
    // A block an unclosed one swallows shows the image that closes over it.
    expect(drawn('@startyaml\na: 1\n@startuml\nA -> B\n@enduml\n')).toEqual([true, true])
    // Nothing closes: drawn as if wrapped in @startuml…@enduml.
    expect(drawn('@startuml a\nA\n@startuml b\nB\n')).toEqual([true, true])
  })
```

- [ ] **Step 4: See them fail**

Run: `npx vitest run tests/js/blocks.test.js && composer run test:unit -- --filter DiagramsTest`
Expected: vitest FAILS every `reads <file>.puml` case and the new test (no `drawn` on the rows); PHPUnit passes (the server already has it).

- [ ] **Step 5: `drawn` in `scan()`**

In `src/editor/blocks.js`, the typedef gains, after `render`:

```js
 * @property {boolean} drawn whether PlantUML draws an image for it at all: a block left open
 *   after the last closed one has a `render` past the last image, which the server answers
 *   with a 400 page and an export of every diagram leaves out
```

and the loop at the end of `scan()` becomes (the local `drawn` is renamed `lasts`, freeing the word):

```js
  const lasts = images(lines)
  for (const d of diagrams) {
    const at = lasts.findIndex((last) => last >= d.from)
    d.render = at === -1 ? lasts.length : at
    d.drawn = at !== -1
  }
```

In `lib/Service/Diagrams.php` the class docblock's `drawn` paragraph becomes:

```php
 * `drawn` is whether PlantUML draws an image for the diagram at all, the editor's too (the Viewer's
 * "Export all" counts by it). A block left open after the last closed one has a `render` past the
 * last image, and the server answers that with a 400 page, not a picture.
```

- [ ] **Step 6: See them pass**

Run: `npx vitest run && composer run test:unit && npm run lint`
Expected: PASS. (`scan()`'s rows are compared whole only in `blocks.test.js`; nothing else needs `drawn`.)

- [ ] **Step 7: Commit**

```bash
git add src/editor/blocks.js lib/Service/Diagrams.php tests/fixtures/diagrams/expected.json tests/js/blocks.test.js tests/unit/DiagramsTest.php
git commit -m "Diagrams: the editor's scan says which diagrams PlantUML draws, held to the server's by the fixture"
```

### Task 3: A line separator reads the same in PHP and JS

**Files:**
- Create: `tests/fixtures/diagrams/line-separator.puml`
- Modify: `tests/fixtures/diagrams/expected.json` (one block, before `long-name.puml`)
- Modify: `lib/Service/Diagrams.php:28-32`

**Interfaces:**
- Consumes: Task 2's `drawn` field on fixture rows.
- Produces: nothing new; both scans agree on lines holding U+2028/U+2029.

- [ ] **Step 1: The fixture**

Write the file with its exact bytes (U+2028 is `\xe2\x80\xa8`, U+2029 `\xe2\x80\xa9`):

```bash
printf '@startuml first\nA -> B\nnewpage x\xe2\x80\xa8y\nB -> A\n@enduml\n@startuml second\xe2\x80\xa8tail\nC -> D\n@enduml\n@startuml third\xe2\x80\xa9\nE -> F\n@enduml\n' > tests/fixtures/diagrams/line-separator.puml
```

and in `expected.json`, before `"long-name.puml"`, JS's reading (no second page; neither later line opens a block):

```json
  "line-separator.puml": [
    { "index": 0, "type": "uml", "name": "first", "id": null, "page": 1, "pages": 1, "from": 1, "to": 4, "start": 1, "end": 5, "render": 0, "drawn": true }
  ],
```

- [ ] **Step 2: See PHP disagree**

Run: `npx vitest run tests/js/blocks.test.js && composer run test:unit -- --filter DiagramsTest`
Expected: vitest PASS (it is JS's reading); PHPUnit FAILS `testScansAsTheEditorDoes@line-separator.puml` with four diagrams (`first` in two pages, `second tail`, `third`).

- [ ] **Step 3: JavaScript's `.` in PHP**

In `lib/Service/Diagrams.php`, after `W`:

```php
	/** JavaScript's `.`, which stops at U+2028 and U+2029 as at a line feed: PCRE's takes both. */
	private const DOT = '[^\n\r\x{2028}\x{2029}]';
	private const START = '/^' . self::S . '*@start(' . self::W . '+)(' . self::DOT . '*)$/u';
	private const END = '/^' . self::S . '*@end' . self::W . '*' . self::S . '*$/u';
	private const NEWPAGE = '/^' . self::S . '*newpage(?:' . self::S . self::DOT . '*)?$/u';
```

(`END` is unchanged; it has no `.`.)

- [ ] **Step 4: See them agree**

Run: `composer run test:unit && composer run cs:check && composer run psalm && npx vitest run tests/js/blocks.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Service/Diagrams.php tests/fixtures/diagrams/line-separator.puml tests/fixtures/diagrams/expected.json
git commit -m "Diagrams: a line holding a line separator opens no diagram, on the server as in the editor"
```

### Task 4: Export names keep their joiners and fit a file system

**Files:**
- Modify: `lib/Controller/ExportController.php:41-42` (a constant), `:139`, `:188`, `:191-204`
- Test: `tests/unit/ExportControllerTest.php` (two new tests before `testALongLabelIsCutAt150Characters`, line 222; one line added to that test)

**Interfaces:**
- Consumes: nothing.
- Produces: `ExportController::MAX_STEM = 200`; names `<stem>.<ext>` where `<stem>` is at most 200 bytes. Task 1's spec row describes it.

- [ ] **Step 1: The failing tests**

Before `testALongLabelIsCutAt150Characters`:

```php
	/** U+200C and U+200D join letters and emoji: format characters, yet part of the name as written. */
	public function testNamesKeepTheJoiners(): void {
		$persian = "\u{0645}\u{06CC}\u{200C}\u{062E}\u{0648}\u{0627}\u{0647}\u{0645}";
		$coder = "\u{1F469}\u{200D}\u{1F4BB}";
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml {$persian}\n@enduml\n@startuml {$coder}\n@enduml\n")->export('Diagrams/Doc.puml', 'svg');
		self::assertSame(["Doc - {$persian}.svg", "Doc - {$coder}.svg"], array_keys($this->entries($response->render())));
	}

	/**
	 * A name is cut at 200 bytes before its extension, on a character's edge: the 255 bytes a file
	 * system allows leave room for ` (n)` and the extension. The file's own name counts too.
	 */
	public function testANameIsCutAt200Bytes(): void {
		$file = str_repeat('ö', 150) . '.puml';
		$text = "@startuml\n@enduml\n@startuml\n@enduml\n";
		$stem = str_repeat('ö', 100);
		$all = $this->controller($this->drawing(), $file, $text)->export("Diagrams/{$file}", 'svg');
		self::assertSame([$stem . '.svg', $stem . ' (2).svg'], array_keys($this->entries($all->render())));
		self::assertStringEndsWith("; filename*=UTF-8''" . rawurlencode($stem . '.zip'), (string)self::header($all, 'Content-Disposition'));
		$one = $this->controller($this->drawing(), $file, $text)->export("Diagrams/{$file}", 'svg', null, ['1']);
		self::assertStringEndsWith("; filename*=UTF-8''" . rawurlencode($stem . '.svg'), (string)self::header($one, 'Content-Disposition'));
	}
```

In `testALongLabelIsCutAt150Characters`, after `$cut = …;` add `self::assertLessThanOrEqual(ExportController::MAX_STEM, strlen($cut) - strlen('.svg'));` (166 bytes: that test's cut is the label's, not the stem's). `testNamesLoseEveryUnsafeAndInvisibleCharacter` stays as it is: U+200B is still stripped.

- [ ] **Step 2: See them fail**

Run: `composer run test:unit -- --filter ExportControllerTest`
Expected: FAIL: `Doc - می - خواهم.svg` and `Doc - 👩 - 💻.svg` for the joiners; 150 `ö` and ` - uml` for the cut.

- [ ] **Step 3: `stem()` and the joiners**

Under `MAX_LABEL`:

```php
	/** Bytes of a name before its extension: of the 255 a file system allows, room for ` (n)` and `.svg`. */
	public const MAX_STEM = 200;
```

`self::safe($base) . ".{$format}"` (the one-diagram file, line 139) and `self::safe($base) . '.zip'` (line 188) become `self::stem($base) . …`; `entry()` calls `self::stem(…)` where it called `self::safe(…)`. After `entry()`:

```php
	/** `safe()`, cut at MAX_STEM bytes on a character's edge, and trimmed again after the cut. */
	private static function stem(string $name): string {
		$cut = rtrim(mb_strcut(self::safe($name), 0, self::MAX_STEM, 'UTF-8'), ' -');
		return $cut !== '' ? $cut : 'diagram';
	}
```

`safe()`'s docblock gains, after `which shows a name backwards).`: ` The joiners U+200C and U+200D stay: Persian and Indic words and emoji sequences are written with them.` Its first pattern becomes (PCRE cannot subtract inside a class, so `\p{Cf}` without the two is its own negated class):

```php
		$name = trim((string)preg_replace(['/\s*(?:[\/\\\\:*?"<>|\p{Cc}]|[^\P{Cf}\x{200C}\x{200D}])+\s*/u', '/ {2,}/'], [' - ', ' '], $name), ' -');
```

- [ ] **Step 4: See them pass**

Run: `composer run test:unit && composer run lint && composer run cs:check && composer run psalm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Controller/ExportController.php tests/unit/ExportControllerTest.php
git commit -m "Export: names keep the joiners of Persian words and emoji, and stop at 200 bytes"
```

### Task 5: Drawings kept for the page

**Files:**
- Create: `src/viewer/page-cache.js`
- Test: `tests/js/viewer/page-cache.test.js` (node environment)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sheetKey(path: string, etag: string, index: number): string` — `JSON.stringify([path, etag, index])`, so no two keys run together.
  - `createPageCache({ max = 200, maxChars = 32 * 1024 * 1024 } = {})` → `{ get(key): Drawing|null` (and marks it recently used), `set(key, drawing): void`, `clear(): void`, `size: number }`, with `Drawing = { svg: string, size: { width: number, height: number }|null }`.
  - `pageCache`, the one instance the Viewer's sheets share. Task 6 uses all three.

- [ ] **Step 1: The failing tests**

`tests/js/viewer/page-cache.test.js`:

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { createPageCache, sheetKey } from '../../../src/viewer/page-cache.js'

const drawing = (svg) => ({ svg, size: { width: 40, height: 20 } })
const svgOf = (cache, key) => cache.get(key)?.svg ?? null

describe('the page cache', () => {
  it('gives back a drawing under the path, ETag and place it was kept under', () => {
    const cache = createPageCache()
    cache.set(sheetKey('/D/S.puml', '"e1"', 0), drawing('<svg/>'))

    expect(cache.get(sheetKey('/D/S.puml', '"e1"', 0))).toEqual(drawing('<svg/>'))
  })

  it('finds nothing for another ETag, place or path', () => {
    const cache = createPageCache()
    cache.set(sheetKey('/D/S.puml', '"e1"', 0), drawing('<svg/>'))

    expect(cache.get(sheetKey('/D/S.puml', '"e2"', 0))).toBeNull()
    expect(cache.get(sheetKey('/D/S.puml', '"e1"', 1))).toBeNull()
    expect(cache.get(sheetKey('/D/T.puml', '"e1"', 0))).toBeNull()
  })

  it('keeps apart keys whose parts would run together', () => {
    const cache = createPageCache()
    cache.set(sheetKey('/D/a,b', '"e"', 1), drawing('one'))

    expect(cache.get(sheetKey('/D/a', 'b,"e"', 1))).toBeNull()
  })

  it('lets the least recently used drawing go past its count', () => {
    const cache = createPageCache({ max: 2 })
    cache.set('a', drawing('1'))
    cache.set('b', drawing('2'))
    cache.get('a')
    cache.set('c', drawing('3'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b'), svgOf(cache, 'c')]).toEqual(['1', null, '3'])
  })

  it('lets the least recently used drawing go past its size in characters', () => {
    const cache = createPageCache({ maxChars: 10 })
    cache.set('a', drawing('xxxxxx'))
    cache.set('b', drawing('yyyyyy'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b')]).toEqual([null, 'yyyyyy'])
  })

  it('counts a drawing kept again under its key once', () => {
    const cache = createPageCache({ maxChars: 10 })
    cache.set('a', drawing('xxxxxx'))
    cache.set('a', drawing('yyyyyy'))

    expect(svgOf(cache, 'a')).toBe('yyyyyy')
  })

  it('holds 200 drawings by default', () => {
    const cache = createPageCache()
    for (let i = 0; i <= 200; i++) {
      cache.set(String(i), drawing('<svg/>'))
    }

    expect(cache.size).toBe(200)
    expect(cache.get('0')).toBeNull()
    expect(svgOf(cache, '200')).toBe('<svg/>')
  })
})
```

- [ ] **Step 2: See them fail**

Run: `npx vitest run tests/js/viewer/page-cache.test.js`
Expected: FAIL, `Cannot find module '../../../src/viewer/page-cache.js'`.

- [ ] **Step 3: `src/viewer/page-cache.js`**

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's drawings, kept for the life of the Files page (VW11): switching
 * modes, reopening a file or arrowing back to it draws from memory, with no
 * request. Kept by the file's path, the ETag the Viewer read it with and the
 * diagram's 0-based place, so a changed file, with its new ETag, never meets an
 * old drawing. Only drawings are kept, never a failure. Past `max` drawings or
 * `maxChars` characters of SVG, the least recently used go first.
 *
 * What is kept is the server's SVG text, not an element: each sheet makes its
 * own through toInlineSvg, with its own view's id prefix.
 */

/** @typedef {{ svg: string, size: { width: number, height: number }|null }} Drawing */

/**
 * @param {string} path
 * @param {string} etag
 * @param {number} index 0-based
 * @return {string}
 */
export function sheetKey(path, etag, index) {
  return JSON.stringify([path, etag, index])
}

/**
 * @param {{ max?: number, maxChars?: number }} [limits]
 * @return {{ get: (key: string) => Drawing|null, set: (key: string, drawing: Drawing) => void, clear: () => void, readonly size: number }}
 */
export function createPageCache({ max = 200, maxChars = 32 * 1024 * 1024 } = {}) {
  // A Map keeps insertion order: the first key is the least recently used.
  const drawings = new Map()
  let chars = 0
  const drop = (key) => {
    chars -= drawings.get(key).svg.length
    drawings.delete(key)
  }
  return {
    get(key) {
      const drawing = drawings.get(key)
      if (!drawing) {
        return null
      }
      drawings.delete(key)
      drawings.set(key, drawing)
      return drawing
    },
    set(key, drawing) {
      if (drawings.has(key)) {
        drop(key)
      }
      drawings.set(key, drawing)
      chars += drawing.svg.length
      while (drawings.size > max || chars > maxChars) {
        drop(drawings.keys().next().value)
      }
    },
    clear() {
      drawings.clear()
      chars = 0
    },
    get size() {
      return drawings.size
    },
  }
}

/** The one the Viewer's sheets share. */
export const pageCache = createPageCache()
```

- [ ] **Step 4: See them pass**

Run: `npx vitest run tests/js/viewer/page-cache.test.js && npm run lint`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/page-cache.js tests/js/viewer/page-cache.test.js
git commit -m "Viewer: a page-long memory of drawn diagrams, by path, ETag and place"
```

### Task 6: Sheets wait with a spinner, draw when asked, and remember

**Files:**
- Rewrite: `src/viewer/sheets.js`
- Modify: `src/viewer/diagram-view.js:216-227` (`show()`), `:253-262` (the file read)
- Modify: `css/viewer.css` (after `.plantuml-viewer__problem`, line 99)
- Test: `tests/js/viewer/sheets.test.js` (rewritten), `tests/js/viewer/diagram-view.test.js` (the cache cleared per test; a new `describe` before `describe('Stack and Wall', …)`, line 237)

**Interfaces:**
- Consumes: Task 5's `pageCache`, `sheetKey`, `createPageCache`.
- Produces, from `createSheets(path, { labelOf, etag?, parallel = 3, idPrefix = 'plantuml-viewer-', cache = pageCache })`:
  - `sheet(position): HTMLElement` — makes the sheet (class `plantuml-viewer__sheet plantuml-viewer__sheet--loading`, `role="img"`, its `aria-label`, `aria-busy="true"`, a `span.plantuml-viewer__spinner`) and draws nothing.
  - `request(position): void` — draws it once: from the cache at once (no request, settled synchronously), else queued; at most `parallel` under way, the lowest waiting position next.
  - `release(position): void` — a waiting position waits no more; `clear(): void` — none waits; neither stops one under way.
  - `sizeOf(position): {width, height}|null`; the `plantuml-viewer:settled` event carries `detail.size`.
  - `destroy(): void` as before.
  - The exported `sizeOf(svg: SVGSVGElement): {width, height}|null` and `jsonProblem(body)` as before.
  - Task 7 calls `request`, `release` and `clear`.

- [ ] **Step 1: The failing sheet tests**

Replace `tests/js/viewer/sheets.test.js` with:

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSheets, sizeOf } from '../../../src/viewer/sheets.js'
import { createPageCache, sheetKey } from '../../../src/viewer/page-cache.js'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><text>login</text></svg>'
const WITH_ID = '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="f"/></defs><rect filter="url(#f)"/></svg>'
const svgAnswer = (body = SVG) => new Response(body, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
const settled = (element) => new Promise((resolve) => element.addEventListener('plantuml-viewer:settled', resolve, { once: true }))
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const asked = (fetch) => fetch.mock.calls.map(([url]) => new URL(url, 'https://x').searchParams.get('index'))

/** A sheet asked for and drawn. */
async function drawn(sheets, position) {
  const sheet = sheets.sheet(position)
  const done = settled(sheet)
  sheets.request(position)
  return { sheet, event: await done }
}

describe('a sheet', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => vi.unstubAllGlobals())

  it('draws the diagram at its position inline, asked by its 0-based index, named for a screen reader', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const { sheet } = await drawn(createSheets('/Diagrams/Screens.puml', { labelOf: () => 'login' }), 2)

    expect(fetch.mock.calls[0][0]).toBe('/index.php/apps/plantuml/render?path=%2FDiagrams%2FScreens.puml&index=1')
    expect(sheet.querySelector('svg text').textContent).toBe('login')
    expect(sheet.getAttribute('aria-label')).toBe('login')
  })

  it('gives each sheet its own id prefix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => svgAnswer(WITH_ID)))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const [first, second] = await Promise.all([drawn(sheets, 1), drawn(sheets, 2)])

    const ids = [first, second].map(({ sheet }) => sheet.querySelector('filter').id)
    expect(new Set(ids).size).toBe(2)
  })

  it('prefixes its SVG ids with the prefix it is given', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => svgAnswer(WITH_ID)))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a', idPrefix: 'view-7-' }), 2)

    expect(sheet.querySelector('filter').id).toBe('view-7-2-f')
  })

  it('shows the problem the route answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"not set"}', { status: 503 })))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 1)

    expect(sheet.textContent).toBe('not set')
  })

  it("shows the route's words for a missing diagram as they are, never as an index", async () => {
    // GET /render counts from 1 in its problem, whatever index it was asked.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"no diagram 3"}', { status: 404 })))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 3)

    expect(sheet.textContent).toBe('no diagram 3')
  })

  it.each([
    ['an error page', () => new Response('<html>Internal Server Error</html>', { status: 500 })],
    ['an SVG that sanitises to nothing', () => new Response('<script>alert(1)</script>', { status: 200 })],
    ['no answer', () => { throw new TypeError('Failed to fetch') }],
  ])('shows one fixed line for %s', async (_what, answer) => {
    vi.stubGlobal('fetch', vi.fn(async () => answer()))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 1)

    expect(sheet.textContent).toBe('Could not draw the diagram')
  })

  it('asks once for a position, however often it is asked for', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const { sheet } = await drawn(sheets, 1)
    sheets.request(1)

    expect(sheets.sheet(1)).toBe(sheet)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops what is pending when destroyed', async () => {
    let signal
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}) }))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    sheets.request(1)

    sheets.destroy()

    expect(signal.aborted).toBe(true)
  })
})

describe('a sheet still loading (VW9)', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => vi.unstubAllGlobals())

  it('shows the loading spinner, busy for a screen reader, until its diagram lands', async () => {
    let answer
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { answer = resolve })))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const sheet = sheets.sheet(1)
    const done = settled(sheet)
    sheets.request(1)

    expect(sheet.classList.contains('plantuml-viewer__sheet--loading')).toBe(true)
    expect(sheet.querySelector('.plantuml-viewer__spinner')).not.toBeNull()
    expect(sheet.getAttribute('aria-busy')).toBe('true')

    answer(svgAnswer())
    await done

    expect(sheet.classList.contains('plantuml-viewer__sheet--loading')).toBe(false)
    expect(sheet.querySelector('.plantuml-viewer__spinner')).toBeNull()
    expect(sheet.hasAttribute('aria-busy')).toBe(false)
    expect(sheet.querySelector('svg')).not.toBeNull()
  })

  it('shows the spinner before it is asked for, so a card waiting its turn has its height', () => {
    vi.stubGlobal('fetch', vi.fn())
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)

    expect(sheet.querySelector('.plantuml-viewer__spinner')).not.toBeNull()
  })

  it('swaps the spinner for the problem line when the drawing fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"not set"}', { status: 503 })))
    const { sheet } = await drawn(createSheets('/D/S.puml', { labelOf: () => 'a' }), 1)

    expect(sheet.querySelector('.plantuml-viewer__spinner')).toBeNull()
    expect(sheet.classList.contains('plantuml-viewer__sheet--loading')).toBe(false)
    expect(sheet.querySelector('.plantuml-viewer__problem').textContent).toBe('not set')
  })
})

describe('what is asked for (VW10)', () => {
  let pending
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    pending = []
    vi.stubGlobal('fetch', vi.fn((url) => new Promise((resolve) => pending.push({ url, resolve }))))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('draws nothing until a sheet is asked for', async () => {
    createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)
    await tick()

    expect(fetch).not.toHaveBeenCalled()
  })

  it('has at most three under way, the lowest position waiting going next', async () => {
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    for (const position of [1, 2, 3, 7, 5, 6, 4]) {
      sheets.request(position)
    }
    expect(asked(fetch)).toEqual(['0', '1', '2'])

    pending.shift().resolve(svgAnswer())
    await tick()
    expect(asked(fetch)).toEqual(['0', '1', '2', '3'])
  })

  it('lets a sheet go that is no longer wanted before its turn', async () => {
    const sheets = createSheets('/D/S.puml', { parallel: 1, labelOf: () => 'a' })
    sheets.request(1)
    sheets.request(2)
    sheets.release(2)
    sheets.release(1)

    pending.shift().resolve(svgAnswer())
    await tick()

    expect(asked(fetch)).toEqual(['0'])
  })

  it('clears what waits, never what is under way', async () => {
    const sheets = createSheets('/D/S.puml', { parallel: 1, labelOf: () => 'a' })
    sheets.request(1)
    sheets.request(2)
    sheets.clear()
    pending.shift().resolve(svgAnswer())
    await tick()

    expect(asked(fetch)).toEqual(['0'])
    sheets.request(2)
    expect(asked(fetch)).toEqual(['0', '1'])
  })
})

describe('the page cache (VW11)', () => {
  let fetch
  let cache
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = vi.fn(async () => svgAnswer(WITH_ID))
    vi.stubGlobal('fetch', fetch)
    cache = createPageCache()
  })
  afterEach(() => vi.unstubAllGlobals())

  const sheetsOf = (etag, idPrefix = 'view-1-') => createSheets('/D/S.puml', { etag, cache, idPrefix, labelOf: () => 'a' })

  it('draws a kept sheet with no request, through its own view prefix', async () => {
    await drawn(sheetsOf('"e"'), 2)
    const { sheet } = await drawn(sheetsOf('"e"', 'view-2-'), 2)

    expect(fetch).toHaveBeenCalledOnce()
    expect(sheet.querySelector('filter').id).toBe('view-2-2-f')
    expect(sheet.querySelector('.plantuml-viewer__spinner')).toBeNull()
  })

  it('asks again once the file has a new ETag', async () => {
    await drawn(sheetsOf('"e"'), 1)
    await drawn(sheetsOf('"f"'), 1)

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps no failure', async () => {
    fetch.mockImplementationOnce(async () => new Response('{"problem":"not set"}', { status: 503 }))
    await drawn(sheetsOf('"e"'), 1)
    const { sheet } = await drawn(sheetsOf('"e"'), 1)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sheet.querySelector('svg')).not.toBeNull()
  })

  it('keeps nothing for a file read without an ETag', async () => {
    await drawn(sheetsOf(undefined), 1)
    await drawn(sheetsOf(undefined), 1)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(0)
  })

  it('keeps the size it was drawn at with the drawing', async () => {
    fetch.mockImplementation(async () => svgAnswer())
    await drawn(sheetsOf('"e"'), 1)

    expect(cache.get(sheetKey('/D/S.puml', '"e"', 0)).size).toEqual({ width: 40, height: 20 })
  })
})

describe('the size a diagram was drawn at', () => {
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.stubGlobal('fetch', vi.fn(async () => svgAnswer()))
  })
  afterEach(() => vi.unstubAllGlobals())

  const svgWith = (attributes) => new DOMParser()
    .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" ${attributes}/>`, 'image/svg+xml').documentElement

  it('is said with the settled event, and kept by the sheets', async () => {
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const { event } = await drawn(sheets, 1)

    expect(event.detail.size).toEqual({ width: 40, height: 20 })
    expect(sheets.sizeOf(1)).toEqual({ width: 40, height: 20 })
    expect(sheets.sizeOf(2)).toBeNull()
  })

  it.each([
    ['its width and height in px', 'width="123px" height="45px" viewBox="0 0 10 10"', { width: 123, height: 45 }],
    ['its bare width and height', 'width="12.5" height="8"', { width: 12.5, height: 8 }],
    ['its viewBox, for a width in %', 'width="100%" height="100%" viewBox="0 0 300 150"', { width: 300, height: 150 }],
    ['its viewBox, with commas', 'viewBox="0,0,30,15"', { width: 30, height: 15 }],
    ['nothing, without either', '', null],
  ])('reads %s', (_what, attributes, size) => {
    expect(sizeOf(svgWith(attributes))).toEqual(size)
  })
})
```

- [ ] **Step 2: The failing view tests**

In `tests/js/viewer/diagram-view.test.js`, after the `createDiagramView` import:

```js
const { pageCache } = await import('../../../src/viewer/page-cache.js')
```

the top-level `beforeEach` starts with:

```js
  // Drawings are kept for the page: each test starts with none.
  pageCache.clear()
```

and before `describe('Stack and Wall', …)`:

```js
describe('drawings kept for the page (VW11)', () => {
  const reopen = async (content, etag) => {
    seams.loadFile.mockResolvedValue({ content, etag })
    const view = createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady: vi.fn() })
    await settle()
    return view
  }

  it('draws a file opened again from memory, with no request', async () => {
    const first = await reopen(SCREENS, '"e"')
    first.destroy()
    const onReady = vi.fn()
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady })
    await settle()

    expect(asked(fetch)).toEqual(['0'])
    expect(shown(root)).toEqual(['nodes'])
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('asks again for a file changed since, its ETag new', async () => {
    const first = await reopen(SCREENS, '"e"')
    first.destroy()
    await reopen(SCREENS, '"f"')

    expect(asked(fetch)).toEqual(['0', '0'])
  })

  it('switches modes with no request for a sheet already drawn', async () => {
    await open(THREE)
    mode('Stack')
    await settle()
    mode('Tabs')
    root.querySelectorAll('[role="tab"]')[2].click()
    await settle()

    expect(asked(fetch)).toEqual(['0', '1', '2'])
    expect(shown(root)).toEqual(['p3'])
  })
})
```

- [ ] **Step 3: See them fail**

Run: `npx vitest run tests/js/viewer`
Expected: FAIL: every sheets test (`sheets.request is not a function`; `sizeOf` is not exported), and "draws a file opened again from memory" (`['0', '0']`). The other two view tests pass already and pin what must stay: a new ETag asks again, and a view reuses its own sheets across modes.

- [ ] **Step 4: Rewrite `src/viewer/sheets.js`**

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's sheets: one diagram each, drawn inline through GET /render so its
 * links work (D1), or the line saying why not (D4). Until then a sheet shows
 * Nextcloud's loading spinner at a fixed size (VW9). A sheet is drawn only once
 * it is asked for (VW10), a few at a time, the lowest position waiting first, so
 * a wall of diagrams does not flood the server; what is drawn is kept for the
 * page (page-cache.js, VW11) and drawn from there with no request.
 *
 * Positions count from 1, as the tabs do; the route is asked by `index`, the
 * 0-based place, never `diagram=`, which a diagram named with digits would win.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID, renderUrl } from '../files-helpers.js'
import { toInlineSvg } from '../editor/inline-svg.js'
import { pageCache, sheetKey } from './page-cache.js'

/**
 * The route's own words for a refusal, `{"problem": …}`, or '' for any other body.
 *
 * @param {string} body
 * @return {string}
 */
export function jsonProblem(body) {
  try {
    const problem = JSON.parse(body)?.problem
    return typeof problem === 'string' ? problem : ''
  } catch {
    return ''
  }
}

// A length in user units or px; a `%` or `em` says nothing of the drawing's own size.
const LENGTH = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/

/**
 * The size PlantUML drew a diagram at, in CSS pixels: its width and height, else its
 * viewBox's; null when it names neither. A later Wall lays cards out by it.
 *
 * @param {SVGSVGElement} svg
 * @return {{ width: number, height: number }|null}
 */
export function sizeOf(svg) {
  const width = Number(LENGTH.exec(svg.getAttribute('width') ?? '')?.[1] ?? 0)
  const height = Number(LENGTH.exec(svg.getAttribute('height') ?? '')?.[1] ?? 0)
  if (width > 0 && height > 0) {
    return { width, height }
  }
  const box = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  return box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null
}

/**
 * @param {string} path the file, in the user's folder
 * @param {object} options
 * @param {(position: number) => string} options.labelOf
 * @param {string} [options.etag] the ETag the file was read with; without one nothing is kept
 * @param {number} [options.parallel]
 * @param {string} [options.idPrefix] the view's own, so no two views on a page share an SVG id
 * @param {ReturnType<import('./page-cache.js').createPageCache>} [options.cache]
 * @return {{
 *   sheet: (position: number) => HTMLElement,
 *   request: (position: number) => void,
 *   release: (position: number) => void,
 *   clear: () => void,
 *   sizeOf: (position: number) => ({ width: number, height: number }|null),
 *   destroy: () => void,
 * }}
 */
export function createSheets(path, { labelOf, etag, parallel = 3, idPrefix = 'plantuml-viewer-', cache = pageCache }) {
  const sheets = new Map()
  const sizes = new Map()
  // Asked for and not yet under way; under way or settled.
  const waiting = new Set()
  const started = new Set()
  const stop = new AbortController()
  let running = 0
  const keyOf = (position) => (etag ? sheetKey(path, etag, position - 1) : null)
  const inline = (svgText, position) => toInlineSvg(svgText, { idPrefix: `${idPrefix}${position}-` })

  function sheet(position) {
    if (!sheets.has(position)) {
      const node = document.createElement('div')
      node.className = 'plantuml-viewer__sheet plantuml-viewer__sheet--loading'
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', labelOf(position))
      node.setAttribute('aria-busy', 'true')
      const spinner = document.createElement('span')
      spinner.className = 'plantuml-viewer__spinner'
      node.append(spinner)
      sheets.set(position, node)
    }
    return sheets.get(position)
  }

  /** The drawing in place of the spinner, or the problem line; then the sheet says it is settled. */
  function settle(position, svg, size, problem) {
    const node = sheets.get(position)
    node.classList.remove('plantuml-viewer__sheet--loading')
    node.removeAttribute('aria-busy')
    if (svg) {
      sizes.set(position, size)
      node.replaceChildren(svg)
    } else {
      const line = document.createElement('p')
      line.className = 'plantuml-viewer__problem'
      line.textContent = problem
      node.classList.add('plantuml-viewer__sheet--problem')
      node.replaceChildren(line)
    }
    node.dispatchEvent(new CustomEvent('plantuml-viewer:settled', { detail: { size: sizes.get(position) ?? null } }))
  }

  /** A drawing kept for the page, drawn at once; false when there is none. */
  function fromMemory(position) {
    const key = keyOf(position)
    const kept = key === null ? null : cache.get(key)
    const svg = kept ? inline(kept.svg, position) : null
    if (!svg) {
      return false
    }
    started.add(position)
    settle(position, svg, kept.size, '')
    return true
  }

  async function draw(position) {
    let svg = null
    let size = null
    let problem = ''
    try {
      const res = await fetch(renderUrl(path, { index: position - 1 }), { credentials: 'same-origin', signal: stop.signal })
      const body = await res.text()
      svg = res.ok ? inline(body, position) : null
      if (svg) {
        size = sizeOf(svg)
        const key = keyOf(position)
        if (key !== null) {
          cache.set(key, { svg: body, size })
        }
      } else {
        // The route's own words, as it sent them: its "no diagram N" counts from 1.
        problem = (!res.ok && jsonProblem(body)) || t(APP_ID, 'Could not draw the diagram')
      }
    } catch {
      if (stop.signal.aborted) {
        return
      }
      problem = t(APP_ID, 'Could not draw the diagram')
    }
    settle(position, svg, size, problem)
  }

  function pump() {
    while (running < parallel && waiting.size && !stop.signal.aborted) {
      const position = Math.min(...waiting)
      waiting.delete(position)
      started.add(position)
      running++
      draw(position).finally(() => {
        running--
        pump()
      })
    }
  }

  return {
    sheet,
    /** Draws the sheet at `position`, from memory or in its turn; once, however often asked. */
    request(position) {
      sheet(position)
      if (started.has(position) || waiting.has(position) || stop.signal.aborted || fromMemory(position)) {
        return
      }
      waiting.add(position)
      pump()
    },
    /** A sheet no longer wanted before its turn (a card scrolled away) waits no more. */
    release(position) {
      waiting.delete(position)
    },
    /** Nothing waits any more; what is under way still lands. */
    clear() {
      waiting.clear()
    },
    sizeOf: (position) => sizes.get(position) ?? null,
    destroy() {
      waiting.clear()
      stop.abort()
    },
  }
}
```

- [ ] **Step 5: The view asks for its sheets, with the ETag**

In `src/viewer/diagram-view.js`, `show()`'s branches ask for what they show (Task 7 replaces these two lines with `want()`):

```js
    if (state.mode === 'tabs') {
      tabs.update(diagrams, state.active)
      stage.replaceChildren(sheets.sheet(state.active + 1))
      sheets.request(state.active + 1)
    } else {
      stage.replaceChildren(...diagrams.map((_diagram, index) => card(index)))
      diagrams.forEach((_diagram, index) => sheets.request(index + 1))
    }
```

and the file read passes its ETag on, the ready listener still before `show()`:

```js
  Promise.all([loadFile(path), downloadable]).then(([{ content, etag }, exportable]) => {
    if (destroyed) {
      return
    }
    // CodeMirror reads any line ending for the editor; scan() splits on \n alone.
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { etag, labelOf: (position) => label(diagrams[position - 1]), idPrefix: prefix })
    build({ exportable })
    // Before show(): a drawing kept for the page settles the sheet as soon as it is asked for.
    sheets.sheet(1).addEventListener('plantuml-viewer:settled', settle, { once: true })
    show()
```

- [ ] **Step 6: The spinner's styles**

In `css/viewer.css`, after the `.plantuml-viewer__problem` rule:

```css
/* A sheet waiting for its drawing (VW9): Nextcloud's loading spinner, centred
 * on the white sheet at a fixed placeholder size, so a Stack or Wall has its
 * height before its diagrams land. */
.plantuml-viewer__sheet--loading {
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 320px;
	height: 240px;
}

.plantuml-viewer__stage--stack .plantuml-viewer__sheet--loading {
	width: auto;
}

/* Core's icon-loading look (its ring, arc, 0.8 s turn and dark-theme filter),
 * at 44px. */
.plantuml-viewer__spinner {
	width: 44px;
	height: 44px;
	box-sizing: border-box;
	border: 2px solid var(--color-loading-light);
	border-top-color: var(--color-loading-dark);
	border-radius: 50%;
	filter: var(--background-invert-if-dark);
	animation: plantuml-viewer-spin 0.8s linear infinite;
}

@keyframes plantuml-viewer-spin {
	to {
		transform: rotate(360deg);
	}
}
```

- [ ] **Step 7: See them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS (the viewer round's own Stack test, "has no more than three drawings asked for at once, in file order", still passes: Stack asks for every card in order until Task 7).

- [ ] **Step 8: Commit**

```bash
git add src/viewer/sheets.js src/viewer/diagram-view.js css/viewer.css tests/js/viewer/sheets.test.js tests/js/viewer/diagram-view.test.js
git commit -m "Viewer: a sheet shows a spinner until drawn, and a diagram drawn before comes from memory"
```

### Task 7: Stack and Wall draw what is on screen; a hidden view waits

**Files:**
- Create: `tests/js/helpers/intersection.js`
- Modify: `src/viewer/diagram-view.js` (header comment; state at `:76-80`; `card()`; a new `want()` before `show()`; `show()`; the returned object `:273-281` and its `@return`)
- Modify: `src/viewer-component.js:20-27` and its header comment
- Test: `tests/js/viewer/diagram-view.test.js` (a new `describe` before `const exportButton = …`, line 337), `tests/js/viewer-component.test.js:9` and two new tests

**Interfaces:**
- Consumes: Task 6's `sheets.request(position)`, `sheets.release(position)`, `sheets.clear()`.
- Produces: `createDiagramView(...)` returns `{ setActive(active: boolean): void, destroy(): void }`; the component calls `setActive` on every change of `active` once the view exists.

- [ ] **Step 1: The fake observer**

`tests/js/helpers/intersection.js`:

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// jsdom has no IntersectionObserver. This one is told by the test which targets come within its
// margin or leave it, and passes on only those it still observes, as the browser would.

export class FakeIntersectionObserver {
  static made = []

  /** The one made last. */
  static last() {
    return FakeIntersectionObserver.made.at(-1)
  }

  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.targets = new Set()
    this.disconnected = false
    FakeIntersectionObserver.made.push(this)
  }

  observe(target) {
    this.targets.add(target)
  }

  unobserve(target) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    this.disconnected = true
  }

  observed() {
    return [...this.targets]
  }

  enter(...targets) {
    this.tell(targets, true)
  }

  leave(...targets) {
    this.tell(targets, false)
  }

  tell(targets, isIntersecting) {
    const entries = targets.filter((target) => this.targets.has(target)).map((target) => ({ target, isIntersecting }))
    if (entries.length) {
      this.callback(entries, this)
    }
  }
}
```

- [ ] **Step 2: The failing view tests**

In `tests/js/viewer/diagram-view.test.js`, import it after vitest:

```js
import { FakeIntersectionObserver } from '../helpers/intersection.js'
```

and before `const exportButton = …`:

```js
describe('Stack and Wall draw what is on screen (VW10)', () => {
  const FORTY = Array.from({ length: 40 }, (_, i) => `@startuml d${i + 1}\n@enduml\n`).join('')
  const observer = () => FakeIntersectionObserver.last()
  let pending
  const answerOne = async () => {
    pending.shift().resolve(new Response(svg('d')))
    await settle()
  }

  beforeEach(() => {
    FakeIntersectionObserver.made = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    pending = []
    fetch.mockImplementation((url) => new Promise((resolve) => pending.push({ url, resolve })))
  })

  it('watches every card from the scrolling stage, a stage height ahead', async () => {
    await open(THREE)
    mode('Stack')

    expect(observer().options).toEqual({ root: root.querySelector('.plantuml-viewer__stage'), rootMargin: '100%' })
    expect(observer().observed()).toEqual(cards())
  })

  it('asks only for the cards near what is in view, in file order, three at a time', async () => {
    await open(FORTY)
    await answerOne()
    mode('Wall')
    await settle()
    expect(asked(fetch)).toEqual(['0'])

    observer().enter(...cards().slice(0, 6).reverse())
    expect(asked(fetch)).toEqual(['0', '1', '2', '3'])
    await answerOne()
    expect(asked(fetch)).toEqual(['0', '1', '2', '3', '4'])
  })

  it('lets a card go that scrolled away before its turn', async () => {
    await open(FORTY)
    await answerOne()
    mode('Stack')
    observer().enter(...cards().slice(1, 8))
    observer().leave(...cards().slice(4, 8))
    observer().enter(cards()[30])
    await answerOne()

    expect(asked(fetch)).toEqual(['0', '1', '2', '3', '30'])
  })

  it('asks for nothing more while the view is hidden, and goes on once it is shown', async () => {
    seams.loadFile.mockResolvedValue({ content: FORTY, etag: '"e"' })
    const view = createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady: vi.fn() })
    await settle()
    await answerOne()
    mode('Stack')
    observer().enter(...cards().slice(1, 8))
    const watched = observer()

    view.setActive(false)
    expect(watched.disconnected).toBe(true)
    await answerOne()
    await answerOne()
    expect(asked(fetch)).toEqual(['0', '1', '2', '3'])

    view.setActive(true)
    expect(observer()).not.toBe(watched)
    observer().enter(...cards().slice(1, 8))
    expect(asked(fetch)).toEqual(['0', '1', '2', '3', '4', '5'])
  })

  it('stops watching the cards back in Tabs, and asks only for the open tab', async () => {
    await open(FORTY)
    await answerOne()
    mode('Stack')
    observer().enter(...cards().slice(1, 8))
    const watched = observer()
    mode('Tabs')
    root.querySelectorAll('[role="tab"]')[20].click()
    await answerOne()
    await answerOne()
    await answerOne()

    expect(watched.disconnected).toBe(true)
    expect(asked(fetch)).toEqual(['0', '1', '2', '3', '20'])
  })

  it('stops watching when destroyed', async () => {
    seams.loadFile.mockResolvedValue({ content: THREE, etag: '"e"' })
    const view = createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady: vi.fn() })
    await settle()
    mode('Wall')
    view.destroy()

    expect(observer().disconnected).toBe(true)
  })

  it('asks for every card where the browser has no IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    await open(THREE)
    await answerOne()
    mode('Stack')

    expect(asked(fetch)).toEqual(['0', '1', '2'])
  })
})
```

- [ ] **Step 3: The failing component tests**

In `tests/js/viewer-component.test.js`, the view seam gains `setActive`:

```js
const seams = vi.hoisted(() => ({ view: { destroy: vi.fn(), setActive: vi.fn() }, createDiagramView: vi.fn() }))
```

and at the end:

```js
it('pauses the view while it is hidden and resumes it when shown', () => {
  const vm = instance(true)
  component.mounted.call(vm)
  component.watch.active.call(vm, false)
  expect(seams.view.setActive).toHaveBeenLastCalledWith(false)
  component.watch.active.call(vm, true)
  expect(seams.view.setActive).toHaveBeenLastCalledWith(true)
})

it('tells a view just built nothing more', () => {
  const vm = instance(false)
  component.mounted.call(vm)
  component.watch.active.call(vm, true)
  expect(seams.view.setActive).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: See them fail**

Run: `npx vitest run tests/js/viewer tests/js/viewer-component.test.js`
Expected: FAIL: the six observer tests (no observer is made; every card is asked for), and "pauses the view…" (`setActive` never called). "asks for every card where the browser has no IntersectionObserver" and "tells a view just built nothing more" pass already: they pin what must not change.

- [ ] **Step 5: `want()` and `setActive` in `src/viewer/diagram-view.js`**

The header comment gains, after `(VW7) act on the open tab, or in Stack and Wall on the checked cards.`:

```js
 * Only what is on screen is drawn (VW10): the open tab, or the cards near the
 * visible part of the stage; a hidden view asks for nothing.
```

The state gains, after `let menu = null`:

```js
  let observer = null
  let active = true
```

and after `let ready = false`:

```js
  // A card → the position of its sheet.
  const positions = new WeakMap()
```

In `card()`, after `caption.append(…)`: `positions.set(node, index + 1)`.

Before `show()`:

```js
  /**
   * What the stage shows is asked for: the open tab, or in Stack and Wall each card once it comes
   * within a stage's height of the visible part, watched from the scrolling stage, the nearest
   * in file order. A card that leaves before its turn waits no more; a hidden view asks for nothing.
   */
  function want() {
    observer?.disconnect()
    observer = null
    sheets.clear()
    if (!active) {
      return
    }
    if (state.mode === 'tabs') {
      sheets.request(state.active + 1)
      return
    }
    const shown = [...stage.children]
    if (typeof IntersectionObserver === 'undefined') {
      shown.forEach((node) => sheets.request(positions.get(node)))
      return
    }
    observer = new IntersectionObserver((entries) => {
      const near = []
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) {
          near.push(positions.get(target))
        } else {
          sheets.release(positions.get(target))
        }
      }
      near.sort((a, b) => a - b).forEach((position) => sheets.request(position))
    }, { root: stage, rootMargin: '100%' })
    shown.forEach((node) => observer.observe(node))
  }
```

`show()` drops Task 6's two `sheets.request…` lines and calls `want()` after the `if`/`else`, before `afterCheck()`. The returned object, and its `@return {{ setActive: (active: boolean) => void, destroy: () => void }}`:

```js
  return {
    /** The Viewer shows this file (true) or keeps it hidden beside the one shown (false). */
    setActive(now) {
      active = now
      if (sheets && !destroyed) {
        want()
      }
    },
    destroy() {
      destroyed = true
      observer?.disconnect()
      menu?.destroy()
      sheets?.destroy()
      tabs.destroy()
      root.replaceChildren()
    },
  }
```

- [ ] **Step 6: The component tells it**

`src/viewer-component.js`'s watcher:

```js
    active(now) {
      this.$el.toggleAttribute('inert', !now)
      if (this.view) {
        this.view.setActive(now)
      } else if (now) {
        this.build()
      }
    },
```

and its header's `so its active tab leaves the focus order.` becomes `so its active tab leaves the focus order, and asks for no more drawings.`

- [ ] **Step 7: See them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/viewer/diagram-view.js src/viewer-component.js tests/js/helpers/intersection.js tests/js/viewer/diagram-view.test.js tests/js/viewer-component.test.js
git commit -m "Viewer: Stack and Wall draw the diagrams near the screen, and a hidden file draws none"
```

### Task 8: The Export menu keeps its focus and counts what it saves

**Files:**
- Modify: `src/viewer/menu.js:78` (a listener before the `keydown` one)
- Modify: `src/viewer/diagram-view.js:130-140` (`exportHeading()`)
- Test: `tests/js/viewer/menu.test.js` (before "leaves the page as it found it once destroyed"), `tests/js/viewer/diagram-view.test.js` (before "reads Export again back in Tabs, whatever is checked", line 451)

**Interfaces:**
- Consumes: Task 2's `drawn` on `scan()` rows.
- Produces: nothing new.

- [ ] **Step 1: The failing tests**

`tests/js/viewer/menu.test.js`:

```js
  it.each([
    ['its heading', () => shown().firstElementChild],
    ['its own padding', () => shown()],
  ])('keeps the focus where it is on a press on %s, so Escape closes only the menu', (_what, target) => {
    menu.open()
    const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    target().dispatchEvent(press)

    expect(press.defaultPrevented).toBe(true)
    expect(shown().hidden).toBe(false)
  })

  it('lets a press on an item go on, to be clicked', () => {
    menu.open()
    const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    shown().querySelector('[role="menuitem"] .plantuml-viewer__menu-label').dispatchEvent(press)

    expect(press.defaultPrevented).toBe(false)
  })
```

(jsdom moves no focus on a press, so the test pins the mechanism, the prevented default; the live check pins the focus.)

`tests/js/viewer/diagram-view.test.js`:

```js
  it('counts in Export all only the diagrams the server draws, as its zip does', async () => {
    await open(`${THREE}@startuml p4\nG -> H\n`)
    mode('Stack')
    exportButton().click()

    expect(heading()).toBe('3 diagrams, as .zip')
  })

  it('names the one diagram Export all saves when the others have no image', async () => {
    await open('@startuml a\nA -> B\n@enduml\n@startuml b\nC -> D\n')
    mode('Wall')
    exportButton().click()

    expect(heading()).toBe('a')
  })
```

- [ ] **Step 2: See them fail**

Run: `npx vitest run tests/js/viewer`
Expected: FAIL: the two "keeps the focus" cases (`defaultPrevented` false), "4 diagrams, as .zip", and "2 diagrams, as .zip" for the second.

- [ ] **Step 3: The menu**

In `src/viewer/menu.js`, before `element.addEventListener('keydown', …)`:

```js
  // A press on the heading or the padding would take the focus out of the menu, to the Viewer,
  // whose Escape then closes the Viewer itself; on an item it goes on to the click.
  element.addEventListener('pointerdown', (event) => {
    if (!event.target.closest?.('[role="menuitem"]')) {
      event.preventDefault()
    }
  })
```

- [ ] **Step 4: The heading**

In `src/viewer/diagram-view.js`:

```js
  /**
   * What the menu exports: the one diagram's label, else how many go in the zip. None chosen is
   * every diagram the server draws an image for; it leaves out the rest (B1's `drawn`).
   */
  function exportHeading() {
    const indexes = chosen()
    const going = indexes.length ? indexes.map((index) => diagrams[index]) : diagrams.filter((diagram) => diagram.drawn)
    if (going.length > 1) {
      return n(APP_ID, '%n diagrams, as .zip', '%n diagrams, as .zip', going.length)
    }
    const one = going[0] ?? diagrams[0]
    // A file of one unnamed diagram is named after the file (the export-menu-single board).
    return diagrams.length === 1 && !one.name ? basename.replace(/\.(?:puml|plantuml)$/i, '') : label(one)
  }
```

- [ ] **Step 5: See them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/viewer/menu.js src/viewer/diagram-view.js tests/js/viewer/menu.test.js tests/js/viewer/diagram-view.test.js
git commit -m "Viewer: a click on the Export menu's heading keeps it open to Escape, and Export all counts what it saves"
```

### Task 9: Cards and tabs as the boards draw them

**Files:**
- Modify: `src/viewer/diagram-view.js` (`card()`, the checkbox, `:189-201`)
- Modify: `css/viewer.css:45-53` (the strip), `:290-305` (caption and checkbox), `:307-309` (after the card sheet rule)
- Test: `tests/js/viewer/diagram-view.test.js` (before "opens a Wall card in Tabs on a click outside its checkbox", line 259)

**Interfaces:**
- Consumes: nothing new.
- Produces: the card checkbox `input.plantuml-viewer__check-input` followed by `span.plantuml-viewer__check[aria-hidden="true"]`, inside the caption `<label>`.

- [ ] **Step 1: The failing test**

```js
  it('draws its checkbox as the boards do, over the native one kept for the keyboard and screen readers', async () => {
    await open(THREE)
    mode('Stack')
    const [first] = cards()
    const box = first.querySelector('input[type="checkbox"]')

    expect(box.nextElementSibling.classList.contains('plantuml-viewer__check')).toBe(true)
    expect(box.nextElementSibling.getAttribute('aria-hidden')).toBe('true')
    expect(first.querySelector('label').textContent).toBe('nodes')
    box.click()
    expect(box.checked).toBe(true)
  })
```

- [ ] **Step 2: See it fail**

Run: `npx vitest run tests/js/viewer/diagram-view.test.js`
Expected: FAIL, `Cannot read properties of null (reading 'classList')`.

- [ ] **Step 3: The markup**

In `card()`:

```js
    // The native box takes the keys and the clicks, unseen; the mark after it is what is drawn (viewer.css).
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'plantuml-viewer__check-input'
    box.checked = state.checked.has(index)
    const mark = element('span', 'plantuml-viewer__check')
    mark.setAttribute('aria-hidden', 'true')
```

and `caption.append(box, label(diagrams[index]))` becomes `caption.append(box, mark, label(diagrams[index]))`.

- [ ] **Step 4: The styles**

The strip shrinks inside the pill (editor.css:250 gives it `flex-shrink: 0`):

```css
/* tabs.js's strip, styled for the editor's pane by editor.css (which every
 * Files page loads): kept inside the pill, at the board's tab size. It may
 * shrink, as editor.css's may not, so many tabs scroll inside the pill and
 * "All diagrams" shows at its end. */
.plantuml-viewer__tabbar .plantuml-editor__tabbar {
	flex-shrink: 1;
	min-width: 0;
	height: 100%;
	margin: 0;
	border: 0;
	align-self: auto;
}
```

`.plantuml-viewer__caption` gains `position: relative;` as its first declaration, and the `.plantuml-viewer__caption input[type="checkbox"]` rule is replaced by:

```css
/* The card's checkbox as the boards draw it: 14px, radius 4, filled with the
 * primary colour when checked. The native box lies over it, unseen, for the
 * keyboard, the clicks and screen readers. */
.plantuml-viewer__caption input.plantuml-viewer__check-input {
	position: absolute;
	top: calc(50% - 7px);
	left: 8px;
	width: 14px;
	height: 14px;
	min-height: 0;
	margin: 0;
	opacity: 0;
}

.plantuml-viewer__check {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: none;
	width: 14px;
	height: 14px;
	box-sizing: border-box;
	border: 1px solid var(--color-border-maxcontrast);
	border-radius: 4px;
	background: var(--color-main-background);
}

.plantuml-viewer__check-input:checked + .plantuml-viewer__check {
	border-color: var(--color-primary-element);
	background: var(--color-primary-element);
}

/* The tick: img/icons/check.svg's path, as a mask the text colour shows through. */
.plantuml-viewer__check-input:checked + .plantuml-viewer__check::after {
	content: "";
	width: 12px;
	height: 12px;
	background: var(--color-primary-element-text);
	mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z'/%3E%3C/svg%3E") center / contain no-repeat;
}

.plantuml-viewer__check-input:focus-visible + .plantuml-viewer__check {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}
```

After the `.plantuml-viewer__card .plantuml-viewer__sheet` rule:

```css
/* A diagram narrower than its Stack card sits in the middle of it, as the
 * viewer-stack board draws it. */
.plantuml-viewer__card .plantuml-viewer__sheet svg {
	margin-inline: auto;
}
```

(The Wall's cards are as wide as their diagrams, so this changes nothing there.)

- [ ] **Step 5: See it pass**

Run: `npx vitest run && npm run lint`
Expected: PASS. The styles themselves are checked live (Task 11): jsdom lays nothing out.

- [ ] **Step 6: Commit**

```bash
git add src/viewer/diagram-view.js css/viewer.css tests/js/viewer/diagram-view.test.js
git commit -m "Viewer: Stack centres each diagram, cards draw the boards' checkbox, and many tabs stay in the bar"
```

### Task 10: ← and → step to the previous and next .puml

**Files:**
- Modify: `src/files.js:37`
- Test: `tests/js/files.test.js` (a new `describe` before `describe('Edit diagram', …)`)

**Interfaces:**
- Consumes: nothing.
- Produces: the Viewer handler `{ id: 'plantuml', group: 'plantuml', mimes: ['text/x-plantuml'], component }`.

- [ ] **Step 1: The failing test**

```js
describe('the Viewer handler', () => {
  it('groups the diagram files, so the Viewer steps to the previous and next .puml of the folder', () => {
    expect(window.OCA.Viewer.registerHandler).toHaveBeenCalledWith(expect.objectContaining({
      id: 'plantuml',
      group: 'plantuml',
      mimes: ['text/x-plantuml'],
    }))
  })
})
```

- [ ] **Step 2: See it fail**

Run: `npx vitest run tests/js/files.test.js`
Expected: FAIL, the handler has no `group`.

- [ ] **Step 3: The group**

```js
// Viewer stable34 lists the folder's files only for a handler with a `group`, keeping those
// whose mime is in it: without one, ← and → have no previous or next .puml to go to.
const viewerHandler = { id: APP_ID, group: APP_ID, mimes: [MIMETYPE], component }
```

- [ ] **Step 4: See it pass**

Run: `npx vitest run && npm run lint`
Expected: PASS. Neighbours still draw only once shown: the component builds its view only while `active` (its own tests), which the live check confirms with a real folder.

- [ ] **Step 5: Commit**

```bash
git add src/files.js tests/js/files.test.js
git commit -m "Files: the Viewer steps through a folder's diagram files"
```

### Task 11: Build, live check and docs

The deploy and the browser check follow **Live verification** at the top of this plan, step by step, including its route-cache step: selenium-flow's skills from `skill://selenium-flow/SKILL.md` and its references, sign-in with its `grafana` secret (valid for Nextcloud). The check is not done until every behaviour below is passed or recorded as outstanding with its reason.

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]`), `AGENTS.md` (the repo map's `src/viewer/` line), `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`, `docs/superpowers/specs/2026-10-14-editor-design.md` (status flips)

- [ ] **Step 1: Build and measure**

Run: `npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js && gzip -c dist/plantuml-files.js | wc -c`
Expected: the guard passes; the Files bundle is at most 106000 bytes gzipped (97538 on `main`, about 98400 with this round). Over budget: name what came in, from the sourcemap `dist/plantuml-files.js.map`, in the report; do not raise the budget.

- [ ] **Step 2: Every suite**

Run: `composer run test:unit && composer run lint && composer run cs:check && composer run psalm && npx vitest run && npm run lint && bash tests/integration/bin/check-suites.sh && bash tests/integration/bin/check-notes-anchors.sh && bash tests/integration/bin/check-step-definitions.sh`
Expected: all pass.

- [ ] **Step 3: Deploy, clear the route cache, and check it live**

Deploy and run `apachectl -k graceful` as **Live verification** steps 1 and 1a say. In the shared `claudecode` selenium-flow browser, in a scratch folder holding `Multi.puml` (`nodes` with a `[[link]]`, a tall `login`, a three-page `pages` block), `Forty.puml` (`d1`…`d40`), `Unclosed.puml` (`first`, `second`, then an unclosed `third`), `Single.puml`, `Größe.puml` (`größe`, `zweite`), `Joined.puml` (a diagram named `می‌خواهم` and one named `👩‍💻`) and two PNGs:
- **Spinner (VW9):** with a `window.fetch` wrapper delaying `/render` by 2 s, each sheet shows the 44 px spinner centred on a white 320 × 240 sheet (in Stack the card's width), in Tabs, Stack and Wall, light and dark; a refused render (a bad `occ plantuml:set-url`, then set it back) swaps it for the problem line. One screenshot per mode.
- **Load on scroll (VW10):** `Forty.puml` in Stack: on open only the cards within a stage height of the view are asked for (a `fetch` wrapper logs the `index`es), never more than 3 in flight; scrolling down asks for the next ones in file order; scrolling fast to the bottom does not draw the cards flown past. The same in Wall.
- **Page cache (VW11):** with the wrapper logging, switching Tabs → Stack → Tabs, closing and reopening the file, and arrowing away and back ask for nothing already drawn. Changing the file (edit and save it in the editor) and reopening asks again.
- **Previous/next:** opening `Multi.puml` from Files lists the folder's `.puml` files (Viewer's `fileList`), not the PNGs; → and ‹ › step to them; a neighbour is read and drawn only once shown, and a hidden one asks for nothing while you work in the shown one.
- **Stack centring and checkbox:** the narrow `nodes` diagram is centred in its 720 px card; the checkbox is 14 px with radius 4 (computed style of `.plantuml-viewer__check`), primary-filled with a tick when checked, Space toggles it on a focused card, and the focus ring shows. Compare with `docs/design/viewer-stack.png`.
- **40 tabs:** `Forty.puml` in Tabs: the strip stays inside the pill and the modal, and the "All diagrams" button shows at its end and opens its menu; Escape closes only that menu.
- **Export menu:** a click on its heading, then Escape: only the menu closes, the Viewer stays. On `Unclosed.puml` in Stack with nothing checked the heading reads "2 diagrams, as .zip" and the zip holds two entries.
- **Export (the viewer round's item 3, blocked then by the stale route cache):** each format downloads with its name (`workspace://files/downloads`), Export all gives `<file>.zip` and its entries, `Größe.puml` keeps `Größe - größe.*`, `Joined.puml`'s entries keep their joiners.
- **Still outstanding from the viewer round, unless Dr K shares one:** a share that forbids download (no Export; `GET /export` 404).

- [ ] **Step 4: Specs**

In `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`:
- VW9, VW10, VW11: `agreed (viewer-polish round)` becomes `shipped (viewer-polish round)`.
- The heading `## The Viewer (shipped 2026-10-17, viewer round)` becomes `## The Viewer (shipped 2026-10-17, viewer and viewer-polish rounds)`.
- The `viewer-component.js` row's `**Agreed (viewer-polish round):**` becomes `**Shipped (viewer-polish round):**`.
- The rulings paragraph's `(viewer-polish round, Dr K approved 2026-10-17)` stays; add any ruling the live check forced, one sentence each.

In `docs/superpowers/specs/2026-10-14-editor-design.md`, B1's status `and line separators agreed (viewer-polish round)` becomes `and line separators shipped (viewer-polish round)`.

Run: `git diff --stat docs/superpowers/specs/`
Expected: those two files.

- [ ] **Step 5: Docs**

`CHANGELOG.md`, under `### Added` after the line `- **Edit** in the Viewer opens the editor at the diagram in view.`:

```markdown
- The Viewer shows a spinner on each diagram until it is drawn, draws a stack or wall as you scroll to it, and shows a diagram it drew before on the same page at once.
- In the Viewer, ← and → step to the previous and next `.puml` in the folder.
```

and the Export line `the checked ones or all as a zip, except from a share that forbids download.` becomes `the checked ones or all as a zip, named so every file system takes them, except from a share that forbids download.` (The Viewer is unreleased: its centring, checkbox, tab strip and menu fixes need no line of their own.)

`AGENTS.md`: the repo map's `src/viewer/` entry names `page-cache.js` beside `sheets.js`.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md AGENTS.md docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md docs/superpowers/specs/2026-10-14-editor-design.md
git commit -m "Docs: the viewer-polish round"
```

- [ ] **Step 7: Report**

The report lists each live behaviour with pass or fail and its screenshot, whether `apachectl -k graceful` ran or is outstanding for Dr K, the bundle size, and this scenario proposed for `features/diagrams/view.feature` (never written into it):

```gherkin
  @api
  Scenario: Exporting diagrams whose names join letters or emoji
    Given "Diagrams/Joined.puml" holds the diagrams "می‌خواهم" and "👩‍💻"
    When I export "Diagrams/Joined.puml" as SVG
    Then I download "Joined.zip"
    And it holds "Joined - می‌خواهم.svg" and "Joined - 👩‍💻.svg"
```

It uses only steps `view.feature` already defines (its "Exporting every diagram of a file" scenario's).
