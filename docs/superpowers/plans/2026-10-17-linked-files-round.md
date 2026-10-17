<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Linked-files round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a file a diagram links to (`<style file=./x.css>`, `!include ./x.puml`) opens in the editor in place of the source, saves exactly as the main file does, and the main file's diagram redraws live from its unsaved text.

**Architecture:**
- `POST /render` gains `overrides`: texts the include resolver reads in place of files it has already found readable. An overridden file keeps whatever access it had, and only files reached *through* override text lose the owner's view-only-share exemption.
- The editor's save machinery moves out of `editor.js` into one session per file (`file-session.js`), so the main file and a linked file each have their own ETag, autosave, watcher and conflict.
- One `EditorView` swaps between the main file's parked `EditorState`, kept whole (text, history, folds, selection), and the linked file's. Both are built on the same editor chrome (`extensions.js`).
- A `<style file=…>` target is read by the style profile alone, as one style body.

**Tech Stack:**
- PHP 8.4 / Nextcloud OCP: PHPUnit, and Behat in CI only.
- CodeMirror 6: `EditorView.setState`, view plugins, state effects, stream languages.
- WebDAV through `@nextcloud/files/dav`.
- vitest + jsdom.

**Spec:**
- `docs/superpowers/specs/2026-10-14-editor-design.md`: rows R9–R18 and the paragraph "Linked files (R9–R18)".
- `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`: the `POST /apps/plantuml/render` row (`overrides`) and the "Linked files (2026-10-17)" design row.
- Both spec files carry the other agent's uncommitted edits. Read them, never edit or stage them.
- The Gherkin is committed in `features/diagrams/edit.feature` (5f67c32, 2397d1d):
  - "A view-only folder cannot be read through a drawing of my own" (`@api @todo`);
  - "A linked file's unsaved text is drawn in place of the saved one" (`@api @unbuilt`);
  - "Unsaved text cannot stand in for a file that is not there" (`@api @unbuilt`);
  - "Unsaved text cannot read the rest of a view-only share" (`@api @unbuilt`).

**Built with (kb MCP skills):**
- `skill://superpowers/writing-plans/SKILL.md` and its `plan-document-reviewer-prompt.md`.
- `skill://superpowers/test-driven-development/SKILL.md` and `writing-good-tests.md`.
- `skill://penpot/penpot-router/SKILL.md`, read-only discovery only: `high_level_overview` and `shapeStructure` on the Penpot file "NXT PlantUML", page "Linked files", boards `screens / linked-main`, `linked-ctrl`, `linked-style` and `linked-include`. The design values and test fixtures below come from those boards.

## Global Constraints

- **Shared ground with the Viewer round** (planned order: Viewer → Linked files → Add diagram). The Viewer round adds `canDownload()` to `src/editor/save.js`, reading `nc:share-attributes` (string or parsed). If it is there when this round runs, `fileAccess` reuses its attribute parsing instead of a second copy; the Viewer round's `IncludeResolver::forbidsDownload()` is the same rule on the server.

- **Copy, verbatim.** Every string goes through `t(APP_ID, '…', { … })` with Nextcloud's `{name}` placeholders.
  - The chip's label and title: `Open <file name>`.
  - The back button's title: `Back to <main file>`.
  - The breadcrumb separator: `›`.
  - The lock's title: `Read only`.
  - The going-back prompt: `Discard unsaved changes?`.
  - Failures reuse the existing lines: `Could not open the file`, `Could not save the file`.
- **Only relative paths open:** `./x`, `../x`, or a bare name. Never `/…`, `<…>`, a `scheme://` URL, a path holding `$` or `%`, or `!import`. The forms are `<style file=…>`, `!include`, `!include_many`, `!include_once` and `!includesub path!X`, quoted paths too.
- **One level only (R14).** Chips and Ctrl/Cmd+click exist in the main file's state alone.
- **Limits.**
  - 1 MiB (1,048,576 bytes) per request, source plus every override text; past it, 413 `The diagram is too large to draw`.
  - The resolver's caps still hold: 1 MB in all, 64 files, 256 lookups.
  - At most 64 overrides; more is a 400.
- **View-only shares.**
  - Every override only replaces a file the resolver has found readable.
  - Files reached through override text never get the owner's-text exemption.
  - A file whose share forbids download gets no chip: `fileAccess` reads `nc:share-attributes` and answers null for it.
- **Design values, from the Penpot boards.**
  - Breadcrumb: a flex row, 8 px gap (`grid-baseline-2`), centred, 16 px Noto Sans. The main crumb is 400 weight in `--color-text-maxcontrast`. The `›` is in `--color-text-maxcontrast`. The linked name is 600 weight in `--color-main-text`.
  - Back button: 34 × 34 (`default-clickable-area`), pill radius, holding the 14 px close glyph in `--color-text-maxcontrast`. The glyph is the existing `img/icons/close.svg`.
  - Chip: a 16 × 16 box with a 12 px `code-tags` glyph in `--color-text-maxcontrast`, the chooser's own sizes. It sits 4 px after the line's last character: after the `>` of a `<style file=…>` line, after the path of an include line.
  - While Ctrl/Cmd is held over a path, the path's text is `--color-primary-element`, underlined, with a hand pointer.
- **The Add-diagram split button (`.plantuml-editor__add`)** is hidden while a linked file is open and shown again on going back (Dr K, 2026-10-17). The step that does this is conditional on the button existing when this round runs.
- Every colour is a Nextcloud variable. Icons are Material Design path data (Apache-2.0) in `img/icons/*.svg`, with the repo's header comment, drawn in `currentColor`. No new dependency.
- **Commands.**
  - PHP: `composer run test:unit`, `composer run psalm`, `composer run cs:check`, `php -l <file>`. Behat runs in CI only, never in a pod.
  - JS: `npx vitest run <file>`, `npm run lint`, `npm run build`.
  - The chunk guard: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`.
- **`.feature` files** (Dr K, 2026-10-17: "do touch .feature files and write the test definitions. I approve of them this round"): Task 1 removes `@todo` and `@unbuilt` from the four scenarios above and writes every step definition; a step's wording changes only if a definition truly needs it, with the reason in `features/AGENTS.md`.
- **House rules.**
  - The maintainer is Dr K, never a real name; SPDX `kubed-io`; no homelab hostnames in any file.
  - Branch `linked-files`.
  - Each commit body ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `POST /render` reads overrides in place of files the caller can read

**Files:**
- Modify: `lib/Service/IncludeResolver.php`: the `Context` psalm type (line 38), `expand()` (lines 108–128), `find()` (lines 447–497), `lookUp()` (lines 500–513), `inZip()` (lines 519–537), `viewOnly()` (lines 761–772).
- Modify: `lib/Controller/RenderController.php` (`bySource()`, lines 117–145).
- Modify: `appinfo/routes.php` (the comment on `render#bySource`).
- Modify: `features/diagrams/edit.feature` (status tags only, lines 87, 97, 104 and 110).
- Create: `tests/integration/bootstrap/Steps/LinkedFileSteps.php`.
- Modify: `tests/integration/bootstrap/Steps/ShareSteps.php`, `tests/integration/bootstrap/Steps/RenderApiSteps.php`, `tests/integration/bootstrap/FeatureContext.php`.
- Test: `tests/unit/IncludeResolverTest.php`, `tests/unit/RenderControllerTest.php`.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `IncludeResolver::expand(string $source, Folder $base, Folder $root, ?File $self = null, bool $ownersText = false, array $overrides = []): Expanded`, where `@param array<string, string> $overrides` maps a path as written to its text. A relative path resolves against `$base`; one starting `/` resolves from the root.
  - `RenderController::bySource(string $source = '', mixed $index = 0, string $path = '', mixed $overrides = null): Response`, and `RenderController::MAX_OVERRIDES = 64`.
  - The JSON body key is `overrides`.

- [ ] **Step 1: Write the failing resolver tests** (append to `IncludeResolverTest`):

```php
	/**
	 * @param array<string, string|File> $files
	 * @param array<string, string> $overrides
	 */
	private function expandWith(string $source, array $files, array $overrides, ?File $self = null, bool $ownersText = false, string $base = 'docs'): Expanded {
		[$folder, $root] = $this->tree($files, $base);
		return (new IncludeResolver())->expand($source, $folder, $root, $self, $ownersText, $overrides);
	}

	public function testAnOverrideReplacesAStyleFilesText(): void {
		$expanded = $this->expandWith("<style file=x.css>\n", ['docs/x.css' => "a {}\n"], ['x.css' => "b {}\n"]);

		self::assertSame("<style>\nb {}\n</style>\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testTwoSpellingsOfOneFileShareItsOverride(): void {
		$expanded = $this->expandWith("<style file=x.css>\n", ['docs/x.css' => "a {}\n"], ['./x.css' => "b {}\n"]);

		self::assertSame("<style>\nb {}\n</style>\n", $expanded->source);
	}

	public function testAnOverrideReachesAFileANestedIncludeNames(): void {
		$files = ['docs/a.puml' => "!include x.puml\n", 'docs/x.puml' => "A -> B\n"];

		$expanded = $this->expandWith("!include a.puml\n", $files, ['x.puml' => "C -> D\n"]);

		self::assertSame("C -> D\n", $expanded->source);
	}

	public function testAnOverrideForAMissingFileIsIgnored(): void {
		$expanded = $this->expandWith("<style file=x.css>\n", [], ['x.css' => "b {}\n"]);

		self::assertSame("<style file=x.css>\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot find x.css']], $expanded->mistakes);
	}

	public function testAnOverrideAboveTheRootIsIgnored(): void {
		$expanded = $this->expandWith("<style file=x.css>\n", ['docs/x.css' => "a {}\n"], ['../../x.css' => "b {}\n"]);

		self::assertSame("<style>\na {}\n</style>\n", $expanded->source);
	}

	public function testAnOverrideCannotOpenAViewOnlyFile(): void {
		$expanded = $this->expandWith("<style file=x.css>\n", ['docs/x.css' => $this->viewOnly()], ['x.css' => "b {}\n"]);

		self::assertStringNotContainsString('b {}', $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot read x.css']], $expanded->mistakes);
	}

	public function testAnOverrideOfTheDiagramItselfIsStillACycle(): void {
		$self = $this->file('docs/a.puml', "!include a.puml\n");

		$expanded = $this->expandWith("!include a.puml\n", ['docs/a.puml' => $self], ['a.puml' => "X -> Y\n"], $self);

		self::assertSame([['line' => 0, 'message' => 'a.puml includes itself']], $expanded->mistakes);
	}

	public function testAnOverrideCountsTowardTheMegabyte(): void {
		$expanded = $this->expandWith("<style file=x.css>\n", ['docs/x.css' => "a {}\n"], ['x.css' => str_repeat('a', 1048577)]);

		self::assertSame([['line' => 0, 'message' => 'x.css is past the limit of 1 MB in all']], $expanded->mistakes);
	}

	/**
	 * The owner's diagram on read-only share S, which forbids download, including
	 * its part beside it: `$overrides` as the editor sends them.
	 *
	 * @param array<string, string> $overrides
	 */
	private function drawnInShareWith(array $overrides): Expanded {
		$files = [
			'Shared/parts.puml' => $this->file('Shared/parts.puml', "Parts\n", null, $this->shareStorage(false)),
			'Shared/b.puml' => $this->file('Shared/b.puml', "beside\n", null, $this->shareStorage(false)),
		];
		$self = $this->file('Shared/a.puml', "!include parts.puml\n", null, $this->shareStorage(false, 'S', Constants::PERMISSION_READ));
		return $this->expandWith("!include parts.puml\n", $files, $overrides, $self, true, 'Shared');
	}

	/** The overridden part is the owner's file in the owner's share: it stays readable. */
	public function testAnOverriddenFileInTheShareStaysReadable(): void {
		$expanded = $this->drawnInShareWith(['parts.puml' => "New parts\n"]);

		self::assertSame("New parts\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	/** Override text is the caller's: what it names is read without the owner's exemption. */
	public function testOverrideTextCannotReadTheRestOfAViewOnlyShare(): void {
		$expanded = $this->drawnInShareWith(['parts.puml' => "!include b.puml\n"]);

		self::assertStringNotContainsString('beside', $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'In parts.puml, line 1: Cannot read b.puml']], $expanded->mistakes);
	}
```

- [ ] **Step 2: Run the resolver tests to verify they fail**

Run: `composer run test:unit -- --filter 'Override'`
Expected: FAIL. The stored text comes back in place of the override (`a {}` where `b {}` is expected, `Parts` where `New parts` is expected), and the share test finds no mistake.

- [ ] **Step 3: Write the minimal resolver change**

The psalm type gains `caller`, which is true when the lines come through override text:

```php
 * @psalm-type Context = array{dir: list<string>|null, zip: int|null, zipDir: list<string>, caller: bool}
```

A new property beside `$contents`:

