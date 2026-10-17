# Viewer Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Viewer shows every diagram of a `.puml` inline, as Tabs, a Stack or a Wall, exports one, some or all of them, and opens the editor at the one in view.

**Architecture:** The server learns to pick one diagram of a file (`lib/Service/Diagrams.php`, a PHP twin of the editor's B1 scan, held to it by one shared fixture) and answers `GET /render?…&diagram=` and `GET /export`. Reading a stored diagram moves out of `RenderController` into `DiagramFiles`, so both routes refuse the same files the same way. The Viewer component becomes a thin Vue 2 shell over plain-DOM modules in `src/viewer/`, which read the file once over WebDAV, split it with `blocks.js`, draw each sheet through `GET /render` and `inline-svg.js`, and reuse the editor's tab strip.

**Tech Stack:** PHP 8.4 (Nextcloud 34 OCP, PHPUnit), plain ES modules in the IIFE Files bundle (Vite 8 / Rolldown), DOMPurify, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (VW1–VW8; the `GET /render … &diagram=` row, agreed round 4; the `GET /export` row; the `Controller/ExportController` row) and `docs/superpowers/specs/2026-10-14-editor-design.md` (B1–B5, D1, D4, O1). Both carry uncommitted edits from another agent: read them, never edit or stage them.

**Built with (kb MCP skills):** `skill://superpowers/writing-plans/SKILL.md`, `skill://superpowers/test-driven-development/SKILL.md` and its `writing-good-tests.md`, `skill://penpot/penpot-router/SKILL.md` (read-only discovery of the Penpot file "NXT PlantUML": `library / viewer`, `screens / viewer*`, `overlay / export-menu-*`). The design values in Global Constraints were read off those boards on 2026-10-17.

## Global Constraints

- Work on a branch `viewer-round` in its own worktree; never on `main`.
- Never edit `features/**/*.feature`. Gherkin is proposed to Dr K in chat.
- Never stage `docs/superpowers/specs/*` (another agent's uncommitted work).
- The maintainer is **Dr K**; SPDX headers say `kubed-io`; fixture users are `drk`; no homelab hostnames in any file.
- PHP: `declare(strict_types=1)`, tabs, `final` classes, logged-in routes only (no `#[PublicPage]`).
- The Viewer component stays a Vue 2 options object drawn with `render(h)` that imports no Vue. Viewer stable34 mounts the previous and next files' components too, hidden and without `active` (`src/views/Viewer.vue`, read 2026-10-17); the view is built only while `active` is true.
- Copy, through `t(APP_ID, …)` / `n(APP_ID, …)`: "Tabs", "Stack", "Wall", "Export", "Export all", "Export %n", "Edit", "SVG", "PNG", "PDF", "EPS", "ASCII art", "%n diagrams, as .zip", "Could not draw the diagram", "Diagrams".
- Formats: `svg`, `png`, `pdf`, `eps`, `txt`, drawn at `<server>/<format>/<index>` (`<server>/<format>` for index 0). Live server 2026-10-17: `image/svg+xml`, `image/png`, `application/pdf`, `application/postscript`, `text/plain;charset=utf-8`; a past-the-end index answers `400 text/html`; `utxt` answers 405.
- Zips are built with PHP's `ZipArchive` (already required by R7's `!import`), not core's `ZipResponse`: core's `OC\Streamer` answers macOS user agents with a `.tar` (`UA_PREFERS_TAR`, Nextcloud 34 pod, 2026-10-17) and VW6 promises a `.zip`.
- Downloads set their own `Content-Disposition`; `DataDownloadResponse` needs `symfony/http-foundation` and `symfony/string`, which the unit tests' vendor tree lacks.
- Design values (Penpot, 2026-10-17). Viewer backdrop `#000000`, its text `#ffffff`. Under the Viewer's 50 px bar, a column with a 16 px gap and 40 px bottom padding: the toolbar 16 px below the bar, the tab bar 16 px below the toolbar, then the stage.
  - Toolbar `viewer-toolbar`: 42 px high, padding 4, gap 4, radius 100 (pill), fill `--color-main-background`, 1 px `--color-border-maxcontrast`, shadow `0 2px 12px rgba(0, 0, 0, 0.18)`. Divider 1×20 `--color-border`.
  - Display option and toolbar button: 34 px high (`--default-clickable-area`), padding 0 12, gap 4, radius 100, 24 px icon, label 14 px. Active option: fill `--color-primary-element-light`, label 700 in `--color-primary-element-light-text`. Hover: `--color-background-hover`. Focus: 2 px `--color-primary-element` outline. Export carries a 16 px `chevron-down-small` after its label; Edit carries none.
  - Tab bar `viewer-tab-bar`: 44 px high, padding 0 8, radius 8, fill, outline and shadow as the toolbar; tabs padding 0 16, label 15 px, `--color-text-maxcontrast`, the active one `--color-main-text` with a 2 px `--color-primary-element` underline.
  - Sheet `diagram-sheet`: fill `#ffffff` (`plantuml.background`), radius 8, padding 40, centred in the stage.
  - Card `diagram-card`: padding 4, gap 4, radius 8, fill `--color-main-background`, 1 px `--color-border-maxcontrast`, the toolbar's shadow; checked: 2 px `--color-primary-element`. Caption 34 px high, padding 0 8: a 14 px checkbox (radius 4, `--color-primary-element` when checked), gap 4, label 14 px `--color-main-text`. Then the sheet.
  - Stack: cards 720 px wide, 24 px apart, starting 32 px below the toolbar. Wall: a wrapping row, 24 px gaps both ways, centred, 80 px side margins, each card at its diagram's own size.
  - Export menu `export-menu`: 260 px wide, padding 4 0, radius 8, fill `--color-main-background`, 1 px `--color-border`, the toolbar's shadow, opened under the Export button, left edges aligned. Heading 34 px, padding 0 16, 13 px 600 `--color-text-maxcontrast`. Items 44 px: a 32 px icon slot holding the 24 px `download` icon, label 15 px `--color-main-text`.
- Icons (Penpot icon components, 24 px viewBox unless noted), each a file `img/icons/<name>.svg` in the shape of `img/icons/pencil.svg` and imported `?raw`:
  - `view-tabs.svg`: `M21,3L3,3C1.9,3,1,3.9,1,5L1,19C1,20.1,1.9,21,3,21L21,21C22.1,21,23,20.1,23,19L23,5C23,3.9,22.1,3,21,3M21,19L3,19L3,5L13,5L13,9L21,9L21,19Z`
  - `view-stack.svg`: `M21,13L3,13C2.45,13,2,13.45,2,14L2,20C2,20.55,2.45,21,3,21L21,21C21.55,21,22,20.55,22,20L22,14C22,13.45,21.55,13,21,13M20,19L4,19L4,15L20,15M21,3L3,3C2.45,3,2,3.45,2,4L2,10C2,10.55,2.45,11,3,11L21,11C21.55,11,22,10.55,22,10L22,4C22,3.45,21.55,3,21,3M20,9L4,9L4,5L20,5Z`
  - `view-grid.svg`: `M3,11L11,11L11,3L3,3M5,5L9,5L9,9L5,9M13,21L21,21L21,13L13,13M15,15L19,15L19,19L15,19M3,21L11,21L11,13L3,13M5,15L9,15L9,19L5,19M13,3L13,11L21,11L21,3M19,9L15,9L15,5L19,5Z`
  - `download.svg`: `M2,12L4,12L4,17L20,17L20,12L22,12L22,17C22,18.11,21.11,19,20,19L4,19C2.9,19,2,18.11,2,17L2,12M12,15L17.55,9.54L16.13,8.13L13,11.25L13,2L11,2L11,11.25L7.88,8.13L6.46,9.55L12,15Z`
  - `chevron-down-small.svg` (16 px viewBox): `M4.94,5.72L8,8.78L11.06,5.72L12,6.67L8,10.67L4,6.67L4.94,5.72Z`
  - Edit uses the existing `pencil.svg`.
- Commands: `composer run test:unit`, `composer run lint && composer run cs:check && composer run psalm`, `npx vitest run`, `npm run lint`, `npm run build`. Psalm and cs-fixer run in the code-server pod, never in the Nextcloud pod.
- CI's chunk guard stays green: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`.
- Commit messages: `<Area>: <one plain sentence>`, ending with the session's attribution line.

## Review Focus

1. **A CRLF file, or one starting with a BOM**: the Viewer's tabs and the server's `diagram=` pick the same diagram as for the LF file. Tests: Task 1, Task 7.
2. **Two unnamed diagrams of one type** exported together: two zip entries, never one overwriting the other. Test: Task 5.
3. **A diagram named with `/`, `"`, `:` or non-ASCII**: download and entry names stay safe and readable. Test: Task 5.
4. **A file of 40 diagrams in Stack or Wall**: at most 3 render requests in flight, asked in file order. Test: Task 8.
5. **The Viewer closed, or a neighbour preloaded, while sheets load**: no `doneLoading()` after destroy, nothing fetched for an inactive neighbour, pending fetches aborted. Test: Task 7.

## Rulings

Each as `Ruling: <what> — <why> — <cost if wrong>`.

- Ruling (coordinator, 2026-10-17): Export is a download, so a file on a share whose owner forbids download has no Export in the toolbar, and `GET /export` answers 404 for it as for any other refusal; the check is the resolver's own (`IncludeResolver::forbidsDownload`, split out of `viewOnly`) — a picture of a file is a copy of it, which the share forbids — a file that should export cannot, until the check is loosened.
- Ruling: `diagram` on `GET /export` is `diagram[]=` (a single `diagram=` also works) — PHP keeps only the last of a plain repeated `diagram=a&diagram=b`, so the spec's "repeatable" cannot mean that — a client following the spec's literal form exports one diagram.
- Ruling: asked diagrams are drawn in file order, each once; a set of one, however asked, is one file — the spec says one is a file and several a zip, and a file of one diagram has nothing to zip — none.
- Ruling: at most 100 diagrams and 50 MiB drawn per export, else 413 "The export is too large" — the spec sets no cap and the Caps round asked for caps, not rate limits — a file of more than 100 diagrams exports only in parts.
- Ruling: no total time budget for an export beyond RenderService's 10 s per diagram; 100 diagrams can hold a request for minutes, and PHP's own execution limit ends a stuck one — a time cap would refuse a slow but working server mid-zip — a slow server ties up a PHP worker per export.
- Ruling: a repeated name in a zip gets ` (2)`, ` (3)` before its extension; an unnamed diagram is named by its type, as its tab is; unsafe characters (`/ \ : * ? " < > |`, controls), with the spaces around them, become ` - ` — the spec names no rule — a name reads differently than Dr K expects.
- Ruling: the Export menu heading for a file of one unnamed diagram is the file's name without `.puml` — the `export-menu-single` board shows "Checkout" for `Checkout.puml` — none.
- Ruling: icons are the Penpot components' (`view-tabs`, `view-stack`, `view-grid`, `download`, `chevron-down-small`, `pencil`), not VW2's Material names — the boards are the design and their glyphs are what was drawn — a later swap of one path.
- Ruling: zips come from PHP's `ZipArchive`, not core's `ZipResponse` — core sends macOS a `.tar` and VW6 promises a `.zip` — none.
- Ruling: a failed export shows "Could not export the diagram", or the route's problem, under the toolbar; the download goes through `fetch` and a `blob:` URL — an `<a download>` on the route would save a 404 or 503 JSON body as the file — new copy Dr K may want worded otherwise.
- Ruling: the toolbar shows Export unless the file's `nc:share-attributes` forbid download; a failed look shows it, and the route decides — hiding Export on a network hiccup would read as a missing feature — a user on a forbidden share may see Export and get the refusal line.
- Ruling: Edit shows only with `server_configured`, as O1's file action — VW7 does not say — none.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/Service/Diagrams.php` (create) | B1's scan in PHP: a file's diagrams with PlantUML's image index; finding one by name or position; its label; the problem line when none matches. |
| `lib/Service/DiagramFiles.php`, `lib/Service/DiagramFile.php`, `lib/Exception/FileRefusal.php` (create) | Reading a stored `.puml` for a route: the caller's readable file, capped, includes expanded, its ETag; or a refusal carrying the response. |
| `lib/Controller/RenderController.php` (modify) | `byPath` reads through `DiagramFiles` and takes `diagram`. |
| `lib/Service/RenderService.php` (modify) | `render()` takes a format. |
| `lib/Controller/ExportController.php` (create), `appinfo/routes.php` (modify) | `GET /export`. |
| `tests/fixtures/diagrams/scan.json` (create) | The B1 cases both scans must agree on. |
| `src/editor/lexicon/start.js` (create) | `startName`, `startCall`, so the Files bundle does not pull in the 37 kB grammar for two patterns. |
| `src/open-editor.js` (create), `src/files.js` (modify) | Loading the editor bundle and opening it, shared by the file action and the Viewer. |
| `src/editor.js` (modify) | `openEditor(node, { diagram })`. |
| `src/viewer/sheets.js` (create) | One diagram drawn as a sheet; the queue of at most 3 requests. |
| `src/viewer/diagram-view.js` (create) | The Viewer's UI on a root element: read, split, modes, selection, export, edit. |
| `src/viewer/toolbar.js` (create) | The toolbar; `LABELLED`, the one switch for words on buttons. |
| `src/viewer/menu.js` (create) | The Export menu. |
| `img/icons/view-tabs.svg`, `view-stack.svg`, `view-grid.svg`, `download.svg`, `chevron-down-small.svg` (create) | Toolbar and menu icons. |
| `src/viewer-component.js` (modify) | Builds the view while active; destroys it. |
| `src/files-helpers.js` (modify) | `renderUrl(path, diagram)`, `exportUrl(path, format, positions)`. |
| `css/viewer.css` (create), `lib/Listener/LoadFilesScriptListener.php` (modify) | The Viewer's styles on Files pages. |

---

### Task 1: `Diagrams.php`, the server's B1

**Files:**
- Create: `lib/Service/Diagrams.php`, `src/editor/lexicon/start.js`, `tests/fixtures/diagrams/scan.json`, `tests/unit/DiagramsTest.php`
- Modify: `src/editor/lexicon/rules.js:649-652`, `src/editor/blocks.js:8`
- Test: `tests/js/blocks.test.js`, `tests/unit/DiagramsTest.php`

**Interfaces:**
- Produces:
  - `Diagrams::scan(string $text): list<array{index: int, type: string, name: string, id: ?string, page: int, pages: int, render: int}>` — JS `scan()`'s fields and values for the same text.
  - `Diagrams::find(array $diagrams, string $diagram): ?array` — the first page of the first block whose `name` is `$diagram`; else, for 1–4 digits, the diagram at that 1-based position; else null.
  - `Diagrams::label(array $diagram): string` — JS `label()`.
  - `Diagrams::missing(string $diagram): string` — `no diagram 9` for digits, `no diagram named signup` otherwise.
  - `src/editor/lexicon/start.js` exports `startName`, `startCall`; `rules.js` re-exports both.

- [ ] **Step 1: Write the shared fixture**

`tests/fixtures/diagrams/scan.json`, every expected list worked out by hand from B1 (index, type, name, id, page, pages, render). The `bom` case's text starts with the BOM itself, U+FEFF written as the raw character (bytes `EF BB BF`), not as an escape; it is invisible below, before `@startuml a`.

```json
{
  "one": { "text": "@startuml\nA -> B\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "no-start": { "text": "A -> B\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "two-named": { "text": "@startuml nodes\nA -> B\n@enduml\n\n@startuml login\nC -> D\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "nodes", "id": null, "page": 1, "pages": 1, "render": 0 },
    { "index": 1, "type": "uml", "name": "login", "id": null, "page": 1, "pages": 1, "render": 1 } ] },
  "id": { "text": "@startuml(id=x)\nA -> B\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "x", "id": "x", "page": 1, "pages": 1, "render": 0 } ] },
  "id-and-name": { "text": "@startuml(id=fun) Fun name\nA -> B\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "Fun name", "id": "fun", "page": 1, "pages": 1, "render": 0 } ] },
  "quoted": { "text": "@startuml \"quoted name\"\nA -> B\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "quoted name", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "braced": { "text": "@startuml{fun_file.png}\nA -> B\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "fun_file.png", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "newpage": { "text": "@startuml nodes\nA -> B\nnewpage\nB -> C\nnewpage\nC -> D\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "nodes", "id": null, "page": 1, "pages": 3, "render": 0 },
    { "index": 1, "type": "uml", "name": "nodes", "id": null, "page": 2, "pages": 3, "render": 1 },
    { "index": 2, "type": "uml", "name": "nodes", "id": null, "page": 3, "pages": 3, "render": 2 } ] },
  "salt-newpage": { "text": "@startsalt\n{\nnewpage\n}\n@endsalt\n", "diagrams": [
    { "index": 0, "type": "salt", "name": "", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "unclosed-then-closed": { "text": "@startuml a\nA -> B\n@startuml b\nC -> D\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "a", "id": null, "page": 1, "pages": 1, "render": 0 },
    { "index": 1, "type": "uml", "name": "b", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "nothing-closes": { "text": "@startuml a\nA -> B\n@startuml b\nC -> D\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "a", "id": null, "page": 1, "pages": 1, "render": 0 },
    { "index": 1, "type": "uml", "name": "b", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "bom": { "text": "﻿@startuml a\nA -> B\n@enduml\n", "diagrams": [
    { "index": 0, "type": "uml", "name": "a", "id": null, "page": 1, "pages": 1, "render": 0 } ] },
  "jcckit-args": { "text": "@startjcckit(300,200)\ndata\n@endjcckit\n", "diagrams": [
    { "index": 0, "type": "jcckit", "name": "", "id": null, "page": 1, "pages": 1, "render": 0 } ] }
}
```

The fixture sets the bar for both languages. If a JS case disagrees with a hand-worked value, check B1 in the editor spec before changing either: the spec wins, and a JS bug found here is a finding for the report, not a fixture edit.

- [ ] **Step 2: Write the failing tests**

`tests/js/blocks.test.js`, added:

```js
import cases from '../fixtures/diagrams/scan.json'

describe('the shared scan fixture', () => {
  it.each(Object.entries(cases))('scans %s as the PHP twin must', (_name, { text, diagrams }) => {
    const picked = scan(text).map(({ index, type, name, id, page, pages, render }) => ({ index, type, name, id, page, pages, render }))
    expect(picked).toEqual(diagrams)
  })
})
```

`tests/unit/DiagramsTest.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\Diagrams;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DiagramsTest extends TestCase {
	/** @return array<string, array{string, list<array<string, mixed>>}> */
	public static function cases(): array {
		$cases = json_decode((string)file_get_contents(__DIR__ . '/../fixtures/diagrams/scan.json'), true, 512, JSON_THROW_ON_ERROR);
		return array_map(static fn (array $case): array => [$case['text'], $case['diagrams']], $cases);
	}

	#[DataProvider('cases')]
	public function testScansAsTheEditorDoes(string $text, array $diagrams): void {
		self::assertSame($diagrams, Diagrams::scan($text));
	}

	public function testCrlfScansAsLf(): void {
		self::assertSame(
			Diagrams::scan("@startuml a\nA -> B\n@enduml\n@startuml b\n@enduml\n"),
			Diagrams::scan("@startuml a\r\nA -> B\r\n@enduml\r\n@startuml b\r\n@enduml\r\n"),
		);
	}

	public function testLoneCrScansAsLf(): void {
		self::assertSame(Diagrams::scan("@startuml a\n@enduml\n"), Diagrams::scan("@startuml a\r@enduml\r"));
	}

	public function testANoBreakSpaceBeforeTheNameIsASpace(): void {
		self::assertSame('a', Diagrams::scan("@startuml\u{A0}a\n@enduml\n")[0]['name']);
	}

	/** JavaScript's `\w` is ASCII; `@startümlaut` opens no block there, so none here. */
	public function testATypeIsAsciiWordCharactersOnly(): void {
		self::assertSame([null], array_column(Diagrams::scan("@startüml x\n@enduml\n"), 'id'));
		self::assertSame('uml', Diagrams::scan("@startüml x\n@enduml\n")[0]['type']);
		self::assertSame('', Diagrams::scan("@startüml x\n@enduml\n")[0]['name']);
	}

	/** Bytes that are not UTF-8 would make every `/u` pattern fail; they read as replaced, the rest as written. */
	public function testInvalidUtf8StillScans(): void {
		self::assertSame(['nodes', 'login'], array_column(Diagrams::scan("@startuml nodes\n\xFF\n@enduml\n@startuml login\n@enduml\n"), 'name'));
	}

	public function testFindsByName(): void {
		$diagrams = Diagrams::scan("@startuml nodes\n@enduml\n@startuml login\n@enduml\n");
		self::assertSame(1, Diagrams::find($diagrams, 'login')['render']);
	}

	public function testFindsTheFirstPageOfANamedBlock(): void {
		$diagrams = Diagrams::scan("@startuml nodes\nA\nnewpage\nB\n@enduml\n");
		self::assertSame(1, Diagrams::find($diagrams, 'nodes')['page']);
	}

	public function testFindsByPositionCountingPages(): void {
		$diagrams = Diagrams::scan("@startuml nodes\nA\nnewpage\nB\nnewpage\nC\n@enduml\n");
		self::assertSame(2, Diagrams::find($diagrams, '3')['render']);
	}

	public function testANameWinsOverANumber(): void {
		$diagrams = Diagrams::scan("@startuml x\n@enduml\n@startuml 2\n@enduml\n@startuml y\n@enduml\n");
		self::assertSame(1, Diagrams::find($diagrams, '2')['index']);
	}

	#[DataProvider('nothing')]
	public function testFindsNothing(string $diagram): void {
		self::assertNull(Diagrams::find(Diagrams::scan("@startuml nodes\n@enduml\n"), $diagram));
	}

	/** @return list<array{string}> */
	public static function nothing(): array {
		return [['signup'], ['0'], ['2'], ['-1'], ['1.0'], ['NODES'], ['']];
	}

	public function testLabels(): void {
		$diagrams = Diagrams::scan("@startuml nodes\nA\nnewpage\nB\n@enduml\n@startsalt\n{\n}\n@endsalt\n");
		self::assertSame(['nodes 1', 'nodes 2', 'salt'], array_map(Diagrams::label(...), $diagrams));
	}

	public function testSaysWhatIsMissing(): void {
		self::assertSame('no diagram 9', Diagrams::missing('9'));
		self::assertSame('no diagram named signup', Diagrams::missing('signup'));
	}
}
```

- [ ] **Step 3: Run them to see the right failures**

Run: `npx vitest run tests/js/blocks.test.js`
Expected: PASS for every fixture case that matches B1. A failure here is a JS disagreement with the spec: stop and report it.

Run: `composer run test:unit -- --filter DiagramsTest`
Expected: FAIL, `Class "OCA\PlantUml\Service\Diagrams" not found`.

- [ ] **Step 4: Move the two patterns**

`src/editor/lexicon/start.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The two patterns a `@start` line is read with, on their own so the Files
 * bundle can split a file into diagrams without the whole grammar.
 */

/** The name after `@start<type>`: group 2, with the spaces, quotes and braces around it in 1 and 3. */
export const startName = /^([\s{][\s"“”]*)([^"“”]*?)([\s}"“”]*)$/

/** The arguments in parentheses straight after the type; group 1 is what is between them. */
export const startCall = /^\(([^)]*)\)/
```

In `rules.js`, replace the two definitions with `export { startName, startCall } from './start.js'` and add `import { startName, startCall } from './start.js'` for its own uses at lines 700 and 706. In `blocks.js`: `import { startCall, startName } from './lexicon/start.js'`.

- [ ] **Step 5: Write `lib/Service/Diagrams.php`**

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

/**
 * A file read into its diagrams as the editor's tabs read it (src/editor/blocks.js,
 * editor spec B1): one per `@start…` block, one per `newpage` page of a uml block,
 * each with the image PlantUML draws for it. tests/fixtures/diagrams/scan.json
 * holds both to the same answers.
 *
 * @psalm-type Diagram = array{index: int, type: string, name: string, id: ?string, page: int, pages: int, render: int}
 */
final class Diagrams {
	/** The characters of JavaScript's `\s`, which PCRE's is narrower than; bare, to go inside other classes. */
	private const SC = '\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';
	private const S = '[' . self::SC . ']';
	/** JavaScript's `\w`: under `/u`, PCRE's would take any letter. */
	private const W = '[A-Za-z0-9_]';
	private const START = '/^' . self::S . '*@start(' . self::W . '+)(.*)$/u';
	private const END = '/^' . self::S . '*@end' . self::W . '*' . self::S . '*$/u';
	private const NEWPAGE = '/^' . self::S . '*newpage(?:' . self::S . '.*)?$/u';
	private const CALL = '/^\(([^)]*)\)/u';
	private const ID = '/^' . self::S . '*id' . self::S . '*=' . self::S . '*(.*?)' . self::S . '*$/u';
	private const NAME = '/^([' . self::SC . '{][' . self::SC . '"“”]*)([^"“”]*?)([' . self::SC . '}"“”]*)$/u';

	/** @return list<Diagram> */
	public static function scan(string $text): array {
		// Bytes that are not UTF-8 would fail every `/u` pattern; the browser reads them as U+FFFD.
		$text = mb_scrub($text, 'UTF-8');
		$lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $text));
		$found = [];
		$block = null;
		$close = static function () use (&$block, &$found): void {
			if ($block === null) {
				return;
			}
			$pages = count($block['pages']);
			foreach ($block['pages'] as $i => $from) {
				$found[] = ['type' => $block['type'], 'name' => $block['name'], 'id' => $block['id'], 'page' => $i + 1, 'pages' => $pages, 'from' => $from];
			}
			$block = null;
		};
		foreach ($lines as $i => $line) {
			$n = $i + 1;
			$open = self::startOf($line);
			if ($open !== null) {
				$close();
				$block = $open + ['pages' => [$n]];
			} elseif ($block !== null && preg_match(self::END, $line) === 1) {
				$close();
			} elseif ($block !== null && $block['type'] === 'uml' && preg_match(self::NEWPAGE, $line) === 1) {
				$block['pages'][] = $n;
			}
		}
		$close();
		if ($found === []) {
			$found[] = ['type' => 'uml', 'name' => '', 'id' => null, 'page' => 1, 'pages' => 1, 'from' => 1];
		}
		$drawn = self::images($lines);
		$diagrams = [];
		foreach ($found as $index => $d) {
			$render = count($drawn);
			foreach ($drawn as $at => $last) {
				if ($last >= $d['from']) {
					$render = $at;
					break;
				}
			}
			$diagrams[] = ['index' => $index, 'type' => $d['type'], 'name' => $d['name'], 'id' => $d['id'], 'page' => $d['page'], 'pages' => $d['pages'], 'render' => $render];
		}
		return $diagrams;
	}

	/**
	 * @param list<Diagram> $diagrams
	 * @return Diagram|null
	 */
	public static function find(array $diagrams, string $diagram): ?array {
		foreach ($diagrams as $d) {
			if ($d['name'] !== '' && $d['name'] === $diagram && $d['page'] === 1) {
				return $d;
			}
		}
		return preg_match('/^\d{1,4}$/', $diagram) === 1 ? ($diagrams[(int)$diagram - 1] ?? null) : null;
	}

	/** @param Diagram $diagram */
	public static function label(array $diagram): string {
		$base = $diagram['name'] !== '' ? $diagram['name'] : $diagram['type'];
		return $diagram['pages'] > 1 ? "{$base} {$diagram['page']}" : $base;
	}

	public static function missing(string $diagram): string {
		return preg_match('/^\d+$/', $diagram) === 1 ? "no diagram {$diagram}" : "no diagram named {$diagram}";
	}

	/** @return array{type: string, id: ?string, name: string}|null */
	private static function startOf(string $line): ?array {
		if (preg_match(self::START, $line, $open) !== 1) {
			return null;
		}
		$rest = $open[2];
		$id = null;
		if (preg_match(self::CALL, $rest, $call) === 1) {
			$id = preg_match(self::ID, $call[1], $m) === 1 && $m[1] !== '' ? $m[1] : null;
			$rest = substr($rest, strlen($call[0]));
		}
		$named = preg_match(self::NAME, $rest, $name) === 1;
		if ($rest !== '' && !$named) {
			return null;
		}
		$text = $named && $name[2] !== '' ? $name[2] : ($id ?? '');
		return ['type' => $open[1], 'id' => $id, 'name' => $text];
	}

	/**
	 * The last line of each image PlantUML draws, in its order (blocks.js `images`).
	 *
	 * @param list<string> $lines
	 * @return list<int>
	 */
	private static function images(array $lines, bool $wrapped = false): array {
		$lasts = [];
		$open = $wrapped ? ['type' => 'uml', 'pages' => []] : null;
		foreach ($lines as $i => $line) {
			$n = $i + 1;
			$start = self::startOf($line);
			if ($start !== null) {
				$open = ['type' => $start['type'], 'pages' => []];
			} elseif ($open !== null && preg_match(self::END, $line) === 1) {
				array_push($lasts, ...$open['pages'], ...[$n]);
				$open = null;
			} elseif ($open !== null && $open['type'] === 'uml' && preg_match(self::NEWPAGE, $line) === 1) {
				$open['pages'][] = $n - 1;
			}
		}
		if ($wrapped && $open !== null) {
			array_push($lasts, ...$open['pages'], ...[count($lines)]);
		}
		return $lasts !== [] || $wrapped ? $lasts : self::images($lines, true);
	}
}
```

- [ ] **Step 6: Run both suites**

Run: `npx vitest run && composer run test:unit && composer run psalm`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/Service/Diagrams.php src/editor/lexicon/start.js src/editor/lexicon/rules.js src/editor/blocks.js tests/fixtures/diagrams/scan.json tests/unit/DiagramsTest.php tests/js/blocks.test.js
git commit -m "Diagrams: the server reads a file into diagrams as the editor's tabs do"
```

