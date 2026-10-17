# Wall Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six fixes the live checks found (a compressed file's ETag that blocks every save, the Viewer's doubled spinner, U+2028/U+2029 read as PlantUML reads them, a linked file named `0`, hover cards in a style file, the chips' margins), then the Wall: cards packed by size on a column grid as their sizes arrive, sliding when they move, read in the order drawn, and opened at their final places from a per-browser layout memory.

**Architecture:** The fixes are small and each lands on its own: `src/editor/etag.js` (new, pure) strips the web server's `-gzip`/`-br` from every ETag taken from a response header, and the render route reads `If-None-Match` the same way; `diagram-view.js` says it is ready once its sheets show; the PHP and JS scans stop treating U+2028/U+2029 as line ends or indentation; the overrides guard drops `array_is_list`; the style-file state gets `plantumlDocs`; the chip, chooser and stepper button rules outrank core's button margins. For the Wall, a pure `src/viewer/wall-layout.js` packs `{width, height}|null` items into grid placements (columns about 260 px, rows of 8 px, tallest first into the first free spot, spans and scale rules); `src/viewer/wall-memory.js` keeps the sizes a wall was packed with in `localStorage` by path + ETag + column count; `diagram-view.js` re-packs on each `plantuml-viewer:settled` and stage resize (batched), applies the placements as `grid-column`/`grid-row` spans and CSS variables, reorders the cards into reading order around the focused one, and slides moved cards (FLIP); `css/viewer.css` makes the Wall a grid and pins the chrome the packer counts.

**Tech Stack:** PHP 8.4 (Nextcloud 34 OCP, PHPUnit), plain ES modules in the IIFE Files bundle and the editor's ES module (Vite 8 / Rolldown), CodeMirror 6, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (the Viewer section, VW5, VW9, VW11, and VW12–VW13 added by Task 7; the `POST /apps/plantuml/render` routes row; Known limitations) and `docs/superpowers/specs/2026-10-14-editor-design.md` (S1, B1, R9, R12). Dr K approved the Wall design in chat on 2026-10-17 (Wall mode only; Tabs and Stack keep file order); the six fixes come from the linked-files and viewer-polish live checks, as the coordinator relayed them. Each task writes its own spec change as agreed; Task 12 flips them to shipped.

**Built with (kb MCP skills):** `skill://superpowers/writing-plans/SKILL.md` and `skill://superpowers/test-driven-development/SKILL.md` were asked for. The kb MCP server was not reachable from the planning session (no MCP resource tool was offered), so the same-named skills of the superpowers plugin were followed instead (`superpowers:writing-plans`, `superpowers:test-driven-development`). The executor reads the selenium-flow skills named in **Live verification** from the selenium-flow MCP server itself. Every code block below was run on a scratch copy of `main` (2acc742) while planning: the whole JS suite (2308 tests), eslint, PHPUnit (489 tests), cs-fixer and psalm green; every new test was watched failing on `main`'s code first; the Files bundle 100366 bytes gzipped, the editor entry 243016.

## Global Constraints