```php
	/** @var array<string, true> ids of the files whose text the caller sent: what that text names is the caller's to read */
	private array $overridden = [];
```

In `expand()`, keep the `ownShare` line as it is. Before `walk()`, seed the overrides. Start the walk with `'caller' => false`:

```php
		foreach ($overrides as $written => $text) {
			$path = str_replace('\\', '/', (string)$written);
			if (preg_match('/[\x00-\x1f]/', $path) === 1) {
				continue;
			}
			$dir = str_starts_with($path, '/') ? [] : $run->baseDir;
			$segments = $dir === null ? null : self::resolve($dir, $path);
			if ($segments === null || $segments === []) {
				continue;
			}
			// read() takes contents by the found id, so only once lookUp() and viewOnly() have let the file through.
			$id = 'files:' . implode('/', $segments);
			$run->contents[$id] = $text;
			$run->overridden[$id] = true;
		}
		try {
			$run->walk(explode("\n", $source), ['dir' => $run->baseDir, 'zip' => null, 'zipDir' => [], 'caller' => false], 0, null, null);
```

In `find()`:
- the zip lookups pass `$context['caller']` to `inZip()`;
- the node cache key carries the caller, so a file looked up for the owner's text is not reused for the caller's;
- the found file's context says whether its own lines are the caller's.

```php
		$key = ($context['caller'] ? '!' : '') . $name;
		if (!array_key_exists($key, $this->nodes)) {
			// … the two cap checks as today …
			$this->nodes[$key] = $this->lookUp($name, $context['caller']);
		}
		$node = $this->nodes[$key];
		if (!$node instanceof File) {
			return $node;
		}
		$id = 'files:' . implode('/', $segments);
		return [
			'id' => $id,
			'display' => $this->display($segments),
			'context' => ['dir' => array_slice($segments, 0, -1), 'zip' => null, 'zipDir' => [], 'caller' => $context['caller'] || isset($this->overridden[$id])],
			'file' => $node,
			'zip' => null,
			'entry' => 0,
		];
```

`lookUp(string $name, bool $caller)` returns `$this->viewOnly($node, $caller) ? false : $node`. `inZip(int $n, array $dir, string $path, bool $caller)` puts `'caller' => $caller` in the context it returns. `viewOnly(File $file, bool $caller)`:

```php
				&& ($this->ownShare === null || $caller || self::shareOf($file) !== $this->ownShare);
```

Add `@param array<string, string> $overrides texts read in place of the files they name, once those are found readable` to `expand()`'s docblock.

- [ ] **Step 4: Run the resolver tests to verify they pass**

Run: `composer run test:unit -- --filter 'IncludeResolverTest'`
Expected: PASS, all of `IncludeResolverTest`.

- [ ] **Step 5: Write the failing controller tests** (append to `RenderControllerTest`):

```php
	private const STYLED = "@startuml\n<style file=x.css>\nA -> B\n@enduml\n";

	/** @return array<string, Node> */
	private function styledFiles(): array {
		return [
			'Diagrams/Order flow.puml' => $this->diagram('text/x-plantuml', self::STYLED),
			'Diagrams/x.css' => $this->diagram('text/plain', "a {}\n", 'css1'),
		];
	}

	public function testBySourceDrawsAnOverrideInPlaceOfTheFile(): void {
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $this->styledFiles())->bySource(self::STYLED, 0, '/Diagrams/Order flow.puml', ['./x.css' => "b {}\n"]);

		self::assertSame(200, $response->getStatus());
		self::assertSame("@startuml\n<style>\nb {}\n</style>\nA -> B\n@enduml\n", $sent);
	}

	public function testOverridesWithoutAPathAre400(): void {
		$response = $this->controller($this->renderingNothing(), new NotFoundException())->bySource(self::STYLED, 0, '', ['x.css' => 'b {}']);

		self::assertSame(400, $response->getStatus());
	}

	/** @return iterable<string, array{mixed}> */
	public static function malformedOverrides(): iterable {
		yield 'a list' => [['b {}']];
		yield 'a number for text' => [['x.css' => 1]];
		yield 'a string' => ['x.css'];
		yield 'sixty-five of them' => [array_fill_keys(array_map(static fn (int $n): string => "f$n.css", range(1, 65)), '')];
	}

	#[DataProvider('malformedOverrides')]
	public function testMalformedOverridesAre400(mixed $overrides): void {
		$response = $this->controller($this->renderingNothing(), $this->styledFiles())->bySource(self::STYLED, 0, '/Diagrams/Order flow.puml', $overrides);

		self::assertSame(400, $response->getStatus());
	}

	public function testASourceAndOverridesPastAMegabyteAre413(): void {
		$overrides = ['x.css' => str_repeat('a', RenderController::MAX_SOURCE - strlen(self::STYLED) + 1)];

		$response = $this->controller($this->renderingNothing(), $this->styledFiles())->bySource(self::STYLED, 0, '/Diagrams/Order flow.puml', $overrides);

		self::assertSame(413, $response->getStatus());
		self::assertSame(self::TOO_LARGE, $response->getData());
	}

	public function testNoOverridesIsTheSameAsAnEmptySet(): void {
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$this->controller($render, $this->styledFiles())->bySource(self::STYLED, 0, '/Diagrams/Order flow.puml', []);

		self::assertSame("@startuml\n<style>\na {}\n</style>\nA -> B\n@enduml\n", $sent);
	}
```

- [ ] **Step 6: Run the controller tests to verify they fail**

Run: `composer run test:unit -- --filter 'Override|AndOverrides'`
Expected: FAIL. PHP ignores the extra argument, so the stored `a {}` is sent, and the 400 and 413 tests get 200.

- [ ] **Step 7: Write the minimal controller change**

```php
	/** More overrides than the resolver could ever read (its 64 files) is no editor's request. */
	public const MAX_OVERRIDES = 64;

	#[NoAdminRequired]
	public function bySource(string $source = '', mixed $index = 0, string $path = '', mixed $overrides = null): Response {
		if (is_string($index) && preg_match('/^\d{1,3}$/', $index) === 1) {
			$index = (int)$index;
		}
		if (trim($source) === '' || !is_int($index) || $index < 0 || $index > 999) {
			return new Response(Http::STATUS_BAD_REQUEST);
		}
		$overrides ??= [];
		if (!is_array($overrides) || ($overrides !== [] && $path === '') || count($overrides) > self::MAX_OVERRIDES) {
			return new Response(Http::STATUS_BAD_REQUEST);
		}
		$bytes = strlen($source);
		foreach ($overrides as $written => $text) {
			// PHP keeps a JSON key "1" as the int 1, so a list is refused here too.
			if (!is_string($written) || !is_string($text)) {
				return new Response(Http::STATUS_BAD_REQUEST);
			}
			$bytes += strlen($text);
		}
		if ($bytes > self::MAX_SOURCE) {
			return $this->tooLarge();
		}
		// … the path branch as today, with $overrides as expand()'s sixth argument:
		//     $this->resolver->expand($source, $node->getParent(), $userFolder, $node, self::ownersText($node, $source), $overrides)
```

The routes comment becomes `// JSON {source, index?, path?, overrides?: {path as written: text}}`.

- [ ] **Step 8: Run all PHP checks**

Run: `composer run test:unit && php -l lib/Controller/RenderController.php && php -l lib/Service/IncludeResolver.php && composer run psalm && composer run cs:check`
Expected: every suite OK, psalm reports no errors, and cs:check reports no changes.

- [ ] **Step 9: Write the step definitions for the four scenarios.** They run against the committed text, verbatim.

`RenderApiSteps.php` gains two shared helpers. The existing `ShareSteps` Then is rewritten to use `assertMistake`, which keeps its message:

```php
	/**
	 * POST /render as the editor sends it: the file whose folder includes resolve against, and any
	 * linked file's unsaved text.
	 *
	 * @param array<string, string> $overrides
	 */
	private function renderWith(string $source, string $path, array $overrides = []): ResponseInterface {
		$body = ['source' => $source, 'index' => 0, 'path' => $path];
		if ($overrides !== []) {
			$body['overrides'] = $overrides;
		}
		return $this->httpClient()->post($this->baseUrl . '/index.php/apps/plantuml/render', [
			'json' => $body,
			'headers' => ['OCS-APIRequest' => 'true'],
		]);
	}

	/** The drawing's one mistake, as the routes send it: the message and the 0-based line. */
	private function assertMistake(string $expected, int $line): void {
		$response = $this->lastRenderResponse();
		$error = rawurldecode($response->getHeaderLine('X-PlantUML-Diagram-Error'));
		$at = $response->getHeaderLine('X-PlantUML-Diagram-Error-Line');
		if ($error !== $expected || $at !== (string)$line) {
			throw new \RuntimeException("expected '{$expected}' on line {$line}, got HTTP {$response->getStatusCode()}, error '{$error}', line '{$at}'");
		}
	}
```

`ShareSteps.php`:
- the existing file Given is split into helpers that the new folder Given shares;
- `theDrawingNamesTheIncludeAsOneItCannotRead()` becomes `$this->assertMistake("Cannot read {$this->sharedPath}", self::INCLUDE_LINE);`;
- `noneOfTheSharedFilesTextIsInIt()` gains the docblock line `@Then none of the notes file's text is in it`, one function under two phrasings;
- then add:

```php
	/** The folder in my files, as the share's target names it. */
	private string $sharedFolder = '';

	/** The colleague's diagram in that folder, as stored: the owner's own text. */
	private const SHARED_DIAGRAM = "@startuml\nlegend\n!include Parts.puml\nendlegend\n@enduml\n";

	/** @Given a colleague shared a text file with me that may be viewed but not downloaded */
	public function aColleagueSharedATextFileWithMeThatMayBeViewedButNotDownloaded(): void {
		$this->makeTheColleague();
		$this->colleaguePut('Figures.txt', 'Q4 ' . self::SHARED_WORD . "\n");
		$this->sharedPath = $this->shareWithMeViewOnly('/Figures.txt');
	}

	/** @Given a colleague shared a folder with me that may be viewed but not downloaded */
	public function aColleagueSharedAFolderWithMeThatMayBeViewedButNotDownloaded(): void {
		$this->makeTheColleague();
		$this->colleagueDav('MKCOL', 'Figures');
		$this->colleaguePut('Figures/About.md', "# Figures\n");
		$this->sharedFolder = $this->shareWithMeViewOnly('/Figures');
	}

	/** @Given the folder holds a text file */
	public function theFolderHoldsATextFile(): void {
		$this->colleaguePut('Figures/Figures.txt', 'Q4 ' . self::SHARED_WORD . "\n");
		// The include names it beside the drawing, so its mistake names it so.
		$this->sharedPath = 'Figures.txt';
	}

	/** @When I draw my own diagram that includes that file, beside a file in that folder */
	public function iDrawMyOwnDiagramThatIncludesThatFileBesideAFileInThatFolder(): void {
		// The include is the third line (INCLUDE_LINE), as the reused Then reads it.
		$this->renderResponse = $this->renderWith("@startuml\nlegend\n!include {$this->sharedPath}\nendlegend\n@enduml\n", "{$this->sharedFolder}/About.md");
	}

	/** @Given the folder holds a diagram, a part it includes and a notes file */
	public function theFolderHoldsADiagramAPartItIncludesAndANotesFile(): void {
		$this->colleaguePut('Figures/Flow.puml', self::SHARED_DIAGRAM);
		$this->colleaguePut('Figures/Parts.puml', "Parts\n");
		$this->colleaguePut('Figures/Notes.txt', 'Q4 ' . self::SHARED_WORD . "\n");
	}

	/** @When the diagram is drawn with new text for that part that includes the notes file */
	public function theDiagramIsDrawnWithNewTextForThatPartThatIncludesTheNotesFile(): void {
		$this->renderResponse = $this->renderWith(self::SHARED_DIAGRAM, "{$this->sharedFolder}/Flow.puml", ['Parts.puml' => "!include Notes.txt\n"]);
	}

	/** @Then the drawing names the notes file as one it cannot read */
	public function theDrawingNamesTheNotesFileAsOneItCannotRead(): void {
		$this->assertMistake('In Parts.puml, line 1: Cannot read Notes.txt', self::INCLUDE_LINE);
	}

	private function makeTheColleague(): void {
		// Left behind by a run that died before its cleanup.
		$this->removeTheColleague();
		$this->colleaguePass = 'Pu-' . bin2hex(random_bytes(12));
		$this->ocsAs($this->adminUser, $this->adminPass, 'POST', 'cloud/users', ['userid' => self::COLLEAGUE, 'password' => $this->colleaguePass]);
	}

	private function colleagueDav(string $method, string $path, string $body = ''): void {
		$status = (new Client([
			'base_uri' => $this->baseUrl . '/remote.php/dav/files/' . self::COLLEAGUE . '/',
			'auth' => [self::COLLEAGUE, $this->colleaguePass],
			'http_errors' => false,
		]))->request($method, $path, $body === '' ? [] : ['body' => $body])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("{$method} {$path} as the colleague answered HTTP {$status}");
		}
	}

	private function colleaguePut(string $path, string $body): void {
		$this->colleagueDav('PUT', $path, $body);
	}

	/** Shares the colleague's `$path` with me, read only and no download; where it is in my files. */
	private function shareWithMeViewOnly(string $path): string {
		$share = $this->ocsAs(self::COLLEAGUE, $this->colleaguePass, 'POST', 'apps/files_sharing/api/v1/shares', [
			'path' => $path,
			'shareType' => 0,
			'shareWith' => $this->adminUser,
			'permissions' => 1,
			'attributes' => '[{"scope":"permissions","key":"download","value":false}]',
		]);
		$id = (string)($share['id'] ?? '');
		// A server set not to accept shares by itself lists it as pending.
		foreach ($this->ocsAs($this->adminUser, $this->adminPass, 'GET', 'apps/files_sharing/api/v1/shares/pending') as $pending) {
			if ((string)($pending['id'] ?? '') === $id) {
				$this->ocsAs($this->adminUser, $this->adminPass, 'POST', "apps/files_sharing/api/v1/shares/pending/{$id}");
			}
		}
		foreach ($this->ocsAs($this->adminUser, $this->adminPass, 'GET', 'apps/files_sharing/api/v1/shares', ['shared_with_me' => 'true']) as $received) {
			if ((string)($received['id'] ?? '') === $id) {
				return (string)$received['file_target'];
			}
		}
		throw new \RuntimeException("share {$id} is not among the shares I received");
	}
```