### Task 2: `DiagramFiles`, one read of a stored diagram

A refactor. `byPath` and `bySource` behave exactly as before; in `RenderControllerTest` only the `controller()` helper changes, to build the new service.

**Files:**
- Create: `lib/Service/DiagramFiles.php`, `lib/Service/DiagramFile.php`, `lib/Exception/FileRefusal.php`, `tests/unit/DiagramFilesTest.php`
- Modify: `lib/Controller/RenderController.php`, `tests/unit/RenderControllerTest.php` (its `controller()` helper and the stream flag), `tests/unit/stream-get-contents.php`

**Interfaces:**
- Produces:
  - `final class DiagramFile { public function __construct(public readonly File $file, public readonly string $text, public readonly ?Expanded $expanded, public readonly string $etag) }`
  - `DiagramFiles::__construct(IncludeResolver $resolver, IRootFolder $rootFolder, IUserSession $userSession)`
  - `DiagramFiles::open(string $path): DiagramFile` (throws `FileRefusal`), `DiagramFiles::userFolder(): ?Folder`.
  - Static: `DiagramFiles::readable(Folder $userFolder, string $path): ?File`, `content(File $file): ?string`, `storedSize(File $file): int`, `namesAFile(string $text): bool`, `tooLarge(): JSONResponse`; private `etag(string $fileEtag, Expanded $expanded): string`. Const `DiagramFiles::MAX_SOURCE = 1048576`.
  - Moved out of `RenderController`, unchanged in body: `readable`, `storedSize`, `content`, `etag`, `userFolder`, `tooLarge`, `NAMES_A_FILE`, `MAX_SOURCE`. `ownersText`, `mistake`, `encoded`, `image`, `revalidated`, `problem` stay.
  - `final class FileRefusal extends \Exception { public function __construct(public readonly Response $response) }`
  - `RenderController::__construct(string $appName, IRequest $request, RenderService $render, IncludeResolver $resolver, DiagramFiles $files)`; `RenderController::MAX_SOURCE = DiagramFiles::MAX_SOURCE` stays for its tests.
  - Test utility: `OCA\PlantUml\Tests\Unit\Streams::$unreadable` (bool), the switch the `stream_get_contents` shim reads, now in the `OCA\PlantUml\Service` namespace where `content()` lives.

- [ ] **Step 1: Move the stream shim**

PHP looks up an unqualified function in the caller's namespace first, so the shim must sit in the namespace of the code that calls `stream_get_contents`, which after this task is `DiagramFiles` (and `IncludeResolver`, already there, which reads zips through its own streams and is untouched by the flag while it is false). `tests/unit/stream-get-contents.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit {
	/** When the services' stream_get_contents fails; a test sets it and tearDown clears it. */
	final class Streams {
		public static bool $unreadable = false;
	}
}

namespace OCA\PlantUml\Service {
	use OCA\PlantUml\Tests\Unit\Streams;

	/**
	 * PHP looks for a function in the caller's namespace before the global one, so
	 * this stands in for PHP's own inside the services. PHP's answers false only
	 * on a failed seek, which no stream a test can make gives; the test says when.
	 *
	 * @param resource $stream
	 */
	function stream_get_contents($stream, ?int $length = null, int $offset = -1): string|false {
		return Streams::$unreadable ? false : \stream_get_contents($stream, $length, $offset);
	}
}
```

In `RenderControllerTest`: delete `public static bool $unreadable`, set `Streams::$unreadable = true` where it set `self::$unreadable = true` (line 235), and reset `Streams::$unreadable = false` in `tearDown()`.

- [ ] **Step 2: Write the failing tests**

`tests/unit/DiagramFilesTest.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Exception\FileRefusal;
use OCA\PlantUml\Service\DiagramFiles;
use OCA\PlantUml\Service\IncludeResolver;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\ForbiddenException;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Lock\LockedException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/stream-get-contents.php';

final class DiagramFilesTest extends TestCase {
	private const SOURCE = "@startuml\nCustomer -> Shop : place order\n@enduml\n";

	protected function tearDown(): void {
		Streams::$unreadable = false;
	}

	/**
	 * What the caller's folder answers for any path, or the caller's files by path from their root.
	 *
	 * @param Node|\Throwable|array<string, Node> $resolved
	 */
	public function files(Node|\Throwable|array $resolved): DiagramFiles {
		$folder = $this->createStub(Folder::class);
		$folder->method('getPath')->willReturn('/drk/files');
		if (is_array($resolved)) {
			$folder->method('get')->willReturnCallback(
				static fn (string $path): Node => $resolved[ltrim($path, '/')] ?? throw new NotFoundException($path),
			);
		} elseif ($resolved instanceof \Throwable) {
			$folder->method('get')->willThrowException($resolved);
		} else {
			$folder->method('get')->willReturn($resolved);
		}
		$root = $this->createStub(IRootFolder::class);
		$root->method('getUserFolder')->willReturn($folder);
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn('drk');
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		return new DiagramFiles(new IncludeResolver(), $root, $session);
	}

	/** A file in the caller's `Diagrams` folder. */
	public function diagram(string $mimetype = 'text/x-plantuml', string $content = self::SOURCE, string $etag = 'abc123'): File {
		$parent = $this->createStub(Folder::class);
		$parent->method('getPath')->willReturn('/drk/files/Diagrams');
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn($mimetype);
		$file->method('getEtag')->willReturn($etag);
		$file->method('fopen')->willReturnCallback(static function () use ($content) {
			$handle = fopen('php://memory', 'r+');
			self::assertIsResource($handle);
			fwrite($handle, $content);
			rewind($handle);
			return $handle;
		});
		$file->method('getSize')->willReturn(strlen($content));
		$file->method('getParent')->willReturn($parent);
		$file->method('getPath')->willReturn('/drk/files/Diagrams/Order flow.puml');
		return $file;
	}