- Work on a branch `wall-round` in its own worktree under `/projects/kubed-io/`, cut from `main` (2acc742 or later); never on `main`. The other worktree, `/projects/kubed-io/nextcloud-plantuml-polish`, is not touched.
- `.feature` files: none change. The Wall is browser-only (no API), and the API-first rule keeps it out of Behat. Task 4's change is API-visible; its scenario is proposed in the final report, never written.
- Behat runs in CI only, never in the code-server pod or the Nextcloud pod; locally run `tests/integration/bin/check-step-definitions.sh`, `check-suites.sh` and `check-notes-anchors.sh`.
- The maintainer is **Dr K**; SPDX headers say `kubed-io`; fixture users are `drk`; no homelab hostname in any file (the PlantUML server is reached from the Nextcloud pod by the URL `occ plantuml:show-config` prints, never written down).
- PHP: `declare(strict_types=1)`, tabs, `final` classes.
- Copy: no new strings. The Wall adds no visible words; the moves and the memory have none.
- Every SVG on a sheet still comes through `toInlineSvg(svgText, { idPrefix: `${view prefix}${position}-` })`; the Wall only sizes it with CSS.
- Wall values (Dr K, 2026-10-17): columns about 260 px with a 16 px gap; rows of 8 px; scale never above 1, shrink only to fit the span, a span one narrower kept at 0.8 or more, accepted at 0.7 or more when it lands higher, floor 0.5, still too wide at 0.5 a full-width card that scrolls sideways; Wall-only spacing: sheet padding 16 (VW1's 40 elsewhere), gap 16, side margin 24 (today 40 / 24 / 80); moves slide in about 200 ms, none under `prefers-reduced-motion`; re-packs batched; memory bounded to 50 walls, least recently packed first.
- Nextcloud 34's `--default-clickable-area` is 34px (`apps/theming/lib/Themes/DefaultTheme.php` on the live pod, read 2026-10-17): the Wall pins its caption at 34px, which `wall-layout.js` counts.
- Budgets: the Files bundle stays at most 106000 bytes gzipped (98581 on `main`; 100366 with this plan's code). CI's chunk guard stays green: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`. The editor entry grows by tens of bytes only (242972 → 243016).
- Commands: `composer run test:unit`, `composer run lint && composer run cs:check && composer run psalm`, `npx vitest run`, `npm run lint`, `npm run build`. Psalm and cs-fixer run in the code-server pod, never in the Nextcloud pod.
- Commit messages: `<Area>: <one plain sentence>`, ending with the session's attribution line.
- Line numbers in **Files** are `main`'s (2acc742). Earlier tasks shift them: find the anchor text each step quotes.

## Review Focus

1. **A kept drawing drawn anew at another size** (an included file changed, the 200 re-check after a memory draw): the card is packed again at the new size, not left at the old one. Test: Task 10 ("packs again at the new size when a kept drawing is drawn anew").
2. **The neighbour the Viewer keeps hidden** (its stage 0 px wide): it packs nothing while hidden, so no wall is remembered under a one-column count, and packs once shown. Test: Task 10 ("packs nothing while the view is hidden…").
3. **A browser that keeps nothing** (private mode, blocked site data): the Wall still packs; only the memory is lost. Tests: Task 9 ("is no memory when the storage throws"), Task 10 ("still packs when the browser keeps nothing").
4. **A file where nothing can be drawn** (no server, every diagram refused): every card waits in file order at the 240 px slot and nothing is remembered. Test: Task 10 ("keeps every card waiting in file order…").
5. **A compressed render answer** (`ETag: "x-gzip"` on `GET /render`): the Viewer's page-cache check and the browser's own revalidation still get 304. Tests: Task 1 ("checks a kept sheet by the ETag the route gave, without the web server's -gzip"; `testIfNoneMatchWithTheWebServersMarkIs304`).

## Rulings

Each as `Ruling: <what> — <why> — <cost if wrong>`.

- Ruling: `plainEtag` lives in a module of its own, `src/editor/etag.js`, with no imports, used by `save.js` (GET and PUT headers) and `viewer/sheets.js` (the render route's ETag) — the Viewer's sheets need it in the Files bundle, and `diagram-view.test.js` mocks `save.js` whole — none.
- Ruling: `currentEtag` (the Depth-0 PROPFIND) is left as it is — `getetag` travels in the XML body, which compression never alters — none.
- Ruling: `GET /render` strips a trailing `-gzip` or `-br` from `If-None-Match` before comparing — the browser sends a compressed answer's ETag back as it got it, so the route never answered 304 to it (sweeping the class the save bug belongs to) — none.
- Ruling: the Viewer is ready (the Viewer's own spinner goes) once the file is read and the stage, or the problem line, shows — and not while the Viewer keeps the view hidden: it becomes ready when shown, and Viewer stable34's `Mime` mixin re-calls `doneLoading()` on its own `active` watcher once loaded — a sheet's spinner then shows alone — none.
- Ruling: U+2028 and U+2029 are ordinary characters, as PlantUML reads them — the live server (1.2026.8, 2026-10-17, by `POST /svg/<n>` from the Nextcloud pod) opened a block on `@startuml second<U+2028>tail`, `@startuml third<U+2029>`, `@startuml<U+2028>x` and `@start<word><U+2028>x`, closed one on `@enduml<U+2029>`, drew a page for `newpage x<U+2028>y`, but answered **a syntax error** for a lone `newpage<U+2028>` and for `<U+2028>newpage`, opened nothing on `<U+2028>@startuml x` and closed nothing on `<U+2028>@enduml` — so both scans read a line's tail as `[^\n\r]*`, and the indentation before `@start`, `@end` and `newpage`, and the space after `newpage`, as whitespace without U+2028/U+2029 — a lone `newpage<U+2028>` is not a page, against the note "a lone `newpage<U+2028>` starts a page", which the server contradicts.
- Ruling: a name with a separator inside keeps it (`second<U+2028>tail`), and a trailing one is trimmed as a space (`third<U+2029>` is `third`), as the name trimming (`LEAD`, `TAIL`, JS `\s`) already reads them — PlantUML's own name for such a block cannot be seen from the server — a tab label or `diagram=` name may differ from PlantUML's for such a block.
- Ruling: the JS id check `/[\r  ]/` goes — PHP never had it, and with the new tail it would make the two scans disagree on `@startuml(id=a<U+2028>b)` — none.
- Ruling: every key of `overrides` is a path — `json_decode(…, true)` turns `{"0": "x"}` into the list `[0 => 'x']`, so the list refusal made a linked file named `0` a 400 on every render; a JSON array `["x"]` now names a file `0`, which the resolver reads only if the caller can read it — none.
- Ruling: a style file gets `plantumlDocs` only with its profile — without the profile there is no style grammar, no tokens and so no card — none.
- Ruling: the chip, the chooser and the stepper's buttons go under `.cm-content` with `marginInlineStart` — core's `button:not(.button-vue, [class^="vs__"]):not(.app-navigation-entry-button)` is (0,2,1), comes later and sets `margin: 3px; margin-inline-start: 0`; the scoped `.ͼN .cm-plantuml-link-chip` is (0,2,0) and loses whichever margin property it names, so a logical property alone would not do; (0,3,1) wins, as the doc card's × already does; the chooser (2 px) and the stepper's buttons (margin 0) have the same bug — the stepper's buttons lose core's 3px margins, which no board drew.
- Ruling: the memory keeps each diagram's drawn size, not its placement, keyed by path + WebDAV ETag + column count as Dr K approved — the columns' width varies within one count, and `pack` gives the same placements for the same sizes, so recomputing is instant and fits the current width; sizes do not depend on the width, so a later round could drop the column count from the key and let a new width open settled too (Dr K's call) — one stored entry per column count holds the same sizes.
- Ruling: every pack that knows a size is remembered, not only a complete one — a wall scrolled only half way still opens half settled — a few `localStorage` writes per open.
- Ruling: cards of no known size are packed after the known ones, in file order, into the first free spots, so they fill the holes the packing leaves — "after the packed ones" in packing order; the wall has no holes while it loads — a waiting card may sit beside a packed one and move when its size comes.
- Ruling: a card whose diagram fails (a problem line) keeps the 240 px waiting slot — its size is never known — a short problem card leaves room under it.
- Ruling: re-packs are batched: 150 ms after the last size arrived, at most 500 ms after the first waiting one; the first placement of a mode switch is immediate — the wall settles a few times while 3 drawings are in flight, never once per image, and a long stream still settles every half second — none.
- Ruling: the chrome is counted, not measured: card 1 px border and 4 px padding a side, caption pinned at 34px in the Wall, a 4 px gap, sheet padding 16; each sheet's height is set by the packing (`--plantuml-wall-height`), its drawing's width too (`--plantuml-wall-width`), the drawing fitted inside (`max-height: 100%`); a CSS test holds `viewer.css` to the numbers — jsdom lays nothing out, and a measured chrome would need a laid-out card before the first pack — a theme that changes the card's border or padding fails the CSS test, not the users.
- Ruling: `scrollbar-gutter: stable` on the Wall — a vertical scrollbar coming or going would change the columns' width, re-pack, and could loop — the wall sits a scrollbar's width off centre.
- Ruling: a full-width card that scrolls sideways gets 16 px more sheet height for a classic scrollbar — overlay scrollbars need none, classic ones about 15 — 16 px of slack under such a card where scrollbars overlay.
- Ruling: moves slide by FLIP on re-packs only (not the first placement of a mode switch); a slide under way stops where it is when the next pack starts — the cards were just made — none.
- Ruling: the cards move in the DOM into reading order (row, then column); the card holding the focus never moves (`held.before(…)`, `held.after(…)` move the others) — removing a focused node loses the focus — none.
- Ruling: the Penpot board `screens / viewer-wall` is left as it is (file order) and the spec says so — Dr K approved the packing without a board, and a packed board would be a guess at one stage width — the board shows the Wall as it was.
- Ruling: CHANGELOG — the Viewer, the editor and linked files are unreleased, so only the Wall's line is amended; the six fixes need no line of their own — none.

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
| `src/editor/etag.js` (create) | `plainEtag`: an ETag without the web server's `-gzip`/`-br` or a weak `W/`. |
| `src/editor/save.js` (modify) | `loadFile` and every PUT keep the plain ETag. |
| `src/viewer/sheets.js` (modify) | The render route's ETag kept plain for its `If-None-Match`. |
| `lib/Controller/RenderController.php` (modify) | `If-None-Match` read without `-gzip`/`-br`; every override key a path. |
| `src/viewer/diagram-view.js` (modify) | Ready once its sheets show; the Wall's packing, memory, resize, reading order and slides. |
| `src/editor/blocks.js`, `lib/Service/Diagrams.php` (modify) | U+2028/U+2029 as PlantUML reads them. |
| `tests/fixtures/diagrams/line-separator.puml`, `expected.json` (modify) | The separator cases PlantUML answered. |
| `src/editor/linked/sheet.js` (modify) | A style file's hover cards. |
| `src/editor/theme.js` (modify) | The chip's, chooser's and stepper's margins over core's. |
| `src/viewer/wall-layout.js` (create) | The pure packer: `columnsFor`, `pack`, `visualOrder`. |
| `src/viewer/wall-memory.js` (create) | The Wall's layout memory: `recall`, `remember`. |
| `css/viewer.css` (modify) | The Wall as a grid; its pinned chrome; slides; the sideways-scrolling card. |
| `docs/superpowers/specs/…`, `CHANGELOG.md`, `AGENTS.md` (modify) | The rows and lines this round adds and changes. |

---

### Task 1: An ETag the web server compressed still saves and still matches

**Files:**
- Create: `src/editor/etag.js`
- Modify: `src/editor/save.js` (imports, `loadFile` `:25-38`, `etagOf` `:194-201`)
- Modify: `src/viewer/sheets.js` (imports `:21-24`, the `cache.set` line `:157`)
- Modify: `lib/Controller/RenderController.php:101`
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (S1, line 52), `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (VW11)
- Test: `tests/js/compressed-etag.test.js` (create), `tests/js/save.test.js`, `tests/js/viewer/sheets.test.js`, `tests/unit/RenderControllerTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `plainEtag(etag: string|null|undefined): string|null|undefined` in `src/editor/etag.js`. `loadFile(path)` resolves `{ content, etag }` with the plain ETag; `saveFile` and `saveCopy` resolve plain ETags; a page-cache entry's `serverEtag` is plain.

- [ ] **Step 1: The failing tests, through the real save and session**

`tests/js/compressed-etag.test.js`:

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A file the web server sends compressed (a linked .css of a hundred bytes or more): its GET's
// ETag carries `-gzip`. Through the real save.js and file session, with only the DAV client and
// the watcher's clock mocked: the save is not refused and the clean file is not read again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from '@codemirror/state'

const seams = vi.hoisted(() => ({ client: { getFileContents: vi.fn(), customRequest: vi.fn(), stat: vi.fn() }, watchFile: vi.fn() }))
vi.mock('@nextcloud/files/dav', () => ({
  getClient: () => seams.client,
  getRootPath: () => '/files/drk',
  getDefaultPropfind: () => '<propfind/>',
  resultToNode: (stat) => stat,
}))
vi.mock('../../src/editor/watch.js', () => ({ watchFile: seams.watchFile }))

const { loadFile } = await import('../../src/editor/save.js')
const { createFileSession } = await import('../../src/editor/file-session.js')

const PATH = '/Diagrams/UML_Fun.css'
let session

/** The file as the editor opens it, read through the web server that compressed it. */
async function opened() {
  seams.client.getFileContents.mockResolvedValue({ data: 'a {}\n', headers: { etag: '"e1-gzip"' }, status: 200 })
  const file = await loadFile(PATH)
  let text = Text.of(file.content.split('\n'))
  session = createFileSession({ path: PATH, etag: file.etag, doc: () => text, replace: (content) => { text = Text.of(content.split('\n')) }, onChange: () => {} })
  return { type: (content) => { text = Text.of(content.split('\n')); session.edited() } }
}

beforeEach(() => {
  vi.resetAllMocks()
  seams.watchFile.mockReturnValue({ stop: vi.fn() })
  // Sabre's getetag, which webdav's stat hands over unquoted.
  seams.client.stat.mockResolvedValue({ filename: `/files/drk${PATH}`, etag: 'e1' })
})
afterEach(() => session?.stop())

describe('a file the web server compresses', () => {
  it('is saved against the ETag Sabre knows, not the -gzip one', async () => {
    seams.client.customRequest.mockResolvedValue(new Response(null, { status: 204, headers: { ETag: '"e2"' } }))
    const { type } = await opened()
    type('b {}')

    await session.save()

    expect(seams.client.customRequest).toHaveBeenCalledWith(`/files/drk${PATH}`, expect.objectContaining({ headers: { 'If-Match': '"e1"' } }))
    expect(session.status().state).toBe('saved')
  })

  it('is unchanged to the watcher while its getetag is the one it was read at', async () => {
    await opened()
    session.start()
    const { check } = seams.watchFile.mock.calls[0][0]

    await check()
    await check()

    expect(seams.client.getFileContents).toHaveBeenCalledOnce()
    expect(session.status().state).toBe('saved')
  })
})
```

In `tests/js/save.test.js`, in `describe('loadFile', …)` after the test `'reads the file from the user folder with its ETag'`:

```js
  // Apache's mod_deflate and mod_brotli mark a compressed answer's ETag; Sabre knows the file by the plain one.
  for (const [sent, kept] of [['"e1-gzip"', '"e1"'], ['"e1-br"', '"e1"'], ['W/"e1-gzip"', '"e1"'], ['"e1-gzipped"', '"e1-gzipped"']]) {
    it(`keeps the ETag ${sent} as ${kept}`, async () => {
      client.getFileContents.mockResolvedValue({ data: 'a {}\n', headers: { etag: sent }, status: 200 })

      await expect(loadFile('/Diagrams/UML_Fun.css')).resolves.toEqual({ content: 'a {}\n', etag: kept })
    })
  }
```

and in `describe('saveFile', …)` before `'takes the new ETag from OC-ETag when ETag is missing'`:

```js
  it('resolves with the new ETag as Sabre has it, without the web server\'s -gzip', async () => {
    client.customRequest.mockResolvedValue(new Response(null, { status: 204, headers: { ETag: '"e2-gzip"' } }))

    await expect(saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"')).resolves.toBe('"e2"')
  })
```

In `tests/js/viewer/sheets.test.js`, before `'draws anew a kept sheet the server has drawn anew, its size and what is kept with it'`:

```js
  it('checks a kept sheet by the ETag the route gave, without the web server\'s -gzip', async () => {
    fetch.mockImplementation(async () => svgAnswer(WITH_ID, { ETag: '"srv1-gzip"' }))
    await drawn(sheetsOf('"e"'), 1)
    fetch.mockImplementation(() => new Promise(() => {}))
    sheetsOf('"e"', 'view-2-').request(1)

    expect(ifNoneMatch(fetch.mock.calls[1])).toBe('"srv1"')
  })
```

In `tests/unit/RenderControllerTest.php`, before `testServerProblemIs503WithProblem`:

```php
	/** The web server marks the ETag of an answer it compressed; the browser sends it back so. */
	#[DataProvider('compressedEtags')]
	public function testIfNoneMatchWithTheWebServersMarkIs304(string $ifNoneMatch): void {
		$response = $this->controller($this->renderingNothing(), $this->diagram(), $ifNoneMatch)->byPath('Diagrams/Order flow.puml');

		self::assertSame(304, $response->getStatus());
	}

	/** @return iterable<string, array{string}> */
	public static function compressedEtags(): iterable {
		yield 'gzip' => ['"abc123-gzip"'];
		yield 'brotli' => ['"abc123-br"'];
		yield 'weak gzip' => ['W/"abc123-gzip"'];
	}
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/js/compressed-etag.test.js tests/js/save.test.js tests/js/viewer/sheets.test.js && composer run test:unit -- --filter WebServersMark`
Expected: FAIL — 7 JS tests (the save sends `If-Match: "e1-gzip"`; the watcher reads the file again; the kept ETags keep `-gzip`) and 3 PHP cases (200, not 304).

- [ ] **Step 3: `src/editor/etag.js`**

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * An ETag as the server's own code made it, from a response header: the web
 * server's compression adds `-gzip` or `-br` inside the quotes (Apache's
 * mod_deflate and mod_brotli), which If-Match then never matches (412), the
 * PROPFIND's `getetag` never equals and the render route's If-None-Match never
 * meets; a weak `W/` goes too. Pure, for the editor and the Viewer alike.
 */

/**
 * @param {string|null|undefined} etag
 * @return {string|null|undefined} the same when there is none
 */
export function plainEtag(etag) {
  return typeof etag === 'string' ? etag.replace(/^W\//, '').replace(/-(?:gzip|br)"$/, '"') : etag
}
```

- [ ] **Step 4: Every ETag from a response header goes through it**

`src/editor/save.js`: after `import { getClient, … } from '@nextcloud/files/dav'` add `import { plainEtag } from './etag.js'`; in `loadFile`'s JSDoc `@return {Promise<{content: string, etag: string}>}` becomes `@return {Promise<{content: string, etag: string}>} the ETag as Sabre has it (`plainEtag`)`; its last line becomes:

```js
  return { content: res.data, etag: plainEtag(res.headers.etag) }
```

and `etagOf`'s first line becomes:

```js
  const etag = plainEtag(res.headers.get('ETag') ?? res.headers.get('OC-ETag'))
```

`src/viewer/sheets.js`: after `import { toInlineSvg } from '../editor/inline-svg.js'` add `import { plainEtag } from '../editor/etag.js'`; the `cache.set(…)` line becomes:

```js
          // The ETag the route gave, without the web server's `-gzip`, so its If-None-Match matches.
          cache.set(key, { svg: body, size, serverEtag: plainEtag(res.headers.get('ETag')) })
```

`lib/Controller/RenderController.php:101` becomes:

```php
		// The browser sends back the ETag as it got it, with the web server's `-gzip` or `-br` if it compressed the answer.
		if (preg_replace('/-(?:gzip|br)$/', '', trim(str_replace('W/', '', $this->request->getHeader('If-None-Match')), '"')) === $file->etag) {
```

Sweep check — Run: `grep -rn "headers.etag\|get('ETag')\|getHeader('If-None-Match')" src lib`
Expected: each hit goes through `plainEtag` or the `preg_replace` above; nothing else keeps an ETag from a header (`currentEtag` reads the PROPFIND body, Ruling).

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run && composer run test:unit`
Expected: PASS, every suite.

- [ ] **Step 6: The spec**

Editor spec S1: after `a WebDAV `PUT` with `If-Match` and the ETag last read or written.` insert:

```markdown
 Every ETag taken from a response header is kept as Sabre made it: the `-gzip` or `-br` the web server's compression adds inside the quotes, and a weak `W/`, are taken off (`editor/etag.js`), so a file sent compressed (a linked `.css` of a hundred bytes or more) still saves, and still equals the watcher's `getetag`.
```

and its status `shipped (#4)` becomes `shipped (#4); compressed ETags agreed (wall round)`.

App spec VW11: `(`If-None-Match` with the server's own ETag from `GET /render`)` becomes:

```markdown
(`If-None-Match` with the server's own ETag from `GET /render`, without the web server's `-gzip` or `-br`, which the route also takes off what the browser sends)
```

- [ ] **Step 7: Commit**

```bash
git add src/editor/etag.js src/editor/save.js src/viewer/sheets.js lib/Controller/RenderController.php tests/js/compressed-etag.test.js tests/js/save.test.js tests/js/viewer/sheets.test.js tests/unit/RenderControllerTest.php docs/superpowers/specs/
git commit -m "Editor: a file the web server compresses still saves, and its ETag still matches"
```

### Task 2: The Viewer's own spinner goes once the sheets show theirs

**Files:**
- Modify: `src/viewer/diagram-view.js` (header comment `:13-15`; `let ready`/`settle` `:84-92`; the file-read `.then` `:318-321`; the failure branch `:326-329`; `setActive` `:334-339`)
- Modify: `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (VW9)
- Test: `tests/js/viewer/diagram-view.test.js` (`'is ready once, when the first sheet is drawn'` `:160`, `'does nothing more once destroyed mid-load'` `:181`, `'asks for nothing while hidden before its file is read…'` `:476`)

**Interfaces:**
- Consumes: nothing.
- Produces: `onReady` is called once, when the file is read and the stage (or the problem line) shows while the view is active; a view hidden then calls it when `setActive(true)`. The component (`viewer-component.js`) is unchanged: it still passes `onReady: () => this.doneLoading()`.

- [ ] **Step 1: The failing tests**

Replace the test `'is ready once, when the first sheet is drawn'` with:

```js
  it('is ready once, when the file is read and its sheet shows its own spinner, before it is drawn', async () => {
    fetch.mockImplementation(() => new Promise(() => {}))
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    const onReady = vi.fn()
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady })
    expect(onReady).not.toHaveBeenCalled()
    await settle()

    expect(root.querySelector('.plantuml-viewer__stage .plantuml-viewer__sheet--loading .plantuml-viewer__spinner')).not.toBeNull()
    expect(onReady).toHaveBeenCalledOnce()
    root.querySelectorAll('[role="tab"]')[1].click()
    await settle()
    expect(onReady).toHaveBeenCalledOnce()
  })
```

In `'does nothing more once destroyed mid-load'`, the last line `expect(onReady).not.toHaveBeenCalled()` becomes:

```js
    // Ready when its sheets showed, before the destroy; nothing since.
    expect(onReady).toHaveBeenCalledOnce()
```

Replace `'asks for nothing while hidden before its file is read, and is ready once shown and drawn'` with these two:

```js
  it('asks for nothing and is not ready while hidden before its file is read, and is both once shown', async () => {
    let read
    seams.loadFile.mockReturnValue(new Promise((resolve) => { read = resolve }))
    const onReady = vi.fn()
    const view = createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady })
    view.setActive(false)
    read({ content: THREE, etag: '"e"' })
    await settle()
    expect(fetch).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()

    view.setActive(true)
    expect(asked(fetch)).toEqual(['0'])
    expect(onReady).toHaveBeenCalledOnce()
    view.setActive(false)
    view.setActive(true)
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('is ready once shown when the file could not be read while hidden', async () => {
    let fail
    seams.loadFile.mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
    const onReady = vi.fn()
    const view = createDiagramView(root, { path: '/D/Gone.puml', basename: 'Gone.puml', onReady })
    view.setActive(false)
    fail(new Error('404'))
    await settle()
    expect(onReady).not.toHaveBeenCalled()

    view.setActive(true)
    expect(root.textContent).toBe('Could not draw the diagram')
    expect(onReady).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/js/viewer/diagram-view.test.js`
Expected: FAIL — 4 tests (ready only once a sheet is drawn; ready while hidden).

- [ ] **Step 3: Ready when shown, and only while active**

In `src/viewer/diagram-view.js`, the block from `let ready = false` to the end of `settle` becomes:

```js
  let ready = false
  // The file is read and its stage (or the problem line) shows.
  let shown = false
  // A card → the position of its sheet.
  const positions = new WeakMap()
  // Ready once shown, and only while the Viewer shows this file: a neighbour is ready once it is.
  const settle = () => {
    if (shown && active && !ready && !destroyed) {
      ready = true
      onReady()
    }
  }
```

In the file-read `.then`, the three lines from `// Before show(): a drawing kept for the page settles…` to `show()` become:

```js
    show()
    // Each sheet has its own spinner: the Viewer's goes now, not once the first is drawn.
    shown = true
    settle()
```

In the failure branch, `root.replaceChildren(line)` is followed by `shown = true` before its `settle()`. In `setActive`, `settle()` is the last line, after the `if (sheets && !destroyed) { want() }` block. The header comment's sentence `Only what is on screen is drawn (VW10): … a hidden view asks for nothing.` gains:

```js
 * visible part of the stage; a hidden view asks for nothing. The view is ready
 * (the Viewer's own spinner goes) once the file is read and its sheets, each
 * with its spinner, are in place (VW9).
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/js/viewer/ tests/js/viewer-component.test.js`
Expected: PASS.

- [ ] **Step 5: The spec, and commit**

VW9: after `and is announced busy (`aria-busy`).` insert ` The Viewer's own loading spinner goes as soon as the file is read and its sheets are in place, so only the sheet's shows; a file the Viewer keeps hidden beside the one shown is ready once shown.` Its status `shipped (viewer-polish round)` becomes `shipped (viewer-polish round); one spinner agreed (wall round)`.

```bash
git add src/viewer/diagram-view.js tests/js/viewer/diagram-view.test.js docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md
git commit -m "Viewer: its own spinner goes once the sheets show theirs"
```

### Task 3: Line and paragraph separators read as PlantUML reads them

**Files:**
- Modify: `src/editor/blocks.js:10-14` (the patterns), `:36-38` (the id check)
- Modify: `lib/Service/Diagrams.php:30-34`
- Modify: `tests/fixtures/diagrams/line-separator.puml`, `tests/fixtures/diagrams/expected.json` (`line-separator.puml`, `long-word-separator.puml`)
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (B1, line 185)
- Test: `tests/js/blocks.test.js:164-168`, `tests/unit/DiagramsTest.php:88-93` (the fixture cases run in both)

**Interfaces:**
- Consumes: nothing.
- Produces: `scan(text)` (JS) and `Diagrams::scan($text)` (PHP) agree with each other and with PlantUML 1.2026.8 on U+2028/U+2029 (Ruling).

- [ ] **Step 1: The fixture PlantUML answered**

Write it with the separators as bytes (they are invisible in an editor):

```bash
printf '@startuml first\nA -> B\nnewpage x\342\200\250y\nB -> A\n@enduml\n@startuml lone\nA -> B\nnewpage\342\200\250\nB -> A\n@enduml\n@startuml second\342\200\250tail\nC -> D\n@enduml\n@startuml third\342\200\251\nE -> F\n@enduml\342\200\251\n\342\200\250@startuml x\nG -> H\n@enduml\n' > tests/fixtures/diagrams/line-separator.puml
```

Check it against the live server from the Nextcloud pod (Live verification step 1's `$P`; the server's URL from `occ plantuml:show-config`, typed into the command, never into a file), the file on stdin and never through `sh -c`:

```bash
for n in 0 1 2 3 4 5; do kubectl -n cloud exec -i $P -c nextcloud -- curl -s -o /dev/null -w "$n %{http_code}\n" --data-binary @- "<server URL>/svg/$n" < tests/fixtures/diagrams/line-separator.puml; done
```

Expected: `0 200`, `1 200`, `2 400` (the `lone` block's syntax error, an image), `3 200`, `4 200`, `5 400` (no sixth image): five diagrams, the last line's block not opened.

- [ ] **Step 2: The expected rows**

In `tests/fixtures/diagrams/expected.json`, the `"line-separator.puml"` entry becomes:

```json
  "line-separator.puml": [
    { "index": 0, "type": "uml", "name": "first", "id": null, "page": 1, "pages": 2, "from": 1, "to": 2, "start": 1, "end": 5, "render": 0, "drawn": true },
    { "index": 1, "type": "uml", "name": "first", "id": null, "page": 2, "pages": 2, "from": 3, "to": 4, "start": 1, "end": 5, "render": 1, "drawn": true },
    { "index": 2, "type": "uml", "name": "lone", "id": null, "page": 1, "pages": 1, "from": 6, "to": 9, "start": 6, "end": 10, "render": 2, "drawn": true },
    { "index": 3, "type": "uml", "name": "second tail", "id": null, "page": 1, "pages": 1, "from": 11, "to": 12, "start": 11, "end": 13, "render": 3, "drawn": true },
    { "index": 4, "type": "uml", "name": "third", "id": null, "page": 1, "pages": 1, "from": 14, "to": 15, "start": 14, "end": 16, "render": 4, "drawn": true }
  ],
```

and `"long-word-separator.puml"` (`@start` + 5000 `a` + U+2028 + `x`, which PlantUML opens as an unknown type) becomes one row, written by script for its 5000-letter type:

```bash
python3 - <<'EOF'
p = 'tests/fixtures/diagrams/expected.json'
s = open(p).read()
old = '    { "index": 0, "type": "uml", "name": "", "id": null, "page": 1, "pages": 1, "from": 1, "to": 4, "start": null, "end": null, "render": 0, "drawn": true }\n  ],\n  "long-name.puml"'
new = '    { "index": 0, "type": "%s", "name": "x", "id": null, "page": 1, "pages": 1, "from": 1, "to": 2, "start": 1, "end": 3, "render": 0, "drawn": true }\n  ],\n  "long-name.puml"' % ('a' * 5000)
assert old in s
open(p, 'w').write(s.replace(old, new))
EOF
```

The two timing guards keep their timing and assert the block PlantUML opens. `tests/js/blocks.test.js`'s `'reads a 40,000-letter @start word cut by a line separator in under 200 ms'` becomes:

```js
  it('reads a 40,000-letter @start word with a line separator after it in under 200 ms, as PlantUML opens it', () => {
    const [diagrams, ms] = timed(`@start${'a'.repeat(40000)} x\n@enduml`)
    expect(diagrams.map((d) => [d.start, d.name])).toEqual([[1, 'x']])
    expect(ms).toBeLessThan(200)
  })
```

and `tests/unit/DiagramsTest.php`'s `testALongStartWordCutByALineSeparatorOpensNoBlock` becomes:

```php
	/** A long `@start` word and a line separator once exhausted PCRE's backtrack limit and threw; PlantUML opens the block. */
	public function testALongStartWordWithALineSeparatorAfterItOpensItsBlock(): void {
		$diagrams = Diagrams::scan('@start' . str_repeat('a', 40000) . "\u{2028}x\n@enduml\n");
		self::assertSame(['x'], array_column($diagrams, 'name'));
		self::assertSame([str_repeat('a', 40000)], array_column($diagrams, 'type'));
	}
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/js/blocks.test.js && composer run test:unit -- --filter DiagramsTest`
Expected: FAIL — the two fixtures and the timing guard in each language (the old scans drop `second…`, `third` and `x`'s word, and count `newpage<U+2028>`).

- [ ] **Step 4: The JS scan**

In `src/editor/blocks.js`, the comment and the three patterns from `// `(?=(\w+))\1` is a possessive` to `const NEWPAGE = …` become:

```js
// PlantUML (Java) splits lines at \n and \r only: U+2028 and U+2029 are ordinary characters, never
// a line's end and never the indent before `@start`, `@end` or `newpage`, nor the space after
// `newpage` (1.2026.8, checked 2026-10-17). `(?=(\w+))\1` is a possessive `\w+`, PHP's `++`: a
// line that fails at `$` is not retried one letter shorter, which is quadratic.
const START = /^[^\S  ]*@start(?=(\w+))\1([^\n\r]*)$/
const END = /^[^\S  ]*@end\w*\s*$/
const NEWPAGE = /^[^\S  ]*newpage(?:[^\S  ][^\n\r]*)?$/
```

and in `startOf`, the three lines from `// `.` stops at a line terminator…` to `id = /[\r  ]/.test(value) ? null : value || null` become:

```js
    const value = lead === undefined ? '' : untailed(call[1].slice(lead.length), /\s/)
    id = value || null
```

- [ ] **Step 5: Its PHP twin**

In `lib/Service/Diagrams.php`, from the `DOT` docblock to the `NEWPAGE` constant becomes:

```php
	/**
	 * PlantUML (Java) ends a line at \n and \r only: U+2028 and U+2029 are ordinary characters in it,
	 * never the indent before `@start`, `@end` or `newpage`, nor the space after `newpage`.
	 */
	private const DOT = '[^\n\r]';
	private const INDENT = '[\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}\x{FEFF}]';
	private const START = '/^' . self::INDENT . '*@start(' . self::W . '++)(' . self::DOT . '*)$/u';
	private const END = '/^' . self::INDENT . '*@end' . self::W . '*' . self::S . '*$/u';
	private const NEWPAGE = '/^' . self::INDENT . '*newpage(?:' . self::INDENT . self::DOT . '*)?$/u';
```

(`INDENT` is `SC` without U+2028 and U+2029; `S`, `LEAD`, `TAIL` and `SPACE` keep them, as JS's `\s` does.)

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run && composer run test:unit && composer run psalm`
Expected: PASS; the backtracking guards (`testANameWithAHugeRunOfSpacesIsRead`, the 200,000-space and 40,000-letter JS tests) stay green.

- [ ] **Step 7: The spec, and commit**

In B1, the sentence `A U+2028 or U+2029 inside the rest of an `@start` or `newpage` line stops it matching, in both scans, as JavaScript's `.` stops at both; the PHP twin reads it the same.` becomes:

```markdown
U+2028 and U+2029 are ordinary characters, as PlantUML reads them (Java ends a line only at `\n` and `\r`; checked on 1.2026.8, 2026-10-17): inside the rest of an `@start` or `newpage` line they are part of it (`@startuml second<U+2028>tail` opens a block, `newpage x<U+2028>y` a page), but they are never the indentation before `@start`, `@end` or `newpage`, nor the space after `newpage` (`newpage<U+2028>` starts no page; PlantUML answers it as a syntax error). Both scans read them so.
```

and B1's status `and line separators shipped (viewer-polish round)` becomes `and line separators shipped (viewer-polish round); line separators as PlantUML reads them agreed (wall round)`.

```bash
git add src/editor/blocks.js lib/Service/Diagrams.php tests/fixtures/diagrams/line-separator.puml tests/fixtures/diagrams/expected.json tests/js/blocks.test.js tests/unit/DiagramsTest.php docs/superpowers/specs/2026-10-14-editor-design.md
git commit -m "Diagrams: line and paragraph separators read as PlantUML reads them"
```

### Task 4: A linked file named `0` takes its unsaved text

**Files:**
- Modify: `lib/Controller/RenderController.php:128-129`
- Modify: `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (the `POST /apps/plantuml/render` row, line 187)
- Test: `tests/unit/RenderControllerTest.php` (`malformedOverrides` `:994`; a new test after `testAnAllDigitOverrideKeyNamesItsFile`)

**Interfaces:**
- Consumes: nothing.
- Produces: `bySource(…, $overrides)` reads every key as a path; a 400 only for overrides without a `path`, a text that is not a string, a non-array, or more than 64.

- [ ] **Step 1: The failing test**

In `malformedOverrides`, delete the line `yield 'a list' => [['b {}']];`. Before `/** @return iterable<string, array{array<string, string>|null}> */` over `noOverrides`, add:

```php
	/** json_decode makes `{"0": …}` the list [0 => …]: a linked file named `0` is still a path. */
	public function testAnOverrideForAFileNamedZeroIsDrawn(): void {
		$source = "@startuml\n<style file=0>\nA -> B\n@enduml\n";
		$files = [
			'Diagrams/Order flow.puml' => $this->diagram('text/x-plantuml', $source),
			'Diagrams/0' => $this->diagram('text/plain', "a {}\n", 'css1', '0'),
		];
		$overrides = json_decode('{"0": "b {}\\n"}', true);
		self::assertTrue(array_is_list($overrides));
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $files)->bySource($source, 0, '/Diagrams/Order flow.puml', $overrides);

		self::assertSame(200, $response->getStatus());
		self::assertSame("@startuml\n<style>\nb {}\n</style>\nA -> B\n@enduml\n", $sent);
	}
```

- [ ] **Step 2: Run it to see it fail**

Run: `composer run test:unit -- --filter NamedZero`
Expected: FAIL — `Failed asserting that 400 is identical to 200.`

- [ ] **Step 3: Every key is a path**

The comment and condition at `RenderController.php:128-129` become:

```php
		// Every key is a path: json_decode makes `{"0": …}` the list [0 => …], and "2024" the int 2024.
		if (!is_array($overrides) || ($overrides !== [] && $path === '') || count($overrides) > self::MAX_OVERRIDES) {
```

- [ ] **Step 4: Run it to see it pass**

Run: `composer run test:unit && composer run psalm && composer run cs:check`
Expected: PASS; psalm "No errors found!"; cs-fixer finds nothing.

- [ ] **Step 5: The spec, and commit**

In the `POST /apps/plantuml/render` row, before `A request with overrides but no `path`, a malformed override or more than 64 is a `400`` insert `Every key is a path, `0` and `2024` included (JSON's `{"0": …}` reaches PHP as a list). `.

```bash
git add lib/Controller/RenderController.php tests/unit/RenderControllerTest.php docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md
git commit -m "Render: a linked file named 0 takes its unsaved text"
```

### Task 5: A style file has the hover cards its lines have inside `<style>`

**Files:**
- Modify: `src/editor/linked/sheet.js` (header `:5-7`, imports, the profile branch `:24-31`)
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (R12, line 403)
- Test: `tests/js/style-sheet.test.js`

**Interfaces:**
- Consumes: `plantumlDocs` from `src/editor/docs/hover.js` (unchanged).
- Produces: `sheetExtension(profile)` includes `plantumlDocs` when `profile` is not null.

- [ ] **Step 1: The failing test**

In `tests/js/style-sheet.test.js`, after `import { sheetExtension } from '../../src/editor/linked/sheet.js'`:

```js
import { docSource } from '../../src/editor/docs/hover.js'
import { loadDocs } from '../../src/editor/docs/index.js'
```

and first in `describe('a style file', …)`:

```js
  it('opens the hover cards the same lines open inside <style>: its selectors and properties', async () => {
    const view = new EditorView({ parent: document.body, state: await sheet(SHEET) })
    // The view asks for the docs as it opens; they are in once loadDocs answers.
    await loadDocs()
    const at = (word) => SHEET.indexOf(word)
    try {
      expect(docSource(view, at('participant') + 1, 1)).toMatchObject({ pos: 0, end: 'participant'.length })
      expect(docSource(view, at('BackgroundColor') + 1, 1)).toMatchObject({ pos: at('BackgroundColor'), end: at('BackgroundColor') + 'BackgroundColor'.length })
    } finally {
      view.destroy()
    }
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/js/style-sheet.test.js`
Expected: FAIL — `expected null to match object { pos: 0, end: 11 }`.

- [ ] **Step 3: The docs in the sheet's state**

In `src/editor/linked/sheet.js`: the header's `completion, its lint and its values, and nothing of `@start` blocks.` becomes `completion, its lint, its values and its hover cards, and nothing of `@start` blocks.`; after `import { withDocs } from '../completion/docs.js'` add `import { plantumlDocs } from '../docs/hover.js'`; after `autocompletion({ addToOptions: [swatchOption] }),` add:

```js
    // After the completion, whose Escape closes its list first, as in a diagram.
    plantumlDocs,
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/js/style-sheet.test.js tests/js/hover.test.js tests/js/editor.test.js`
Expected: PASS.

- [ ] **Step 5: The spec, and commit**

R12: `its completion, its lint and W1–W4's choosers` becomes `its completion, its lint, W1–W4's choosers and the hover cards (I2) its lines have inside `<style>``; status `shipped (linked-files round)` becomes `shipped (linked-files round); hover cards agreed (wall round)`.

```bash
git add src/editor/linked/sheet.js tests/js/style-sheet.test.js docs/superpowers/specs/2026-10-14-editor-design.md
git commit -m "Editor: a style file has the hover cards its lines have in a diagram"
```

### Task 6: The chip, chooser and stepper keep their margins over core's

**Files:**
- Modify: `src/editor/theme.js:390-394` (chooser, stepper), `:399-400` (chip)
- Modify: `docs/superpowers/specs/2026-10-14-editor-design.md` (R9's status)
- Test: `tests/js/theme.test.js` (`describe('the editor surface', …)`)

**Interfaces:**
- Consumes: nothing.
- Produces: the rules keyed `buttonStates('.cm-content button.cm-plantuml-chooser')`, `buttonStates('.cm-content .cm-plantuml-stepper button')`, `buttonStates('.cm-content button.cm-plantuml-link-chip')` in `surfaceRules`.

- [ ] **Step 1: The failing tests**

In `describe('the editor surface', …)`, before `'takes every colour from Nextcloud theme variables, never a literal'`:

```js
  // Core's `button:not(.button-vue, [class^="vs__"]):not(.app-navigation-entry-button)` is (0,2,1), comes
  // later, and sets `margin: 3px; margin-inline-start: 0` on every button. EditorView.theme adds a scope class.
  const specificity = (selector) => [(selector.match(/[.:][\w-]+/g) ?? []).length + 1, (selector.match(/(?:^|[\s>+~])[a-z]+/g) ?? []).length]
  const ruleFor = (button) => Object.entries(surfaceRules).find(([selector]) => selector.split(', ')[0].endsWith(button))

  it.each([
    ['button.cm-plantuml-link-chip', { margin: '0', marginInlineStart: '4px' }],
    ['button.cm-plantuml-chooser', { margin: '0', marginInlineStart: '2px' }],
    ['.cm-plantuml-stepper button', { margin: '0' }],
  ])('keeps %s\'s own margins over core\'s button margins, the one before it logical', (button, margins) => {
    const [selector, rule] = ruleFor(button)

    expect(specificity(selector.split(', ')[0])).toEqual([3, 1])
    expect(rule).toMatchObject(margins)
    expect(rule).not.toHaveProperty('marginLeft')
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/js/theme.test.js`
Expected: FAIL — 3 cases (no rule ends in `button.cm-plantuml-link-chip`; the others at (2,1)).

- [ ] **Step 3: The rules**

The chooser and stepper lines (from `// The chooser (W1) and the stepper (W2)…` to the stepper button rule) become:

```js
  // The chooser (W1) and the stepper (W2) after a value on the cursor's line:
  // quiet until pointed at. Core's `button:not(.button-vue, [class^="vs__"]):not(.app-navigation-entry-button)`
  // is (0,2,1), comes later and sets `margin: 3px; margin-inline-start: 0`: each button here is under
  // `.cm-content`, (0,3,1), and its margin before it is logical, as core's is.
  [buttonStates('.cm-content button.cm-plantuml-chooser')]: { ...QUIET_BUTTON, display: 'inline-flex', width: '16px', height: '16px', marginInlineStart: '2px', verticalAlign: 'middle' },
  '.cm-plantuml-chooser svg': { width: '12px', height: '12px' },
  '.cm-plantuml-stepper': { display: 'inline-flex', flexDirection: 'column', width: '12px', height: '18px', marginLeft: '2px', verticalAlign: 'middle' },
  [buttonStates('.cm-content .cm-plantuml-stepper button')]: { ...QUIET_BUTTON, width: '12px', height: '9px', fontSize: '7px', lineHeight: '1' },
```

and the chip's two lines become:

```js
  // R9: a linked file's chip, the chooser's size, 4 px after its path; under `.cm-content`, as the chooser.
  [buttonStates('.cm-content button.cm-plantuml-link-chip')]: { ...QUIET_BUTTON, display: 'inline-flex', width: '16px', height: '16px', marginInlineStart: '4px', verticalAlign: 'middle' },
```

(The stepper `span` keeps `marginLeft`: no core rule reaches a span.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS (the `'styles %s'` cases still find `.cm-plantuml-chooser`, `.cm-plantuml-stepper`, `.cm-plantuml-link-chip`).

- [ ] **Step 5: The spec, and commit**

R9's status `shipped (linked-files round)` becomes `shipped (linked-files round); its 4 px kept over core's button margin agreed (wall round)`.

```bash
git add src/editor/theme.js tests/js/theme.test.js docs/superpowers/specs/2026-10-14-editor-design.md
git commit -m "Editor: the chip, chooser and stepper keep their margins over core's buttons"
```

### Task 7: The spec says what the Wall adds

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (VW5, line 320; after VW11, line 326; the `viewer-component.js` units row, line 233; after the viewer-polish rulings paragraph, line 352; the Penpot `Files` row, line 387; Known limitations, lines 477–478)

**Interfaces:**
- Consumes: nothing.
- Produces: VW12, VW13 (status `agreed (wall round)`), which Tasks 8–11 cite; Task 12 flips them.

- [ ] **Step 1: VW5, and VW12–VW13 after VW11**

VW5's `**Wall**: the same cards in a wrapping grid, in file order.` becomes `**Wall**: the same cards on a grid, packed by their diagrams' sizes (VW12) and opened as last packed (VW13).`

After the VW11 row:

```markdown
| VW12 | **The Wall packs its cards by size.** A first open shows them in file order, each waiting at the 240 px sheet in one column, and asks for them as VW10 says. As each diagram's drawn size arrives (twice when a kept drawing is drawn anew), the whole wall is packed again on a grid of columns about 260 px wide (their count from the stage's width, a 16 px gap) and rows of 8 px: a diagram spans the fewest columns that hold it at its own size, or one fewer if that shrinks it no further than 0.8; the cards go tallest first, each to the first free spot (the highest row, then the leftmost column), where a span one narrower still at 0.7 or more is taken if it lands higher. Cards whose size is not known yet follow in file order, one column each. A drawing is never drawn larger than its size and shrinks only to fit its span, never below half; one still too wide at half spans the wall and its sheet scrolls sideways. The packing waits until sizes stop arriving (150 ms after the last, at most 500 ms after the first), so the wall settles a few times while it loads, not once per diagram; a resize of the stage packs it again. A card that moves slides to its new place in about 200 ms, and jumps under `prefers-reduced-motion`. The cards are read (Tab, a screen reader) in the order they are drawn, by row then column, and the focus stays where it is while they move. In the Wall a sheet has 16 px padding, the cards a 16 px gap and the wall 24 px at its sides (VW1's 40 px elsewhere). A card's click still opens its diagram in Tabs; Tabs and Stack keep file order. | Dr K, 2026-10-17 | agreed (wall round) |
| VW13 | **The Wall opens as it was last packed.** The drawn sizes a wall was packed with are kept in the browser (`localStorage`) by the file's path, its WebDAV ETag and the wall's column count, at most 50 walls, the least recently packed going first. The next open in Wall packs at once from them: every card in its final place, a waiting sheet at its diagram's packed size, with no reshuffle as the drawings land. A changed file (a new ETag) or another column count packs as its sizes arrive. Storage that is blocked or holds what cannot be read is no memory. | Dr K, 2026-10-17 | agreed (wall round) |
```

- [ ] **Step 2: The units row, the rulings, the boards, the limitation**

In the `viewer-component.js` row, `(VW1–VW11: `diagram-view.js`, `sheets.js`, `page-cache.js`, `toolbar.js`, `menu.js`)` becomes `(VW1–VW13: `diagram-view.js`, `sheets.js`, `page-cache.js`, `wall-layout.js`, `wall-memory.js`, `toolbar.js`, `menu.js`)`, and after its `**Shipped (viewer-polish round):** …` sentence add ` **Agreed (wall round):** VW12 and VW13.`

After the viewer-polish rulings paragraph (ending `the one-file download, each zip entry and the zip alike.`):

```markdown
**Rulings (wall round, Dr K approved 2026-10-17).** Dr K chose live re-packing over
placing each card once as it arrives: cards move, and the moves slide. The packing is
`wall-layout.js`, pure: the same sizes and width give the same places. The memory keeps
sizes, not places, since the columns' width varies within one count. Cards of unknown
size fill the spots the packing leaves, in file order; a diagram that fails keeps its
waiting slot. The card's chrome is counted, not measured: the Wall pins the caption at
Nextcloud 34's 34 px clickable area, and a CSS test holds `viewer.css` to the numbers.
The stage keeps its scrollbar gutter, so a scrollbar never changes the columns. A
hidden view packs nothing. The Penpot board `screens / viewer-wall` still shows file order.
```

In the Penpot `Files` row, after `` `screens / viewer-wall`, `` insert `(file order, from before VW12's packing) `.

In Known limitations, the bullet `- The Wall is drawn with every card at its diagram's own size. With many or large diagrams the cards may need to shrink to thumbnails; not decided.` (two lines) becomes:

```markdown
- A Wall diagram wider than the whole wall at half its size scrolls sideways in its card
  rather than shrinking further (VW12). The Wall's layout memory is per browser (VW13).
```

- [ ] **Step 3: Check and commit**

Run: `git diff --stat docs/superpowers/specs/`
Expected: the app spec only.

```bash
git add docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md
git commit -m "Spec: the Wall packs its cards by size and opens as last packed"
```

### Task 8: The packer

**Files:**
- Create: `src/viewer/wall-layout.js`
- Test: `tests/js/viewer/wall-layout.test.js` (create; node environment)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `COLUMN = 260`, `GAP = 16`, `ROW_UNIT = 8` (exported constants).
  - `columnsFor(width: number, { column?, gap? } = {}): number` — at least 1.
  - `pack(items: Array<{width: number, height: number}|null>, { width: number, column?, gap?, rowUnit? }): { columns: number, placements: Placement[] }`, placements in input order, `Placement = { column: number (0-based), row: number (0-based), span: number, rows: number, scale: number|null, scroll: boolean, width: number|null (the drawing's px at its scale, floored), height: number (the sheet's px, padding included) }`.
  - `visualOrder(placements: Placement[]): number[]` — indexes by row, then column.

- [ ] **Step 1: The failing tests**

`tests/js/viewer/wall-layout.test.js`:

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { columnsFor, pack, visualOrder } from '../../../src/viewer/wall-layout.js'

// 1232 px inside the stage (a 1280 px stage less 24 px a side): 5 columns of 233.6 px.
const WIDE = 1232
const room = (span) => span * 233.6 + (span - 1) * 16 - 42
const one = (size, width = WIDE) => pack([size], { width }).placements[0]

// The prototype's mix (proto.mjs): sequences, activities, classes, tiny ones and states, a few not yet drawn.
function sample(count, seed) {
  let s = seed >>> 0
  const random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const kinds = [[0.25, [800, 1500], [250, 600]], [0.15, [250, 500], [900, 1600]], [0.3, [400, 900], [300, 700]], [0.2, [120, 260], [60, 180]], [0.1, [300, 600], [300, 600]]]
  return Array.from({ length: count }, () => {
    let x = random()
    const [, w, h] = kinds.find(([weight]) => (x -= weight) <= 0) ?? kinds[0]
    const pick = ([a, b]) => Math.round(a + random() * (b - a))
    const size = { width: pick(w), height: pick(h) }
    return random() < 0.15 ? null : size
  })
}

describe('the column grid', () => {
  it('counts columns of about 260 px and a 16 px gap from the inner width', () => {
    expect(columnsFor(WIDE)).toBe(5)
    expect(columnsFor(1752)).toBe(6)
    expect(columnsFor(536)).toBe(2)
    expect(columnsFor(327)).toBe(1)
  })

  it('has one column however narrow the stage, a hidden one included', () => {
    expect(columnsFor(0)).toBe(1)
    expect(columnsFor(-48)).toBe(1)
    expect(pack([{ width: 100, height: 50 }], { width: 0 }).columns).toBe(1)
  })
})

describe('a card', () => {
  it('takes one column at its own size when it fits, never larger', () => {
    // 50 px drawn, 32 px of sheet padding; 48 px of card and 16 px of gap: 146 px, 19 rows of 8 px.
    expect(one({ width: 100, height: 50 })).toEqual({ column: 0, row: 0, span: 1, rows: 19, scale: 1, scroll: false, width: 100, height: 82 })
  })

  it('spans the fewest columns that hold it at its own size', () => {
    // 600 px wants 642 px of card: three columns; two would shrink it to 0.74.
    expect(one({ width: 600, height: 300 })).toMatchObject({ span: 3, scale: 1, width: 600 })
  })

  it('takes a column fewer when that shrinks it no further than 0.8', () => {
    const placed = one({ width: 520, height: 260 })

    expect(placed).toMatchObject({ span: 2, scroll: false })
    expect(placed.scale).toBeCloseTo(room(2) / 520)
    expect(placed.scale).toBeGreaterThanOrEqual(0.8)
    expect(placed.width).toBe(Math.floor(placed.scale * 520))
  })

  it('takes a column fewer at 0.7 or more when that lands it higher', () => {
    // The tall one fills columns 1–3 from the top; at three columns the next would wait under it.
    const { placements } = pack([{ width: 600, height: 2000 }, { width: 600, height: 300 }], { width: WIDE })

    expect(placements[0]).toMatchObject({ column: 0, row: 0, span: 3, scale: 1 })
    expect(placements[1]).toMatchObject({ column: 3, row: 0, span: 2 })
    expect(placements[1].scale).toBeCloseTo(room(2) / 600)
    expect(placements[1].scale).toBeGreaterThanOrEqual(0.7)
  })

  it('keeps the larger scale when both spans land as high', () => {
    expect(one({ width: 600, height: 300 })).toMatchObject({ column: 0, row: 0, span: 3, scale: 1 })
  })

  it('spans the whole wall when nothing narrower holds it at half its size', () => {
    const placed = one({ width: 2000, height: 400 })

    expect(placed).toMatchObject({ column: 0, span: 5, scroll: false })
    expect(placed.scale).toBeCloseTo(room(5) / 2000)
  })

  it('stops at half its size and scrolls sideways when still too wide, across the wall', () => {
    // 2000 px drawn, 32 px of padding and 16 px for the scrollbar.
    expect(one({ width: 4000, height: 4000 })).toEqual({ column: 0, row: 0, span: 5, rows: 264, scale: 0.5, scroll: true, width: 2000, height: 2048 })
  })

  it('waits in one column at the waiting sheet\'s 240 px while its size is not known', () => {
    expect(one(null)).toEqual({ column: 0, row: 0, span: 1, rows: 38, scale: null, scroll: false, width: null, height: 240 })
  })
})

describe('the packing', () => {
  it('places the tallest first, each in the first free spot', () => {
    const { placements } = pack([{ width: 100, height: 100 }, { width: 100, height: 300 }, { width: 100, height: 200 }], { width: 536 })

    expect(placements.map(({ column, row }) => [column, row])).toEqual([[1, 37], [0, 0], [1, 0]])
  })

  it('puts the cards of no known size after the packed ones, in file order, into the spots left', () => {
    const { placements } = pack([null, { width: 100, height: 50 }, null], { width: 536 })

    expect(placements.map(({ column, row, span }) => [column, row, span])).toEqual([[1, 0, 1], [0, 0, 1], [0, 19, 1]])
  })

  it('places equal cards in file order', () => {
    const { placements } = pack(Array.from({ length: 4 }, () => ({ width: 100, height: 100 })), { width: 536 })

    expect(placements.map(({ column, row }) => [column, row])).toEqual([[0, 0], [1, 0], [0, 25], [1, 25]])
  })

  it('places the same diagrams the same way every time', () => {
    const items = sample(40, 11)

    expect(pack(items, { width: WIDE })).toEqual(pack(structuredClone(items), { width: WIDE }))
  })

  for (const width of [327, 800, WIDE, 1752]) {
    it(`never overlaps two cards, nor leaves the ${columnsFor(width)} columns of a ${width} px wall`, () => {
      const items = sample(40, width)
      const { columns, placements } = pack(items, { width })
      const cells = new Set()

      for (const { column, row, span, rows } of placements) {
        expect(column).toBeGreaterThanOrEqual(0)
        expect(column + span).toBeLessThanOrEqual(columns)
        for (let c = column; c < column + span; c++) {
          for (let r = row; r < row + rows; r++) {
            expect(cells.has(`${c},${r}`)).toBe(false)
            cells.add(`${c},${r}`)
          }
        }
      }
    })

    it(`keeps every drawing within its span and the scale rules on a ${width} px wall`, () => {
      const items = sample(40, width + 1)
      const { columns, placements } = pack(items, { width })
      const columnWidth = (width - (columns - 1) * 16) / columns

      placements.forEach((placed, index) => {
        if (!items[index]) {
          return
        }
        const inner = placed.span * columnWidth + (placed.span - 1) * 16 - 42
        expect(placed.scale).toBeLessThanOrEqual(1)
        expect(placed.scale).toBeGreaterThanOrEqual(0.5)
        // Below 0.7 only across the whole wall; scrolling only there, at 0.5.
        if (placed.scale < 0.7) {
          expect(placed.span).toBe(columns)
        }
        if (placed.scroll) {
          expect(placed).toMatchObject({ scale: 0.5, span: columns })
        } else {
          expect(placed.width).toBeLessThanOrEqual(inner)
        }
        // The card and the gap under it fit its rows.
        expect(48 + placed.height + 16).toBeLessThanOrEqual(placed.rows * 8)
      })
    })
  }

  it('packs 200 diagrams in well under 100 ms', () => {
    const items = sample(200, 3)
    const began = performance.now()
    pack(items, { width: 1752 })

    expect(performance.now() - began).toBeLessThan(100)
  })
})

describe('the reading order', () => {
  it('is by row, then column', () => {
    const placements = [{ row: 10, column: 0 }, { row: 0, column: 2 }, { row: 0, column: 0 }, { row: 10, column: 1 }]

    expect(visualOrder(placements)).toEqual([2, 1, 0, 3])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/js/viewer/wall-layout.test.js`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: `src/viewer/wall-layout.js`**

The rules are the algorithm, so the whole module:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Wall's packing (VW12), with no DOM: every card on a grid of columns about
 * COLUMN px wide and rows ROW_UNIT px tall. A diagram spans the fewest columns
 * that hold it at its own size, or one fewer when it shrinks no further than
 * PREFER; never above its own size, never below FLOOR, and still too wide at
 * FLOOR it spans the wall and scrolls sideways. Cards go tallest first, each in
 * the first free spot (the highest row, then the leftmost column), where a span
 * one narrower may land higher at ACCEPT or more. Cards of no known size follow
 * in file order, one column each, at the waiting sheet's height.
 */
export const COLUMN = 260
export const GAP = 16
export const ROW_UNIT = 8
// The card around its sheet (viewer.css): a 1 px border and 4 px padding a side, a 34 px caption and its 4 px gap.
const CARD = { width: 10, height: 48 }
// The Wall's sheet padding, a side; the waiting sheet's height; room for a sideways scrollbar.
const PADDING = 16
const WAITING = 240
const SCROLLBAR = 16
const PREFER = 0.8
const ACCEPT = 0.7
const FLOOR = 0.5

/**
 * How many columns a wall of this width has.
 *
 * @param {number} width the stage's inner width, px
 * @param {{ column?: number, gap?: number }} [options]
 * @return {number} at least 1
 */
export function columnsFor(width, { column = COLUMN, gap = GAP } = {}) {
  return Math.max(1, Math.round((width + gap) / (column + gap)))
}

/**
 * @typedef {object} Placement
 * @property {number} column 0-based
 * @property {number} span columns
 * @property {number} row 0-based, in rows of rowUnit px
 * @property {number} rows the card's height and the gap under it, in rows
 * @property {number|null} scale the drawing's, null when its size is not known
 * @property {boolean} scroll too wide at FLOOR: it spans the wall and its sheet scrolls sideways
 * @property {number|null} width the drawing's width at its scale, px; null when not known
 * @property {number} height the sheet's height, its padding included, px
 */

/**
 * @param {Array<{ width: number, height: number }|null>} items each diagram's drawn size, in file order; null when not known
 * @param {{ width: number, column?: number, gap?: number, rowUnit?: number }} options the stage's inner width, px
 * @return {{ columns: number, placements: Placement[] }} a placement per item, in file order
 */
export function pack(items, { width, column = COLUMN, gap = GAP, rowUnit = ROW_UNIT }) {
  const columns = columnsFor(width, { column, gap })
  const columnWidth = (width - (columns - 1) * gap) / columns
  // What a span of k columns leaves for the drawing.
  const room = (k) => k * columnWidth + (k - 1) * gap - CARD.width - 2 * PADDING
  const rowsOf = (sheet) => Math.ceil((CARD.height + sheet + gap) / rowUnit)
  // Occupied rows per column, as [from, to) pairs.
  const taken = Array.from({ length: columns }, () => [])

  function fit(size, span) {
    const wanted = Math.min(1, room(span) / size.width)
    const scroll = wanted < FLOOR
    const scale = scroll ? FLOOR : wanted
    const height = Math.ceil(scale * size.height) + 2 * PADDING + (scroll ? SCROLLBAR : 0)
    return { span, scale, scroll, width: Math.floor(scale * size.width), height, rows: rowsOf(height) }
  }

  /** The preferred fit first, then a span one narrower that keeps ACCEPT. */
  function fits(size) {
    let span = 1
    while (span < columns && room(span) < size.width) {
      span++
    }
    if (span > 1 && room(span - 1) / size.width >= PREFER) {
      span--
    }
    const options = [fit(size, span)]
    if (span > 1 && room(span - 1) / size.width >= ACCEPT) {
      options.push(fit(size, span - 1))
    }
    return options
  }

  const free = (column, span, row, rows) => {
    for (let j = column; j < column + span; j++) {
      if (taken[j].some(([from, to]) => from < row + rows && row < to)) {
        return false
      }
    }
    return true
  }

  /** The highest free row, then the leftmost column; a free row starts at 0 or where a card ends. */
  function spot(span, rows) {
    let best = null
    for (let column = 0; column + span <= columns; column++) {
      const starts = [0]
      for (let j = column; j < column + span; j++) {
        starts.push(...taken[j].map(([, to]) => to))
      }
      const row = starts.sort((a, b) => a - b).find((start) => free(column, span, start, rows))
      if (!best || row < best.row) {
        best = { column, row }
      }
    }
    return best
  }

  const placements = new Array(items.length)
  function put(index, option) {
    const at = spot(option.span, option.rows)
    for (let j = at.column; j < at.column + option.span; j++) {
      taken[j].push([at.row, at.row + option.rows])
    }
    placements[index] = { column: at.column, row: at.row, span: option.span, rows: option.rows, scale: option.scale, scroll: option.scroll, width: option.width, height: option.height }
  }

  const known = items.flatMap((size, index) => (size ? [{ index, options: fits(size) }] : []))
  known.sort((a, b) => b.options[0].rows - a.options[0].rows || a.index - b.index)
  for (const { index, options } of known) {
    // The option that lands highest; on a tie the first, at the larger scale.
    const landing = options.map((option) => spot(option.span, option.rows).row)
    put(index, options[landing.indexOf(Math.min(...landing))])
  }
  const waiting = { span: 1, scale: null, scroll: false, width: null, height: WAITING, rows: rowsOf(WAITING) }
  items.forEach((size, index) => {
    if (!size) {
      put(index, waiting)
    }
  })
  return { columns, placements }
}

/**
 * The order the cards are read in: by row, then column.
 *
 * @param {Placement[]} placements
 * @return {number[]} indexes into placements
 */
export function visualOrder(placements) {
  return placements.map((_placement, index) => index)
    .sort((a, b) => placements[a].row - placements[b].row || placements[a].column - placements[b].column)
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/js/viewer/wall-layout.test.js && npm run lint`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/wall-layout.js tests/js/viewer/wall-layout.test.js
git commit -m "Viewer: the Wall's packer, tallest first on a column grid"
```

### Task 9: The layout memory

**Files:**
- Create: `src/viewer/wall-memory.js`
- Test: `tests/js/viewer/wall-memory.test.js` (create; jsdom for `localStorage`)

**Interfaces:**
- Consumes: nothing.
- Produces: `STORAGE_KEY = 'plantuml.viewer.wall'`, `LIMIT = 50`; `recall(path: string, etag: string|null, columns: number): Array<{width, height}|null>|null`; `remember(path: string, etag: string|null, columns: number, sizes: Array<{width, height}|null>): void`. Neither throws; with no `etag` they keep and find nothing.

- [ ] **Step 1: The failing tests**

`tests/js/viewer/wall-memory.test.js`:

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMIT, STORAGE_KEY, recall, remember } from '../../../src/viewer/wall-memory.js'

const SIZES = [{ width: 600, height: 300 }, null, { width: 40, height: 20 }]

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the Wall\'s layout memory (VW13)', () => {
  it('recalls the sizes a wall was packed with, by path, ETag and column count', () => {
    remember('/D/S.puml', '"e"', 5, SIZES)

    expect(recall('/D/S.puml', '"e"', 5)).toEqual(SIZES)
  })

  it('recalls nothing for another ETag, another column count or another file', () => {
    remember('/D/S.puml', '"e"', 5, SIZES)

    expect(recall('/D/S.puml', '"f"', 5)).toBeNull()
    expect(recall('/D/S.puml', '"e"', 4)).toBeNull()
    expect(recall('/D/T.puml', '"e"', 5)).toBeNull()
  })

  it('keeps nothing for a file read without an ETag', () => {
    remember('/D/S.puml', null, 5, SIZES)

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(recall('/D/S.puml', null, 5)).toBeNull()
  })

  it('keeps the last packing of a wall in place of the one before', () => {
    remember('/D/S.puml', '"e"', 5, [null, null, null])
    remember('/D/S.puml', '"e"', 5, SIZES)

    expect(recall('/D/S.puml', '"e"', 5)).toEqual(SIZES)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toHaveLength(1)
  })

  it(`keeps at most ${LIMIT} walls, the least recently packed going first`, () => {
    for (let n = 0; n <= LIMIT; n++) {
      remember(`/D/${n}.puml`, '"e"', 5, SIZES)
    }
    // The first one packed again is the most recent: the second goes when the next comes.
    remember('/D/1.puml', '"e"', 5, SIZES)
    remember('/D/new.puml', '"e"', 5, SIZES)

    expect(recall('/D/0.puml', '"e"', 5)).toBeNull()
    expect(recall('/D/2.puml', '"e"', 5)).toBeNull()
    expect(recall('/D/1.puml', '"e"', 5)).toEqual(SIZES)
    expect(recall('/D/new.puml', '"e"', 5)).toEqual(SIZES)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toHaveLength(LIMIT)
  })

  it('is no memory when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })

    expect(() => remember('/D/S.puml', '"e"', 5, SIZES)).not.toThrow()
    expect(recall('/D/S.puml', '"e"', 5)).toBeNull()
  })

  it('reads what it cannot understand as no memory, and a bad size as one not known', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(recall('/D/S.puml', '"e"', 5)).toBeNull()

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([['x', 'y'], [JSON.stringify(['/D/S.puml', '"e"', 5]), [[600, 300], [0, 1], 'z', null]]]))
    expect(recall('/D/S.puml', '"e"', 5)).toEqual([{ width: 600, height: 300 }, null, null, null])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/js/viewer/wall-memory.test.js`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: `src/viewer/wall-memory.js`**

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Wall's layout memory (VW13): the drawn sizes a file's wall was last packed
 * with, kept in this browser by the file's path, the WebDAV ETag it was read
 * with and the wall's column count, so the next open packs at once. Sizes, not
 * places: the columns' width differs within a count, and the packing is the
 * same for the same sizes. At most LIMIT walls, the least recently packed going
 * first. Storage that throws, or holds what this cannot read, is no memory.
 */
export const STORAGE_KEY = 'plantuml.viewer.wall'
export const LIMIT = 50

const keyOf = (path, etag, columns) => JSON.stringify([path, etag, columns])
const isSize = (pair) => Array.isArray(pair) && pair.length === 2 && pair.every((n) => Number.isFinite(n) && n > 0)

/** @return {Array<[string, Array<[number, number]|null>]>} the least recently packed first */
function read() {
  try {
    const walls = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(walls) ? walls.filter((wall) => Array.isArray(wall) && typeof wall[0] === 'string' && Array.isArray(wall[1])) : []
  } catch {
    return []
  }
}

/**
 * @param {string} path
 * @param {string|null} etag none, no memory
 * @param {number} columns
 * @return {Array<{ width: number, height: number }|null>|null} per diagram, in file order; null when none is kept
 */
export function recall(path, etag, columns) {
  if (!etag) {
    return null
  }
  const key = keyOf(path, etag, columns)
  const sizes = read().find(([wall]) => wall === key)?.[1]
  return sizes ? sizes.map((pair) => (isSize(pair) ? { width: pair[0], height: pair[1] } : null)) : null
}

/**
 * @param {string} path
 * @param {string|null} etag none, nothing kept
 * @param {number} columns
 * @param {Array<{ width: number, height: number }|null>} sizes per diagram, in file order
 */
export function remember(path, etag, columns, sizes) {
  if (!etag) {
    return
  }
  const key = keyOf(path, etag, columns)
  const walls = read().filter(([wall]) => wall !== key)
  walls.push([key, sizes.map((size) => (size ? [size.width, size.height] : null))])
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(walls.slice(-LIMIT)))
  } catch {
    // Not kept: the next open packs as the sizes arrive.
  }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/js/viewer/wall-memory.test.js && npm run lint`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/wall-memory.js tests/js/viewer/wall-memory.test.js
git commit -m "Viewer: the Wall's layout memory, by path, ETag and column count"
```

### Task 10: The Wall packs as its sizes arrive, and opens as last packed

**Files:**
- Modify: `css/viewer.css` (the Wall block `:304-313`; after `.plantuml-viewer__stage--wall .plantuml-viewer__card { cursor: pointer; }`)
- Modify: `src/viewer/diagram-view.js` (header; imports; constants; state; the stage listeners after `root.replaceChildren(head, stage)`; `schedule`, `arrange`, `place` before `show()`; `show()`; the file-read `.then`; `setActive`; `destroy`)
- Test: `tests/js/viewer/wall-layout.test.js` (the CSS guard), `tests/js/viewer/diagram-view.test.js` (the top-level `beforeEach`; a new `describe` before `const exportButton = …`)

**Interfaces:**
- Consumes: Task 8's `columnsFor`, `pack`; Task 9's `recall`, `remember`; `sheets.sizeOf(position)` and the `plantuml-viewer:settled` event (unchanged); Task 2's `setActive` ending in `settle()`.
- Produces: `export const WALL_SETTLE = 150` from `diagram-view.js` (tests wait on it). In the Wall each card carries `style.gridColumn = '<column+1> / span <span>'`, `style.gridRow = '<row+1> / span <rows>'`, `--plantuml-wall-height: <height>px`, `--plantuml-wall-width: <width>px` (only when known) and the class `plantuml-viewer__card--scroll` when `scroll`; the stage carries `--plantuml-wall-columns`.

- [ ] **Step 1: The failing CSS guard**

In `tests/js/viewer/wall-layout.test.js`, add `import { readFileSync } from 'node:fs'` first among the imports, and at the end:

```js
describe('the Wall\'s CSS', () => {
  // wall-layout.js counts the card's chrome; viewer.css draws it. A mismatch would overlap cards.
  const css = readFileSync(new URL('../../../css/viewer.css', import.meta.url), 'utf8')
  const rule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''

  it('draws the chrome the packing counts', () => {
    expect(rule('.plantuml-viewer__card')).toMatch(/padding: 4px;[\s\S]*border: 1px solid/)
    expect(rule('.plantuml-viewer__card')).toMatch(/gap: 4px;/)
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__caption')).toMatch(/height: 34px;/)
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__sheet')).toMatch(/padding: 16px;/)
    expect(rule('.plantuml-viewer__stage--wall .plantuml-viewer__sheet')).toMatch(/height: var\(--plantuml-wall-height, 240px\);/)
    expect(rule('.plantuml-viewer__stage--wall')).toMatch(/grid-auto-rows: 8px;[\s\S]*column-gap: 16px;/)
  })
})
```

- [ ] **Step 2: The failing view tests**

In `tests/js/viewer/diagram-view.test.js`: the import `const { createDiagramView } = await import('../../../src/viewer/diagram-view.js')` becomes `const { createDiagramView, WALL_SETTLE } = await import('../../../src/viewer/diagram-view.js')`; the top-level `beforeEach`'s first lines become:

```js
  // Drawings are kept for the page, and Wall layouts in the browser: each test starts with none.
  pageCache.clear()
  window.localStorage.clear()
```

and before `const exportButton = () =>`:

```js
describe('the Wall packs its cards (VW12, VW13)', () => {
  // A 1232 px stage: five columns of 233.6 px. Each index answers a drawing of its own size.
  let sizes
  const sized = (index) => {
    const [width, height] = sizes[index] ?? [40, 20]
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text>${['nodes', 'login', 'p3'][index]}</text></svg>`
  }
  const repacked = () => new Promise((resolve) => setTimeout(resolve, WALL_SETTLE + 20))
  const stage = () => root.querySelector('.plantuml-viewer__stage')
  const placeOf = (card) => [card.style.gridColumn, card.style.gridRow]
  const byName = (name) => cards().find((card) => card.querySelector('label').textContent === name)
  const names = () => cards().map((card) => card.querySelector('label').textContent)
  const wide = (width = 1232) => Object.defineProperty(stage(), 'clientWidth', { configurable: true, get: () => width })
  let resized

  beforeEach(() => {
    sizes = [[40, 20], [600, 300], [100, 800]]
    fetch.mockImplementation(async (url) => new Response(sized(Number(new URL(url, 'https://x').searchParams.get('index'))), { status: 200 }))
    resized = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) {
        this.callback = callback
        resized.push(this)
      }

      observe(target) {
        this.target = target
      }

      disconnect() {
        this.disconnected = true
      }
    })
  })

  it('places every card at once, in file order, while no size is known', async () => {
    fetch.mockImplementation(() => new Promise(() => {}))
    await open(THREE)
    wide()
    mode('Wall')

    expect(stage().style.getPropertyValue('--plantuml-wall-columns')).toBe('5')
    expect(cards().map(placeOf)).toEqual([['1 / span 1', '1 / span 38'], ['2 / span 1', '1 / span 38'], ['3 / span 1', '1 / span 38']])
    expect(cards().map((card) => card.style.getPropertyValue('--plantuml-wall-height'))).toEqual(['240px', '240px', '240px'])
  })

  it('packs the whole wall again once the sizes have arrived: tallest first, a wide one across the columns it needs', async () => {
    await open(THREE)
    wide()
    mode('Wall')
    await repacked()

    expect(placeOf(byName('p3'))).toEqual(['1 / span 1', '1 / span 112'])
    expect(placeOf(byName('login'))).toEqual(['2 / span 3', '1 / span 50'])
    expect(placeOf(byName('nodes'))).toEqual(['5 / span 1', '1 / span 15'])
    expect(byName('login').style.getPropertyValue('--plantuml-wall-width')).toBe('600px')
    expect(byName('login').style.getPropertyValue('--plantuml-wall-height')).toBe('332px')
  })

  it('packs once for sizes that land together, not once per drawing', async () => {
    await open(THREE)
    wide()
    mode('Wall')
    await settle()

    // All three are drawn; the wall still shows the first packing.
    expect(shown(root)).toHaveLength(3)
    expect(placeOf(byName('p3'))).toEqual(['3 / span 1', '1 / span 38'])
    await repacked()
    expect(placeOf(byName('p3'))).toEqual(['1 / span 1', '1 / span 112'])
  })

  it('shrinks a diagram too wide for the wall no further than half, across the wall, scrolling sideways', async () => {
    fetch.mockImplementation(async () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="100" viewBox="0 0 4000 100"><text>w</text></svg>', { status: 200 }))
    await open('@startuml w\n@enduml\n@startuml v\n@enduml\n')
    wide()
    mode('Wall')
    await repacked()

    expect(cards()[0].style.gridColumn).toBe('1 / span 5')
    expect(cards()[0].style.getPropertyValue('--plantuml-wall-width')).toBe('2000px')
    expect(cards()[0].classList.contains('plantuml-viewer__card--scroll')).toBe(true)
  })

  it('opens a wall packed before at its final places at once, each waiting sheet at its size', async () => {
    const view = await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    view.destroy()
    // Nothing is drawn this time, from memory or the server: only the layout is remembered.
    pageCache.clear()
    fetch.mockImplementation(() => new Promise(() => {}))
    await open(THREE)
    wide()
    mode('Wall')

    expect(placeOf(byName('p3'))).toEqual(['1 / span 1', '1 / span 112'])
    expect(byName('p3').querySelector('.plantuml-viewer__sheet--loading')).not.toBeNull()
    expect(byName('p3').style.getPropertyValue('--plantuml-wall-height')).toBe('832px')
  })

  it('packs a file changed since, its ETag new, as its sizes arrive', async () => {
    const view = await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    view.destroy()
    pageCache.clear()
    fetch.mockImplementation(() => new Promise(() => {}))
    await open(THREE, { etag: '"f"' })
    wide()
    mode('Wall')

    expect(names()).toEqual(['nodes', 'login', 'p3'])
    expect(placeOf(byName('p3'))).toEqual(['3 / span 1', '1 / span 38'])
  })

  it('packs again when the stage is resized, under its new column count', async () => {
    await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    wide(536)
    resized.at(-1).callback([])
    await repacked()

    expect(stage().style.getPropertyValue('--plantuml-wall-columns')).toBe('2')
    // Two columns: the wide one shrinks to 0.82 across both, under the tall one.
    expect(placeOf(byName('login'))).toEqual(['1 / span 2', '113 / span 43'])
    expect(JSON.parse(window.localStorage.getItem('plantuml.viewer.wall')).map(([key]) => JSON.parse(key)[2])).toEqual([5, 2])
  })

  it('packs again at the new size when a kept drawing is drawn anew', async () => {
    const view = await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    view.destroy()
    // The next open draws from the page's memory at once; then the server draws p3 anew, wider.
    sizes[2] = [1000, 800]
    await open(THREE)
    wide()
    mode('Wall')
    await repacked()

    expect(placeOf(byName('p3'))).toEqual(['1 / span 4', '1 / span 107'])
    expect(byName('p3').style.getPropertyValue('--plantuml-wall-width')).toBe('940px')
  })

  it('packs nothing while the view is hidden, and packs again once it is shown', async () => {
    const view = await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    view.setActive(false)
    wide(536)
    resized.at(-1).callback([])
    await repacked()
    expect(stage().style.getPropertyValue('--plantuml-wall-columns')).toBe('5')

    view.setActive(true)
    await repacked()
    expect(stage().style.getPropertyValue('--plantuml-wall-columns')).toBe('2')
  })

  it('still packs when the browser keeps nothing', async () => {
    const blocked = () => { throw new Error('blocked') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    try {
      await open(THREE)
      wide()
      mode('Wall')
      await repacked()

      expect(placeOf(byName('p3'))).toEqual(['1 / span 1', '1 / span 112'])
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('keeps every card waiting in file order, and remembers nothing, when no diagram can be drawn', async () => {
    fetch.mockImplementation(async () => new Response('{"problem":"no diagram"}', { status: 400 }))
    await open(THREE)
    wide()
    mode('Wall')
    await repacked()

    expect(cards().map(placeOf)).toEqual([['1 / span 1', '1 / span 38'], ['2 / span 1', '1 / span 38'], ['3 / span 1', '1 / span 38']])
    expect(window.localStorage.getItem('plantuml.viewer.wall')).toBeNull()
  })

  it('leaves Stack in file order, unplaced', async () => {
    await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    mode('Stack')

    expect(names()).toEqual(['nodes', 'login', 'p3'])
    expect(cards().map(placeOf)).toEqual([['', ''], ['', ''], ['', '']])
  })

  it('stops watching the stage size when destroyed', async () => {
    const view = await open(THREE)
    view.destroy()

    expect(resized.at(-1).disconnected).toBe(true)
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/js/viewer/`
Expected: FAIL — the CSS guard and every new view test (no grid placement; `WALL_SETTLE` undefined).

- [ ] **Step 4: The Wall's CSS**

In `css/viewer.css`, the block from `/* Wall: the cards wrapping in file order, each at its diagram's own size. */` to its closing `}` becomes:

```css
/* Wall (VW12): a grid of columns and 8px rows, each card placed on it by
 * wall-layout.js; the column count comes from diagram-view.js. The gutter is
 * kept, so a scrollbar coming or going never changes the columns' width. */
.plantuml-viewer__stage--wall {
	display: grid;
	grid-template-columns: repeat(var(--plantuml-wall-columns, 1), minmax(0, 1fr));
	grid-auto-rows: 8px;
	column-gap: 16px;
	align-items: start;
	align-content: start;
	padding: 16px 24px 0;
	box-sizing: border-box;
	scrollbar-gutter: stable;
}
```

and after the rule `.plantuml-viewer__stage--wall .plantuml-viewer__card { cursor: pointer; }`:

```css
/* A move slides from the old place (diagram-view.js), unless motion is reduced. */
@media (prefers-reduced-motion: no-preference) {
	.plantuml-viewer__stage--wall .plantuml-viewer__card {
		transition: transform 200ms ease;
	}
}

/* wall-layout.js counts this chrome: the caption is pinned at Nextcloud's
 * 34px clickable area, and each sheet takes the height the packing gave it
 * (the waiting sheet's 240px while its size is not known), its drawing at the
 * packed width and fitted inside. */
.plantuml-viewer__stage--wall .plantuml-viewer__caption {
	height: 34px;
}

.plantuml-viewer__stage--wall .plantuml-viewer__sheet {
	height: var(--plantuml-wall-height, 240px);
	padding: 16px;
	box-sizing: border-box;
}

.plantuml-viewer__stage--wall .plantuml-viewer__sheet--loading {
	width: auto;
}

.plantuml-viewer__stage--wall .plantuml-viewer__sheet svg {
	width: var(--plantuml-wall-width, auto);
	max-height: 100%;
}

/* Too wide at half its size: the card spans the wall and its sheet scrolls sideways. */
.plantuml-viewer__card--scroll .plantuml-viewer__sheet {
	overflow-x: auto;
}

.plantuml-viewer__card--scroll .plantuml-viewer__sheet svg {
	max-width: none;
}
```

- [ ] **Step 5: The wiring in `diagram-view.js`**

Header: `The Viewer's diagrams (VW1–VW11)` becomes `(VW1–VW13)`, and before ` * Only what is on screen is drawn (VW10)` insert:

```js
 * The Wall (VW12) is packed by wall-layout.js as the drawn sizes arrive, a few
 * at a time, and again when the stage is resized; its cards then read in the
 * order they are drawn. The sizes it was packed with are remembered for the
 * next open (VW13, wall-memory.js).
```

After `import { createToolbar } from './toolbar.js'`:

```js
import { columnsFor, pack } from './wall-layout.js'
import { recall, remember } from './wall-memory.js'
```

After `const SHARE_WAIT = 3000`:

```js
// The Wall packs again this long after the last size arrives, and at most WALL_MOST after the first.
export const WALL_SETTLE = 150
const WALL_MOST = 500
```

After `let observer = null`, add `let resizer = null` and `let etag = null`. After `const positions = new WeakMap()`:

```js
  // The Wall's next packing, when the first size it waits for arrived, what it last packed, and
  // the sizes remembered per column count.
  let repack = 0
  let since = 0
  let packed = ''
  const recalled = new Map()
```

After `root.replaceChildren(head, stage)`:

```js
  // A sheet's drawn size arrived (twice for a kept drawing drawn anew), or the stage changed size.
  stage.addEventListener('plantuml-viewer:settled', () => schedule(), true)
  if (typeof ResizeObserver === 'function') {
    resizer = new ResizeObserver(() => schedule())
    resizer.observe(stage)
  }
```

(The settled event does not bubble; the capture listener on the stage hears every sheet in it.)

Before `function show() {`:

```js
  /** The Wall packs again once its sizes stop arriving: WALL_SETTLE after the last, WALL_MOST after the first. */
  function schedule() {
    if (state.mode !== 'wall') {
      return
    }
    const now = Date.now()
    since ||= now
    clearTimeout(repack)
    repack = setTimeout(() => arrange(), Math.min(WALL_SETTLE, since + WALL_MOST - now))
  }

  /**
   * Every card of the Wall where wall-layout.js packs it, by the sizes drawn and those remembered
   * for this column count; the sizes are remembered. Nothing changed, nothing is done.
   */
  function arrange() {
    clearTimeout(repack)
    repack = 0
    since = 0
    if (state.mode !== 'wall' || !active || destroyed) {
      return
    }
    const style = getComputedStyle(stage)
    const width = stage.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
    const columns = columnsFor(width)
    if (!recalled.has(columns)) {
      recalled.set(columns, recall(path, etag, columns) ?? [])
    }
    const sizes = diagrams.map((_diagram, index) => sheets.sizeOf(index + 1) ?? recalled.get(columns)[index] ?? null)
    const now = JSON.stringify([width, sizes])
    if (now === packed) {
      return
    }
    packed = now
    if (sizes.some(Boolean)) {
      remember(path, etag, columns, sizes)
    }
    const { placements } = pack(sizes, { width })
    const byIndex = new Map([...stage.children].map((node) => [positions.get(node) - 1, node]))
    stage.style.setProperty('--plantuml-wall-columns', String(columns))
    placements.forEach((placed, index) => place(byIndex.get(index), placed))
  }

  /** A card at its packed place, its sheet at the packed height and its drawing at the packed width. */
  function place(node, { column, span, row, rows, scroll, width, height }) {
    node.style.gridColumn = `${column + 1} / span ${span}`
    node.style.gridRow = `${row + 1} / span ${rows}`
    node.style.setProperty('--plantuml-wall-height', `${height}px`)
    if (width === null) {
      node.style.removeProperty('--plantuml-wall-width')
    } else {
      node.style.setProperty('--plantuml-wall-width', `${width}px`)
    }
    node.classList.toggle('plantuml-viewer__card--scroll', scroll)
  }
```

In `show()`, the `else` branch becomes:

```js
    } else {
      stage.replaceChildren(...diagrams.map((_diagram, index) => card(index)))
      packed = ''
      arrange()
    }
```

The file-read `.then`'s head `.then(([{ content, etag }, exportable]) => {` and its `destroyed` guard become:

```js
  Promise.all([loadFile(path), downloadable]).then(([file, exportable]) => {
    if (destroyed) {
      return
    }
    etag = file.etag ?? null
    const { content } = file
```

(`createSheets(path, { etag, … })` below it now reads the variable.) In `setActive`, before its final `settle()`:

```js
      if (now) {
        schedule()
      }
```

In `destroy()`, after `destroyed = true`: `clearTimeout(repack)`, and after `observer?.disconnect()`: `resizer?.disconnect()`.

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS, every suite (the VW10 tests keep file order: jsdom's stage is 0 px wide, one column).

- [ ] **Step 7: Commit**

```bash
git add css/viewer.css src/viewer/diagram-view.js tests/js/viewer/wall-layout.test.js tests/js/viewer/diagram-view.test.js
git commit -m "Viewer: the Wall packs its cards as their sizes arrive, and opens as last packed"
```

### Task 11: Cards read in the order drawn, and slide when they move

**Files:**
- Modify: `src/viewer/diagram-view.js` (the `wall-layout.js` import; `schedule`; `arrange`; two new functions after `place`; `show()`)
- Test: `tests/js/viewer/diagram-view.test.js` (inside `describe('the Wall packs its cards (VW12, VW13)', …)`, before `'packs again at the new size when a kept drawing is drawn anew'`)

**Interfaces:**
- Consumes: Task 8's `visualOrder`; Task 10's `arrange`, `place`.
- Produces: `arrange(animate: boolean)`; the stage's children in reading order after each pack.

- [ ] **Step 1: The failing tests**

```js
  it('reads the cards in the order they are drawn: by row, then column', async () => {
    await open(THREE)
    wide()
    mode('Wall')
    await repacked()

    expect(names()).toEqual(['p3', 'login', 'nodes'])
  })

  it('opens a remembered wall in its reading order at once', async () => {
    const view = await open(THREE)
    wide()
    mode('Wall')
    await repacked()
    view.destroy()
    pageCache.clear()
    fetch.mockImplementation(() => new Promise(() => {}))
    await open(THREE)
    wide()
    mode('Wall')

    expect(names()).toEqual(['p3', 'login', 'nodes'])
  })

  it('keeps the focus on the checkbox it is on while the cards move around it', async () => {
    await open(THREE)
    wide()
    mode('Wall')
    const box = byName('nodes').querySelector('input')
    box.focus()
    await repacked()

    expect(names()).toEqual(['p3', 'login', 'nodes'])
    expect(document.activeElement).toBe(box)
  })

  describe('a move', () => {
    // jsdom lays nothing out: a card's box follows its grid place, 100 px a column and 8 px a row.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const [column, row] = [this.style.gridColumn, this.style.gridRow].map((place) => (Number.parseInt(place, 10) || 1) - 1)
        return { left: column * 100, top: row * 8, width: 100, height: 100 }
      })
    })
    afterEach(() => vi.restoreAllMocks())

    /** Every style a card wore while the wall packed again. */
    async function styles() {
      const seen = []
      const watch = new MutationObserver((records) => seen.push(...records.map((record) => record.oldValue ?? '')))
      cards().forEach((card) => watch.observe(card, { attributes: true, attributeFilter: ['style'], attributeOldValue: true }))
      await repacked()
      watch.disconnect()
      return seen.join(';')
    }

    it('slides a moved card from where it was', async () => {
      await open(THREE)
      wide()
      mode('Wall')
      const worn = await styles()

      // p3 moved from the third column to the first: it was drawn 200 px to the right, then let go.
      expect(worn).toContain('translate(200px, 0px)')
      expect(byName('p3').style.transform).toBe('')
    })

    it('moves without a slide when motion is reduced', async () => {
      vi.stubGlobal('matchMedia', (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }))
      await open(THREE)
      wide()
      mode('Wall')
      const worn = await styles()

      expect(placeOf(byName('p3'))).toEqual(['1 / span 1', '1 / span 112'])
      expect(worn).not.toContain('translate(')
    })
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/js/viewer/diagram-view.test.js`
Expected: FAIL — 4 tests (the cards stay in file order; no slide). The reduced-motion test passes already and stays: it guards Step 3.

- [ ] **Step 3: Reading order and slides**

`import { columnsFor, pack } from './wall-layout.js'` becomes `import { columnsFor, pack, visualOrder } from './wall-layout.js'`. In `schedule`, `setTimeout(() => arrange(), …)` becomes `setTimeout(() => arrange(true), …)`; in `show()`, `arrange()` becomes `arrange(false)`; `function arrange() {` becomes `function arrange(animate) {` and its doc comment's `for this column count; the sizes are remembered.` becomes `for this column count, then read in that order; the sizes are remembered.` Its last three lines (from `const byIndex = …` to the `placements.forEach(…)`) become:

```js
    const cards = [...stage.children]
    const byIndex = new Map(cards.map((node) => [positions.get(node) - 1, node]))
    const before = animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? new Map(cards.map((node) => [node, node.getBoundingClientRect()]))
      : null
    stage.style.setProperty('--plantuml-wall-columns', String(columns))
    placements.forEach((placed, index) => place(byIndex.get(index), placed))
    reorder(visualOrder(placements).map((index) => byIndex.get(index)))
    if (before) {
      slide(before)
    }
```

After `place`:

```js
  /**
   * The cards in the stage in reading order, so Tab and a screen reader follow what is drawn. The
   * card holding the focus is never moved, which would lose it: the others move around it.
   */
  function reorder(ordered) {
    const now = [...stage.children]
    if (ordered.every((node, index) => now[index] === node)) {
      return
    }
    const held = ordered.find((node) => node.contains(document.activeElement))
    if (!held) {
      stage.append(...ordered)
      return
    }
    const at = ordered.indexOf(held)
    held.before(...ordered.slice(0, at))
    held.after(...ordered.slice(at + 1))
  }

  /** Each moved card is drawn at its old place, then slides to its new one (viewer.css's transition). */
  function slide(before) {
    const cards = [...before.keys()]
    // A slide under way stops; `before` read the card where it was.
    cards.forEach((node) => {
      node.style.transition = 'none'
      node.style.transform = ''
    })
    const moves = cards.map((node) => {
      const was = before.get(node)
      const now = node.getBoundingClientRect()
      return [node, was.left - now.left, was.top - now.top]
    }).filter(([, dx, dy]) => dx || dy)
    moves.forEach(([node, dx, dy]) => {
      node.style.transform = `translate(${dx}px, ${dy}px)`
    })
    // The old places are styled before the transition comes back.
    void stage.offsetWidth
    cards.forEach((node) => {
      node.style.transition = ''
    })
    moves.forEach(([node]) => {
      node.style.transform = ''
    })
  }
```

Check that moving a focused card would be caught: temporarily make `held` always `null`, run `npx vitest run tests/js/viewer/diagram-view.test.js -t focus`, see it fail, and restore.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS, every suite.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/diagram-view.js tests/js/viewer/diagram-view.test.js
git commit -m "Viewer: Wall cards read in the order drawn, and slide when they move"
```

### Task 12: Build, live check and docs

The deploy and the browser check follow **Live verification** at the top of this plan, step by step, including its route-cache step: selenium-flow's skills from `skill://selenium-flow/SKILL.md` and its references, sign-in with its `grafana` secret (valid for Nextcloud). The check is not done until every behaviour below is passed or recorded as outstanding with its reason.

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]`), `AGENTS.md` (the repo map's `src/viewer/` row, line 112), `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`, `docs/superpowers/specs/2026-10-14-editor-design.md` (status flips)

- [ ] **Step 1: Build and measure**

Run: `npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js && gzip -c dist/plantuml-files.js | wc -c && gzip -c dist/plantuml-editor.js | wc -c`
Expected: the guard passes; the Files bundle at most 106000 bytes gzipped (98581 on `main`, about 100370 with this round); the editor entry about 243016 (242972 on `main`). Over budget: name what came in, from `dist/plantuml-files.js.map`, in the report; do not raise the budget.

- [ ] **Step 2: Every suite**

Run: `composer run test:unit && composer run lint && composer run cs:check && composer run psalm && npx vitest run && npm run lint && bash tests/integration/bin/check-suites.sh && bash tests/integration/bin/check-notes-anchors.sh && bash tests/integration/bin/check-step-definitions.sh`
Expected: all pass.

- [ ] **Step 3: Deploy, clear the route cache, and check it live**

Deploy and run `apachectl -k graceful` as **Live verification** steps 1 and 1a say. In the shared `claudecode` selenium-flow browser, a 1280 px wide window, in a scratch folder holding `Linked.puml` (`<style file=UML_Fun.css>` and `<style file=0>`), `UML_Fun.css` (a style body of about 300 bytes), a style file named `0`, `Separators.puml` (this round's `line-separator.puml`), `Mixed.puml` (40 diagrams: wide sequences, tall activities, small classes and one 4000 px wide diagram, made from `proto.mjs`'s kinds) and `Single.puml`:
- **Compressed ETag (Task 1):** confirm the premise first: the GET of `UML_Fun.css` answers `ETag: "…-gzip"` (a `fetch` wrapper logging response headers). Open it from its chip, type, wait for the autosave: no "Someone else changed this file"; the PUT's `If-Match` has no `-gzip`; over 30 s of watcher ticks the file is not read again (the wrapper logs no second GET). In the Viewer, reopening `Mixed.puml` on the same page: its re-checks answer 304 where the render answer was compressed.
- **One spinner (Task 2):** with a `window.fetch` wrapper delaying `/render` by 2 s, open `Single.puml` from Files: `.modal-mask.icon-loading` is gone (an `execute_script` poll every 50 ms) while the sheet still shows its spinner; ← to a neighbour and back: no lasting modal spinner.
- **Separators (Task 3):** `Separators.puml` in the Viewer has 5 tabs (`first 1`, `first 2`, `lone`, `second tail`, `third`); `second tail` draws C → D and `third` E → F; `lone` shows PlantUML's syntax-error drawing.
- **A file named `0` (Task 4):** in the editor on `Linked.puml`, open the `0` chip, type a change: the diagram redraws with it (`POST /render` 200, not 400).
- **Hover in a style file (Task 5):** in the open `UML_Fun.css`, hover `BackgroundColor` for 600 ms: `.cm-tooltip-hover .cm-doc` appears (`execute_script`), the card the same line shows inside a diagram's `<style>`.
- **Margins (Task 6):** computed `margin-inline-start` of `.cm-plantuml-link-chip` 4px and of `.cm-plantuml-chooser` 2px, a stepper button's margins 0px; compare the chip with the Penpot linked-files board.
- **Packing (VW12):** `Mixed.puml` in Wall: the first placement is file order; within a few seconds the cards are packed (a `MutationObserver` on the cards' `style` counts the packs: a handful, not one per diagram); no two cards' boxes overlap and every card lies inside the stage (`getBoundingClientRect`, pairwise, by `execute_script`); every drawing's rendered width over its `width` attribute is between 0.5 and 1; the 4000 px diagram spans the wall and scrolls sideways; moves slide (a screenshot mid-move is enough, or `getComputedStyle(card).transition`). Screenshots light and dark.
- **Memory (VW13):** close and reopen `Mixed.puml`, switch to Wall: every card is at its final place before any `/render` answers (the delaying wrapper again), spinners at their real sizes; `localStorage['plantuml.viewer.wall']` holds the file's entry. Resize the window to 900 px (`resize`): the wall packs again under its new column count, and reopening at 900 px places at once too.
- **Order and focus:** Tab through the Wall: the focus goes by row, then column; focus a card's checkbox, then force a re-pack (resize by 300 px): the focus stays on it.
- **Kept:** a Wall card's click opens it in Tabs (not on its checkbox or a link); an undrawn diagram's checkbox is disabled; Stack keeps file order.
- **Reduced motion:** Chrome's emulation (`Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce`) if selenium-flow can send it; otherwise record it as outstanding (the unit test covers it).

- [ ] **Step 4: Specs**

In `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`:
- VW12, VW13: `agreed (wall round)` becomes `shipped (wall round)`.
- VW9's `one spinner agreed (wall round)` becomes `one spinner shipped (wall round)`.
- The heading `## The Viewer (shipped 2026-10-17, viewer and viewer-polish rounds)` becomes `## The Viewer (shipped 2026-10-17, viewer, viewer-polish and wall rounds)`.
- The `viewer-component.js` row's `**Agreed (wall round):**` becomes `**Shipped (wall round):**`.
- The wall-round rulings paragraph stays; add any ruling the live check forced, one sentence each.

In `docs/superpowers/specs/2026-10-14-editor-design.md`: S1's `compressed ETags agreed (wall round)`, B1's `line separators as PlantUML reads them agreed (wall round)`, R9's `its 4 px kept over core's button margin agreed (wall round)` and R12's `hover cards agreed (wall round)` each say `shipped` for `agreed`.

Run: `git diff --stat docs/superpowers/specs/`
Expected: those two files.

- [ ] **Step 5: Docs**

`CHANGELOG.md`, the line `- The Viewer shows every diagram of a `.puml` as tabs, a stack or a wall, drawn inline so their links work; the mode is not remembered, every open is Tabs.` becomes:

```markdown
- The Viewer shows every diagram of a `.puml` as tabs, a stack or a wall, drawn inline so their links work; the wall packs diagrams of every size together and opens as it was last packed. The mode is not remembered, every open is Tabs.
```

(The six fixes are to unreleased features and need no line.)

`AGENTS.md`: the `src/viewer/` row's `` `sheets.js`, `page-cache.js`, `` becomes `` `sheets.js`, `page-cache.js`, `wall-layout.js` (the Wall's packer), `wall-memory.js`, ``.

Penpot: `screens / viewer-wall` is left as it is (Rulings); nothing to export.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md AGENTS.md docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md docs/superpowers/specs/2026-10-14-editor-design.md
git commit -m "Docs: the wall round"
```

- [ ] **Step 7: Report**

The report lists each live behaviour with pass or fail and its screenshot, whether `apachectl -k graceful` ran or is outstanding for Dr K, both bundle sizes, and this scenario proposed for `features/diagrams/edit.feature` under its linked-files rule (never written into it; it needs one new Given, a style file named by a parameter):

```gherkin
  @api
  Scenario: A linked file named with a number is drawn from its unsaved text
    Given I have a diagram that takes its style from a file beside it named "0"
    When the diagram is drawn with new text for that style file
    Then the drawing uses the new text
    And the style file is unchanged
```