`LinkedFileSteps.php` (new), added to `FeatureContext` as `use LinkedFileSteps;` in alphabetical order:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

/**
 * A linked file open in the editor, drawn before it is saved: the source as
 * stored, with the linked file's new text sent beside it.
 */
trait LinkedFileSteps {
	private const STYLED = "@startuml\n<style file=Styled.css>\nAlice -> Bob : StyledMarker\n@enduml\n";
	private const OLD_STYLE = "arrow {\n  LineColor #000000\n}\n";
	private const NEW_STYLE = "arrow {\n  LineColor #12AB34\n}\n";
	private const GHOST = "@startuml\nlegend\n!include Absent.puml\nendlegend\n@enduml\n";

	/** @Given I have a diagram that takes its style from a file beside it */
	public function iHaveADiagramThatTakesItsStyleFromAFileBesideIt(): void {
		$this->diagramPath = 'Diagrams/Styled.puml';
		$this->putFile('Diagrams', 'Styled.puml', self::STYLED);
		$this->putFile('Diagrams', 'Styled.css', self::OLD_STYLE);
	}

	/** @When the diagram is drawn with new text for that style file */
	public function theDiagramIsDrawnWithNewTextForThatStyleFile(): void {
		$this->renderResponse = $this->renderWith(self::STYLED, '/' . $this->diagramPath, ['Styled.css' => self::NEW_STYLE]);
	}

	/** @Then the drawing uses the new text */
	public function theDrawingUsesTheNewText(): void {
		$response = $this->lastRenderResponse();
		$this->assertSvg($response, 'StyledMarker');
		if (stripos((string)$response->getBody(), '#12AB34') === false) {
			throw new \RuntimeException('the drawing does not use the new LineColor #12AB34');
		}
	}

	/** @Then the style file is unchanged */
	public function theStyleFileIsUnchanged(): void {
		$this->assertFileHolds('Diagrams/Styled.css', self::OLD_STYLE);
	}

	/** @Given I have a diagram that includes a file beside it that does not exist */
	public function iHaveADiagramThatIncludesAFileBesideItThatDoesNotExist(): void {
		$this->diagramPath = 'Diagrams/Ghost.puml';
		$this->putFile('Diagrams', 'Ghost.puml', self::GHOST);
	}

	/** @When the diagram is drawn with text for that missing file */
	public function theDiagramIsDrawnWithTextForThatMissingFile(): void {
		$this->renderResponse = $this->renderWith(self::GHOST, '/' . $this->diagramPath, ['Absent.puml' => "Ghost\n"]);
	}

	/** @Then the drawing names the include as one it cannot find */
	public function theDrawingNamesTheIncludeAsOneItCannotFind(): void {
		$this->assertMistake('Cannot find Absent.puml', 2);
	}
}
```

In `features/diagrams/edit.feature`, change exactly four tag lines: line 87 `@api @todo` → `@api`; lines 97, 104 and 110 `@api @unbuilt` → `@api`.

Run: `bash tests/integration/bin/check-step-definitions.sh && bash tests/integration/bin/check-suites.sh && php -l tests/integration/bootstrap/Steps/LinkedFileSteps.php && php -l tests/integration/bootstrap/Steps/ShareSteps.php && php -l tests/integration/bootstrap/Steps/RenderApiSteps.php && git diff --stat features/`
Expected:
- both checks print OK;
- each `php -l` prints `No syntax errors detected`;
- the feature diff is `1 file changed, 4 insertions(+), 4 deletions(-)`.

Behat itself runs in CI.

- [ ] **Step 10: Commit**

```bash
git add lib/Service/IncludeResolver.php lib/Controller/RenderController.php appinfo/routes.php tests/unit/IncludeResolverTest.php tests/unit/RenderControllerTest.php features/diagrams/edit.feature tests/integration/bootstrap/FeatureContext.php tests/integration/bootstrap/Steps/LinkedFileSteps.php tests/integration/bootstrap/Steps/ShareSteps.php tests/integration/bootstrap/Steps/RenderApiSteps.php
git commit -m "Render: a linked file's unsaved text draws in place of the saved one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: One save machine per file (refactor, no behaviour change)

**Files:**
- Create: `src/editor/file-session.js`.
- Modify: `src/editor.js`. The state at lines 119–129, and the code at lines 140–198, 223–247 and 341–474 (`save`, `reload`, `check`, `saveAsCopy`, `saveBeforeClose`), move out.
- Test: `tests/js/file-session.test.js` (new). `tests/js/editor.test.js` stays green and unchanged.

**Interfaces:**
- Consumes: `loadFile`, `currentEtag`, `saveFile`, `saveCopy` and `ConflictError` (`save.js`), `createAutosave` (`autosave.js`), `watchFile` (`watch.js`).
- Produces:

```js
/** A change that came from the file (Reload, a change taken in), not the keyboard. */
export const fromFile = Annotation.define()

/**
 * @param {object} options
 * @param {string} options.path the file, in the user's folder
 * @param {string} options.etag what it was read at
 * @param {() => import('@codemirror/state').Text} options.doc the file's live text, shown or parked
 * @param {(content: string, opts: {history: boolean}) => void} options.replace writes the file's text into that live text
 * @param {() => void} options.onChange its state changed; the bar redraws if it shows this file
 * @param {(node: import('@nextcloud/files').Node) => void} [options.onCopied] after Save as copy (S8)
 * @param {boolean} [options.readOnly] never written (R17)
 */
export function createFileSession({ path, etag, doc, replace, onChange, onCopied = () => {}, readOnly = false })
// returns {
//   get path(): string, get copied(): boolean, readOnly: boolean,
//   isDirty(): boolean, blocked(): boolean, fail(message: string): void,
//   status(): { state: 'saving'|'unsaved'|'saved', title: string, line: string, conflict: boolean, busy: boolean },
//   edited(): void, save(): Promise<void>, reload(): Promise<void>, check(): Promise<void>, saveAsCopy(): Promise<void>,
//   saveBeforeLeaving(): Promise<void>, start(): void, pause(): void, resume(): Promise<void>, stop(): void,
// }
```

- In `editor.js`:
  - `let parked = null`. It stays null until Task 6.
  - `mainState(): EditorState` is `parked?.state ?? view.state`.
  - `toMain(spec): void` updates `parked.state` when parked, else `view.dispatch(spec)`.
  - `replaceWith(state, dispatch, content, { history })` diffs against `state.doc` and dispatches with `fromFile.of(true)`, plus `Transaction.addToHistory.of(false)` when `history` is false.

- [ ] **Step 1: Write the failing tests**

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from '@codemirror/state'

const seams = vi.hoisted(() => {
  class ConflictError extends Error {}
  return { ConflictError, loadFile: vi.fn(), currentEtag: vi.fn(), saveFile: vi.fn(), saveCopy: vi.fn(), watchFile: vi.fn() }
})
vi.mock('../../src/editor/save.js', () => ({
  ConflictError: seams.ConflictError, loadFile: seams.loadFile, currentEtag: seams.currentEtag, saveFile: seams.saveFile, saveCopy: seams.saveCopy,
}))
vi.mock('../../src/editor/watch.js', () => ({ watchFile: seams.watchFile }))

const { createFileSession } = await import('../../src/editor/file-session.js')

function session(options = {}) {
  let text = Text.of(['@startuml', '@enduml'])
  const s = createFileSession({
    path: '/Diagrams/UML_Fun.css', etag: '"e1"',
    doc: () => text, replace: (content) => { text = Text.of(content.split('\n')) }, onChange: () => {}, ...options,
  })
  return { s, type: (content) => { text = Text.of(content.split('\n')); s.edited() } }
}

beforeEach(() => {
  vi.resetAllMocks()
  seams.watchFile.mockReturnValue({ stop: vi.fn() })
})