	/** A diagram whose stored size and whose stream may disagree; with `$mayOpen` false, opening it fails the test. */
	public function sizedDiagram(int $storedSize, string $streamed, bool $mayOpen = true): File {
		$file = $mayOpen ? $this->createStub(File::class) : $this->createMock(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getEtag')->willReturn('abc123');
		$file->method('getSize')->willReturn($storedSize);
		$file->method('getParent')->willReturn($this->createStub(Folder::class));
		if ($mayOpen) {
			$file->method('fopen')->willReturnCallback(static function () use ($streamed) {
				$handle = fopen('php://memory', 'r+');
				self::assertIsResource($handle);
				fwrite($handle, $streamed);
				rewind($handle);
				return $handle;
			});
		} else {
			$file->expects(self::never())->method('fopen');
		}
		return $file;
	}

	/** A diagram whose open throws `$e`, as core does for a locked or forbidden file. */
	public function failingDiagram(\Throwable $e): File {
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getEtag')->willReturn('abc123');
		$file->method('getSize')->willReturn(10);
		$file->method('getParent')->willReturn($this->createStub(Folder::class));
		$file->method('fopen')->willThrowException($e);
		return $file;
	}

	public function testOpensAPlainDiagramAsStored(): void {
		$opened = $this->files($this->diagram())->open('Diagrams/Order flow.puml');
		self::assertSame(self::SOURCE, $opened->text);
		self::assertNull($opened->expanded);
		self::assertSame('abc123', $opened->etag);
	}

	public function testExpandsWhatItIncludes(): void {
		$base = $this->diagram(content: "@startuml\n!include parts.puml\n@enduml\n");
		$opened = $this->files(['Diagrams/Order flow.puml' => $base, 'Diagrams/parts.puml' => $this->diagram(content: "A -> B\n", etag: 'p1')])->open('Diagrams/Order flow.puml');
		self::assertStringContainsString('A -> B', $opened->expanded?->source ?? '');
		self::assertSame(md5('abc123,p1,'), $opened->etag);
	}

	#[DataProvider('refusals')]
	public function testRefuses(\Closure $files, string $path, int $status): void {
		try {
			$files($this)->open($path);
			self::fail('opened');
		} catch (FileRefusal $e) {
			self::assertSame($status, $e->response->getStatus());
		}
	}

	/** @return array<string, array{\Closure, string, int}> */
	public static function refusals(): array {
		return [
			'missing' => [fn (self $t) => $t->files(new NotFoundException()), 'Diagrams/nope.puml', 404],
			'climbing out' => [fn (self $t) => $t->files(new NotPermittedException()), '../x.puml', 404],
			'a folder' => [fn (self $t) => $t->files($t->createStub(Folder::class)), 'Diagrams', 404],
			'plain text' => [fn (self $t) => $t->files($t->diagram('text/plain')), 'notes.txt', 404],
			'too large on disk' => [fn (self $t) => $t->files($t->sizedDiagram(DiagramFiles::MAX_SOURCE + 1, '', false)), 'big.puml', 413],
			'too large in its stream' => [fn (self $t) => $t->files($t->sizedDiagram(10, str_repeat('a', DiagramFiles::MAX_SOURCE + 1))), 'big.puml', 413],
			'locked' => [fn (self $t) => $t->files($t->failingDiagram(new LockedException('x'))), 'l.puml', 423],
			'forbidden' => [fn (self $t) => $t->files($t->failingDiagram(new ForbiddenException('x', false))), 'f.puml', 404],
			'a stream that cannot be read' => [static function (self $t): DiagramFiles {
				Streams::$unreadable = true;
				return $t->files($t->diagram());
			}, 'Diagrams/Order flow.puml', 404],
		];
	}

	public function testTheTooLargeAnswerSaysSo(): void {
		try {
			$this->files($this->sizedDiagram(DiagramFiles::MAX_SOURCE + 1, '', false))->open('big.puml');
			self::fail('opened');
		} catch (FileRefusal $e) {
			self::assertInstanceOf(JSONResponse::class, $e->response);
			self::assertSame(['problem' => 'The diagram is too large to draw'], $e->response->getData());
		}
	}

	public function testNobodySignedInIsRefused(): void {
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn(null);
		$this->expectException(FileRefusal::class);
		(new DiagramFiles(new IncludeResolver(), $this->createStub(IRootFolder::class), $session))->open('Diagrams/Order flow.puml');
	}
}
```

- [ ] **Step 3: Run to see it fail**

Run: `composer run test:unit -- --filter DiagramFilesTest`
Expected: FAIL, `Class "OCA\PlantUml\Service\DiagramFiles" not found`. `RenderControllerTest::testByPathOfAStreamThatCannotBeReadIs404` fails too until Step 4 moves `content()`: the shim is now in the Service namespace and the controller still calls PHP's own.

- [ ] **Step 4: Move the code**

`lib/Exception/FileRefusal.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Exception;

use OCP\AppFramework\Http\Response;

/** A stored diagram a route may not read, with the answer the route gives. */
final class FileRefusal extends \Exception {
	public function __construct(public readonly Response $response) {
		parent::__construct('refused with HTTP ' . $response->getStatus());
	}
}
```

`lib/Service/DiagramFile.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCP\Files\File;

/** A stored diagram as a route reads it: the text as stored, what it includes, and the ETag covering both. */
final class DiagramFile {
	public function __construct(
		public readonly File $file,
		public readonly string $text,
		public readonly ?Expanded $expanded,
		public readonly string $etag,
	) {
	}
}
```

`lib/Service/DiagramFiles.php` takes the moved helpers, bodies unchanged, with their doc comments, and the class comment "Reading a stored diagram for a route: the caller's own readable `.puml`, capped, its includes expanded, the ETag covering them; or the refusal the route answers." Its `open()` is `byPath`'s first half:

```php
/** @throws FileRefusal */
public function open(string $path): DiagramFile {
	$userFolder = $this->userFolder();
	$node = $userFolder === null ? null : self::readable($userFolder, $path);
	// A text file would render as PlantUML's error image, and a 200 for it
	// would tell the caller nothing.
	if ($userFolder === null || $node === null || $node->getMimetype() !== Application::MIMETYPE) {
		throw new FileRefusal(new Response(Http::STATUS_NOT_FOUND));
	}
	if (self::storedSize($node) > self::MAX_SOURCE) {
		throw new FileRefusal(self::tooLarge());
	}
	try {
		$text = self::content($node);
	} catch (LockedException) {
		throw new FileRefusal(new Response(Http::STATUS_LOCKED));
	} catch (NotPermittedException|NotFoundException|InvalidPathException|GenericFileException|ForbiddenException) {
		// Forbidden is an access rule's refusal (files_accesscontrol).
		throw new FileRefusal(new Response(Http::STATUS_NOT_FOUND));
	}
	if ($text === null) {
		throw new FileRefusal(self::tooLarge());
	}
	$expanded = self::namesAFile($text) ? $this->resolver->expand($text, $node->getParent(), $userFolder, $node, true) : null;
	return new DiagramFile($node, $text, $expanded, $expanded === null ? $node->getEtag() : self::etag($node->getEtag(), $expanded));
}

public static function namesAFile(string $text): bool {
	return preg_match(self::NAMES_A_FILE, $text) === 1;
}
```

`byPath` becomes:

```php
public function byPath(string $path = ''): Response {
	try {
		$file = $this->files->open($path);
	} catch (FileRefusal $e) {
		return $e->response;
	}
	if (trim(str_replace('W/', '', $this->request->getHeader('If-None-Match')), '"') === $file->etag) {
		return $this->revalidated(new Response(Http::STATUS_NOT_MODIFIED), $file->etag);
	}
	try {
		return $this->revalidated($this->image($this->render->render($file->expanded?->source ?? $file->text), $file->expanded), $file->etag);
	} catch (RenderException $e) {
		return $this->problem($e);
	}
}
```

In `bySource` and `ownersText`, the calls become `$this->files->userFolder()`, `DiagramFiles::readable(...)`, `DiagramFiles::namesAFile($source)`, `DiagramFiles::storedSize(...)`, `DiagramFiles::content(...)`, `DiagramFiles::tooLarge()`, and `public const MAX_SOURCE = DiagramFiles::MAX_SOURCE;`. In `RenderControllerTest::controller()`, the last line becomes:

```php
return new RenderController('plantuml', $request, $render, new IncludeResolver(), new DiagramFiles(new IncludeResolver(), $root, $session));
```

- [ ] **Step 5: Run every PHP test**

Run: `composer run test:unit && composer run psalm && composer run cs:check`
Expected: PASS, `testByPathOfAStreamThatCannotBeReadIs404` included; `RenderControllerTest` changed only in `controller()` and the stream flag.

- [ ] **Step 6: Commit**

```bash
git add lib/Service/DiagramFiles.php lib/Service/DiagramFile.php lib/Exception/FileRefusal.php lib/Controller/RenderController.php tests/unit/DiagramFilesTest.php tests/unit/RenderControllerTest.php tests/unit/stream-get-contents.php
git commit -m "Render: reading a stored diagram is one service the routes share"
```

### Task 3: `GET /render?path=…&diagram=`

**Files:**
- Modify: `lib/Controller/RenderController.php` (`byPath`), `src/files-helpers.js:41`
- Test: `tests/unit/RenderControllerTest.php`, `tests/js/files-helpers.test.js`

**Interfaces:**
- Consumes: `Diagrams::scan`, `Diagrams::find`, `Diagrams::missing` (Task 1); `DiagramFiles::open` (Task 2).
- Produces: `RenderController::byPath(string $path = '', string $diagram = ''): Response`; JS `renderUrl(path: string, diagram?: number|string): string`.

- [ ] **Step 1: Write the failing tests**

`RenderControllerTest`, with `SCREENS = "@startuml nodes\nA -> B\n@enduml\n@startuml login\nC -> D\n@enduml\n"`:

```php
/** Records the index each render was asked for. */
private function indexing(?int &$index): RenderService {
	$render = $this->createStub(RenderService::class);
	$render->method('render')->willReturnCallback(static function (string $source, int $i = 0) use (&$index): Rendered {
		$index = $i;
		return new Rendered(self::SVG, 'image/svg+xml');
	});
	return $render;
}

public function testDrawsTheDiagramNamed(): void {
	$this->controller($this->indexing($index), $this->diagram(content: self::SCREENS))->byPath('Diagrams/Screens.puml', 'login');
	self::assertSame(1, $index);
}

public function testDrawsTheDiagramNumbered(): void {
	$this->controller($this->indexing($index), $this->diagram(content: self::SCREENS))->byPath('Diagrams/Screens.puml', '2');
	self::assertSame(1, $index);
}

public function testCountsPages(): void {
	$this->controller($this->indexing($index), $this->diagram(content: "@startuml\nA\nnewpage\nB\nnewpage\nC\n@enduml\n"))->byPath('Diagrams/P.puml', '3');
	self::assertSame(2, $index);
}

public function testWithoutADiagramDrawsTheFirst(): void {
	$this->controller($this->indexing($index), $this->diagram(content: self::SCREENS))->byPath('Diagrams/Screens.puml');
	self::assertSame(0, $index);
}

public function testNoDiagramNamedIs404(): void {
	$response = $this->controller($this->renderingNothing(), $this->diagram(content: self::SCREENS))->byPath('Diagrams/Screens.puml', 'signup');
	self::assertInstanceOf(JSONResponse::class, $response);
	self::assertSame(404, $response->getStatus());
	self::assertSame(['problem' => 'no diagram named signup'], $response->getData());
}

public function testNoDiagramNumberedIs404(): void {
	$response = $this->controller($this->renderingNothing(), $this->diagram(content: self::SCREENS))->byPath('Diagrams/Screens.puml', '9');
	self::assertSame(['problem' => 'no diagram 9'], $response->getData());
}

public function testAMissingDiagramIsNeverRevalidated(): void {
	$response = $this->controller($this->renderingNothing(), $this->diagram(content: self::SCREENS), '"abc123"')->byPath('Diagrams/Screens.puml', 'signup');
	self::assertSame(404, $response->getStatus());
}

public function testTheIndexIsTheStoredTextsNotTheExpandedOnes(): void {
	// The included file holds a block of its own; inlined, its lines are no @start.
	$base = $this->diagram(content: "@startuml a\n!include parts.puml\n@enduml\n@startuml b\n@enduml\n");
	$parts = $this->diagram(content: "@startuml\nX -> Y\n@enduml\n", etag: 'p1');
	$this->controller($this->indexing($index), ['Diagrams/Order flow.puml' => $base, 'Diagrams/parts.puml' => $parts])->byPath('Diagrams/Order flow.puml', 'b');
	self::assertSame(1, $index);
}
```

`tests/js/files-helpers.test.js`:

```js
it('names one diagram of the file', () => {
  expect(renderUrl('/D/S.puml', 2)).toBe('/index.php/apps/plantuml/render?path=%2FD%2FS.puml&diagram=2')
  expect(renderUrl('/D/S.puml', 'Größe')).toBe('/index.php/apps/plantuml/render?path=%2FD%2FS.puml&diagram=Gr%C3%B6%C3%9Fe')
})

it('leaves the diagram out when none is named', () => {
  expect(renderUrl('/D/S.puml')).toBe('/index.php/apps/plantuml/render?path=%2FD%2FS.puml')
})
```

- [ ] **Step 2: Run to see them fail**

Run: `composer run test:unit -- --filter RenderControllerTest && npx vitest run tests/js/files-helpers.test.js`
Expected: FAIL: the index is always 0; `renderUrl` ignores its second argument.

- [ ] **Step 3: Implement**

In `byPath`, after `open()` and before the If-None-Match comparison:

```php
$index = 0;
if ($diagram !== '') {
	$found = Diagrams::find(Diagrams::scan($file->text), $diagram);
	if ($found === null) {
		return new JSONResponse(['problem' => Diagrams::missing($diagram)], Http::STATUS_NOT_FOUND);
	}
	$index = $found['render'];
}
```

and `$this->render->render($file->expanded?->source ?? $file->text, $index)`. The doc comment says the index comes from the stored text because included blocks are inlined without their `@start` lines.

```js
export function renderUrl(path, diagram) {
  const url = OC.generateUrl(`/apps/${APP_ID}/render`) + '?path=' + encodeURIComponent(path)
  return diagram === undefined ? url : `${url}&diagram=${encodeURIComponent(diagram)}`
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `composer run test:unit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Controller/RenderController.php src/files-helpers.js tests/unit/RenderControllerTest.php tests/js/files-helpers.test.js
git commit -m "Render: a file of several diagrams draws the one asked for by name or number"
```

### Task 4: `RenderService::render` takes a format

**Files:**
- Modify: `lib/Service/RenderService.php:68-86`
- Test: `tests/unit/RenderServiceTest.php`

**Interfaces:**
- Produces: `RenderService::FORMATS` (below); `render(string $source, int $index = 0, string $format = 'svg'): Rendered`.

- [ ] **Step 1: Write the failing tests**

With the test file's own `service()`, `clientAnswering()`, `response()` and `problemOf()` helpers, and `self::URL` / `self::SOURCE`:

```php
/** @return array<string, array{string, int, string, string}> */
public static function formats(): array {
	return [
		'svg' => ['svg', 0, 'image/svg+xml', '/svg'],
		'png past the first' => ['png', 2, 'image/png', '/png/2'],
		'pdf' => ['pdf', 1, 'application/pdf', '/pdf/1'],
		'eps' => ['eps', 0, 'application/postscript', '/eps'],
		'text with a charset' => ['txt', 3, 'text/plain;charset=utf-8', '/txt/3'],
	];
}

#[DataProvider('formats')]
public function testDrawsInTheFormatAsked(string $format, int $index, string $answered, string $path): void {
	$client = $this->createMock(IClient::class);
	$client->expects(self::once())->method('post')
		->with(self::URL . $path, self::anything())
		->willReturn($this->response(200, 'BODY', ['Content-Type' => $answered]));

	$rendered = $this->service($client)->render(self::SOURCE, $index, $format);

	self::assertSame('BODY', $rendered->body);
	self::assertSame($answered, $rendered->contentType);
}

public function testAPageWhereAPdfWasAskedIsNotPlantUml(): void {
	$service = $this->service($this->clientAnswering($this->response(200, '<html>', ['Content-Type' => 'text/html'])));
	self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE, 0, 'pdf')));
}

public function testAPastTheEndIndexIsNotPlantUml(): void {
	$service = $this->service($this->clientAnswering($this->response(400, '', ['Content-Type' => 'text/html;charset=iso-8859-1'])));
	self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE, 5, 'pdf')));
}

public function testAnUnknownFormatIsNeverSent(): void {
	$client = $this->createMock(IClient::class);
	$client->expects(self::never())->method('post');
	$this->expectException(\InvalidArgumentException::class);
	$this->service($client)->render(self::SOURCE, 0, 'latex');
}
```

- [ ] **Step 2: Run to see them fail**

Run: `composer run test:unit -- --filter RenderServiceTest`
Expected: FAIL: `render()` takes no format and always posts to `svg`.

- [ ] **Step 3: Implement**

```php
/** The formats the server draws (checked on 1.2026.8), each with the type it answers. */
public const FORMATS = [
	'svg' => 'image/svg+xml',
	'png' => 'image/png',
	'pdf' => 'application/pdf',
	'eps' => 'application/postscript',
	'txt' => 'text/plain',
];

/**
 * The server draws the n-th diagram of the file (0-based) at `<format>/n`.
 *
 * @throws RenderException
 */
public function render(string $source, int $index = 0, string $format = 'svg'): Rendered {
	$expected = self::FORMATS[$format] ?? throw new \InvalidArgumentException("No such format: {$format}");
	$response = $this->post($index === 0 ? $format : "{$format}/{$index}", $source);
	// A drawing is a render whatever the status: PlantUML answers a mistake in
	// the diagram with a 400 and the error drawn in. Anything else, a 200 page
	// from a catch-all web server included, is not PlantUML.
	$contentType = $response->getHeader('Content-Type');
	$type = strtolower(trim(explode(';', $contentType)[0]));
	if (str_starts_with($expected, 'image/') ? !str_starts_with($type, 'image/') : $type !== $expected) {
		throw $this->notPlantUml(sprintf('%s answered HTTP %d %s', $format, $response->getStatusCode(), $contentType));
	}
	// From here unchanged: the error headers read into the Rendered.
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `composer run test:unit && composer run psalm`
Expected: PASS, every earlier SVG test included.

- [ ] **Step 5: Commit**

```bash
git add lib/Service/RenderService.php tests/unit/RenderServiceTest.php
git commit -m "Render: the server's diagram in SVG, PNG, PDF, EPS or text"
```

### Task 5: `GET /export`

**Files:**
- Create: `lib/Controller/ExportController.php`
- Modify: `appinfo/routes.php`, `lib/Service/IncludeResolver.php:756-770` (`viewOnly` splits out `forbidsDownload`)
- Test: `tests/unit/ExportControllerTest.php`, `tests/unit/IncludeResolverTest.php`

**Interfaces:**
- Consumes: `DiagramFiles::open`, `Diagrams::scan/find/label/missing`, `RenderService::render(…, $format)`, `RenderService::FORMATS`.
- Produces:
  - `GET /apps/plantuml/export?path=<p>&format=<f>[&diagram[]=<n or name>…]` → `ExportController::export(string $path = '', string $format = '', mixed $diagram = null): Response`. `#[NoAdminRequired] #[NoCSRFRequired]`: a download link changes nothing, and the path rule keeps it safe, as for `GET /render`.
  - `IncludeResolver::forbidsDownload(File $file): bool` (public static) — the file is on a share whose owner forbids download, or its storage cannot be asked (refused, as `viewOnly` refuses). `viewOnly()` keeps its exception for the diagram's own share and calls it.

This task carries the Rulings on `diagram[]`, file order, the caps, the time budget, names, `ZipArchive` and download-forbidden shares.

- [ ] **Step 1: Write the failing tests**

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Controller\ExportController;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\DiagramFiles;
use OCA\PlantUml\Service\IncludeResolver;
use OCA\PlantUml\Service\Rendered;
use OCA\PlantUml\Service\RenderService;
use OCP\AppFramework\Http\Response;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\Storage\ISharedStorage;
use OCP\IRequest;
use OCP\ITempManager;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Share\IAttributes;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ExportControllerTest extends TestCase {
	private const SCREENS = "@startuml nodes\nA -> B\n@enduml\n@startuml login\nC -> D\n@enduml\n";

	/** @param array<string, Node> $files the caller's files by path from their root */
	private function controllerOver(RenderService $render, array $files, string $userAgent = ''): ExportController {
		$folder = $this->createStub(Folder::class);
		$folder->method('getPath')->willReturn('/drk/files');
		$folder->method('get')->willReturnCallback(
			static fn (string $path): Node => $files[ltrim($path, '/')] ?? throw new NotFoundException($path),
		);
		$root = $this->createStub(IRootFolder::class);
		$root->method('getUserFolder')->willReturn($folder);
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn('drk');
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$request = $this->createStub(IRequest::class);
		$request->method('getHeader')->willReturnCallback(static fn (string $name): string => $name === 'User-Agent' ? $userAgent : '');
		$temp = $this->createStub(ITempManager::class);
		$temp->method('getTemporaryFile')->willReturnCallback(static fn (): string => (string)tempnam(sys_get_temp_dir(), 'export'));
		return new ExportController('plantuml', $request, $render, new DiagramFiles(new IncludeResolver(), $root, $session), $temp);
	}

	private function controller(RenderService $render, string $name, string $content, string $userAgent = '', string $mimetype = 'text/x-plantuml'): ExportController {
		return $this->controllerOver($render, ["Diagrams/{$name}" => $this->diagram($mimetype, $content, name: $name)], $userAgent);
	}

	/** A file in the caller's `Diagrams` folder; `$storage` puts it on a share. */
	private function diagram(string $mimetype = 'text/x-plantuml', string $content = "@startuml\n@enduml\n", string $etag = 'abc123', string $name = 'Order flow.puml', ?ISharedStorage $storage = null): File {
		$parent = $this->createStub(Folder::class);
		$parent->method('getPath')->willReturn('/drk/files/Diagrams');
		$file = $this->createStub(File::class);
		$file->method('getName')->willReturn($name);
		$file->method('getMimetype')->willReturn($mimetype);
		$file->method('getEtag')->willReturn($etag);
		$file->method('getSize')->willReturn(strlen($content));
		$file->method('fopen')->willReturnCallback(static function () use ($content) {
			$handle = fopen('php://memory', 'r+');
			self::assertIsResource($handle);
			fwrite($handle, $content);
			rewind($handle);
			return $handle;
		});
		$file->method('getParent')->willReturn($parent);
		$file->method('getPath')->willReturn("/drk/files/Diagrams/{$name}");
		if ($storage !== null) {
			$file->method('getStorage')->willReturn($storage);
		}
		return $file;
	}

	/** A share its recipient may only read, whose `permissions.download` attribute is `$download`. */
	private function share(?bool $download): ISharedStorage {
		$attributes = $this->createStub(IAttributes::class);
		$attributes->method('getAttribute')->willReturnCallback(static fn (string $scope, string $key): ?bool => [$scope, $key] === ['permissions', 'download'] ? $download : null);
		$share = $this->createStub(IShare::class);
		$share->method('getAttributes')->willReturn($attributes);
		$share->method('getPermissions')->willReturn(Constants::PERMISSION_READ);
		$share->method('getId')->willReturn('S');
		$storage = $this->createStub(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturnCallback(static fn (string $class): bool => $class === 'OCA\Files_Sharing\SharedStorage');
		$storage->method('getShare')->willReturn($share);
		$storage->method('getId')->willReturn('shared::/S');
		return $storage;
	}

	/** getHeaders() asks the server container for the request id; read the set headers directly. */
	private static function header(Response $response, string $name): ?string {
		return \Closure::bind(fn () => $this->headers[$name] ?? null, $response, Response::class)();
	}

	/** A render service that answers `<format>:<index>` as each body, and records the calls. */
	private function drawing(?array &$calls = []): RenderService {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturnCallback(static function (string $source, int $index = 0, string $format = 'svg') use (&$calls): Rendered {
			$calls[] = [$index, $format];
			return new Rendered("{$format}:{$index}", RenderService::FORMATS[$format]);
		});
		return $render;
	}

	public function testOneDiagramIsOneFile(): void {
		$response = $this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'png', ['login']);
		self::assertSame([[1, 'png']], $calls);
		self::assertSame('png:1', $response->render());
		self::assertSame('image/png', self::header($response, 'Content-Type'));
		self::assertSame("attachment; filename=\"Screens - login.png\"; filename*=UTF-8''Screens%20-%20login.png", self::header($response, 'Content-Disposition'));
		self::assertSame('nosniff', self::header($response, 'X-Content-Type-Options'));
	}

	public function testOneStringDiagramWorksToo(): void {
		$this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', '2');
		self::assertSame([[1, 'svg']], $calls);
	}

	public function testAOneDiagramFileIsNamedAfterTheFile(): void {
		$response = $this->controller($this->drawing(), 'Order flow.puml', "@startuml\nA -> B\n@enduml\n")->export('Diagrams/Order flow.puml', 'pdf');
		self::assertSame("attachment; filename=\"Order flow.pdf\"; filename*=UTF-8''Order%20flow.pdf", self::header($response, 'Content-Disposition'));
	}

	public function testEveryDiagramIsAZip(): void {
		$response = $this->controller($this->drawing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg');
		self::assertSame('application/zip', self::header($response, 'Content-Type'));
		self::assertSame(['Screens - nodes.svg' => 'svg:0', 'Screens - login.svg' => 'svg:1'], self::entries($response->render()));
	}

	public function testAZipEvenForAMac(): void {
		$response = $this->controller($this->drawing(), 'Screens.puml', self::SCREENS, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')->export('Diagrams/Screens.puml', 'svg');
		self::assertSame('application/zip', self::header($response, 'Content-Type'));
	}

	public function testCheckedDiagramsInFileOrderEachOnce(): void {
		$this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', ['2', '1', 'login']);
		self::assertSame([[0, 'svg'], [1, 'svg']], $calls);
	}

	public function testSameLabelsStayApart(): void {
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml\n@enduml\n@startuml\n@enduml\n")->export('Diagrams/Doc.puml', 'svg');
		self::assertSame(['Doc - uml.svg', 'Doc - uml (2).svg'], array_keys(self::entries($response->render())));
	}

	public function testNamesAreSafeAndReadable(): void {
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml \"Login / Sign-up\"\n@enduml\n@startuml Größe\n@enduml\n")->export('Diagrams/Doc.puml', 'svg');
		self::assertSame(['Doc - Login - Sign-up.svg', 'Doc - Größe.svg'], array_keys(self::entries($response->render())));
	}

	public function testANonAsciiDownloadHasAnAsciiFallback(): void {
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml a\n@enduml\n@startuml Größe\n@enduml\n")->export('Diagrams/Doc.puml', 'svg', ['Größe']);
		self::assertSame("attachment; filename=\"Doc - Gr__e.svg\"; filename*=UTF-8''Doc%20-%20Gr%C3%B6%C3%9Fe.svg", self::header($response, 'Content-Disposition'));
	}

	#[DataProvider('badFormats')]
	public function testAnotherFormatIs400(string $format): void {
		self::assertSame(400, $this->controller($this->drawing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', $format)->getStatus());
	}

	/** @return list<array{string}> */
	public static function badFormats(): array {
		return [['latex'], ['utxt'], [''], ['SVG']];
	}

	public function testANonListDiagramIs400(): void {
		self::assertSame(400, $this->controller($this->drawing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', [['x']])->getStatus());
	}

	public function testNoSuchDiagramIs404(): void {
		$response = $this->controller($this->drawing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', ['signup']);
		self::assertSame(404, $response->getStatus());
		self::assertSame(['problem' => 'no diagram named signup'], $response->getData());
	}

	public function testANonDiagramIsRefusedAsRenderRefusesIt(): void {
		self::assertSame(404, $this->controller($this->drawing(), 'notes.txt', 'x', mimetype: 'text/plain')->export('Diagrams/notes.txt', 'svg')->getStatus());
	}

	public function testAServerProblemIs503(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_SET));
		$response = $this->controller($render, 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg');
		self::assertSame(503, $response->getStatus());
		self::assertSame(['problem' => 'not set'], $response->getData());
	}

	public function testMoreThanAHundredDiagramsIs413(): void {
		$response = $this->controller($this->drawing(), 'Many.puml', str_repeat("@startuml\n@enduml\n", 101))->export('Diagrams/Many.puml', 'svg');
		self::assertSame(413, $response->getStatus());
		self::assertSame(['problem' => 'The export is too large'], $response->getData());
	}

	public function testMoreThan50MiBDrawnIs413(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered(str_repeat('a', 26 * 1048576), 'image/png'));
		self::assertSame(413, $this->controller($render, 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'png')->getStatus());
	}

	/** The coordinator's ruling: Export is a download, which the share forbids. */
	public function testADownloadForbiddenShareIsRefused(): void {
		$render = $this->createMock(RenderService::class);
		$render->expects(self::never())->method('render');
		$file = $this->diagram(content: self::SCREENS, name: 'Screens.puml', storage: $this->share(false));
		self::assertSame(404, $this->controllerOver($render, ['Shared/Screens.puml' => $file])->export('Shared/Screens.puml', 'svg')->getStatus());
	}

	#[DataProvider('downloadable')]
	public function testAShareThatAllowsDownloadExports(?bool $download): void {
		$file = $this->diagram(content: "@startuml\n@enduml\n", name: 'Screens.puml', storage: $this->share($download));
		self::assertSame(200, $this->controllerOver($this->drawing(), ['Shared/Screens.puml' => $file])->export('Shared/Screens.puml', 'svg')->getStatus());
	}

	/** @return array<string, array{?bool}> */
	public static function downloadable(): array {
		return ['download allowed' => [true], 'no download attribute' => [null]];
	}

	public function testIncludesAreDrawn(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturnCallback(static function (string $source) use (&$sent): Rendered {
			$sent = $source;
			return new Rendered('<svg/>', 'image/svg+xml');
		});
		$this->controllerOver($render, [
			'Diagrams/Order flow.puml' => $this->diagram(content: "@startuml\n!include parts.puml\n@enduml\n"),
			'Diagrams/parts.puml' => $this->diagram(content: "A -> B\n", etag: 'p1'),
		])->export('Diagrams/Order flow.puml', 'svg');
		self::assertStringContainsString('A -> B', $sent);
	}

	/** @return array<string, string> entry name => content */
	private static function entries(string $zip): array {
		$path = tempnam(sys_get_temp_dir(), 'zip');
		file_put_contents($path, $zip);
		$archive = new \ZipArchive();
		self::assertTrue($archive->open($path));
		$entries = [];
		for ($i = 0; $i < $archive->numFiles; $i++) {
			$entries[$archive->getNameIndex($i)] = $archive->getFromIndex($i);
		}
		$archive->close();
		unlink($path);
		return $entries;
	}
}
```

`tests/unit/IncludeResolverTest.php`, added beside the view-only tests, with its own `shareStorage()` helper. These pin the rule the export refusal and the include refusal now share; the existing view-only include tests stay as they are and must stay green:

```php
/** @return array<string, array{\Closure, bool}> */
public static function downloadRules(): array {
	return [
		'not on a share' => [fn (self $t): IStorage => $t->createStub(IStorage::class), false],
		'a share that forbids download' => [fn (self $t): IStorage => $t->shareStorage(false), true],
		'a share that allows it' => [fn (self $t): IStorage => $t->shareStorage(true), false],
		'a share that says nothing' => [fn (self $t): IStorage => $t->shareStorage(null), false],
	];
}

#[DataProvider('downloadRules')]
public function testForbidsDownloadAsItsShareSays(\Closure $storage, bool $forbidden): void {
	$file = $this->createStub(File::class);
	$file->method('getStorage')->willReturn($storage($this));
	self::assertSame($forbidden, IncludeResolver::forbidsDownload($file));
}

public function testAFileWhoseStorageCannotBeAskedForbidsDownload(): void {
	$file = $this->createStub(File::class);
	$file->method('getStorage')->willThrowException(new \Exception('no storage'));
	self::assertTrue(IncludeResolver::forbidsDownload($file));
}
```

The provider's closures are made inside the class, so they may call the private `shareStorage()` on the instance they are handed; `DiagramFilesTest::refusals()` works the same way.

- [ ] **Step 2: Run to see them fail**

Run: `composer run test:unit -- --filter 'ExportControllerTest|IncludeResolverTest'`
Expected: FAIL, `Class "OCA\PlantUml\Controller\ExportController" not found` and `Call to undefined method …IncludeResolver::forbidsDownload()`.

- [ ] **Step 3: Implement**

`lib/Service/IncludeResolver.php`, `viewOnly()` split in two, its behaviour unchanged:

```php
/**
 * A file on a share whose owner forbids download, decided as files_sharing's
 * ViewOnly decides it; a storage that cannot be asked is a refusal too. The
 * export refuses such a file outright, since an export is a download.
 */
public static function forbidsDownload(File $file): bool {
	try {
		$storage = $file->getStorage();
		return $storage->instanceOfStorage(SharedStorage::class)
			&& $storage->getShare()->getAttributes()?->getAttribute('permissions', 'download') === false;
	} catch (\Throwable) {
		// Core throws a bare Exception for a node without storage; unreadable, as a refusal is.
		return true;
	}
}

/**
 * A file that forbids download (above), which a picture of its text would get
 * around, unless the diagram is on that same share, may not write to it and is
 * the owner's text.
 */
private function viewOnly(File $file): bool {
	return self::forbidsDownload($file) && ($this->ownShare === null || self::shareOf($file) !== $this->ownShare);
}
```

`appinfo/routes.php`, after the render routes:

```php
// ?path=<path>&format=<svg|png|pdf|eps|txt>[&diagram[]=<n or name>…], a download
['name' => 'export#export', 'url' => '/export', 'verb' => 'GET'],
```

`lib/Controller/ExportController.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\Exception\FileRefusal;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\DiagramFiles;
use OCA\PlantUml\Service\Diagrams;
use OCA\PlantUml\Service\IncludeResolver;
use OCA\PlantUml\Service\Rendered;
use OCA\PlantUml\Service\RenderService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;
use OCP\ITempManager;

/**
 * GET /export (VW6): the diagrams of a stored `.puml` in one format, one as its
 * file, several as a zip. Read as GET /render reads the file, so it refuses
 * what that refuses, and a file whose share forbids download as well: an
 * export is a download.
 *
 * @psalm-import-type Diagram from Diagrams
 */
final class ExportController extends Controller {
	public const MAX_DIAGRAMS = 100;
	public const MAX_BYTES = 52428800;

	public function __construct(string $appName, IRequest $request, private RenderService $render, private DiagramFiles $files, private ITempManager $temp) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function export(string $path = '', string $format = '', mixed $diagram = null): Response {
		$asked = match (true) {
			$diagram === null, $diagram === '' => [],
			is_string($diagram) => [$diagram],
			is_array($diagram) && array_is_list($diagram) && array_filter($diagram, 'is_string') === $diagram => $diagram,
			default => null,
		};
		if (!isset(RenderService::FORMATS[$format]) || $asked === null) {
			return new Response(Http::STATUS_BAD_REQUEST);
		}
		try {
			$file = $this->files->open($path);
		} catch (FileRefusal $e) {
			return $e->response;
		}
		if (IncludeResolver::forbidsDownload($file->file)) {
			return new Response(Http::STATUS_NOT_FOUND);
		}
		$all = Diagrams::scan($file->text);
		$picked = $asked === [] ? $all : [];
		foreach ($asked as $one) {
			$found = Diagrams::find($all, $one);
			if ($found === null) {
				return new JSONResponse(['problem' => Diagrams::missing($one)], Http::STATUS_NOT_FOUND);
			}
			$picked[$found['index']] = $found;
		}
		ksort($picked);
		if (count($picked) > self::MAX_DIAGRAMS) {
			return self::tooLarge();
		}
		$source = $file->expanded?->source ?? $file->text;
		$drawn = [];
		$bytes = 0;
		try {
			foreach ($picked as $d) {
				$rendered = $this->render->render($source, $d['render'], $format);
				$bytes += strlen($rendered->body);
				if ($bytes > self::MAX_BYTES) {
					return self::tooLarge();
				}
				$drawn[] = [$d, $rendered];
			}
		} catch (RenderException $e) {
			return new JSONResponse(['problem' => $e->getProblem()], Http::STATUS_SERVICE_UNAVAILABLE);
		}
		$base = (string)preg_replace('/\.(?:puml|plantuml)$/i', '', $file->file->getName());
		if (count($drawn) === 1) {
			[$d, $rendered] = $drawn[0];
			$name = count($all) === 1 ? self::safe($base) . ".{$format}" : self::entry($base, $d, $format);
			return self::download($rendered->body, $name, RenderService::FORMATS[$format]);
		}
		return $this->zip($drawn, $base, $format);
	}

	/** @param list<array{array, Rendered}> $drawn */
	private function zip(array $drawn, string $base, string $format): Response {
		$path = $this->temp->getTemporaryFile('.zip');
		$zip = new \ZipArchive();
		if ($path === false || $zip->open($path, \ZipArchive::OVERWRITE) !== true) {
			return new Response(Http::STATUS_INTERNAL_SERVER_ERROR);
		}
		$used = [];
		foreach ($drawn as [$d, $rendered]) {
			$zip->addFromString(self::unique(self::entry($base, $d, $format), $used), $rendered->body);
		}
		if (!$zip->close()) {
			return new Response(Http::STATUS_INTERNAL_SERVER_ERROR);
		}
		return self::download((string)file_get_contents($path), self::safe($base) . '.zip', 'application/zip');
	}

	private static function entry(string $base, array $diagram, string $format): string {
		return self::safe($base . ' - ' . Diagrams::label($diagram)) . ".{$format}";
	}

	/** Each run of unsafe characters, with the spaces around it, becomes ` - `: `Login / Sign-up` is `Login - Sign-up`. */
	private static function safe(string $name): string {
		$name = (string)preg_replace(['/\s*[\/\\\\:*?"<>|\x00-\x1F\x7F]+\s*/u', '/ {2,}/'], [' - ', ' '], $name);
		return trim($name, " -");
	}

	/** @param array<string, true> $used */
	private static function unique(string $name, array &$used): string {
		$dot = strrpos($name, '.');
		$stem = substr($name, 0, (int)$dot);
		$extension = substr($name, (int)$dot);
		for ($n = 2, $candidate = $name; isset($used[$candidate]); $n++) {
			$candidate = "{$stem} ({$n}){$extension}";
		}
		$used[$candidate] = true;
		return $candidate;
	}

	private static function download(string $body, string $name, string $type): Response {
		$response = new DataDisplayResponse($body, Http::STATUS_OK, ['Content-Type' => $type, 'X-Content-Type-Options' => 'nosniff']);
		// One `_` per character past ASCII: `Größe` falls back to `Gr__e`.
		$fallback = (string)preg_replace('/[^\x20-\x7E]/u', '_', $name);
		$response->addHeader('Content-Disposition', "attachment; filename=\"{$fallback}\"; filename*=UTF-8''" . rawurlencode($name));
		return $response;
	}

	private static function tooLarge(): JSONResponse {
		return new JSONResponse(['problem' => 'The export is too large'], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
	}
}
```

`ITempManager` removes the temporary zip at the end of the request.

- [ ] **Step 4: Run them to see them pass**

Run: `composer run test:unit && composer run psalm && composer run cs:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Controller/ExportController.php lib/Service/IncludeResolver.php appinfo/routes.php tests/unit/ExportControllerTest.php tests/unit/IncludeResolverTest.php
git commit -m "Export: one diagram, some or all, in the format asked for"
```

### Task 6: The editor opens at a diagram

**Files:**
- Create: `src/open-editor.js`, `tests/js/open-editor.test.js`
- Modify: `src/files.js` (its `bundleQuery`, `editorLoading`, `editorFailures`, `ensureEditor` and `openEditor` move to `src/open-editor.js`; it imports `openEditor`), `src/editor.js:59` and its load handler
- Test: `tests/js/editor.test.js`; `tests/js/files.test.js` unchanged

**Interfaces:**
- Produces:
  - `src/open-editor.js`: `export async function openEditor(node, options)` with `node: { path: string, basename: string }` and `options?: { diagram?: number }`. It loads the bundle as `files.js` does today and falls back to `OCA.Viewer.open({ path })` as today; then it calls `window.OCA.PlantUml.openEditor(node)` when `options` is absent, `window.OCA.PlantUml.openEditor(node, options)` when given. Forwarding only what is given keeps `files.test.js`'s `toEqual([[node], [other]])` and `toHaveBeenCalledWith(node)` true: the file action and + New still call `openEditor(node)`.
  - `src/editor.js`: `openEditor(node, { diagram } = {})`, `diagram` a 0-based index into B1's diagrams.

- [ ] **Step 1: Write the failing tests**

`tests/js/files.test.js` stays as it is: its Edit-diagram and + New tests drive `files.js`'s registered action, which now calls the moved `openEditor(node)`, and must pass unchanged.

`tests/js/open-editor.test.js`:

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Viewer's way into the editor: the same bundle load as Edit diagram,
// with the diagram to open at passed on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const node = { path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }
const scripts = () => [...document.head.querySelectorAll('script[type="module"]')]

beforeEach(() => {
  vi.resetModules()
  document.head.replaceChildren()
  window.OCA = {}
})
afterEach(() => vi.restoreAllMocks())

/** What the editor bundle does when it runs: define the opener. */
function editorBundleRuns() {
  window.OCA.PlantUml = { openEditor: vi.fn() }
  scripts()[0].dispatchEvent(new Event('load'))
}

describe('opening the editor from elsewhere', () => {
  it('passes the diagram on to the editor', async () => {
    const { openEditor } = await import('../../src/open-editor.js')

    const opening = openEditor(node, { diagram: 2 })
    editorBundleRuns()
    await opening

    expect(window.OCA.PlantUml.openEditor.mock.calls).toEqual([[node, { diagram: 2 }]])
  })

  it('passes nothing more when no diagram is asked for', async () => {
    const { openEditor } = await import('../../src/open-editor.js')

    const opening = openEditor(node)
    editorBundleRuns()
    await opening

    expect(window.OCA.PlantUml.openEditor.mock.calls).toEqual([[node]])
  })

  it('opens the Viewer when the bundle will not load', async () => {
    window.OCA.Viewer = { open: vi.fn() }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { openEditor } = await import('../../src/open-editor.js')

    const opening = openEditor(node, { diagram: 2 })
    scripts()[0].dispatchEvent(new Event('error'))
    await opening

    expect(window.OCA.Viewer.open).toHaveBeenCalledWith({ path: '/Diagrams/Screens.puml' })
  })
})
```

`tests/js/editor.test.js`:

```js
const selectedTab = () => q('.plantuml-editor__tab[aria-selected="true"]').textContent
const view = () => EditorView.findFromDOM(q('.cm-editor'))
const cursorLine = () => view().state.doc.lineAt(view().state.selection.main.head)

describe('opening at a diagram', () => {
  beforeEach(() => {
    seams.loadFile.mockResolvedValue({ content: '@startuml a\nA -> B\n@enduml\n@startuml b\nC -> D\n@enduml\n', etag: '"get"' })
  })

  it('opens on the diagram asked for, the cursor at the end of its @start line', async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }, { diagram: 1 })
    await settle()

    expect(selectedTab()).toBe('b')
    expect(cursorLine().number).toBe(4)
    expect(view().state.selection.main.head).toBe(cursorLine().to)
  })

  it("puts the cursor on the first diagram's @start line when that one is asked for", async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }, { diagram: 0 })
    await settle()

    expect(selectedTab()).toBe('a')
    expect(cursorLine().number).toBe(1)
    expect(view().state.selection.main.head).toBe(cursorLine().to)
  })

  it('opens on the first diagram, cursor at the top, when the one asked for is past the end', async () => {
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }, { diagram: 9 })
    await settle()

    expect(selectedTab()).toBe('a')
    expect(view().state.selection.main.head).toBe(0)
  })
})
```

Each test closes its overlay with the file's own close helper, as its other describes do.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/js/open-editor.test.js tests/js/editor.test.js`
Expected: FAIL: `src/open-editor.js` does not exist; the editor ignores `diagram` (the first test's tab is `a`, the second's cursor is at 0).

- [ ] **Step 3: Implement**

`src/open-editor.js` takes the moved code with its comments; its export:

```js
/**
 * Opens the editor bundle's editor, at a diagram when one is asked for (VW7);
 * if the bundle will not load, the Viewer opens.
 *
 * @param {{path: string, basename: string}} node
 * @param {{diagram?: number}} [options]
 */
export async function openEditor(node, options) {
  try {
    await ensureEditor()
  } catch (e) {
    console.error(`[${APP_ID}] could not load the editor`, e)
    window.OCA?.Viewer?.open({ path: node.path })
    return
  }
  if (options === undefined) {
    window.OCA.PlantUml.openEditor(node)
  } else {
    window.OCA.PlantUml.openEditor(node, options)
  }
}
```

`src/files.js`: `import { openEditor } from './open-editor.js'` in place of the moved code. `src/editor.js`: `export function openEditor(node, { diagram } = {})`, and at the end of the load handler, after `follow(view.state, true)`:

```js
    // Opened from the Viewer at one of its diagrams (VW7): the cursor goes where its tab would put it.
    if (Number.isInteger(diagram) && diagram >= 0 && diagram < diagrams.length) {
      showDiagram(diagram)
    }
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS, `tests/js/files.test.js` unchanged and green.

- [ ] **Step 5: Commit**

```bash
git add src/open-editor.js src/files.js src/editor.js tests/js/open-editor.test.js tests/js/editor.test.js
git commit -m "Editor: opens at the diagram asked for"
```

### Task 7: The Viewer draws inline, in Tabs

**Files:**
- Create: `src/viewer/sheets.js`, `src/viewer/diagram-view.js`, `css/viewer.css`, `tests/js/viewer/sheets.test.js`, `tests/js/viewer/diagram-view.test.js`
- Modify: `src/viewer-component.js` (whole), `lib/Listener/LoadFilesScriptListener.php:51`
- Test: `tests/js/viewer-component.test.js` (rewritten), `tests/unit/Listener/LoadFilesScriptListenerTest.php`

**Interfaces:**
- Consumes: `loadFile(path): Promise<{content, etag}>` (`src/editor/save.js`); `scan(text)`, `label(diagram)` (`src/editor/blocks.js`); `createTabs({ onActivate, controls })` → `{ element, update(diagrams, active), destroy() }` (`src/editor/tabs.js`); `toInlineSvg(text, { idPrefix })`; `renderUrl(path, diagram)` (Task 3).
- Produces:
  - `createSheets(path: string, { parallel = 3, labelOf }: { parallel?: number, labelOf: (position: number) => string }): { sheet(position: number): HTMLElement, destroy(): void }`. One element per position for the whole open; it fills with the inline SVG or the D4 line and then dispatches `plantuml-viewer:settled`.
  - `createDiagramView(root: HTMLElement, { path, basename, onReady }): { destroy(): void }`, with `root` holding `.plantuml-viewer__head` (not scrolling) over `.plantuml-viewer__stage` (scrolling).

- [ ] **Step 1: Write the failing tests**

`tests/js/viewer/sheets.test.js`:

```js
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSheets } from '../../../src/viewer/sheets.js'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><text>login</text></svg>'
const svgAnswer = () => new Response(SVG, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } })
const settled = (element) => new Promise((resolve) => element.addEventListener('plantuml-viewer:settled', resolve, { once: true }))

describe('a sheet', () => {
  beforeEach(() => vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` }))
  afterEach(() => vi.unstubAllGlobals())

  it('draws the diagram at its position inline, named for a screen reader', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheet = createSheets('/Diagrams/Screens.puml', { labelOf: () => 'login' }).sheet(2)
    await settled(sheet)

    expect(fetch.mock.calls[0][0]).toBe('/index.php/apps/plantuml/render?path=%2FDiagrams%2FScreens.puml&diagram=2')
    expect(sheet.querySelector('svg text').textContent).toBe('login')
    expect(sheet.getAttribute('aria-label')).toBe('login')
  })

  it('shows the problem the route answered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"problem":"not set"}', { status: 503 })))
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)
    await settled(sheet)

    expect(sheet.textContent).toBe('not set')
  })

  it.each([
    ['an error page', () => new Response('<html>Internal Server Error</html>', { status: 500 })],
    ['an SVG that sanitises to nothing', () => new Response('<script>alert(1)</script>', { status: 200 })],
    ['no answer', () => { throw new TypeError('Failed to fetch') }],
  ])('shows one fixed line for %s', async (_what, answer) => {
    vi.stubGlobal('fetch', vi.fn(async () => answer()))
    const sheet = createSheets('/D/S.puml', { labelOf: () => 'a' }).sheet(1)
    await settled(sheet)

    expect(sheet.textContent).toBe('Could not draw the diagram')
  })

  it('asks once for a position, however often it is shown', async () => {
    const fetch = vi.fn(async () => svgAnswer())
    vi.stubGlobal('fetch', fetch)
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    const first = sheets.sheet(1)
    await settled(first)

    expect(sheets.sheet(1)).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops what is pending when destroyed', async () => {
    let signal
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}) }))
    const sheets = createSheets('/D/S.puml', { labelOf: () => 'a' })
    sheets.sheet(1)

    sheets.destroy()

    expect(signal.aborted).toBe(true)
  })
})
```

`tests/js/viewer/diagram-view.test.js`:

```js
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({ loadFile: vi.fn() }))
vi.mock('../../../src/editor/save.js', () => ({ loadFile: seams.loadFile }))
const { createDiagramView } = await import('../../../src/viewer/diagram-view.js')

const SCREENS = '@startuml nodes\nA -> B\n@enduml\n@startuml login\nC -> D\n@enduml\n'
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text>${label}</text></svg>`
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const tabs = (root) => [...root.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)
const shown = (root) => [...root.querySelectorAll('.plantuml-viewer__stage svg text')].map((text) => text.textContent)
const asked = (fetch) => fetch.mock.calls.map(([url]) => new URL(url, 'https://x').searchParams.get('diagram'))

let root
let fetch
beforeEach(() => {
  vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
  // Each position answers the drawing of its own name, as the route would.
  fetch = vi.fn(async (url) => {
    const n = Number(new URL(url, 'https://x').searchParams.get('diagram'))
    return new Response(svg(['nodes', 'login', 'p3'][n - 1]), { status: 200 })
  })
  vi.stubGlobal('fetch', fetch)
  root = document.createElement('div')
  document.body.append(root)
})
afterEach(() => {
  root.remove()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('the Viewer, in Tabs', () => {
  it('reads the file once and gives each diagram a tab', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(seams.loadFile).toHaveBeenCalledOnce()
    expect(tabs(root)).toEqual(['nodes', 'login'])
  })

  it('opens on the first diagram and draws only it', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(asked(fetch)).toEqual(['1'])
    expect(shown(root)).toEqual(['nodes'])
  })

  it('shows the diagram of the tab activated', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    root.querySelectorAll('[role="tab"]')[1].click()
    await settle()

    expect(shown(root)).toEqual(['login'])
  })

  it('shows no tabs for a file of one diagram', async () => {
    seams.loadFile.mockResolvedValue({ content: '@startuml\nA -> B\n@enduml\n', etag: '"e"' })
    createDiagramView(root, { path: '/D/One.puml', basename: 'One.puml', onReady: vi.fn() })
    await settle()

    expect(root.querySelector('.plantuml-editor__tabbar').hidden).toBe(true)
  })

  it('reads a CRLF file as its LF twin', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS.replaceAll('\n', '\r\n'), etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()

    expect(tabs(root)).toEqual(['nodes', 'login'])
  })

  it('is ready once, when the first sheet is drawn', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    const onReady = vi.fn()
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady })
    await settle()
    root.querySelectorAll('[role="tab"]')[1].click()
    await settle()

    expect(onReady).toHaveBeenCalledOnce()
  })

  it('says it could not draw when the file cannot be read, and is ready', async () => {
    seams.loadFile.mockRejectedValue(new Error('404'))
    const onReady = vi.fn()
    createDiagramView(root, { path: '/D/Gone.puml', basename: 'Gone.puml', onReady })
    await settle()

    expect(root.textContent).toBe('Could not draw the diagram')
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('does nothing more once destroyed mid-load', async () => {
    let signal
    fetch.mockImplementation((_url, init) => { signal = init.signal; return new Promise(() => {}) })
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    const onReady = vi.fn()
    const view = createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady })
    await settle()

    view.destroy()
    await settle()

    expect(signal.aborted).toBe(true)
    expect(root.childElementCount).toBe(0)
    expect(onReady).not.toHaveBeenCalled()
  })

  it("keeps the tab strip's arrow keys from the Viewer, which would go to the next file", async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    try {
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        root.querySelector('[role="tab"]').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      }
      expect(seen).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', seen)
    }
  })

  it('lets other keys through to the Viewer', async () => {
    seams.loadFile.mockResolvedValue({ content: SCREENS, etag: '"e"' })
    createDiagramView(root, { path: '/D/Screens.puml', basename: 'Screens.puml', onReady: vi.fn() })
    await settle()
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    try {
      root.querySelector('[role="tab"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(seen).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', seen)
    }
  })
})
```

`tests/js/viewer-component.test.js`, rewritten (the pragma matters: without it the file runs in the node project, which shares one environment across files):

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The component is a plain options object, driven on a bare instance with no
// Vue runtime; the view it builds is mocked at its module.
import { beforeEach, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({ view: { destroy: vi.fn() }, createDiagramView: vi.fn() }))
vi.mock('../../src/viewer/diagram-view.js', () => ({ createDiagramView: seams.createDiagramView }))
const { default: component } = await import('../../src/viewer-component.js')

function instance(active) {
  return { ...component.methods, $el: document.createElement('div'), filename: '/Diagrams/Screens.puml', basename: 'Screens.puml', active, doneLoading: vi.fn() }
}

beforeEach(() => seams.createDiagramView.mockReturnValue(seams.view))

it('draws one empty root for the view', () => {
  const h = (tag, data, children) => ({ tag, data, children })
  expect(component.render.call(instance(true), h)).toEqual({ tag: 'div', data: { class: 'plantuml-viewer' }, children: undefined })
})

it('builds the view on its file when it is the file shown', () => {
  const vm = instance(true)
  component.mounted.call(vm)
  expect(seams.createDiagramView).toHaveBeenCalledWith(vm.$el, expect.objectContaining({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }))
  seams.createDiagramView.mock.calls[0][1].onReady()
  expect(vm.doneLoading).toHaveBeenCalled()
})

it('reads nothing for a neighbour the Viewer preloads, until it is shown', () => {
  const vm = instance(false)
  component.mounted.call(vm)
  expect(seams.createDiagramView).not.toHaveBeenCalled()
  component.watch.active.call(vm, true)
  expect(seams.createDiagramView).toHaveBeenCalledOnce()
})

it('destroys the view with itself', () => {
  const vm = instance(true)
  component.mounted.call(vm)
  component.beforeDestroy.call(vm)
  expect(seams.view.destroy).toHaveBeenCalled()
})
```

`LoadFilesScriptListenerTest`: extend its assertion on added styles so `viewer` is among them, in the test's own style.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/js/viewer tests/js/viewer-component.test.js && composer run test:unit -- --filter LoadFilesScriptListener`
Expected: FAIL, modules not found; the `viewer` style not added.

- [ ] **Step 3: Implement**

`src/viewer/sheets.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's sheets: one diagram each, drawn inline through GET /render so its
 * links work (D1), or the line saying why not (D4). A few requests at a time, in
 * the order asked, so a wall of diagrams does not flood the server.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID, renderUrl } from '../files-helpers.js'
import { toInlineSvg } from '../editor/inline-svg.js'

function jsonProblem(body) {
  try {
    const problem = JSON.parse(body)?.problem
    return typeof problem === 'string' ? problem : ''
  } catch {
    return ''
  }
}

export function createSheets(path, { parallel = 3, labelOf }) {
  const sheets = new Map()
  const queue = []
  const stop = new AbortController()
  let running = 0

  async function draw(position) {
    const sheet = sheets.get(position)
    let problem = ''
    try {
      const res = await fetch(renderUrl(path, position), { credentials: 'same-origin', signal: stop.signal })
      const body = await res.text()
      const svg = res.ok ? toInlineSvg(body, { idPrefix: `plantuml-viewer-${position}-` }) : null
      if (svg) {
        sheet.replaceChildren(svg)
      } else {
        problem = (!res.ok && jsonProblem(body)) || t(APP_ID, 'Could not draw the diagram')
      }
    } catch {
      if (stop.signal.aborted) {
        return
      }
      problem = t(APP_ID, 'Could not draw the diagram')
    }
    if (problem) {
      const line = document.createElement('p')
      line.className = 'plantuml-viewer__problem'
      line.textContent = problem
      sheet.classList.add('plantuml-viewer__sheet--problem')
      sheet.replaceChildren(line)
    }
    sheet.dispatchEvent(new CustomEvent('plantuml-viewer:settled'))
  }

  function pump() {
    while (running < parallel && queue.length && !stop.signal.aborted) {
      running++
      draw(queue.shift()).finally(() => {
        running--
        pump()
      })
    }
  }

  return {
    sheet(position) {
      if (!sheets.has(position)) {
        const sheet = document.createElement('div')
        sheet.className = 'plantuml-viewer__sheet'
        sheet.setAttribute('role', 'img')
        sheet.setAttribute('aria-label', labelOf(position))
        sheets.set(position, sheet)
        queue.push(position)
        pump()
      }
      return sheets.get(position)
    },
    destroy() {
      queue.length = 0
      stop.abort()
    },
  }
}
```