describe('a file session', () => {
  it('starts saved, as the text it was read with', () => {
    const { s } = session()

    expect(s.isDirty()).toBe(false)
    expect(s.status().state).toBe('saved')
  })

  it('saves the live text against the ETag it was read at', async () => {
    seams.saveFile.mockResolvedValue('"e2"')
    const { s, type } = session()
    type('a {}')

    await s.save()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', 'a {}', '"e1"')
    expect(s.status().state).toBe('saved')
  })

  it('stops at a conflict until it is resolved', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    const { s, type } = session()
    type('a {}')

    await s.save()
    type('b {}')
    await vi.advanceTimersByTimeAsync(31000)

    expect(s.status().conflict).toBe(true)
    expect(s.blocked()).toBe(true)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('stops watching while paused, and looks at once when resumed', async () => {
    seams.currentEtag.mockResolvedValue('"e1"')
    const stop = vi.fn()
    seams.watchFile.mockReturnValue({ stop })
    const { s } = session()
    s.start()

    s.pause()
    await s.resume()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(seams.watchFile).toHaveBeenCalledTimes(2)
    expect(seams.currentEtag).toHaveBeenCalledWith('/Diagrams/UML_Fun.css')
  })

  it('never writes a read-only file', async () => {
    const { s, type } = session({ readOnly: true })
    type('a {}')

    await s.save()

    expect(seams.saveFile).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/js/file-session.test.js`
Expected: FAIL with `Failed to load url ../../src/editor/file-session.js`.

- [ ] **Step 3: Move the code into `src/editor/file-session.js`**

These move verbatim into the closure of `createFileSession`:
- the state `etag`, `savedAt`, `conflict`, `failure`, `notice`, `running`, `quiet`, `watcher`, and `closing` (renamed `leaving`) and `closed` (renamed `stopped`);
- `IDLE_MS`, `MAX_WAIT_MS`, `MINUTE`, `CLOSE_WAIT_MS`;
- `savedTitle`, `markSaved`, `enterConflict`, `exclusively`, the autosave, `save`, `reload`, `check` and `saveAsCopy`;
- `saveBeforeClose`, renamed `saveBeforeLeaving`.

Initialise `let saved = doc()`, so a new session is clean. Then make exactly these substitutions:

| In `editor.js` | In `file-session.js` |
|---|---|
| `view.state.doc` | `doc()` |
| `replaceWith(x)`, `replaceWith(x, { history: false })` | `replace(x, { history: true })`, `replace(x, { history: false })` |
| `currentPath` | `path` (a `let`; Save as copy reassigns it and sets `copied = true`) |
| `showState()`, `showButtons()` | `onChange()` |
| `fail(m)` | `failure = m; onChange()`, exported as `fail` |
| the copy's title, aria and `nameConfig` updates | `onCopied(copy.node)` |
| `closed` and `closing` checks | `stopped` and `leaving` checks |

Then add the new parts:

```js
  const isDirty = () => !readOnly && !doc().eq(saved)

  function status() {
    const busy = running !== null && !quiet
    const state = busy ? 'saving' : isDirty() ? 'unsaved' : 'saved'
    return {
      state, busy, conflict,
      title: state === 'saved' ? savedTitle() : t(APP_ID, 'Unsaved changes'),
      line: failure || (conflict ? t(APP_ID, 'Someone else changed this file') : notice),
    }
  }

  function edited() {
    failure = notice = ''
    if (!conflict && !readOnly) autosave.schedule()
    onChange()
  }

  const start = () => { watcher = watchFile({ check }) }
  const pause = () => { watcher?.stop(); watcher = null }
  const resume = () => { start(); return check() }
  function stop() { stopped = true; pause(); autosave.cancel() }
```

`save()` returns at once when `readOnly`.

In `editor.js`:
- Inside `loadFile(...).then(...)`, once `view` exists:

  ```js
  main = {
    name,
    session: createFileSession({
      path: currentPath, etag: loadedEtag,
      doc: () => mainState().doc,
      replace: (content, opts) => replaceWith(mainState(), toMain, content, opts),
      onChange: showState,
      onCopied: renamedMain,
    }),
  }
  ```

  Then call `main.session.start()` in place of `watcher = watchFile({ check })`. `renamedMain(node)` takes over the copy's title, aria-label and `nameConfig` lines from today's `saveAsCopy`.
- `showButtons()` and `showState()` render `main?.session.status()`: `saveButton.dataset.state` and `.title`, `status.textContent`, and the Reload and Save-as-copy buttons' `hidden` and `disabled`. Before the file loads there is no session, and they leave the bar as it is.
- The first `loadFile` rejecting has no session yet, so its branch sets `status.textContent = t(APP_ID, 'Could not open the file')` directly. The existing test of that line holds.
- The update listener calls `main.session.edited()` on `docChanged`.
- `close()` uses `main.session.saveBeforeLeaving()`, `blocked()` and `isDirty()`, then `main.session.stop()`.
- The bar's buttons and Mod-s call `main.session.save()`, `reload()` and `saveAsCopy()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/js/file-session.test.js tests/js/editor.test.js && git diff --stat tests/js/editor.test.js`
Expected: PASS, both files, and an empty diff for `editor.test.js`.

- [ ] **Step 5: Commit**

```bash
git add src/editor/file-session.js src/editor.js tests/js/file-session.test.js
git commit -m "Editor: each file has its own save machine" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Which lines link a file, and whether it is there

**Files:**
- Create: `src/editor/paths.js`.
- Create: `src/editor/linked/links.js`.
- Modify: `src/editor/completion/local-files.js`. Its `folderOf`, at lines 97–121, moves to `paths.js` and is imported back.
- Modify: `src/editor/save.js` (add `fileAccess`).
- Modify: `tests/js/editor.test.js`:
  - add `fileAccess: vi.fn()` to `seams` and `fileAccess: seams.fileAccess` to the `save.js` mock;
  - in the outer `beforeEach`, after `vi.resetAllMocks()`, add `seams.fileAccess.mockResolvedValue(null)`.
- Test: `tests/js/links.test.js` (new), `tests/js/save.test.js`.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `folderOf(file: string, dir: string): string|null`, behaviour unchanged.
  - `resolveLinked(file: string, written: string): string|null`.
  - `linkOn(lineText: string): Link|null`, where `Link = { kind: 'style'|'include', written: string, from: number, to: number, section: string|null, block: string|null }`. `from` and `to` are the columns of the path, without its quotes.
  - `fileAccess(path: string): Promise<{ writable: boolean }|null>`. Null for a missing file, a folder, a refusal (403 or 404), or a share that forbids download.

- [ ] **Step 1: Write the failing tests** (`tests/js/links.test.js`):

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { linkOn } from '../../src/editor/linked/links.js'
import { resolveLinked } from '../../src/editor/paths.js'

describe('linkOn', () => {
  it.each([
    ['<style file=./UML_Fun.css>', { kind: 'style', written: './UML_Fun.css', from: 12, to: 25, section: null, block: null }],
    ['!include ./UML_Fun_parts.puml', { kind: 'include', written: './UML_Fun_parts.puml', from: 9, to: 29, section: null, block: null }],
    ['  !include_once parts.puml', { kind: 'include', written: 'parts.puml', from: 16, to: 26, section: null, block: null }],
    ['!includesub ./UML_Fun_parts.puml!NAME', { kind: 'include', written: './UML_Fun_parts.puml', from: 12, to: 32, section: 'NAME', block: null }],
    ['!include "./a b.puml"!2', { kind: 'include', written: './a b.puml', from: 10, to: 20, section: null, block: '2' }],
    ['!include_many ../shared/x.puml!login', { kind: 'include', written: '../shared/x.puml', from: 14, to: 30, section: null, block: 'login' }],
  ])('reads %s', (line, link) => {
    expect(linkOn(line)).toEqual(link)
  })

  it.each([
    '!include /x.puml', '!include <C4/C4_Container>', '!include https://example.com/x.puml',
    '!include $DIR/x.puml', '!include %dirpath()%/x.puml', '!import ./lib.zip', '!includesub ./parts.puml',
    '<style file=/abs.css>', "' !include ./x.puml", 'participant Shop',
  ])('opens nothing for %s', (line) => {
    expect(linkOn(line)).toBeNull()
  })
})

describe('resolveLinked', () => {
  it('resolves against the file\'s folder', () => {
    expect(resolveLinked('/Diagrams/a.puml', './x.css')).toBe('/Diagrams/x.css')
    expect(resolveLinked('/Diagrams/a.puml', '../x.css')).toBe('/x.css')
    expect(resolveLinked('/Diagrams/a.puml', 'sub/y.puml')).toBe('/Diagrams/sub/y.puml')
  })

  it('refuses a path above the root', () => {
    expect(resolveLinked('/a.puml', '../x.css')).toBeNull()
  })
})
```

In `tests/js/save.test.js`, add `fileAccess` to the top-level `const { ConflictError, currentEtag, … } = await import('../../src/editor/save.js')` line, then append:

```js
describe('fileAccess', () => {
  beforeEach(() => vi.resetAllMocks())

  it('says a file is there and whether it may be written', async () => {
    client.stat.mockResolvedValueOnce({ data: { type: 'file', props: { permissions: 'RGDNVW' } } })
      .mockResolvedValueOnce({ data: { type: 'file', props: { permissions: 'SG' } } })

    await expect(fileAccess('/Diagrams/UML_Fun.css')).resolves.toEqual({ writable: true })
    await expect(fileAccess('/Shared/UML_Fun.css')).resolves.toEqual({ writable: false })
    expect(client.stat.mock.calls[0][0]).toBe('/files/drk/Diagrams/UML_Fun.css')
    expect(client.stat.mock.calls[0][1].data).toContain('<oc:permissions/>')
    expect(client.stat.mock.calls[0][1].data).toContain('<nc:share-attributes/>')
  })

  it('answers null for a file whose share forbids download', async () => {
    client.stat.mockResolvedValue({ data: { type: 'file', props: { permissions: 'SG', 'share-attributes': '[{"scope":"permissions","key":"download","value":false}]' } } })

    await expect(fileAccess('/Shared/UML_Fun.css')).resolves.toBeNull()
  })

  it.each([403, 404])('answers null for a %s', async (status) => {
    client.stat.mockRejectedValue(davError(status))

    await expect(fileAccess('/Diagrams/missing.css')).resolves.toBeNull()
  })

  it('answers null for a folder', async () => {
    client.stat.mockResolvedValue({ data: { type: 'directory', props: { permissions: 'RGDNVCK' } } })

    await expect(fileAccess('/Diagrams')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/js/links.test.js tests/js/save.test.js`
Expected: FAIL. `links.js` and `paths.js` cannot be loaded, and `fileAccess is not a function`.

- [ ] **Step 3: Write the minimal implementation**

`src/editor/paths.js` (SPDX header; `folderOf` moved here unchanged):

```js
/**
 * The path `written` names beside `file`, as the resolver reads it; null above the root.
 *
 * @param {string} file the edited file's path
 * @param {string} written the path as a line writes it
 */
export function resolveLinked(file, written) {
  const slash = written.lastIndexOf('/')
  const folder = folderOf(file, written.slice(0, slash + 1))
  return folder === null ? null : `${folder === '/' ? '' : folder}/${written.slice(slash + 1)}`
}
```

`src/editor/linked/links.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lines that link a file beside the diagram (R9): `<style file=…>` and the
 * includes, read as the resolver reads them, only for a relative path.
 */
const STYLE = /^([ \t]*<style\s+file\s*=\s*)(?:"([^"]*)"|([^\s">]+))\s*>\s*$/i
const INCLUDE = /^([ \t]*!include(_many|_once|sub)?[ \t]+)(?:"([^"]*)"(.*)|([^\s!]+)(.*))$/

const relative = (path) => path !== '' && !path.startsWith('/') && !path.startsWith('<')
  && !/^[a-z][a-z0-9+.-]*:\/\//i.test(path) && !/[$%]/.test(path)

/** @return {{kind: 'style'|'include', written: string, from: number, to: number, section: string|null, block: string|null}|null} */
export function linkOn(lineText) {
  const style = STYLE.exec(lineText)
  if (style) {
    const written = style[2] ?? style[3]
    const from = style[1].length + (style[2] !== undefined ? 1 : 0)
    return relative(written) ? { kind: 'style', written, from, to: from + written.length, section: null, block: null } : null
  }
  const include = INCLUDE.exec(lineText.trimEnd())
  if (!include) return null
  const quoted = include[3] !== undefined
  const written = quoted ? include[3] : include[5]
  const rest = (quoted ? include[4] : include[6]).trim()
  const selector = rest.startsWith('!') && rest.length > 1 ? rest.slice(1) : null
  if (!relative(written) || (rest !== '' && selector === null) || /[$%]/.test(selector ?? '')) return null
  const sub = include[2] === 'sub'
  if (sub && selector === null) return null
  const from = include[1].length + (quoted ? 1 : 0)
  return { kind: 'include', written, from, to: from + written.length, section: sub ? selector : null, block: sub ? null : selector }
}
```

Add to `src/editor/save.js`:

```js
const ACCESS_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:resourcetype/><oc:permissions/><nc:share-attributes/></d:prop></d:propfind>`

/** A share's attributes, as Sabre sends them (JSON text); unreadable ones are taken as forbidding. */
function downloadable(attributes) {
  if (attributes === undefined || attributes === null || attributes === '') return true
  try {
    const list = typeof attributes === 'string' ? JSON.parse(attributes) : attributes
    return Array.isArray(list) && !list.some((a) => a?.scope === 'permissions' && a?.key === 'download' && a?.value === false)
  } catch {
    return false
  }
}

/**
 * Whether a file is there to open beside the diagram, and whether the caller may write it (R9, R17).
 *
 * @param {string} path
 * @return {Promise<{writable: boolean}|null>} null when it is missing, a folder, refused, or may not be downloaded
 */
export async function fileAccess(path) {
  let stat
  try {
    stat = await getClient().stat(getRootPath() + path, { data: ACCESS_PROPFIND, details: true })
  } catch (e) {
    if (e?.status === 403 || e?.status === 404) return null
    throw e
  }
  const props = stat.data.props ?? {}
  if (stat.data.type === 'directory' || !downloadable(props['share-attributes'])) return null
  return { writable: String(props.permissions ?? '').includes('W') }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/js/links.test.js tests/js/save.test.js tests/js/completion.test.js tests/js/editor.test.js`
Expected: PASS, all four.

- [ ] **Step 5: Commit**

```bash
git add src/editor/paths.js src/editor/linked/links.js src/editor/completion/local-files.js src/editor/save.js tests/js/links.test.js tests/js/save.test.js tests/js/editor.test.js
git commit -m "Editor: which lines link a file beside the diagram" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: The `<>` chip and Ctrl/Cmd+click (R9, R10, R14)

**Files:**
- Create: `src/editor/linked/chips.js`.
- Modify: `src/editor/theme.js`, with rules beside `.cm-plantuml-chooser` at line 392.
- Test: `tests/js/chips.test.js` (new).

**Interfaces:**
- Consumes: `linkOn` (Task 3), `resolveLinked` (Task 3), `fileAccess` (Task 3), `filePath` (`lint/state.js`).
- Produces: `linkedChips(open: (link: Link & { path: string }) => void): Extension[]`. The editor adds it to the main file's state only (Task 6).

- [ ] **Step 1: Write the failing tests**

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const seams = vi.hoisted(() => ({ fileAccess: vi.fn() }))
vi.mock('../../src/editor/save.js', () => ({ fileAccess: seams.fileAccess }))
const { linkedChips } = await import('../../src/editor/linked/chips.js')
const { filePath } = await import('../../src/editor/lint/state.js')

const MAIN = '@startuml order-flow\n<style file=./UML_Fun.css>\n!include ./UML_Fun_parts.puml\n@enduml\n'
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const press = (target, init) => {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
let view

async function editor(open = vi.fn(), doc = MAIN) {
  view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [filePath.of('/Diagrams/Order flow.puml'), linkedChips(open)] }) })
  await settle()
  return open
}

beforeEach(() => {
  vi.resetAllMocks()
  seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: true } : null))
})
afterEach(() => {
  view?.destroy()
  vi.restoreAllMocks()
})

describe('the linked-file chip', () => {
  it('appears once its file answers, named for its file', async () => {
    await editor()

    const chips = view.dom.querySelectorAll('button.cm-plantuml-link-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].getAttribute('aria-label')).toBe('Open UML_Fun.css')
    expect(chips[0].title).toBe('Open UML_Fun.css')
    expect(chips[0].querySelector('svg')).not.toBeNull()
  })

  it('opens the file it names', async () => {
    const open = await editor()

    press(view.dom.querySelector('button.cm-plantuml-link-chip'))

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'style', written: './UML_Fun.css', path: '/Diagrams/UML_Fun.css' }))
  })

  it('opens the file on a Ctrl+click on its path, and keeps one selection range', async () => {
    const open = await editor()

    const event = press(view.dom.querySelector('[data-linked-path="/Diagrams/UML_Fun.css"]'), { ctrlKey: true })

    expect(open).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(view.state.selection.ranges).toHaveLength(1)
  })

  it('leaves a Ctrl+click anywhere else to CodeMirror', async () => {
    const open = await editor()

    const event = press(view.contentDOM.querySelector('.cm-line'), { ctrlKey: true })

    expect(open).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('takes Cmd, not Ctrl, on macOS', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const open = await editor()
    const path = view.dom.querySelector('[data-linked-path="/Diagrams/UML_Fun.css"]')

    press(path, { ctrlKey: true })
    press(path, { metaKey: true })

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('marks the editor while Ctrl is held', async () => {
    await editor()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
    expect(view.dom.classList.contains('cm-plantuml-ctrl')).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }))
    expect(view.dom.classList.contains('cm-plantuml-ctrl')).toBe(false)
  })

  it('asks once per path until the window is focused again, then asks again', async () => {
    await editor()
    view.dispatch({ changes: { from: 0, insert: "' a comment\n" } })
    expect(seams.fileAccess).toHaveBeenCalledTimes(2) // the style file and the parts file

    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(seams.fileAccess).toHaveBeenCalledTimes(4)
  })

  it('drops the chip of a file that went away', async () => {
    await editor()
    seams.fileAccess.mockResolvedValue(null)

    window.dispatchEvent(new Event('focus'))
    await settle()

    expect(view.dom.querySelectorAll('button.cm-plantuml-link-chip')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/js/chips.test.js`
Expected: FAIL with `Failed to load url ../../src/editor/linked/chips.js`.

- [ ] **Step 3: Write the minimal implementation**

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * R9, R10: a `<>` chip at the end of a line that links a readable file beside
 * the diagram, and Ctrl+click (Cmd+click on macOS) on its path. Whether a file
 * is there is asked once per path, again at R6's moments; each answer redraws.
 */
import { StateEffect } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { filePath } from '../lint/state.js'
import { fileAccess } from '../save.js'
import { linkOn } from './links.js'
import { resolveLinked } from '../paths.js'
import codeTags from '../../../img/icons/code-tags.svg?raw'

/** A file's answer landed, or the answers were forgotten: draw again. */
const answered = StateEffect.define()

const mac = () => /Mac|iP(?:hone|ad|od)/.test(navigator.platform)
const held = (event) => (mac() ? event.metaKey : event.ctrlKey)
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1)

class Chip extends WidgetType {
  constructor(path) {
    super()
    this.path = path
  }

  eq(other) {
    return other.path === this.path
  }

  toDOM() {
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'cm-plantuml-link-chip'
    node.dataset.linkedPath = this.path
    node.title = t(APP_ID, 'Open {name}', { name: baseName(this.path) })
    node.setAttribute('aria-label', node.title)
    node.innerHTML = codeTags
    return node
  }

  ignoreEvent() {
    return false
  }
}

export function linkedChips(open) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view
      this.gone = false
      this.asked = new Set() // paths asked since the last R6 moment
      this.answers = new Map() // path → {writable}|null once answered
      this.refresh = () => {
        this.asked.clear()
        this.answers.clear()
        if (!this.gone) view.dispatch({ effects: answered.of(null) })
      }
      this.visible = () => { if (document.visibilityState === 'visible') this.refresh() }
      this.down = (event) => view.dom.classList.toggle('cm-plantuml-ctrl', event.key === (mac() ? 'Meta' : 'Control') || held(event))
      this.up = () => view.dom.classList.remove('cm-plantuml-ctrl')
      window.addEventListener('focus', this.refresh)
      document.addEventListener('visibilitychange', this.visible)
      document.addEventListener('keydown', this.down)
      document.addEventListener('keyup', this.up)
      window.addEventListener('blur', this.up)
      this.decorations = this.build()
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(answered)))) {
        this.decorations = this.build()
      }
    }

    build() {
      const { state } = this.view
      const file = state.facet(filePath)
      const marks = []
      for (const { from, to } of this.view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = state.doc.lineAt(pos)
          const link = linkOn(line.text)
          const path = link && resolveLinked(file, link.written)
          if (path) {
            marks.push(Decoration.mark({ class: 'cm-plantuml-link', attributes: { 'data-linked-path': path } }).range(line.from + link.from, line.from + link.to))
            if (this.answers.get(path)) {
              marks.push(Decoration.widget({ widget: new Chip(path), side: 1 }).range(line.from + line.text.trimEnd().length))
            }
            this.ask(path)
          }
          pos = line.to + 1
        }
      }
      return Decoration.set(marks, true)
    }

    ask(path) {
      if (this.asked.has(path)) return
      this.asked.add(path)
      fileAccess(path).then((answer) => {
        this.answers.set(path, answer)
        if (!this.gone) this.view.dispatch({ effects: answered.of(path) })
      }, () => {
        // A failure is not kept: the next draw asks again.
        this.asked.delete(path)
      })
    }

    linkAt(target) {
      const node = target.closest?.('[data-linked-path]')
      if (!node) return null
      const link = linkOn(this.view.state.doc.lineAt(this.view.posAtDOM(node)).text)
      return link && { ...link, path: node.dataset.linkedPath }
    }

    destroy() {
      this.gone = true
      window.removeEventListener('focus', this.refresh)
      document.removeEventListener('visibilitychange', this.visible)
      document.removeEventListener('keydown', this.down)
      document.removeEventListener('keyup', this.up)
      window.removeEventListener('blur', this.up)
    }
  }, {
    decorations: (value) => value.decorations,
    eventHandlers: {
      mousedown(event) {
        const chip = event.target.closest?.('button.cm-plantuml-link-chip')
        if (!chip && !held(event)) return false
        const link = this.linkAt(chip ?? event.target)
        if (!link || !this.answers.get(link.path)) return false
        event.preventDefault()
        open(link)
        return true
      },
    },
  })
  return [plugin]
}
```

Add to `theme.js`, after the `.cm-plantuml-chooser` rules:

```js
  // R9: the linked file's chip, the chooser's size, 4 px after the line's end.
  [buttonStates('.cm-plantuml-link-chip')]: { ...QUIET_BUTTON, display: 'inline-flex', width: '16px', height: '16px', marginLeft: '4px', verticalAlign: 'middle' },
  '.cm-plantuml-link-chip svg': { width: '12px', height: '12px' },
  '.cm-plantuml-link-chip': { color: 'var(--color-text-maxcontrast)' },
  '.cm-plantuml-link-chip:hover': { color: 'var(--color-main-text)' },
  // R10: the path under the pointer while Ctrl (Cmd) is held.
  '&.cm-plantuml-ctrl .cm-plantuml-link:hover, &.cm-plantuml-ctrl .cm-plantuml-link:hover *': {
    color: 'var(--color-primary-element)', textDecoration: 'underline', textDecorationColor: 'var(--color-primary-element)', cursor: 'pointer',
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/js/chips.test.js tests/js/theme.test.js`
Expected: PASS, both.

- [ ] **Step 5: Commit**

```bash
git add src/editor/linked/chips.js src/editor/theme.js tests/js/chips.test.js
git commit -m "Editor: a linked file's line carries a chip that opens it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: A style file is read as one style body (R12, style part)

**Files:**
- Modify: `src/editor/plantuml-mode.js`: `plantumlLanguage` (line 292), `startState` and `copyState` (lines 448–466), and `styleBody` (lines 394–410).
- Modify: `src/editor/regions.js`: add `sheetRegions` and `styleSheet`; `inStyleBody` reads the facet.
- Modify: `src/editor/profiles/index.js` (add `loadSheetProfile`).
- Modify: `src/editor/lint/index.js` (add `sheetLint`).
- Create: `src/editor/linked/sheet.js` (`sheetExtension`).
- Test: `tests/js/style-sheet.test.js` (new).

**Interfaces:**
- Consumes: the style profile's factory (the `profiles/style.js` default export), `withDocs`, `colors`, `swatchOption`, `profileRules`, `valuesFacet`, `serverError`.
- Produces:
  - `plantumlLanguage(profiles = {}, { sheet = false } = {})`;
  - `sheetRegions(doc: Text): StyleBlock[]` and `styleSheet: Facet<boolean, boolean>`;
  - `loadSheetProfile(): Promise<Profile|null>`;
  - `sheetExtension(profile: Profile|null): Extension[]`, which is the language, completion, lint and values of a style file and no editor chrome (Task 6 adds that). With a null profile it is plain text: `[plantumlLanguage({}, { sheet: true }), styleSheet.of(true), serverError]`;
  - `sheetLint: Extension[]`.

- [ ] **Step 1: Write the failing tests** (`tests/js/style-sheet.test.js`):

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { loadSheetProfile } from '../../src/editor/profiles/index.js'
import { sheetExtension } from '../../src/editor/linked/sheet.js'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { tokensOf } from './helpers/tokens.js'
import { serverAnswering } from './helpers/server.js'

// The style file on the Penpot board `screens / linked-style`, verbatim.
const SHEET = 'participant {\n  BackgroundColor   #FFE08A\n  LineColor   #8A6D00\n  FontStyle bold\n}\narrow {\n  LineColor   #8A6D00\n}'

beforeAll(() => serverAnswering({ colors: { Red: '#FF0000' } }))
afterAll(() => vi.unstubAllGlobals())

async function sheet(doc) {
  return EditorState.create({ doc, extensions: sheetExtension(await loadSheetProfile()) })
}

async function labels(state, pos) {
  const sources = state.languageDataAt('autocomplete', pos)
  const results = await Promise.all(sources.map((source) => source(new CompletionContext(state, pos, true))))
  return results.filter(Boolean).flatMap((result) => result.options.map((option) => option.label))
}

describe('a style file', () => {
  it('is highlighted as the same lines inside <style> are', async () => {
    const { mode } = await loadSheetProfile()
    const lines = SHEET.split('\n')

    const asSheet = tokensOf(plantumlLanguage({ style: mode }, { sheet: true }), lines)
    const inBlock = tokensOf(plantumlLanguage({ style: mode }), ['<style>', ...lines, '</style>'])

    // inBlock's first and last spans are the `<style>` and `</style>` tags.
    expect(asSheet).toEqual(inBlock.slice(1, -1))
  })

  it('opens and closes nothing on a @startuml or </style> line', async () => {
    const { mode } = await loadSheetProfile()

    const tokens = tokensOf(plantumlLanguage({ style: mode }, { sheet: true }), ['@startuml', '</style>', 'arrow {', '  LineColor #8A6D00', '}'])

    expect(tokens).toContainEqual(['#8A6D00', 'ColorLiteral'])
  })

  it('completes a property', async () => {
    const state = await sheet('arrow {\n  FontSt\n}')

    expect(await labels(state, 'arrow {\n  FontSt'.length)).toContain('FontStyle')
  })

  it('completes a named colour', async () => {
    const state = await sheet('arrow {\n  BackGroundColor Re\n}')

    expect(await labels(state, 'arrow {\n  BackGroundColor Re'.length)).toContain('Red')
  })

  it('runs the style lint, and no block lint', async () => {
    const profile = await loadSheetProfile()
    const state = await sheet('arrow {\n  LineColour #8A6D00\n}')

    const messages = profile.lints.flatMap((rule) => rule(state))

    expect(messages).toHaveLength(1) // the misspelt property; no "unclosed @start", no "unnamed @start"
  })

  it('takes a selection change in a view without throwing', async () => {
    const view = new EditorView({ parent: document.body, state: await sheet(SHEET) })

    expect(() => view.dispatch({ selection: { anchor: 5 } })).not.toThrow()
    view.destroy()
  })

  it('is plain text, still a sheet, when the style profile will not load', () => {
    const state = EditorState.create({ doc: SHEET, extensions: sheetExtension(null) })

    expect(state.languageDataAt('autocomplete', 5)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/js/style-sheet.test.js`
Expected: FAIL. `loadSheetProfile is not a function`, and `../../src/editor/linked/sheet.js` cannot be loaded.

- [ ] **Step 3: Write the minimal implementation**

`regions.js`:

```js
import { Facet } from '@codemirror/state'

/** A style file (R12): the whole document is one style body. */
export const styleSheet = Facet.define({ combine: (values) => values.some(Boolean) })

const sheets = new WeakMap() // Text → [StyleBlock]

/** A style file's one block: every line but PlantUML's own `'` and `!` lines. */
export function sheetRegions(doc) {
  if (!sheets.has(doc)) {
    const body = []
    let line = 0
    for (const text of doc.iterLines()) {
      line++
      if (!OWN.test(text)) body.push({ line, text, from: 0 })
    }
    sheets.set(doc, [{ open: 0, closed: true, body }])
  }
  return sheets.get(doc)
}
```

`inStyleBody(state, pos)` gets a new first line: `if (state.facet(styleSheet)) return !OWN.test(state.doc.lineAt(pos).text)`.

`plantuml-mode.js`:
- The signature becomes `plantumlLanguage(profiles = {}, { sheet = false } = {})`.
- `startState(indentUnit)` returns `{ ...base.startState(), inner: null, style: sheet ? { state: style?.startState ? style.startState(indentUnit) : {}, until: null, sheet: true } : null, math: null, latex: null, sub: null, nested: false }`.
- `copyState` copies the flag: `copy.style = state.style && { state: copyIn(style, state.style.state), until: state.style.until, sheet: state.style.sheet }`.
- In `styleBody`, a sheet never closes:

```js
      if (close && !state.style.sheet) {
        state.style = null
        return emit(stream, state, [[close[1], null], [close[2], 'tagName'], [close[3], null]])
      }
      if (!state.style.sheet && stream.match(/^[ \t]*@end/, false)) {
        state.style = null
        return null
      }
```

`profiles/index.js`:

```js
let sheetProfile = null

/** The style profile reading the whole document as one body (R12); not in PROFILES, so P2 holds. */
export function loadSheetProfile() {
  sheetProfile ??= PROFILES.style()
    .then((module) => module.default({ ...core, styleBlocks: sheetRegions }))
    .catch((e) => {
      console.error(`[${APP_ID}] could not load the style profile`, e)
      sheetProfile = null
      return null
    })
  return sheetProfile
}
```

`lint/index.js`:

```js
/** A style file's lint: the style profile's rules alone (R12). */
export const sheetLint = [
  linter((view) => view.state.facet(profileRules).flatMap((rule) => rule(view.state)), { needsRefresh, tooltipFilter }),
  lintGutter(),
]
```

`src/editor/linked/sheet.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A `<style file=…>` target in the source pane (R12): the style grammar, its
 * completion, its lint and its values, and nothing of `@start` blocks. The
 * editor's own chrome is added beside it (extensions.js).
 */
import { autocompletion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { plantumlLanguage } from '../plantuml-mode.js'
import { styleSheet } from '../regions.js'
import { colors, swatchOption } from '../completion/colors.js'
import { withDocs } from '../completion/docs.js'
import { profileRules, sheetLint } from '../lint/index.js'
import { serverError } from '../lint/state.js'
import { valuesFacet } from '../values/index.js'

/** @param {import('../profiles/index.js').Profile|null} profile the style profile on sheetRegions; null when it would not load */
export function sheetExtension(profile) {
  // serverError is there for the linter's needsRefresh, which reads it on every update.
  const base = [plantumlLanguage(profile ? { style: profile.mode } : {}, { sheet: true }), styleSheet.of(true), serverError]
  if (!profile) return base
  return [
    ...base,
    ...[...profile.completions, colors].map((source) => EditorState.languageData.of(() => [{ autocomplete: withDocs(source) }])),
    autocompletion({ addToOptions: [swatchOption] }),
    profileRules.of(profile.lints),
    sheetLint,
    valuesFacet.of(profile.values ?? []),
  ]
}
```

- [ ] **Step 4: Run the tests and the build to verify they pass**

Run: `npx vitest run tests/js/style-sheet.test.js tests/js/style-profile.test.js tests/js/completion.test.js tests/js/lint.test.js && npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`
Expected: PASS, the build succeeds, and the guard exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/editor/plantuml-mode.js src/editor/regions.js src/editor/profiles/index.js src/editor/lint/index.js src/editor/linked/sheet.js tests/js/style-sheet.test.js
git commit -m "Editor: a style file reads as one style sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The linked file takes over the source pane (R11, R12, R14, R16)

**Files:**
- Create: `src/editor/extensions.js`. The extension list at `editor.js` lines 550–605, and its compartments at lines 132–138, move here.
- Create: `src/editor/breadcrumb.js`.
- Create: `img/icons/lock-outline.svg`.
- Modify: `src/editor.js`, `css/editor.css`.
- Test: `tests/js/breadcrumb.test.js` (new), `tests/js/editor.test.js` (a new `describe('a linked file')`).

**Interfaces:**
- Consumes:
  - `createFileSession`, `fromFile`, `mainState`, `toMain` and `replaceWith` (Task 2);
  - `linkedChips` (Task 4);
  - `loadSheetProfile` and `sheetExtension` (Task 5);
  - `loadFile` and `fileAccess` (`save.js`);
  - `scan`, `blocksOf` and `diagramsOf` (`blocks.js`).
- Produces:
  - `editorChrome({ save, onUpdate }): Extension[]`: line numbers, the active-line gutter and line, `drawSelection`, `bracketMatching`, `closeBrackets`, `highlightSelectionMatches`, `search({ top: true })`, `history()`, `plantumlTheme`, `colorSwatches`, `valueWidgets`, `EditorView.lineWrapping`, the keymap with `Mod-s` running `save`, and `EditorView.updateListener.of(onUpdate)`.
  - `sourceExtensions({ name, path, save, onUpdate, chips, apply }): { extensions: Extension[], nameConfig: Compartment, profilesConfig: Compartment, wantProfiles: (diagrams, text) => void }`. This is `editorChrome` plus the PlantUML profiles compartment, `plantumlCompletion`, `plantumlDocs`, `plantumlLint`, `plantumlFolding`, the name facets, and `chips` (`linkedChips(open)` for the main file, `[]` for a linked `.puml`). `apply(effects)` receives each profile reconfiguration and must send it to the state that owns this compartment.
  - `readOnlyFile: Extension[]`: `EditorState.readOnly.of(true)`, `EditorView.editable.of(false)`, and a transaction filter that drops any document change not annotated `fromFile`.
  - `createBreadcrumb({ onBack }): { element: HTMLHeadingElement, show(main: string, linked: { name: string, readOnly: boolean }|null): void }`. `element` keeps the class `plantuml-editor__name`.
  - In `editor.js`: `openLinked(link: Link & { path: string }): Promise<void>` and `goBack(): Promise<boolean>`, which is true once back on the main file.

- [ ] **Step 1: Write the failing breadcrumb tests** (`tests/js/breadcrumb.test.js`):

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import { createBreadcrumb } from '../../src/editor/breadcrumb.js'

describe('the breadcrumb', () => {
  it('is the file name alone on the main file', () => {
    const crumb = createBreadcrumb({ onBack: vi.fn() })

    crumb.show('Order flow.puml', null)

    expect(crumb.element.textContent).toBe('Order flow.puml')
    expect(crumb.element.querySelector('button')).toBeNull()
  })

  it('leads back from a linked file', () => {
    const onBack = vi.fn()
    const crumb = createBreadcrumb({ onBack })

    crumb.show('Order flow.puml', { name: 'UML_Fun.css', readOnly: false })

    const [main, back] = crumb.element.querySelectorAll('button')
    expect(crumb.element.textContent).toBe('Order flow.puml›UML_Fun.css')
    expect(main.textContent).toBe('Order flow.puml')
    expect(back.title).toBe('Back to Order flow.puml')
    main.click()
    back.click()
    expect(onBack).toHaveBeenCalledTimes(2)
    expect(crumb.element.querySelector('.plantuml-editor__lock')).toBeNull()
  })

  it('shows a lock on a file that may only be read', () => {
    const crumb = createBreadcrumb({ onBack: vi.fn() })

    crumb.show('Order flow.puml', { name: 'UML_Fun.css', readOnly: true })

    expect(crumb.element.querySelector('.plantuml-editor__lock').title).toBe('Read only')
  })
})
```

- [ ] **Step 2: Write the failing editor tests.** Append to `editor.test.js`; the fixtures are the Penpot boards' texts, verbatim.

```js
describe('a linked file', () => {
  // screens / linked-main, linked-style and linked-include, verbatim.
  const MAIN = "@startuml nodes\n@enduml\n@startuml order-flow\n' checkout, happy path\n<style file=./UML_Fun.css>\n!include ./UML_Fun_parts.puml\nparticipant Shop\nparticipant Payment\nCustomer -> Shop : place order\nShop -> Payment : charge\nPayment --> Shop : ok\nShop --> Customer : confirmation\n@enduml\n@startyaml config\nserver: plantuml\ntheme: plain\n@endyaml\n"
  const STYLE = 'participant {\n  BackgroundColor   #FFE08A\n  LineColor   #8A6D00\n  FontStyle bold\n}\narrow {\n  LineColor   #8A6D00\n}\n'
  const PARTS = "@startuml parts\n' the cast every diagram shares\nactor Customer\n<style file=./parts.css>\n@enduml\n@startuml(id=extra) more\nactor Clerk\n@enduml\n"
  const FILES = {
    '/Diagrams/Order flow.puml': { content: MAIN, etag: '"m1"' },
    '/Diagrams/UML_Fun.css': { content: STYLE, etag: '"s1"' },
    '/Diagrams/UML_Fun_parts.puml': { content: PARTS, etag: '"p1"' },
    '/Diagrams/parts.css': { content: 'actor {}\n', etag: '"c1"' },
  }
  let files
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const chip = (name) => q(`button.cm-plantuml-link-chip[aria-label="Open ${name}"]`)
  const pressChip = async (name) => {
    chip(name).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await settle()
  }

  beforeEach(() => {
    files = structuredClone(FILES)
    seams.loadFile.mockImplementation(async (path) => files[path] ?? Promise.reject(new Error('404')))
    seams.fileAccess.mockImplementation(async (path) => (files[path] ? { writable: true } : null))
  })

  /** Opens the style file with the cursor on its `<style file=…>` line, in the order-flow diagram. */
  async function openStyle() {
    await open()
    view().dispatch({ selection: { anchor: MAIN.indexOf('<style') } })
    await settle()
    await pressChip('UML_Fun.css')
  }

  it('takes over the source pane, named in the breadcrumb', async () => {
    await openStyle()

    expect(source()).toBe(STYLE)
    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml›UML_Fun.css')
    expect(q('button.cm-plantuml-link-chip')).toBeNull()
  })

  it('reads a style file with the editor\'s own parts: line numbers, undo and swatches', async () => {
    await openStyle()

    expect(q('.cm-lineNumbers')).not.toBeNull()
    view().dispatch({ changes: { from: 0, insert: "' x\n" } })
    undo(view())
    expect(source()).toBe(STYLE)
  })

  it.each([
    ['the ×', () => q('.plantuml-editor__back').click()],
    ['the main crumb', () => q('.plantuml-editor__crumb').click()],
    ['Escape', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))],
  ])('goes back on %s, the editor still open', async (_how, back) => {
    await openStyle()

    back()
    await settle()

    expect(source()).toBe(MAIN)
    expect(q('.plantuml-editor')).not.toBeNull()
    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml')
  })

  it('keeps the main file whole: text, unsaved edit, selection and undo', async () => {
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" }, selection: { anchor: 3 } })
    await settle()
    await pressChip('UML_Fun.css')
    view().dispatch({ changes: { from: 0, insert: "' theirs\n" } })

    q('.plantuml-editor__back').click()
    await settle()

    expect(source()).toBe("' mine\n" + MAIN)
    expect(view().state.selection.main.head).toBe(3)
    undo(view())
    expect(source()).toBe(MAIN)
  })

  it('autosaves the main file\'s own text while a linked file is open', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockResolvedValue('"m2"')
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    await vi.advanceTimersByTimeAsync(0)
    await pressChip('UML_Fun.css')

    await vi.advanceTimersByTimeAsync(2000)

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', "' mine\n" + MAIN, '"m1"')
    expect(seams.saveFile.mock.calls.some(([path, text]) => path === '/Diagrams/Order flow.puml' && text === STYLE)).toBe(false)
  })

  it('reads a linked .puml as a diagram, with no chips of its own', async () => {
    await open()
    await settle()
    await pressChip('UML_Fun_parts.puml')
    await settle()

    expect(source()).toBe(PARTS)
    expect(q('button.cm-plantuml-link-chip')).toBeNull()
  })

  it.each([
    ['!includesub ./UML_Fun_parts.puml!B', "@startuml\n!startsub A\nX\n!endsub\n!startsub B\nY\n!endsub\n@enduml\n", 5],
    ['!include ./UML_Fun_parts.puml!1', PARTS, 6],
    ['!include ./UML_Fun_parts.puml!extra', PARTS, 6],
  ])('opens %s where the line points', async (line, content, number) => {
    files['/Diagrams/UML_Fun_parts.puml'] = { content, etag: '"p1"' }
    files['/Diagrams/Order flow.puml'] = { content: `@startuml\n${line}\n@enduml\n`, etag: '"m1"' }
    await open()
    await settle()
    await pressChip('UML_Fun_parts.puml')

    expect(view().state.doc.lineAt(view().state.selection.main.head).number).toBe(number)
  })

  it('stays on the main file when the linked one cannot be read', async () => {
    await open()
    await settle()
    delete files['/Diagrams/UML_Fun.css']
    await pressChip('UML_Fun.css')

    expect(source()).toBe(MAIN)
    expect(status()).toBe('Could not open the file')
  })

  it('closes from the main file on the next Escape', async () => {
    await openStyle()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    expect(q('.plantuml-editor')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/js/breadcrumb.test.js tests/js/editor.test.js`
Expected: FAIL. `breadcrumb.js` cannot be loaded, and the linked-file tests fail on `chip(...)` being null.

- [ ] **Step 4: Write the minimal implementation**

`src/editor/breadcrumb.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The bar's file name, a breadcrumb while a linked file is open (R11, R17).
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import closeIcon from '../../img/icons/close.svg?raw'
import lockIcon from '../../img/icons/lock-outline.svg?raw'

export function createBreadcrumb({ onBack }) {
  const element = crelt('h2', { class: 'plantuml-editor__name' })
  function show(main, linked) {
    if (!linked) {
      element.replaceChildren(main)
      return
    }
    const backTitle = t(APP_ID, 'Back to {name}', { name: main })
    const crumb = crelt('button', { class: 'plantuml-editor__crumb', type: 'button' }, main)
    const back = crelt('button', { class: 'plantuml-editor__back', type: 'button', title: backTitle, 'aria-label': backTitle })
    back.innerHTML = closeIcon
    crumb.addEventListener('click', onBack)
    back.addEventListener('click', onBack)
    const parts = [
      crumb,
      crelt('span', { class: 'plantuml-editor__separator', 'aria-hidden': 'true' }, '›'),
      crelt('span', { class: 'plantuml-editor__linked' }, linked.name),
    ]
    if (linked.readOnly) {
      const lock = crelt('span', { class: 'plantuml-editor__lock', title: t(APP_ID, 'Read only'), role: 'img', 'aria-label': t(APP_ID, 'Read only') })
      lock.innerHTML = lockIcon
      parts.push(lock)
    }
    element.replaceChildren(...parts, back)
  }
  return { element, show }
}
```

`img/icons/lock-outline.svg`, with the header comment of `img/icons/code-tags.svg` adapted ("The read-only lock in the editor's breadcrumb, Material Design's lock-outline …"):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12,17C10.89,17 10,16.1 10,15C10,13.89 10.89,13 12,13A2,2 0 0,1 14,15A2,2 0 0,1 12,17M18,20V10H6V20H18M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10C4,8.89 4.89,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/>
</svg>
```

`css/editor.css`, with values from the board:

```css
.plantuml-editor__name { display: flex; align-items: center; gap: 8px; }
.plantuml-editor__crumb { all: unset; cursor: pointer; font-size: 16px; font-weight: 400; color: var(--color-text-maxcontrast); }
.plantuml-editor__crumb:hover { text-decoration: underline; }
.plantuml-editor__crumb:focus-visible { outline: 2px solid var(--color-primary-element); border-radius: var(--border-radius); }
.plantuml-editor__separator { color: var(--color-text-maxcontrast); }
.plantuml-editor__linked { font-weight: 600; color: var(--color-main-text); }
.plantuml-editor__lock { display: inline-flex; width: 16px; height: 16px; color: var(--color-text-maxcontrast); }
.plantuml-editor__bar button.plantuml-editor__back { display: inline-flex; align-items: center; justify-content: center; width: var(--default-clickable-area); height: var(--default-clickable-area); border-radius: var(--border-radius-pill); color: var(--color-text-maxcontrast); }
.plantuml-editor__back svg { width: 14px; height: 14px; }
```

`src/editor/extensions.js`, with the imports moved from `editor.js`:

```js
export function editorChrome({ save, onUpdate }) {
  return [
    lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(), bracketMatching(), closeBrackets(),
    highlightSelectionMatches(), search({ top: true }), history(), plantumlTheme, colorSwatches, valueWidgets, EditorView.lineWrapping,
    keymap.of([
      { key: 'Mod-s', run: () => { save(); return true } },
      ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...plantumlLintKeymap,
      { key: 'Escape', run: closeLintPanel },
      indentWithTab,
    ]),
    EditorView.updateListener.of(onUpdate),
  ]
}

export function sourceExtensions({ name, path, save, onUpdate, chips, apply }) {
  const nameConfig = new Compartment()
  const profilesConfig = new Compartment()
  const wantProfiles = profileLoader((extension) => apply(profilesConfig.reconfigure(extension)))
  const extensions = [
    ...editorChrome({ save, onUpdate }),
    profilesConfig.of(profileExtension([])),
    plantumlCompletion, plantumlDocs, plantumlLint, plantumlFolding,
    nameConfig.of([fileName.of(name), filePath.of(path)]),
    chips,
  ]
  return { extensions, nameConfig, profilesConfig, wantProfiles }
}

/** R17: a file the user may only read. A change from the file itself (fromFile) still lands. */
export const readOnlyFile = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorState.transactionFilter.of((tr) => (tr.docChanged && !tr.annotation(fromFile) ? [] : tr)),
]
```

The comments on each extension move with it. `editor.js` builds the main state from `sourceExtensions({ name, path: currentPath, save: () => main.session.save(), onUpdate: mainUpdate, chips: linkedChips(openLinked), apply: (effects) => toMain({ effects }) })`.

The main file's update-listener body becomes `mainUpdate(update)`. A profile that arrives while the main file is parked therefore lands in the parked state.

`editor.js`, the linked-file flow. `title` becomes `crumbs.element`, and `crumbs.show(name, null)` replaces `title.textContent = …`:

```js
  let linked = null // { link, name, readOnly, session, wantProfiles? } while a linked file is open

  async function openLinked(link) {
    let file
    let access
    try {
      [file, access] = await Promise.all([loadFile(link.path), fileAccess(link.path)])
      if (!access) throw new Error(`${link.path} is not readable`)
    } catch (e) {
      console.error(`[${APP_ID}] could not open ${link.path}`, e)
      main.session.fail(t(APP_ID, 'Could not open the file'))
      return
    }
    const name = link.path.slice(link.path.lastIndexOf('/') + 1)
    const readOnly = !access.writable
    const record = { link, name, readOnly, session: null, wantProfiles: null }
    const save = () => record.session.save()
    let extensions
    if (link.kind === 'style') {
      extensions = [...editorChrome({ save, onUpdate: linkedUpdate }), ...sheetExtension(await loadSheetProfile())]
    } else {
      const built = sourceExtensions({
        name, path: link.path, save, onUpdate: linkedUpdate, chips: [],
        // The linked file is the one shown while it is open.
        apply: (effects) => { if (linked === record) view.dispatch({ effects }) },
      })
      extensions = built.extensions
      record.wantProfiles = built.wantProfiles
    }
    const state = EditorState.create({
      doc: file.content,
      selection: { anchor: landing(file.content, link) },
      extensions: readOnly ? [...extensions, readOnlyFile] : extensions,
    })
    parked = { state: view.state, scrollTop: view.scrollDOM.scrollTop }
    main.session.pause()
    linked = record
    record.session = createFileSession({
      path: link.path, etag: file.etag,
      doc: () => view.state.doc,
      replace: (content, opts) => replaceWith(view.state, (spec) => view.dispatch(spec), content, opts),
      onChange: showState, onCopied: renamedLinked, readOnly,
    })
    view.setState(state)
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'start', yMargin: 20 }) })
    record.wantProfiles?.(diagramsOf(view.state.doc, file.content), file.content)
    record.session.start()
    crumbs.show(main.name, { name, readOnly })
    showState()
    view.focus()
  }

  function linkedUpdate(update) {
    if (!update.docChanged || !linked) return
    linked.session.edited()
    const text = update.state.doc.toString()
    linked.wantProfiles?.(diagramsOf(update.state.doc, text), text)
  }

  /** R16: the line `!startsub NAME`, or block N or id=X, starts on, else line 1; as an offset. */
  function landing(content, { section, block }) {
    const lines = content.split('\n')
    let number = 1
    if (section !== null) {
      const at = lines.findIndex((line) => {
        const m = /^[ \t]*!startsub\s+(\S+)/.exec(line)
        return m !== null && m[1] === section
      })
      number = at < 0 ? 1 : at + 1
    } else if (block !== null) {
      const blocks = blocksOf(scan(content.replace(/\r\n?/g, '\n')))
      const found = /^\d+$/.test(block) ? blocks[Number(block)] : blocks.find((b) => b.id === block)
      number = found?.start ?? 1
    }
    return lines.slice(0, number - 1).reduce((offset, line) => offset + line.length + 1, 0)
  }

  async function goBack() {
    // Task 8 puts the save-before-leaving checks here.
    linked.session.stop()
    linked = null
    const { state, scrollTop } = parked
    parked = null
    view.setState(state)
    view.requestMeasure({ read: () => null, write: () => { view.scrollDOM.scrollTop = scrollTop } })
    crumbs.show(main.name, null)
    await main.session.resume()
    showState()
    view.focus()
    return true
  }
```

The rest of the wiring:
- `showState()` and `showButtons()` read `(linked ?? main)?.session`.
- `onKeydown`'s Escape branch calls `linked ? goBack() : close()`.
- `renamedLinked(node)` sets `linked.name = node.basename` and calls `crumbs.show(main.name, { name: linked.name, readOnly: linked.readOnly })`.
- `follow()` and `drawAgain()` read `mainState()`.
- The main file's `mainUpdate` only runs for the main state, since each state carries its own listener.

- [ ] **Step 5: The Add-diagram button, if it exists.** Dr K: hidden while a linked file is open.

Run: `grep -c "plantuml-editor__add" src/editor.js`
Expected: `0` means the Add-diagram round has not landed. Write "Add button: the Add-diagram round hides it in linked mode" in the ledger and skip to Step 6. Any other count means it has landed: do the rest of this step.

Write the failing test in `describe('a linked file')`:

```js
  it('hides the Add diagram button while a linked file is open', async () => {
    await openStyle()
    expect(q('.plantuml-editor__add').hidden).toBe(true)

    q('.plantuml-editor__back').click()
    await settle()

    expect(q('.plantuml-editor__add').hidden).toBe(false)
  })
```

Run: `npx vitest run tests/js/editor.test.js -t 'hides the Add diagram button'`
Expected: FAIL, `expected false to be true`.

Then, in `editor.js`, where the Add pill is held (the Add round names it `addPill`, the element with class `plantuml-editor__add`):
- `openLinked` sets `addPill.hidden = true` beside `crumbs.show(…)`;
- `goBack` sets `addPill.hidden = false` beside `crumbs.show(main.name, null)`.

Run: `npx vitest run tests/js/editor.test.js -t 'hides the Add diagram button'`
Expected: PASS.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/js/breadcrumb.test.js tests/js/editor.test.js tests/js/file-session.test.js`
Expected: PASS, every test in all three.

- [ ] **Step 7: Commit**

```bash
git add src/editor/extensions.js src/editor/breadcrumb.js src/editor.js src/editor/file-session.js css/editor.css img/icons/lock-outline.svg tests/js/breadcrumb.test.js tests/js/editor.test.js
git commit -m "Editor: a linked file opens in place of the source, and × goes back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The diagram stays the main file's and follows the linked file live (R13)

**Files:**
- Modify: `src/editor/preview.js`: `render`, `request`, `debouncedRender` and `send` gain `overrides`.
- Modify: `src/editor.js`: `draw`, `showDiagram`, `linkedUpdate`, and the `setServerError` dispatch.
- Test: `tests/js/preview.test.js`, `tests/js/editor.test.js` (inside `describe('a linked file')`).

**Interfaces:**
- Consumes: `linked.link.written` and `linked.readOnly` (Task 6), the linked session's `copied` (Task 2), and `mainState` and `toMain` (Task 2).
- Produces:
  - `render(source, index = 0, path = '', overrides = null): Promise<string>`;
  - `debouncedRender(source, index, path, cb, overrides = null)`;
  - the POST body is `{ source, index, path }`, plus `overrides` when non-null.

- [ ] **Step 1: Write the failing tests.** Append to `preview.test.js`:

```js
  it('posts the overrides only when it has them', async () => {
    const fetch = vi.fn(async () => svg())
    vi.stubGlobal('fetch', fetch)

    await render('@startuml\n@enduml\n', 0, '/Diagrams/a.puml', { './x.css': 'b {}' })
    await render('@startuml\n@enduml\n', 0, '/Diagrams/a.puml')

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ source: '@startuml\n@enduml\n', index: 0, path: '/Diagrams/a.puml', overrides: { './x.css': 'b {}' } })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ source: '@startuml\n@enduml\n', index: 0, path: '/Diagrams/a.puml' })
  })
```

Append to `editor.test.js`, inside `describe('a linked file')`. `openStyle()` puts the main cursor on the `<style file=…>` line, so `order-flow` (index 1) is the active tab when the linked file opens. Import `serverError` from `../../src/editor/lint/state.js` at the top.

```js
  const lastRender = () => seams.debouncedRender.mock.calls.at(-1)

  it('draws the main file, its tab kept, with the linked file\'s unsaved text', async () => {
    await openStyle()

    view().dispatch({ changes: { from: 0, insert: "' new\n" } })

    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe('order-flow')
    expect(lastRender()[0]).toBe(MAIN)
    expect(lastRender()[1]).toBe(1)
    expect(lastRender()[4]).toEqual({ './UML_Fun.css': "' new\n" + STYLE })
  })

  it('sends no overrides for a file that may only be read', async () => {
    seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: false } : { writable: true }))
    await openStyle()

    window.dispatchEvent(new Event('focus'))

    expect(lastRender()[4]).toBeNull()
  })

  it('keeps the tab while the cursor moves in the linked file, and a tab only redraws', async () => {
    await openStyle()

    view().dispatch({ selection: { anchor: STYLE.length - 1 } })
    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe('order-flow')
    ;[...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'nodes').click()

    expect(q('[role="tab"][aria-selected="true"]').textContent).toBe('nodes')
    expect(lastRender()[1]).toBe(0)
    expect(view().state.selection.main.head).toBe(STYLE.length - 1)
  })

  it('marks a server mistake on the main file\'s line, not the linked file\'s', async () => {
    seams.answer = { error: null, svg: diagram(), mistake: { message: 'In UML_Fun.css, line 2: bad', line: 5 } }
    await openStyle()
    view().dispatch({ changes: { from: 0, insert: ' ' } })
    await settle()
    expect(view().state.field(serverError, false)).toBeNull()

    q('.plantuml-editor__back').click()
    await settle()

    expect(view().state.field(serverError).message).toBe('In UML_Fun.css, line 2: bad')
  })