`src/viewer/diagram-view.js` (Tabs only here; Tasks 8–9 add the toolbar, Stack, Wall, Export and Edit):

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's diagrams (VW1–VW8), on a root the Vue component hands over. The
 * file is read once and split as the editor's tabs split it; every open starts
 * in Tabs on the first diagram (VW8). The head (toolbar, tab bar) sits outside
 * the scrolling stage, so neither moves when a diagram changes size (VW3).
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import { loadFile } from '../editor/save.js'
import { label, scan } from '../editor/blocks.js'
import { createTabs } from '../editor/tabs.js'
import { createSheets } from './sheets.js'

const STAGE_ID = 'plantuml-viewer-stage'

function element(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}

export function createDiagramView(root, { path, basename, onReady }) {
  const state = { mode: 'tabs', active: 0, checked: new Set() }
  let diagrams = []
  let sheets = null
  let destroyed = false
  let ready = false
  const settle = () => {
    if (!ready && !destroyed) {
      ready = true
      onReady()
    }
  }

  const head = element('div', 'plantuml-viewer__head')
  const tabBar = element('div', 'plantuml-viewer__tabbar')
  const stage = element('div', 'plantuml-viewer__stage')
  stage.id = STAGE_ID
  stage.setAttribute('aria-label', basename)
  const tabs = createTabs({ onActivate: (index) => { state.active = index; show() }, controls: STAGE_ID })
  tabBar.append(tabs.element)
  head.append(tabBar)
  root.replaceChildren(head, stage)

  // The Viewer (NcModal) takes ←/→ for the previous and next file and Escape
  // for closing. Keys a tab strip or an open menu of ours used stop here: the
  // arrows, Home and End in a tablist or menu, and Escape in a menu.
  const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])
  root.addEventListener('keydown', (event) => {
    const inMenu = event.target.closest?.('[role="menu"]')
    const inTabs = event.target.closest?.('[role="tablist"]')
    if ((MOVES.has(event.key) && (inMenu || inTabs)) || (event.key === 'Escape' && inMenu)) {
      event.stopPropagation()
    }
  })

  function show() {
    tabs.update(diagrams, state.active)
    tabBar.hidden = diagrams.length < 2
    stage.replaceChildren(sheets.sheet(state.active + 1))
  }

  loadFile(path).then(({ content }) => {
    if (destroyed) {
      return
    }
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { labelOf: (position) => label(diagrams[position - 1]) })
    sheets.sheet(1).addEventListener('plantuml-viewer:settled', settle, { once: true })
    show()
  }, () => {
    if (destroyed) {
      return
    }
    const line = element('p', 'plantuml-viewer__problem')
    line.textContent = t(APP_ID, 'Could not draw the diagram')
    root.replaceChildren(line)
    settle()
  })

  return {
    destroy() {
      destroyed = true
      sheets?.destroy()
      tabs.destroy()
      root.replaceChildren()
    },
  }
}
```

`src/viewer-component.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer component for a diagram file: a root the plain-DOM view in
 * src/viewer/ draws into.
 *
 * VUE 2. Viewer stable34 mounts this object with its own Vue 2.7, so it imports
 * nothing of Vue and draws with `render(h)`; its `Mime` mixin supplies
 * `filename`, `basename`, `active` and `doneLoading()`. The Viewer also mounts
 * the previous and next files' components, hidden and inactive, so the view is
 * built only once this one is the file shown.
 */
import { createDiagramView } from './viewer/diagram-view.js'

export default {
  name: 'PlantUmlDiagram',

  watch: {
    active(now) {
      if (now) {
        this.build()
      }
    },
  },

  mounted() {
    if (this.active) {
      this.build()
    }
  },

  beforeDestroy() {
    this.view?.destroy()
  },

  methods: {
    build() {
      this.view ??= createDiagramView(this.$el, { path: this.filename, basename: this.basename, onReady: () => this.doneLoading() })
    },
  },

  render(h) {
    return h('div', { class: 'plantuml-viewer' })
  },
}
```

`css/viewer.css` (SPDX header as `css/editor.css`), the Tabs values from Global Constraints:

```css
.plantuml-viewer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  height: 100%;
  padding: 16px 0 40px;
  box-sizing: border-box;
}

.plantuml-viewer__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  flex: none;
}

.plantuml-viewer__tabbar {
  height: 44px;
  padding: 0 8px;
  border: 1px solid var(--color-border-maxcontrast);
  border-radius: 8px;
  background: var(--color-main-background);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}

.plantuml-viewer__tabbar[hidden] {
  display: none;
}

.plantuml-viewer__stage {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
}

/* Centred by auto margins, not align-items: centring a sheet taller than the
   stage would push its top out of reach of the scrollbar. */
.plantuml-viewer__stage > .plantuml-viewer__sheet {
  margin: auto;
}

.plantuml-viewer__sheet {
  padding: 40px;
  border-radius: 8px;
  background: #ffffff;
  max-width: calc(100% - 80px);
}

.plantuml-viewer__sheet svg {
  max-width: 100%;
  height: auto;
}

.plantuml-viewer__sheet--problem {
  background: none;
}

.plantuml-viewer__problem {
  color: #ffffff;
  font-size: 16px;
}
```

`LoadFilesScriptListener`: add `Util::addStyle(Application::APP_ID, 'viewer');` after the `editor` style.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run && composer run test:unit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/viewer src/viewer-component.js css/viewer.css lib/Listener/LoadFilesScriptListener.php tests/js/viewer tests/js/viewer-component.test.js tests/unit/Listener/LoadFilesScriptListenerTest.php
git commit -m "Viewer: every diagram of a file, drawn inline, one tab each"
```

### Task 8: The toolbar, Stack and Wall

**Files:**
- Create: `src/viewer/toolbar.js`, `img/icons/view-tabs.svg`, `img/icons/view-stack.svg`, `img/icons/view-grid.svg`, `img/icons/download.svg`, `img/icons/chevron-down-small.svg`, `tests/js/viewer/toolbar.test.js`
- Modify: `src/viewer/diagram-view.js`, `css/viewer.css`
- Test: `tests/js/viewer/diagram-view.test.js`

**Interfaces:**
- Consumes: `createSheets` (Task 7).
- Produces:
  - `export const LABELLED = true` in `toolbar.js` — the one switch for Dr K's open question on words in buttons.
  - `createToolbar({ single, editable, exportable = true, onMode, onExport, onEdit, labelled = LABELLED }): { element: HTMLElement, exportButton: HTMLButtonElement|null, setMode(mode: 'tabs'|'stack'|'wall'): void, setExportLabel(text: string): void }`. With `labelled` false every button shows its icon alone and keeps its `aria-label` and `title`. With `exportable` false there is no Export (the coordinator's ruling: a share that forbids download); Task 9 decides it.
  - `diagram-view.js` gains, for Task 9 to fill: `afterCheck()`, `exportMenu()`, `edit()` (no-ops here) and `build({ exportable })`.

Behaviour (VW2, VW4, VW5): the toolbar is centred in the head above the tab bar. Its parts, in order: the Display switch (three `aria-pressed` buttons, Tabs `view-tabs`, Stack `view-stack`, Wall `view-grid`), a divider, Export (`download`, its label, `chevron-down-small`, `aria-haspopup="menu"`), Edit (`pencil`). With one diagram, no switch and no divider. Stack: each diagram a card, one under another; a card is a caption (a checkbox labelled with the diagram's label) over its sheet. Wall: the same cards wrapping, in file order, at natural size. A click on a Wall card, not on its checkbox, opens that diagram in Tabs. The tab bar shows in Tabs only. The checked set lasts while the Viewer is open, across modes.

- [ ] **Step 1: Write the failing tests**

`tests/js/viewer/toolbar.test.js`:

```js
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createToolbar } from '../../../src/viewer/toolbar.js'

const names = (toolbar) => [...toolbar.element.querySelectorAll('button, .plantuml-viewer__divider')]
  .map((part) => part.getAttribute('aria-label') ?? 'divider')
const options = { single: false, editable: true, onMode: vi.fn(), onExport: vi.fn(), onEdit: vi.fn() }

describe('the toolbar', () => {
  it('puts the switch, a divider, Export and Edit in that order', () => {
    expect(names(createToolbar(options))).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Export', 'Edit'])
  })

  it('has no switch and no divider for one diagram', () => {
    expect(names(createToolbar({ ...options, single: true }))).toEqual(['Export', 'Edit'])
  })

  it('has no Edit without a server to draw with', () => {
    expect(names(createToolbar({ ...options, editable: false }))).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Export'])
  })

  it('presses the one mode shown', () => {
    const toolbar = createToolbar(options)
    toolbar.setMode('wall')
    const pressed = [...toolbar.element.querySelectorAll('[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'))
    expect(pressed).toEqual(['Wall'])
  })

  it('asks for the mode clicked', () => {
    const onMode = vi.fn()
    createToolbar({ ...options, onMode }).element.querySelector('[aria-label="Stack"]').click()
    expect(onMode).toHaveBeenCalledWith('stack')
  })

  it('shows words on its buttons, or icons alone that still have names', () => {
    // The icons' SVG markup brings whitespace of its own, so the label span is what is read.
    expect(createToolbar(options).exportButton.querySelector('.plantuml-viewer__label').textContent).toBe('Export')
    const bare = createToolbar({ ...options, labelled: false })
    expect(bare.exportButton.querySelector('.plantuml-viewer__label')).toBeNull()
    expect(bare.exportButton.textContent.trim()).toBe('')
    expect(bare.exportButton.getAttribute('aria-label')).toBe('Export')
    expect(bare.exportButton.title).toBe('Export')
  })

  it('has no Export for a file whose share forbids download', () => {
    const toolbar = createToolbar({ ...options, exportable: false })
    expect(names(toolbar)).toEqual(['Tabs', 'Stack', 'Wall', 'divider', 'Edit'])
    expect(toolbar.exportButton).toBeNull()
    expect(() => toolbar.setExportLabel('Export 2')).not.toThrow()
  })

  it('renames Export, words or not', () => {
    const labelled = createToolbar(options)
    labelled.setExportLabel('Export 2')
    expect(labelled.exportButton.querySelector('.plantuml-viewer__label').textContent).toBe('Export 2')
    const bare = createToolbar({ ...options, labelled: false })
    bare.setExportLabel('Export 2')
    expect(bare.exportButton.getAttribute('aria-label')).toBe('Export 2')
    expect(bare.exportButton.title).toBe('Export 2')
  })
})
```

`tests/js/viewer/diagram-view.test.js`, added (`THREE = SCREENS + '@startuml p3\nE -> F\n@enduml\n'`):

```js
const open = async (content) => {
  seams.loadFile.mockResolvedValue({ content, etag: '"e"' })
  createDiagramView(root, { path: '/D/S.puml', basename: 'S.puml', onReady: vi.fn() })
  await settle()
}
const mode = (name) => root.querySelector(`.plantuml-viewer__toolbar [aria-label="${name}"]`).click()
const cards = () => [...root.querySelectorAll('.plantuml-viewer__card')]
const caption = (card) => card.querySelector('label').textContent

describe('Stack and Wall', () => {
  it('stacks every diagram as a card, captioned with a checkbox', async () => {
    await open(THREE)
    mode('Stack')
    await settle()

    expect(cards().map(caption)).toEqual(['nodes', 'login', 'p3'])
    expect(shown(root)).toEqual(['nodes', 'login', 'p3'])
    expect(root.querySelector('.plantuml-viewer__tabbar').hidden).toBe(true)
  })

  it('opens a Wall card in Tabs on a click outside its checkbox', async () => {
    await open(THREE)
    mode('Wall')
    await settle()
    cards()[1].querySelector('.plantuml-viewer__sheet').click()
    await settle()

    expect(root.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('login')
    expect(shown(root)).toEqual(['login'])
  })

  it('stays in the Wall when a checkbox is clicked', async () => {
    await open(THREE)
    mode('Wall')
    cards()[1].querySelector('input[type="checkbox"]').click()

    expect(cards()).toHaveLength(3)
    expect(cards()[1].classList.contains('plantuml-viewer__card--checked')).toBe(true)
  })

  it('keeps what is checked across modes', async () => {
    await open(THREE)
    mode('Stack')
    cards()[2].querySelector('input[type="checkbox"]').click()
    mode('Tabs')
    mode('Wall')

    expect(cards().map((card) => card.querySelector('input').checked)).toEqual([false, false, true])
  })

  it('has no more than three drawings asked for at once, in file order', async () => {
    const pending = []
    fetch.mockImplementation((url) => new Promise((resolve) => pending.push({ url, resolve })))
    await open(Array.from({ length: 40 }, (_, i) => `@startuml d${i + 1}\n@enduml\n`).join(''))
    pending.shift().resolve(new Response(svg('d1')))
    await settle()
    mode('Stack')
    await settle()

    expect(pending.map(({ url }) => new URL(url, 'https://x').searchParams.get('diagram'))).toEqual(['2', '3', '4'])
    pending.shift().resolve(new Response(svg('d2')))
    await settle()
    expect(pending.map(({ url }) => new URL(url, 'https://x').searchParams.get('diagram'))).toEqual(['3', '4', '5'])
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/js/viewer`
Expected: FAIL, `toolbar.js` not found; no Stack or Wall.

- [ ] **Step 3: Implement**

The five icon files, each in `img/icons/pencil.svg`'s shape, with the path from Global Constraints. `img/icons/view-tabs.svg`, for one:

```svg
<!--
  SPDX-FileCopyrightText: 2026 kubed-io
  SPDX-License-Identifier: AGPL-3.0-or-later

  The Viewer toolbar's Tabs option (Penpot icon view-tabs). Imported (?raw) by
  src/viewer/toolbar.js.
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M21,3L3,3C1.9,3,1,3.9,1,5L1,19C1,20.1,1.9,21,3,21L21,21C22.1,21,23,20.1,23,19L23,5C23,3.9,22.1,3,21,3M21,19L3,19L3,5L13,5L13,9L21,9L21,19Z"/>
</svg>
```

The others the same, their comments naming the Stack option (`view-stack`), the Wall option (`view-grid`), Export and the export menu's items (`download`, imported by `toolbar.js` and `menu.js`), Export's chevron (`chevron-down-small`, `viewBox="0 0 16 16"`).

`src/viewer/toolbar.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's toolbar (VW2): how to show the diagrams, Export and Edit.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import tabsIcon from '../../img/icons/view-tabs.svg?raw'
import stackIcon from '../../img/icons/view-stack.svg?raw'
import wallIcon from '../../img/icons/view-grid.svg?raw'
import exportIcon from '../../img/icons/download.svg?raw'
import chevronIcon from '../../img/icons/chevron-down-small.svg?raw'
import editIcon from '../../img/icons/pencil.svg?raw'

/** Words on the buttons, as drawn; false leaves the icons alone (open with Dr K, spec Known limitations). */
export const LABELLED = true

function button(className, icon, name, labelled, after = '') {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = `plantuml-viewer__button ${className}`
  node.innerHTML = `<span class="plantuml-viewer__icon" aria-hidden="true">${icon.trim()}</span>`
    + (labelled ? '<span class="plantuml-viewer__label"></span>' : '')
    + (after ? `<span class="plantuml-viewer__chevron" aria-hidden="true">${after.trim()}</span>` : '')
  const rename = (text) => {
    node.setAttribute('aria-label', text)
    node.title = text
    const shown = node.querySelector('.plantuml-viewer__label')
    if (shown) {
      shown.textContent = text
    }
  }
  rename(name)
  return { node, rename }
}

export function createToolbar({ single, editable, exportable = true, onMode, onExport, onEdit, labelled = LABELLED }) {
  const element = document.createElement('div')
  element.className = 'plantuml-viewer__toolbar'
  element.setAttribute('role', 'toolbar')
  const modes = {}
  if (!single) {
    for (const [mode, icon, name] of [['tabs', tabsIcon, t(APP_ID, 'Tabs')], ['stack', stackIcon, t(APP_ID, 'Stack')], ['wall', wallIcon, t(APP_ID, 'Wall')]]) {
      const { node } = button('plantuml-viewer__mode', icon, name, labelled)
      node.setAttribute('aria-pressed', String(mode === 'tabs'))
      node.addEventListener('click', () => onMode(mode))
      modes[mode] = node
      element.append(node)
    }
    const divider = document.createElement('span')
    divider.className = 'plantuml-viewer__divider'
    element.append(divider)
  }
  const exporting = exportable ? button('plantuml-viewer__export', exportIcon, t(APP_ID, 'Export'), labelled, chevronIcon) : null
  if (exporting) {
    exporting.node.setAttribute('aria-haspopup', 'menu')
    exporting.node.setAttribute('aria-expanded', 'false')
    exporting.node.addEventListener('click', onExport)
    element.append(exporting.node)
  }
  if (editable) {
    const editing = button('plantuml-viewer__edit', editIcon, t(APP_ID, 'Edit'), labelled)
    editing.node.addEventListener('click', onEdit)
    element.append(editing.node)
  }
  return {
    element,
    exportButton: exporting?.node ?? null,
    setMode(mode) {
      for (const [name, node] of Object.entries(modes)) {
        node.setAttribute('aria-pressed', String(name === mode))
      }
    },
    setExportLabel: (text) => exporting?.rename(text),
  }
}
```

`src/viewer/diagram-view.js`, whole, replacing Task 7's (the header comment as Task 7's):

```js
import { translate as t } from '@nextcloud/l10n'
import { loadState } from '@nextcloud/initial-state'
import { APP_ID } from '../files-helpers.js'
import { loadFile } from '../editor/save.js'
import { label, scan } from '../editor/blocks.js'
import { createTabs } from '../editor/tabs.js'
import { createSheets } from './sheets.js'
import { createToolbar } from './toolbar.js'

const STAGE_ID = 'plantuml-viewer-stage'
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

function element(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}

export function createDiagramView(root, { path, basename, onReady }) {
  const state = { mode: 'tabs', active: 0, checked: new Set() }
  let diagrams = []
  let sheets = null
  let toolbar = null
  let destroyed = false
  let ready = false
  const settle = () => {
    if (!ready && !destroyed) {
      ready = true
      onReady()
    }
  }

  const head = element('div', 'plantuml-viewer__head')
  const tabBar = element('div', 'plantuml-viewer__tabbar')
  const stage = element('div', 'plantuml-viewer__stage')
  stage.id = STAGE_ID
  stage.setAttribute('aria-label', basename)
  const tabs = createTabs({ onActivate: (index) => { state.active = index; show() }, controls: STAGE_ID })
  tabBar.append(tabs.element)
  head.append(tabBar)
  root.replaceChildren(head, stage)

  // The Viewer (NcModal) takes ←/→ for the previous and next file and Escape
  // for closing. Keys a tab strip or an open menu of ours used stop here.
  root.addEventListener('keydown', (event) => {
    const inMenu = event.target.closest?.('[role="menu"]')
    const inTabs = event.target.closest?.('[role="tablist"]')
    if ((MOVES.has(event.key) && (inMenu || inTabs)) || (event.key === 'Escape' && inMenu)) {
      event.stopPropagation()
    }
  })

  /** Task 9: the Export label follows what is checked. */
  function afterCheck() {}
  /** Task 9: Export's menu. */
  function exportMenu() {}
  /** Task 9: the editor at the diagram in view. */
  function edit() {}

  function card(index) {
    const node = element('div', 'plantuml-viewer__card')
    const caption = element('label', 'plantuml-viewer__caption')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = state.checked.has(index)
    box.addEventListener('change', () => {
      if (box.checked) {
        state.checked.add(index)
      } else {
        state.checked.delete(index)
      }
      node.classList.toggle('plantuml-viewer__card--checked', box.checked)
      afterCheck()
    })
    caption.append(box, label(diagrams[index]))
    node.classList.toggle('plantuml-viewer__card--checked', box.checked)
    node.append(caption, sheets.sheet(index + 1))
    // The caption is a <label>: a click on its text toggles the box, so it counts as the checkbox.
    node.addEventListener('click', (event) => {
      if (state.mode === 'wall' && !caption.contains(event.target)) {
        state.mode = 'tabs'
        state.active = index
        show()
      }
    })
    return node
  }

  function show() {
    toolbar?.setMode(state.mode)
    tabBar.hidden = state.mode !== 'tabs' || diagrams.length < 2
    stage.className = `plantuml-viewer__stage plantuml-viewer__stage--${state.mode}`
    if (state.mode === 'tabs') {
      tabs.update(diagrams, state.active)
      stage.replaceChildren(sheets.sheet(state.active + 1))
    } else {
      stage.replaceChildren(...diagrams.map((_diagram, index) => card(index)))
    }
    afterCheck()
  }

  function build({ exportable }) {
    toolbar = createToolbar({
      single: diagrams.length < 2,
      editable: loadState(APP_ID, 'server_configured', false),
      exportable,
      onMode: (mode) => { state.mode = mode; show() },
      onExport: () => exportMenu(),
      onEdit: () => edit(),
    })
    head.prepend(toolbar.element)
  }

  loadFile(path).then(({ content }) => {
    if (destroyed) {
      return
    }
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { labelOf: (position) => label(diagrams[position - 1]) })
    build({ exportable: true })
    sheets.sheet(1).addEventListener('plantuml-viewer:settled', settle, { once: true })
    show()
  }, () => {
    if (destroyed) {
      return
    }
    const line = element('p', 'plantuml-viewer__problem')
    line.textContent = t(APP_ID, 'Could not draw the diagram')
    root.replaceChildren(line)
    settle()
  })

  return {
    destroy() {
      destroyed = true
      sheets?.destroy()
      tabs.destroy()
      root.replaceChildren()
    },
  }
}
```

`css/viewer.css`, added (values from Global Constraints):

```css
.plantuml-viewer__toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 42px;
  padding: 4px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-maxcontrast);
  border-radius: 100px;
  background: var(--color-main-background);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}

.plantuml-viewer__toolbar button.plantuml-viewer__button {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--default-clickable-area);
  min-height: 0;
  margin: 0;
  padding: 0 12px;
  border: none;
  border-radius: 100px;
  background: transparent;
  color: var(--color-main-text);
  font-size: 14px;
  font-weight: 400;
}

.plantuml-viewer__toolbar button.plantuml-viewer__button:hover {
  background: var(--color-background-hover);
}

.plantuml-viewer__toolbar button.plantuml-viewer__button:focus-visible {
  outline: 2px solid var(--color-primary-element);
}

.plantuml-viewer__toolbar button.plantuml-viewer__mode[aria-pressed="true"] {
  background: var(--color-primary-element-light);
  color: var(--color-primary-element-light-text);
  font-weight: 700;
}

.plantuml-viewer__icon,
.plantuml-viewer__icon svg {
  display: block;
  width: 24px;
  height: 24px;
}

.plantuml-viewer__chevron,
.plantuml-viewer__chevron svg {
  display: block;
  width: 16px;
  height: 16px;
}

.plantuml-viewer__divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
}

/* `safe` keeps a card wider than the stage from losing its left edge. */
.plantuml-viewer__stage--stack {
  flex-direction: column;
  align-items: safe center;
  gap: 24px;
  padding-top: 16px;
}

.plantuml-viewer__stage--stack .plantuml-viewer__card {
  width: 720px;
  max-width: calc(100% - 32px);
}

.plantuml-viewer__stage--wall {
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
  justify-content: safe center;
  gap: 24px;
  padding: 16px 80px 0;
  box-sizing: border-box;
}

.plantuml-viewer__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border-maxcontrast);
  border-radius: 8px;
  background: var(--color-main-background);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  box-sizing: border-box;
}

.plantuml-viewer__card--checked {
  outline: 2px solid var(--color-primary-element);
  outline-offset: -1px;
}

.plantuml-viewer__stage--wall .plantuml-viewer__card {
  cursor: pointer;
}

.plantuml-viewer__caption {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--default-clickable-area);
  padding: 0 8px;
  color: var(--color-main-text);
  font-size: 14px;
}

.plantuml-viewer__caption input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--color-primary-element);
}

.plantuml-viewer__card .plantuml-viewer__sheet {
  max-width: none;
}

.plantuml-viewer__card .plantuml-viewer__problem {
  color: var(--color-main-text);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/viewer img/icons css/viewer.css tests/js/viewer
git commit -m "Viewer: a toolbar switches between tabs, a stack and a wall"
```

### Task 9: Export and Edit

**Files:**
- Create: `src/viewer/menu.js`, `tests/js/viewer/menu.test.js`
- Modify: `src/viewer/diagram-view.js` (whole, below), `src/viewer/sheets.js` (`jsonProblem` exported), `src/editor/save.js` (`canDownload`), `src/files-helpers.js` (`exportUrl`), `css/viewer.css`
- Test: `tests/js/viewer/diagram-view.test.js`, `tests/js/save.test.js`, `tests/js/files-helpers.test.js`

**Interfaces:**
- Consumes: `createToolbar` (Task 8), `openEditor(node, { diagram })` from `src/open-editor.js` (Task 6), `GET /export` and its refusals (Task 5).
- Produces:
  - `exportUrl(path: string, format: string, positions: number[]): string` (`files-helpers.js`).
  - `canDownload(path: string): Promise<boolean>` (`save.js`) — false only when the file's `nc:share-attributes` hold `{"scope": "permissions", "key": "download", "value": false}`, the rule `IncludeResolver::forbidsDownload` applies on the server (Task 5).
  - `jsonProblem(body: string): string` exported from `sheets.js`.
  - `createMenu({ anchor: HTMLButtonElement, heading: () => string, items: { label: string, value: string }[], onPick: (value: string) => void }): { open(): void, close(): void, destroy(): void }`.

Behaviour (VW6, VW7, and the Rulings on download-forbidden shares and failed exports):
- Export reads "Export" in Tabs; in Stack and Wall, "Export all" with nothing checked, else "Export %n". There is no Export when `canDownload` answers false; when it fails, Export shows and the route decides.
- The menu opens under Export, its left edge on Export's. Its heading is the one diagram's label (a one-diagram file's unnamed diagram: the file's name without `.puml`), else "%n diagrams, as .zip"; then SVG, PNG, PDF, EPS, ASCII art, each with the `download` icon.
- A pick fetches `exportUrl(…)` (Tabs: the active position; Stack and Wall: the checked positions in file order, or none for all) and saves the answer through a `blob:` URL under the name its `Content-Disposition` gives. A failed answer saves nothing and shows the route's `problem`, else "Could not export the diagram", in a status line under the toolbar until the next export.
- Edit (absent without `server_configured`): the open tab, or in Stack and Wall the first checked card, else the first diagram. It closes the Viewer (`OCA.Viewer.close()`), then `openEditor({ path, basename }, { diagram: index })`.
- Escape in either menu (Export's, or the tab strip's "All diagrams") closes that menu, never the Viewer: Task 8's key guard stops it at the view's root.

- [ ] **Step 1: Write the failing tests**

`tests/js/files-helpers.test.js`:

```js
it('asks to export the positions given, or every diagram', () => {
  expect(exportUrl('/D/S.puml', 'png', [2, 4])).toBe('/index.php/apps/plantuml/export?path=%2FD%2FS.puml&format=png&diagram%5B%5D=2&diagram%5B%5D=4')
  expect(exportUrl('/D/S.puml', 'txt', [])).toBe('/index.php/apps/plantuml/export?path=%2FD%2FS.puml&format=txt')
})
```

`tests/js/save.test.js` (`canDownload` joins the destructured import of `save.js`). The cases are the PHP ones of Task 5's `downloadRules`, as the DAV property carries them:

```js
describe('canDownload', () => {
  beforeEach(() => vi.resetAllMocks())

  /** webdav's stat with details: the props under data, the property's JSON as Nextcloud sends it. */
  const answering = (attributes) => client.stat.mockResolvedValue({ data: { props: attributes === undefined ? {} : { 'share-attributes': attributes } } })

  it.each([
    ['not on a share', undefined, true],
    ['a share that forbids download', '[{"scope":"permissions","key":"download","value":false}]', false],
    ['a share that allows it', '[{"scope":"permissions","key":"download","value":true}]', true],
    ['a share that says nothing', '[]', true],
    ['a property that is not JSON', 'nonsense', true],
  ])('reads %s as the server does', async (_what, attributes, allowed) => {
    answering(attributes)
    await expect(canDownload('/Shared/S.puml')).resolves.toBe(allowed)
  })

  it('asks for the share attributes alone, of the file and nothing under it', async () => {
    answering('[]')
    await canDownload('/Shared/S.puml')

    const [davPath, options] = client.stat.mock.calls[0]
    expect(davPath).toBe('/files/drk/Shared/S.puml')
    expect(options.details).toBe(true)
    expect(options.data).toMatch(/xmlns:nc="http:\/\/nextcloud.org\/ns"/)
    expect(options.data.match(/<d:prop>(.*)<\/d:prop>/s)[1].replace(/\s/g, '')).toBe('<nc:share-attributes/>')
  })

  it('passes a failed look on to its caller', async () => {
    client.stat.mockRejectedValue(davError(500))
    await expect(canDownload('/Shared/S.puml')).rejects.toThrow()
  })
})
```

`tests/js/viewer/menu.test.js`. Item names are read from their label span or `data-value`: the icon's SVG markup brings whitespace of its own.

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMenu } from '../../../src/viewer/menu.js'