```

The sheet state carries `serverError` (Task 5) but is never sent a mistake, so it reads null.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/js/preview.test.js tests/js/editor.test.js`
Expected: FAIL. The POST has no `overrides`, `lastRender()[4]` is `undefined`, and the source sent is the linked text instead of `MAIN`.

- [ ] **Step 3: Write the minimal implementation**

In `preview.js`, thread `overrides` through `render`, `request`, `debouncedRender`, `send` and the `parked` record of `send`:

```js
    body: JSON.stringify(overrides ? { source, index, path, overrides } : { source, index, path }),
```

In `editor.js`:

```js
  /** R13: the open linked file's text in place of its file, while it may be written and is still the file the line names. */
  function overrides() {
    if (!linked || linked.readOnly || linked.session.copied) return null
    return { [linked.link.written]: view.state.doc.toString() }
  }
```

- `draw(text)` is always called as `draw(mainState().doc.toString())`, and passes `overrides()` as `debouncedRender`'s fifth argument.
- In its callback, `view.state.doc.toString()` becomes `mainState().doc.toString()`, and `view.dispatch({ effects: setServerError.of(…) })` becomes `toMain({ effects: setServerError.of(…) })`.
- `showDiagram(index)`, while `linked`, does `active = index; tabs.update(diagrams, active); draw(mainState().doc.toString()); return`.
- `linkedUpdate` adds `draw(mainState().doc.toString())` on `docChanged`, and `drawAgain` reads `mainState()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/js/preview.test.js tests/js/editor.test.js`
Expected: PASS, both files.