let anchor
let onPick
let menu
const items = [{ label: 'SVG', value: 'svg' }, { label: 'PNG', value: 'png' }]
const shown = () => document.querySelector('.plantuml-viewer__menu')
const focused = () => document.activeElement.dataset.value
const key = (name) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))

beforeEach(() => {
  document.body.replaceChildren()
  const bar = document.createElement('div')
  anchor = document.createElement('button')
  Object.defineProperty(anchor, 'offsetLeft', { configurable: true, value: 120 })
  bar.append(anchor)
  document.body.append(bar)
  onPick = vi.fn()
  menu = createMenu({ anchor, heading: () => 'login', items, onPick })
})

describe('the export menu', () => {
  it('opens under its button, left edges aligned, its heading first and out of the focus order', () => {
    menu.open()
    expect(shown().hidden).toBe(false)
    expect(shown().style.left).toBe('120px')
    expect(shown().firstElementChild.textContent).toBe('login')
    expect(shown().firstElementChild.tabIndex).toBe(-1)
    expect(focused()).toBe('svg')
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
  })

  it('labels each item with its format', () => {
    expect([...shown().querySelectorAll('.plantuml-viewer__menu-label')].map((label) => label.textContent)).toEqual(['SVG', 'PNG'])
  })

  it('moves with the arrows and wraps', () => {
    menu.open()
    key('ArrowDown')
    expect(focused()).toBe('png')
    key('ArrowDown')
    expect(focused()).toBe('svg')
    key('End')
    expect(focused()).toBe('png')
  })

  it('closes on Escape, back to its button', () => {
    menu.open()
    key('Escape')
    expect(shown().hidden).toBe(true)
    expect(document.activeElement).toBe(anchor)
  })

  it('picks and closes', () => {
    menu.open()
    shown().querySelectorAll('[role="menuitem"]')[1].click()
    expect(onPick).toHaveBeenCalledWith('png')
    expect(shown().hidden).toBe(true)
  })

  it('closes on a click elsewhere', () => {
    menu.open()
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(shown().hidden).toBe(true)
  })
})
```

`tests/js/viewer/diagram-view.test.js`: the hoisted seams gain `canDownload: vi.fn()`, `openEditor: vi.fn()`, `serverConfigured: true`; the mocks become

```js
vi.mock('../../../src/editor/save.js', () => ({ loadFile: seams.loadFile, canDownload: seams.canDownload }))
vi.mock('../../../src/open-editor.js', () => ({ openEditor: seams.openEditor }))
vi.mock('@nextcloud/initial-state', () => ({ loadState: () => seams.serverConfigured }))
```

and the top `beforeEach` adds `seams.canDownload.mockResolvedValue(true)`, `seams.serverConfigured = true` and `window.OCA = { Viewer: { close: vi.fn() } }`. Added:

```js
const exportButton = () => root.querySelector('.plantuml-viewer__export')
const exportLabel = () => exportButton().getAttribute('aria-label')
const heading = () => root.querySelector('.plantuml-viewer__menu-heading').textContent
const pick = (format) => root.querySelector(`[role="menuitem"][data-value="${format}"]`).click()
const check = (index) => cards()[index].querySelector('input').click()
const notice = () => root.querySelector('.plantuml-viewer__notice')
const exportsAsked = () => fetch.mock.calls.map(([url]) => url).filter((url) => url.includes('/apps/plantuml/export'))
  .map((url) => [...new URL(url, 'https://x').searchParams.entries()])

describe('Export', () => {
  let saved
  let exportAnswer
  beforeEach(() => {
    saved = []
    exportAnswer = () => new Response('BYTES', {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Content-Disposition': "attachment; filename=\"S - login.png\"; filename*=UTF-8''S%20-%20login.png" },
    })
    const render = fetch.getMockImplementation()
    fetch.mockImplementation(async (url, init) => (url.includes('/apps/plantuml/export') ? exportAnswer() : render(url, init)))
    URL.createObjectURL = vi.fn(() => 'blob:export')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      saved.push({ href: this.href, name: this.download })
    })
  })

  it('exports the diagram of the open tab, saved under the name the route gives', async () => {
    await open(THREE)
    root.querySelectorAll('[role="tab"]')[1].click()
    exportButton().click()

    expect(exportLabel()).toBe('Export')
    expect(heading()).toBe('login')
    pick('png')
    await settle()

    expect(exportsAsked()).toEqual([[['path', '/D/S.puml'], ['format', 'png'], ['diagram[]', '2']]])
    expect(saved).toEqual([{ href: 'blob:export', name: 'S - login.png' }])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('exports what is checked, as a zip of them', async () => {
    await open(THREE)
    mode('Stack')
    check(2)
    check(1)

    expect(exportLabel()).toBe('Export 2')
    exportButton().click()
    expect(heading()).toBe('2 diagrams, as .zip')
    pick('svg')
    await settle()
    expect(exportsAsked()).toEqual([[['path', '/D/S.puml'], ['format', 'svg'], ['diagram[]', '2'], ['diagram[]', '3']]])
  })

  it('exports every diagram when nothing is checked', async () => {
    await open(THREE)
    mode('Wall')

    expect(exportLabel()).toBe('Export all')
    exportButton().click()
    expect(heading()).toBe('3 diagrams, as .zip')
    pick('txt')
    await settle()
    expect(exportsAsked()).toEqual([[['path', '/D/S.puml'], ['format', 'txt']]])
  })

  it('names a lone unnamed diagram after its file', async () => {
    await open('@startuml\nA -> B\n@enduml\n')
    exportButton().click()
    expect(heading()).toBe('S')
  })

  it('saves nothing when the export is refused, and says why', async () => {
    exportAnswer = () => new Response('{"problem":"The export is too large"}', { status: 413 })
    await open(THREE)
    exportButton().click()
    pick('png')
    await settle()

    expect(saved).toEqual([])
    expect(notice().hidden).toBe(false)
    expect(notice().textContent).toBe('The export is too large')
  })

  it('says it could not export for any other failure, and clears that on the next', async () => {
    exportAnswer = () => new Response('', { status: 404 })
    await open(THREE)
    exportButton().click()
    pick('png')
    await settle()
    expect(notice().textContent).toBe('Could not export the diagram')

    exportAnswer = () => new Response('BYTES', { status: 200 })
    exportButton().click()
    pick('png')
    await settle()
    expect(notice().hidden).toBe(true)
  })

  it("offers no Export when the file's share forbids download", async () => {
    seams.canDownload.mockResolvedValue(false)
    await open(THREE)
    expect(exportButton()).toBeNull()
  })

  it('offers Export when the share cannot be asked, and leaves it to the route', async () => {
    seams.canDownload.mockRejectedValue(new Error('PROPFIND failed'))
    await open(THREE)
    expect(exportButton()).not.toBeNull()
  })

  it("keeps a menu's Escape from the Viewer, for its own menu and the tabs' All diagrams", async () => {
    await open(Array.from({ length: 40 }, (_, i) => `@startuml d${i + 1}\n@enduml\n`).join(''))
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    try {
      exportButton().click()
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(root.querySelector('.plantuml-viewer__menu').hidden).toBe(true)

      // jsdom lays nothing out: make the strip overflow, as tabs.test.js does, then redraw it.
      const list = root.querySelector('[role="tablist"]')
      Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 4000 })
      Object.defineProperty(list, 'clientWidth', { configurable: true, value: 600 })
      root.querySelectorAll('[role="tab"]')[1].click()
      root.querySelector('.plantuml-editor__more-button').click()
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

      expect(root.querySelector('.plantuml-editor__menu').hidden).toBe(true)
      expect(seen).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', seen)
    }
  })
})

describe('Edit', () => {
  const edit = () => root.querySelector('.plantuml-viewer__edit').click()

  it('opens the editor at the open tab, the Viewer closed', async () => {
    await open(THREE)
    root.querySelectorAll('[role="tab"]')[1].click()
    edit()
    expect(window.OCA.Viewer.close).toHaveBeenCalled()
    expect(seams.openEditor).toHaveBeenCalledWith({ path: '/D/S.puml', basename: 'S.puml' }, { diagram: 1 })
  })

  it('opens at the first checked card', async () => {
    await open(THREE)
    mode('Stack')
    check(2)
    check(1)
    edit()
    expect(seams.openEditor).toHaveBeenCalledWith({ path: '/D/S.puml', basename: 'S.puml' }, { diagram: 1 })
  })

  it('opens at the first diagram when nothing is checked', async () => {
    await open(THREE)
    mode('Wall')
    edit()
    expect(seams.openEditor).toHaveBeenCalledWith({ path: '/D/S.puml', basename: 'S.puml' }, { diagram: 0 })
  })

  it('is not offered without a server', async () => {
    seams.serverConfigured = false
    await open(THREE)
    expect(root.querySelector('.plantuml-viewer__edit')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/js/viewer tests/js/save.test.js tests/js/files-helpers.test.js`
Expected: FAIL: `menu.js`, `exportUrl` and `canDownload` not found; Export does nothing.

- [ ] **Step 3: Implement**

`src/files-helpers.js`:

```js
/**
 * The export route for some diagrams of a file, by their positions from 1; none
 * is every diagram. `diagram[]` is PHP's repeatable parameter.
 *
 * @param {string} path
 * @param {string} format svg, png, pdf, eps or txt
 * @param {number[]} positions
 * @return {string}
 */
export function exportUrl(path, format, positions) {
  return OC.generateUrl(`/apps/${APP_ID}/export`) + '?path=' + encodeURIComponent(path) + '&format=' + format
    + positions.map((n) => `&diagram%5B%5D=${n}`).join('')
}
```

`src/editor/save.js`:

```js
const SHARE_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><nc:share-attributes/></d:prop></d:propfind>`

/**
 * Whether the file may be downloaded: false when it is on a share whose owner
 * forbids it, which Nextcloud tells as `nc:share-attributes` (FilesPlugin's
 * SHARE_ATTRIBUTES_PROPERTYNAME, the share's attributes as JSON). The server
 * refuses the same files (IncludeResolver::forbidsDownload).
 *
 * @param {string} path
 * @return {Promise<boolean>}
 */
export async function canDownload(path) {
  const { data } = await getClient().stat(getRootPath() + path, { details: true, data: SHARE_PROPFIND })
  const raw = data?.props?.['share-attributes']
  let attributes = raw
  if (typeof raw === 'string') {
    try {
      attributes = JSON.parse(raw)
    } catch {
      attributes = []
    }
  }
  return !(Array.isArray(attributes) && attributes.some((a) => a?.scope === 'permissions' && a?.key === 'download' && a?.value === false))
}
```

`src/viewer/sheets.js`: `export function jsonProblem(body)` (the function as it is, now exported).

`src/viewer/menu.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Export menu (VW6): a heading saying what is exported, then the formats.
 * A WAI-ARIA menu under its button, left edges aligned: ↑/↓, Home/End, Escape
 * back to the button, a click elsewhere closes it. The view's key guard keeps
 * its keys from the Viewer.
 */
import downloadIcon from '../../img/icons/download.svg?raw'

export function createMenu({ anchor, heading, items, onPick }) {
  const element = document.createElement('div')
  element.className = 'plantuml-viewer__menu'
  element.setAttribute('role', 'menu')
  element.hidden = true
  const title = document.createElement('div')
  title.className = 'plantuml-viewer__menu-heading'
  title.setAttribute('role', 'presentation')
  title.tabIndex = -1
  const buttons = items.map(({ label, value }) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'plantuml-viewer__menu-item'
    item.setAttribute('role', 'menuitem')
    item.tabIndex = -1
    item.dataset.value = value
    item.innerHTML = `<span class="plantuml-viewer__menu-icon" aria-hidden="true">${downloadIcon.trim()}</span><span class="plantuml-viewer__menu-label"></span>`
    item.lastElementChild.textContent = label
    item.addEventListener('click', () => {
      close()
      onPick(value)
    })
    return item
  })
  element.append(title, ...buttons)
  anchor.after(element)

  const outside = (event) => {
    if (!element.contains(event.target) && !anchor.contains(event.target)) {
      close(false)
    }
  }
  function open() {
    title.textContent = heading()
    element.style.left = `${anchor.offsetLeft}px`
    element.hidden = false
    anchor.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', outside, true)
    buttons[0].focus()
  }
  function close(refocus = true) {
    element.hidden = true
    anchor.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', outside, true)
    if (refocus) {
      anchor.focus()
    }
  }
  element.addEventListener('keydown', (event) => {
    const at = buttons.indexOf(document.activeElement)
    const next = { ArrowDown: (at + 1) % buttons.length, ArrowUp: (at - 1 + buttons.length) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key]
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (next !== undefined) {
      event.preventDefault()
      buttons[next].focus()
    }
  })
  return { open, close, destroy: () => { close(false); element.remove() } }
}
```

`src/viewer/diagram-view.js`, whole, replacing Task 8's (the header comment as Task 7's, plus "Export (VW6) and Edit (VW7) act on the open tab, or in Stack and Wall on the checked cards."):

```js
import { n, translate as t } from '@nextcloud/l10n'
import { loadState } from '@nextcloud/initial-state'
import { APP_ID, exportUrl } from '../files-helpers.js'
import { canDownload, loadFile } from '../editor/save.js'
import { label, scan } from '../editor/blocks.js'
import { createTabs } from '../editor/tabs.js'
import { openEditor } from '../open-editor.js'
import { createMenu } from './menu.js'
import { createSheets, jsonProblem } from './sheets.js'
import { createToolbar } from './toolbar.js'

const STAGE_ID = 'plantuml-viewer-stage'
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

function element(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}

// Each label a literal, so the translation tooling finds it.
const formats = () => [
  { label: t(APP_ID, 'SVG'), value: 'svg' },
  { label: t(APP_ID, 'PNG'), value: 'png' },
  { label: t(APP_ID, 'PDF'), value: 'pdf' },
  { label: t(APP_ID, 'EPS'), value: 'eps' },
  { label: t(APP_ID, 'ASCII art'), value: 'txt' },
]

/** The name a download is saved under: the UTF-8 one, else the plain one, from Content-Disposition. */
function filenameOf(disposition) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // Not percent-encoding after all: the plain name below.
    }
  }
  return /filename="([^"]*)"/i.exec(disposition ?? '')?.[1] ?? ''
}

export function createDiagramView(root, { path, basename, onReady }) {
  const state = { mode: 'tabs', active: 0, checked: new Set() }
  let diagrams = []
  let sheets = null
  let toolbar = null
  let menu = null
  let destroyed = false
  let ready = false
  const settle = () => {
    if (!ready && !destroyed) {
      ready = true
      onReady()
    }
  }

  const head = element('div', 'plantuml-viewer__head')
  const notice = element('p', 'plantuml-viewer__notice')
  notice.setAttribute('role', 'status')
  notice.hidden = true
  const tabBar = element('div', 'plantuml-viewer__tabbar')
  const stage = element('div', 'plantuml-viewer__stage')
  stage.id = STAGE_ID
  stage.setAttribute('aria-label', basename)
  const tabs = createTabs({ onActivate: (index) => { state.active = index; show() }, controls: STAGE_ID })
  tabBar.append(tabs.element)
  head.append(notice, tabBar)
  root.replaceChildren(head, stage)

  // The Viewer (NcModal) takes ←/→ for the previous and next file and Escape
  // for closing. Keys a tab strip or an open menu of ours used stop here.
  root.addEventListener('keydown', (event) => {
    const inMenu = event.target.closest?.('[role="menu"]')
    const inTabs = event.target.closest?.('[role="tablist"]')
    if ((MOVES.has(event.key) && (inMenu || inTabs)) || (event.key === 'Escape' && inMenu)) {
      event.stopPropagation()
    }
  })

  /** Positions from 1 of what Export and Edit act on; none in Stack or Wall is every diagram. */
  function chosen() {
    if (state.mode === 'tabs') {
      return [state.active + 1]
    }
    return [...state.checked].sort((a, b) => a - b).map((index) => index + 1)
  }

  function afterCheck() {
    const count = state.checked.size
    toolbar?.setExportLabel(state.mode === 'tabs' ? t(APP_ID, 'Export') : count === 0 ? t(APP_ID, 'Export all') : n(APP_ID, 'Export %n', 'Export %n', count))
  }

  function exportHeading() {
    const positions = chosen()
    const count = positions.length || diagrams.length
    if (count > 1) {
      return n(APP_ID, '%n diagrams, as .zip', '%n diagrams, as .zip', count)
    }
    const one = diagrams[(positions[0] ?? 1) - 1]
    return diagrams.length === 1 && !one.name ? basename.replace(/\.(?:puml|plantuml)$/i, '') : label(one)
  }

  function say(problem) {
    notice.textContent = problem
    notice.hidden = problem === ''
  }

  async function download(format) {
    say('')
    try {
      const res = await fetch(exportUrl(path, format, chosen()), { credentials: 'same-origin' })
      if (!res.ok) {
        say(jsonProblem(await res.text()) || t(APP_ID, 'Could not export the diagram'))
        return
      }
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = filenameOf(res.headers.get('Content-Disposition'))
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      say(t(APP_ID, 'Could not export the diagram'))
    }
  }

  function exportMenu() {
    menu ??= createMenu({ anchor: toolbar.exportButton, heading: exportHeading, items: formats(), onPick: download })
    menu.open()
  }

  function edit() {
    const index = state.mode === 'tabs' ? state.active : (chosen()[0] ?? 1) - 1
    window.OCA?.Viewer?.close()
    openEditor({ path, basename }, { diagram: index })
  }

  function card(index) {
    const node = element('div', 'plantuml-viewer__card')
    const caption = element('label', 'plantuml-viewer__caption')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = state.checked.has(index)
    box.addEventListener('change', () => {
      if (box.checked) {
        state.checked.add(index)
      } else {
        state.checked.delete(index)
      }
      node.classList.toggle('plantuml-viewer__card--checked', box.checked)
      afterCheck()
    })
    caption.append(box, label(diagrams[index]))
    node.classList.toggle('plantuml-viewer__card--checked', box.checked)
    node.append(caption, sheets.sheet(index + 1))
    // The caption is a <label>: a click on its text toggles the box, so it counts as the checkbox.
    node.addEventListener('click', (event) => {
      if (state.mode === 'wall' && !caption.contains(event.target)) {
        state.mode = 'tabs'
        state.active = index
        show()
      }
    })
    return node
  }

  function show() {
    toolbar?.setMode(state.mode)
    tabBar.hidden = state.mode !== 'tabs' || diagrams.length < 2
    stage.className = `plantuml-viewer__stage plantuml-viewer__stage--${state.mode}`
    if (state.mode === 'tabs') {
      tabs.update(diagrams, state.active)
      stage.replaceChildren(sheets.sheet(state.active + 1))
    } else {
      stage.replaceChildren(...diagrams.map((_diagram, index) => card(index)))
    }
    afterCheck()
  }

  function build({ exportable }) {
    toolbar = createToolbar({
      single: diagrams.length < 2,
      editable: loadState(APP_ID, 'server_configured', false),
      exportable,
      onMode: (mode) => { state.mode = mode; show() },
      onExport: exportMenu,
      onEdit: edit,
    })
    head.prepend(toolbar.element)
  }

  // A failed look at the share leaves Export to the route, which refuses what it must.
  Promise.all([loadFile(path), canDownload(path).catch(() => true)]).then(([{ content }, exportable]) => {
    if (destroyed) {
      return
    }
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { labelOf: (position) => label(diagrams[position - 1]) })
    build({ exportable })
    sheets.sheet(1).addEventListener('plantuml-viewer:settled', settle, { once: true })
    show()
  }, () => {
    if (destroyed) {
      return
    }
    const line = element('p', 'plantuml-viewer__problem')
    line.textContent = t(APP_ID, 'Could not draw the diagram')
    root.replaceChildren(line)
    settle()
  })

  return {
    destroy() {
      destroyed = true
      menu?.destroy()
      sheets?.destroy()
      tabs.destroy()
      root.replaceChildren()
    },
  }
}
```

Task 7's tests mock `save.js` with `loadFile` alone; with this file they need the `canDownload` seam above, which Step 1 adds to the whole test file.

`css/viewer.css`, added:

```css
.plantuml-viewer__toolbar {
  position: relative;
}

.plantuml-viewer__notice {
  margin: 0;
  color: #ffffff;
  font-size: 14px;
}

.plantuml-viewer__notice[hidden] {
  display: none;
}

.plantuml-viewer__menu {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 1;
  width: 260px;
  padding: 4px 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-main-background);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}

.plantuml-viewer__menu[hidden] {
  display: none;
}

.plantuml-viewer__menu-heading {
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 16px;
  color: var(--color-text-maxcontrast);
  font-size: 13px;
  font-weight: 600;
}

.plantuml-viewer__menu button.plantuml-viewer__menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 44px;
  margin: 0;
  padding: 0 12px 0 6px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--color-main-text);
  font-size: 15px;
  font-weight: 400;
}

.plantuml-viewer__menu button.plantuml-viewer__menu-item:hover,
.plantuml-viewer__menu button.plantuml-viewer__menu-item:focus-visible {
  background: var(--color-background-hover);
}

.plantuml-viewer__menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

.plantuml-viewer__menu-icon svg {
  width: 24px;
  height: 24px;
}
```

The notice sits first in the head, so the toolbar (prepended in `build`) stays above it: toolbar, notice, tab bar.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run && npm run lint`
Expected: PASS, Task 7's and Task 8's view tests included.

- [ ] **Step 5: Commit**

```bash
git add src/viewer src/editor/save.js src/files-helpers.js css/viewer.css tests/js/viewer tests/js/save.test.js tests/js/files-helpers.test.js
git commit -m "Viewer: export one diagram, the checked ones or all; edit the one in view"
```

### Task 10: The + New entry reads "New puml File"

Dr K, 2026-10-17: rename the + New entry from "UML Diagram" to `New puml File`. The file it makes keeps its name, `New diagram.puml`.

**Files:**
- Modify: `src/files.js:10` (the header comment) and `src/files.js:126` (`displayName`)
- Test: `tests/js/files.test.js` (header comment line 5, the `describe` at line 152, one new test)
- Modify: `README.md:55`, `features/AGENTS.md:277`, `docs/design/README.md:36`; `CHANGELOG.md` gets its line in Task 11

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the + New entry `plantuml-new` with `displayName` `New puml File`.

- [ ] **Step 1: Write the failing test**

In `tests/js/files.test.js`, rename the block `describe('+ New → UML Diagram', …)` to `describe('+ New → New puml File', …)`, change the header comment's "+ New → UML Diagram" to "+ New → New puml File", and add inside the block:

```js
  it('is labelled "New puml File", and still makes "New diagram.puml"', async () => {
    axios.post.mockResolvedValue({ data: {} })
    const entry = newEntries.find((e) => e.id === 'plantuml-new')

    expect(entry.displayName).toBe('New puml File')

    await newDiagram('/Diagrams')
    expect(axios.post.mock.calls[0][1]).toEqual({ filePath: '/Diagrams/New diagram.puml' })
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/js/files.test.js`
Expected: FAIL, `expected 'UML Diagram' to be 'New puml File'`.

- [ ] **Step 3: Rename the entry**

In `src/files.js`:

```js
  displayName: t(APP_ID, 'New puml File'),
```

and in the header comment, `"UML Diagram" in the + New menu` becomes `"New puml File" in the + New menu`. The `New diagram` name on the next lines stays as it is.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/js/files.test.js && npm run lint`
Expected: PASS.

- [ ] **Step 5: The copy elsewhere**

Replace "UML Diagram" with "New puml File" in `README.md:55` (`**+ New → New puml File** starts one, …`), `features/AGENTS.md:277` (`Choosing **New puml File** creates …`) and `docs/design/README.md:36` (`the + New menu, with New puml File`). Then, with the kb Penpot skills (`skill://penpot/penpot-router`), change the entry's text on the `overlay / new-menu` board of "NXT PlantUML" to `New puml File` and export it again over `docs/design/new-menu.png`. Run `grep -rn "UML Diagram" --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=dist --exclude-dir=.git . | grep -v "PlantUML Diagrams"`; expected: only `CHANGELOG.md`'s released entries, which stay as history.

- [ ] **Step 6: Commit**

```bash
git add src/files.js tests/js/files.test.js README.md features/AGENTS.md docs/design/README.md docs/design/new-menu.png
git commit -m "Files: the + New entry reads New puml File"
```

### Task 11: Build, live check and docs

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]`), `AGENTS.md` (repo map and routes row), `README.md` (one line), `features/AGENTS.md` (`#diagramsview` notes), `docs/design/README.md`
- Create: PNGs under `docs/design/`

- [ ] **Step 1: Build and measure**

Run: `npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js && gzip -c dist/plantuml-files.js | wc -c`
Expected: the guard passes; the Files bundle is at most 106000 bytes gzipped (91285 before this round). Over budget: name what came in, from the sourcemap `dist/plantuml-files.js.map`, in the report; do not raise the budget.

- [ ] **Step 2: Every suite**

Run: `composer run test:unit && composer run lint && composer run cs:check && composer run psalm && npx vitest run && npm run lint && bash tests/integration/bin/check-suites.sh && bash tests/integration/bin/check-notes-anchors.sh && bash tests/integration/bin/check-step-definitions.sh`
Expected: all pass.

- [ ] **Step 3: Deploy and check it live**

Deploy as AGENTS.md "Trying it on the live instance" says, and compare the md5 sums of this build's `dist/plantuml-*.js` with the pod's. In the shared `claudecode` selenium-flow browser (sign in with its `grafana` secret if it is signed out; never type a password), on a test file holding `nodes`, `login` and a three-page block:
- Tabs on open; a tab switch; the toolbar and tab bar not moving between a small and a tall diagram.
- Stack and Wall; a Wall click opening Tabs; checkboxes and Export's label.
- Each format downloading with its name (`workspace://files/downloads`), and a zip's entries.
- Edit from Tabs and from Stack landing on the right `@start` line.
- Escape in the open Export menu, and in the tab strip's "All diagrams" menu (a file of 40 diagrams), closing that menu, not the Viewer.
- ←/→, Home and End on a focused tab moving between tabs, never to the previous or next file. If the Viewer still sees them (it listens in the capture phase), the guard moves to a `document` capture listener scoped to the view's root, and Task 7's test follows.
- A refused export (stop the PlantUML server's route with a bad URL in `occ plantuml:set-url`, then set it back) saving nothing and showing the problem line.
- A file in a folder shared to the `selenium` user with download forbidden (share it from Dr K's account with "Allow download" off): no Export in the toolbar, and `GET /apps/plantuml/export?path=…&format=svg` answering 404 through an in-page `fetch`. Check `nc:share-attributes` arrives as the JSON string `canDownload` parses.
- A one-diagram file: no switch, no tabs.
- Light and dark themes; one screenshot per mode, compared with the boards.
- Arrowing to the next file in the folder: the neighbour draws only once shown.
- The + New menu reads New puml File and still makes `New diagram.puml`.

- [ ] **Step 4: Export the boards**

With the kb Penpot skills (`skill://penpot/penpot-router`), export `screens / viewer`, `screens / viewer-order-flow`, `screens / viewer-config`, `screens / viewer-stack`, `screens / viewer-wall`, `screens / viewer-single` and the six `overlay / export-menu-…` boards as PNGs into `docs/design/`, named as the existing ones (`viewer-stack.png`, `export-menu-all.png`, …), and list them in `docs/design/README.md`.

- [ ] **Step 5: Docs**

CHANGELOG, one user-facing line each: the + New entry reads New puml File; the Viewer shows every diagram as tabs, a stack or a wall; export to SVG, PNG, PDF, EPS or ASCII art, one diagram, the checked ones or all as a zip, except from a share that forbids download; Edit opens the editor at the diagram in view; `GET /render` takes `diagram`. AGENTS.md: the map gains `Diagrams`, `DiagramFiles`, `ExportController`, `src/viewer/`, `src/open-editor.js`; the routes row gains `/export`. README: one advertising line. `features/AGENTS.md`: the `diagram` parameter and export under the view notes. Leave the specs alone: their status flips wait until the other agent's edits are committed.

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md AGENTS.md README.md features/AGENTS.md docs/design
git commit -m "Docs: the Viewer round"
```