- [ ] **Step 5: Commit**

```bash
git add src/editor/preview.js src/editor.js tests/js/preview.test.js tests/js/editor.test.js
git commit -m "Editor: the diagram redraws from a linked file's unsaved text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Saving, read-only and conflicts in the linked file (R15, R17, R18)

**Files:**
- Modify: `src/editor.js`: `goBack`, `close`, `onBeforeUnload`, `showButtons`, and the bar's button handlers.
- Test: `tests/js/editor.test.js` (inside `describe('a linked file')`).

**Interfaces:**
- Consumes: the session API (Task 2), and `openLinked`, `goBack` and `readOnlyFile` (Task 6).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

```js
  const typeLinked = (text) => view().dispatch({ changes: { from: 0, insert: text } })

  it('autosaves the linked file against its own ETag, two seconds after typing stops', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockResolvedValue('"s2"')
    await openStyle()

    typeLinked("' new\n")
    await vi.advanceTimersByTimeAsync(2000)

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', "' new\n" + STYLE, '"s1"')
    expect(indicator()).toBe('saved')
  })

  it('gives the linked file its own conflict line', async () => {
    vi.useFakeTimers()
    await openStyle()
    typeLinked("' new\n")
    seams.currentEtag.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? '"theirs"' : '"m1"'))

    await vi.advanceTimersByTimeAsync(10000)

    expect(status()).toBe('Someone else changed this file')
    expect(reloadButton().hidden).toBe(false)
    expect(copyButton().hidden).toBe(false)
  })

  it('never checks the main file while the linked file is open, and checks it at once on going back', async () => {
    vi.useFakeTimers()
    seams.currentEtag.mockResolvedValue('"s1"')
    await openStyle()
    await vi.advanceTimersByTimeAsync(30000)
    expect(seams.currentEtag.mock.calls.map(([path]) => path)).not.toContain('/Diagrams/Order flow.puml')

    seams.currentEtag.mockResolvedValue('"m1"')
    q('.plantuml-editor__back').click()
    await vi.advanceTimersByTimeAsync(0)

    expect(seams.currentEtag).toHaveBeenCalledWith('/Diagrams/Order flow.puml')
  })

  it('saves the linked file before going back', async () => {
    seams.saveFile.mockResolvedValue('"s2"')
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await settle()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', "' new\n" + STYLE, '"s1"')
    expect(source()).toBe(MAIN)
  })

  it('stays on the linked file when its save is refused', async () => {
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await settle()

    expect(source()).toBe("' new\n" + STYLE)
    expect(status()).toBe('Someone else changed this file')
  })

  it.each([[true, MAIN], [false, "' new\n" + STYLE]])('asks before discarding a save that failed (OK: %s)', async (ok, shown) => {
    seams.saveFile.mockRejectedValue(new Error('507'))
    vi.spyOn(window, 'confirm').mockReturnValue(ok)
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await settle()

    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(source()).toBe(shown)
  })

  it('asks after ten seconds of a save that hangs', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockReturnValue(new Promise(() => {}))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openStyle()
    typeLinked("' new\n")

    q('.plantuml-editor__back').click()
    await vi.advanceTimersByTimeAsync(10000)

    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?')
  })

  it('saves the linked file, then the main one, on closing', async () => {
    seams.saveFile.mockResolvedValue('"x2"')
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    await settle()
    await pressChip('UML_Fun.css')
    typeLinked("' new\n")

    q('.plantuml-editor__close').click()
    await settle()

    expect(seams.saveFile.mock.calls.map(([path]) => path)).toEqual(['/Diagrams/UML_Fun.css', '/Diagrams/Order flow.puml'])
    expect(q('.plantuml-editor')).toBeNull()
  })

  it('holds the page while either file is unsaved', async () => {
    await open()
    view().dispatch({ changes: { from: 0, insert: "' mine\n" } })
    await settle()
    await pressChip('UML_Fun.css')
    const event = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('opens a file that may only be read as read-only, locked and never saved', async () => {
    vi.useFakeTimers()
    seams.fileAccess.mockImplementation(async (path) => (path === '/Diagrams/UML_Fun.css' ? { writable: false } : { writable: true }))
    await openStyle()

    typeLinked("' new\n")
    await vi.advanceTimersByTimeAsync(31000)

    expect(source()).toBe(STYLE)
    expect(q('.plantuml-editor__lock').title).toBe('Read only')
    expect(saveButton().hidden).toBe(true)
    expect(seams.saveFile).not.toHaveBeenCalled()
  })

  it('stops sending overrides once the linked file is saved as a copy', async () => {
    seams.saveCopy.mockResolvedValue({ node: { path: '/Diagrams/UML_Fun (copy).css', basename: 'UML_Fun (copy).css' }, etag: '"c1"' })
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    await openStyle()
    typeLinked("' new\n")
    saveButton().click() // Save as copy shows on a conflict (S8)
    await settle()

    copyButton().click()
    await settle()
    typeLinked(' ')

    expect(q('.plantuml-editor__name').textContent).toBe('Order flow.puml›UML_Fun (copy).css')
    expect(seams.debouncedRender.mock.calls.at(-1)[4]).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/js/editor.test.js`
Expected: FAIL.
- Going back does not save.
- Closing PUTs only the main file.
- `beforeunload` is not prevented while the main file is parked.
- The bar's buttons act on the main file.

- [ ] **Step 3: Write the minimal implementation**

```js
  /** R15: going back saves first, under S4's rules; false when it stayed. */
  async function goBack() {
    const { session } = linked
    if (session.isDirty() && !session.blocked()) {
      await session.saveBeforeLeaving()
      if (session.status().conflict) return false
    }
    if (session.isDirty() && !window.confirm(t(APP_ID, 'Discard unsaved changes?'))) return false
    // … then Task 6's restore of the main file.
  }

  async function close() {
    if (linked && !(await goBack())) return
    // … as today, on main.session.
  }

  function onBeforeUnload(event) {
    // main.session.doc() reads the parked state while a linked file is open.
    if (main?.session.isDirty() || linked?.session.isDirty()) event.preventDefault()
  }
```

- The bar's handlers act on the open file: `saveButton`, `reloadButton`, `refreshButton`, `copyButton`, and Mod-s in `onKeydown` all call `(linked ?? main).session.save()` and the like.
- `showButtons()` sets `saveButton.hidden = Boolean(linked?.readOnly)`.
- Reload in the linked file replaces its text through the linked session's `replace`, which dispatches into `view`, annotated `fromFile`, so it lands in a read-only file too.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/js/editor.test.js tests/js/file-session.test.js`
Expected: PASS, both files.

- [ ] **Step 5: Commit**

```bash
git add src/editor.js tests/js/editor.test.js
git commit -m "Editor: a linked file saves, conflicts and goes read-only as the main file does" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Docs, deploy and live check

**Files:**
- Modify: `CHANGELOG.md`. Under Unreleased: "Open a linked style or include file from its line; the diagram follows it live".
- Modify: `AGENTS.md`, the repo map's `src/editor/` row: add `file-session.js`, `paths.js`, `extensions.js`, `breadcrumb.js` and `linked/` (`links.js`, `chips.js`, `sheet.js`).
- Create, if missing: `docs/design/linked-main.png`, `linked-ctrl.png`, `linked-style.png` and `linked-include.png`, exported from the four boards with `export_shape` and listed in `docs/design/README.md`.

- [ ] **Step 1: Write the docs.** Set the spec statuses of R9–R18 and of the `overrides` row to `shipped (#<PR>)`, but only if the other agent's spec edits are committed by then. If they are not, write "statuses wait on the spec commit" in the ledger.

- [ ] **Step 2: Run the whole suite**

Run: `composer run test:unit && composer run psalm && composer run cs:check && npx vitest run && npm run lint && npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js && bash tests/integration/bin/check-step-definitions.sh && bash tests/integration/bin/check-suites.sh`
Expected: every command succeeds: vitest reports 0 failed, psalm reports no errors, and the guard exits 0.

- [ ] **Step 3: Deploy to the live instance** by CONTRIBUTING's recipe.
  1. Run `tar -C . --exclude=node_modules --exclude=vendor --exclude=.git --exclude=.superpowers --exclude=.signing --exclude='*.map' --exclude=./docs -cf - .`, piped into the Nextcloud pod's `custom_apps/plantuml`.
  2. `chown -R www-data:www-data` it.
  3. Compare the md5 sums of this build's `dist/plantuml-*.js dist/chunks/*.js`.

Expected: every sum matches.

- [ ] **Step 4: Live check** in the shared `claudecode` browser. Sign in through the selenium-flow `grafana` secret (`write` with `secret: {name: 'grafana', key: …}`). Open a diagram holding the `screens / linked-main` source and its two linked files, in the light and the dark theme, and compare it against the four boards. Check, and report each difference from the boards:
  - the chip after `<style file=./UML_Fun.css>` opens it;
  - Ctrl+click on the path opens it, and the path turns primary and underlined while Ctrl is held;
  - the breadcrumb, ×, crumb and Escape go back to the same place;
  - the Add button hides and comes back, if it exists;
  - a colour typed in the style file redraws the diagram before it is saved;
  - autosave lands, and the file's ETag changes;
  - a read-only shared style file opens with the lock and no save indicator;
  - a no-download shared file has no chip.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md AGENTS.md docs/design
git commit -m "Docs: the linked-files round" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
