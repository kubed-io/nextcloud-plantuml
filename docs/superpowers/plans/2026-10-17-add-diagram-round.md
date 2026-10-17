# Add-diagram Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The editor's bar gains an **Add diagram** split button: **▾** adds a type's Empty diagram at once, **+** opens a modal of every type's templates (built in, the admin's shared template folder, the user's own Templates folder) and adds the one picked.

**Architecture:** The server gains `Service/TemplateLibrary` (the admin's folder, its actor, the caller's Templates folder, read within caps) behind `GET /apps/plantuml/templates`, a second declarative admin card for the folder, and two `occ plantuml:show-config` lines. The editor gains `src/editor/add/`: pure modules that arrange the templates (A5, A8, A9) and append a block (A4), and the menu and modal that use them. Only the split button and the pure insert helpers are in the editor entry; the menu, the modal and the template data are one chunk `import()`ed on the first click, so the entry hardly grows.

**Tech Stack:** PHP 8.2+ on Nextcloud 34 (OCP `IAppConfig`, `IGroupManager`, `IUserManager`, `IRootFolder`, `ITemplateManager`, declarative settings), PHPUnit; vanilla-DOM editor on CodeMirror 6 (`crelt`, `@codemirror/commands`' `isolateHistory`), Vite 8, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md` (TP1–TP5, the `GET /apps/plantuml/templates` route row, the `TemplatesController`/`TemplateLibrary` and `InstanceSettings` unit rows, the admin copy, the Add diagram row of the design table) and `docs/superpowers/specs/2026-10-14-editor-design.md` (A1–A9, Known limitations "A template's relative links are copied as written"). Read both before any task.

**Built with** the kb MCP's skills: `skill://superpowers/writing-plans/SKILL.md`, `skill://superpowers/test-driven-development/SKILL.md`, and `skill://penpot/penpot-router/SKILL.md` (its read-only Phase 0 discovery only). Every size, token and string marked *board* below was read off the Penpot file "NXT PlantUML" (pages Add diagram, Components → `library / add diagram`, Admin) on 2026-10-17, not guessed.

## Global Constraints

- Repo `/projects/kubed-io/nextcloud-plantuml`, branch `add-diagram-round` off `main`. PHP tests `composer run test:unit`; JS tests `npx vitest run`; build `npm run build`; lint `npm run lint`.
- After `npm run build` the chunk guard must pass: `! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`. `src/editor.js` imports `src/editor/add/button.js` and `src/editor/add/insert.js` statically and everything else under `src/editor/add/` only through `import()`.
- No new npm or composer dependency. MDI path data is copied into `src/editor/data/template-icons.js` from `@mdi/js` **7.4.47** (Apache-2.0), fetched once with `npm pack` into the scratchpad, never installed.
- Caps (TP3): at most **64 files** and **1048576 bytes** of text in all ("1 MB", the same numbers as `IncludeResolver::MAX_FILES` and `MAX_BYTES`).
- App config keys: `template_folder` (default `Templates`), `template_actor` (no default). The actor fallback is the first member of the `admin` group.
- UI copy, exactly: "Add diagram" (the + half's label and title, the modal's title), "Add a diagram of a type" (the ▾ half's label), "Search" (placeholder), "Close", "Shared · " and "Yours · " (description prefixes), "Templates", "Diagrams everyone can start from, in Add diagram", "Template folder", "In <actor>'s files · N templates in M files".
- Built-in templates never use `skinparam`; any styling is a `<style>` block (TP5, A8).
- The types (A6), in this order, `type` → display name → icon (A7): uml UML shape-outline, bpm BPM cog-transfer-outline, board Board view-column-outline, chart Chart chart-bar, chen Chen ER relation-one-to-many, creole Creole format-text, dot DOT graph-outline, ditaa Ditaa draw, ebnf EBNF alphabetical-variant, files Files file-tree-outline, flow Flow transit-connection-variant, gantt Gantt chart-gantt, git Git source-branch, hcl HCL code-equal, json JSON code-json, latex LaTeX sigma, math Math math-integral, mindmap MindMap head-lightbulb-outline, project Project calendar-range-outline, regex Regex regex, salt Salt application-outline, sprites Sprites checkerboard, wbs WBS sitemap-outline, wire Wire connection, yaml YAML format-indent-increase, nwdiag nwdiag lan, packetdiag packetdiag table-row.
- **`.feature` files, this round only (Dr K, 2026-10-17: "do touch .feature files and write the test definitions"):** remove `@unbuilt` from the four approved template scenarios in `features/diagrams/edit.feature` once their definitions are written (Task 5), and change a step's wording only if a definition truly cannot be written for it, recording why in `features/AGENTS.md`. No other `.feature` edit; a new scenario is still proposed to Dr K. This round writes every step definition it needs.
- Never write a real name or a homelab hostname into a file; the maintainer is Dr K; fixture users are `drk` and `alice`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Shared ground with the other two rounds of 2026-10-17** (planned order: Viewer → Linked files → Add diagram). The Viewer round adds `lib/Service/Diagrams.php` (B1 on the server); the Linked-files round turns the bar's name into a breadcrumb, adds `openLinked`/`goBack` to `src/editor.js` and changes `IncludeResolver` (`overrides`). If either has landed first: keep the split button just before the Source toggle whatever the name became, hide it while a linked file is open (Task 10 Steps 5–8, Dr K's ruling), and make Task 1's move on top of its `IncludeResolver`. `TemplateLibrary::blocks()` stays its own: it counts only A6's types, which `Diagrams` does not. The Viewer round also splits `IncludeResolver::forbidsDownload()` out of `viewOnly()` (used by `ExportController`): Task 1 moves it into `FileReader` as `downloadForbidden` and points `ExportController` at it, so one helper decides for drawings, exports and templates.

## Rulings (where the spec is silent, or the boards say more)

- **The built-ins' names** (A4 "the template's name"): *board* `screens / added-class` adds Class as `@startuml class-diagram`, so each UML built-in carries a `name`, `<title in kebab case>-diagram` (`sequence-diagram`, `use-case-diagram` …). Empty's is the type's word (A4). **Example's** is the type's word too (spec silent; flagged to Dr K).
- **Example's description** is the example's first body line (*board*: Example reads "Alice -> Bob : hi").
- **A file template's `path`** is the file's path in its owner's files: *board* "Yours · Templates/retro.puml".
- **The menu does not ask `GET /templates`**: it adds only Empty, which is built in (A5 says both ask; the menu has no use for the answer).
- **The modal is hand-built, not `NcModal`**: the editor has no Vue. *Board*: 880 × 600, centred on a black backdrop at 50 % opacity.
- **The Templates section is a second declarative form** (`Settings/TemplateSettings`): a form has one title and one description, so a second title needs a second form in the same section.
- **Empties are not drawn in CI**: the server answers an empty block with 400 (checked 2026-10-17: 21 of 27 types). The nine UML built-ins and the 27 types' Examples are drawn (all 36 answer 200, checked 2026-10-17); no workflow runs `doc-examples.mjs`, so `template-examples.mjs` draws the Examples itself.
- **The status line costs nothing on most pages**: core builds every declarative form's schema on every admin and personal settings page, and on each value read and save. So the line is worked out only for a user in the `admin` group, once per form instance, and reading it never makes the folder (only saving the setting and `GET /templates` do).
- **The Templates form's priority is 20**: core sorts declarative and classic settings of a section together, and the Test connection button (`AdminTest`) is 10, so 6 would put Templates between the URL and its button.
- **N in the status line counts templates as A9 does**: the closed blocks of A6's types (a `def`, an unclosed or a misspelt block is no template). PHP keeps A6's 27 words as `TemplateLibrary::TYPES`; a JS test keeps it equal to `TYPES`.
- **An added block drops its `(id=…)`**: adding a template twice would give the file two blocks of one id, and `!include file!ID` would then name either. Other arguments stay.
- **The file's final newline is kept**: a file that ended with a newline still does, after the added `@end` line; one that did not still does not; an empty file gets the block alone.
- **A tab's name is taken even when the block is unnamed**: an unnamed block's tab reads its type's word (B2), so Empty `uml` in a file holding an unnamed `@startuml` is added as `uml-2`.

## Review Focus

1. **Escape inside the menu or the modal** closes only that, never the editor: `src/editor.js`'s document `keydown` closes the editor on any Escape not `defaultPrevented`. Pinned in Tasks 10 and 11.
2. **A download-forbidden file in the template folder** (a view-only share someone made to the actor) must not be served to every user as text, as `IncludeResolver::viewOnly` refuses it in a drawing. Pinned in Task 2.
3. **No actor** (an empty `admin` group, a `template_actor` naming a deleted user): the route still answers with the user's own templates, the card has no status line, `show-config` prints `template_actor: (none)`. Pinned in Tasks 2 and 4.
4. **A folder setting that climbs or runs through a file** (`../x`, `a/./b`, `a` being a file): refused on save with the reason logged; no folder made. Pinned in Task 2.
5. **A file with no closed block, or a name the file already has** (`class-diagram` twice, or an unnamed `@startuml` and Empty UML): no template from an unclosed block; the second add is `class-diagram-2`, the Empty `uml-2`. Pinned in Tasks 8, 9 and 10.
6. **Settings pages for everyone**: the Templates form's schema is built for every user on every settings page; a non-admin's build reads no file and makes no folder. Pinned in Task 4.

---

## File Structure

| File | Does |
|---|---|
| `lib/Service/FileReader.php` (new) | Static helpers moved out of `IncludeResolver`: a capped read, a size, whether a file's share forbids download. |
| `lib/Service/TemplateLibrary.php` (new) | TP1–TP3: the folder setting, the actor, making the folder, the template files within the caps. |
| `lib/Controller/TemplatesController.php` (new) | `GET /templates`. |
| `lib/Settings/TemplateSettings.php` (new) | TP4's card. |
| `lib/Command/ShowConfig.php`, `lib/AppInfo/Application.php`, `appinfo/routes.php`, `tests/ocp-stubs.php` | Two lines; the card registered; the route; five stub methods. |
| `tests/integration/bootstrap/Steps/TemplateSteps.php` (new), `FeatureContext.php`, `Steps/ShareSteps.php`, `features/diagrams/edit.feature`, `features/AGENTS.md` | The four approved scenarios' step definitions; `@unbuilt` off them; their note. |
| `src/editor/data/template-icons.js` (new) | A7's 36 paths and `iconSvg()`. |
| `src/editor/data/templates.json` (new) | A8's nine UML built-ins. |
| `src/editor/add/types.js` (new) | A6's 27 types. |
| `src/editor/add/catalog.js` (new) | A5, A8, A9: every template, by type, in order; the search. Pure. |
| `src/editor/add/insert.js` (new, in the entry) | A4: the unique name, the named block, the change. Pure. |
| `src/editor/add/route.js`, `menu.js`, `modal.js`, `index.js` (new, the chunk) | The route, A2, A3, and the chunk's one entry point. |
| `src/editor/add/button.js` (new, in the entry) | A1's split button. |
| `src/editor.js`, `src/editor/completion/directives.js`, `css/editor.css`, `img/icons/plus.svg`, `img/icons/chevron-down.svg` | Wiring and looks. |
| `scripts/template-examples.mjs` (new), `scripts/lib.mjs`, `scripts/doc-examples.mjs`, `.github/workflows/integration.yml` | A8's CI check. |

---

### Task 1: `FileReader`, out of `IncludeResolver`

The template library reads files as the resolver does: move the helpers, do not copy them.

**Files:**
- Create: `lib/Service/FileReader.php`, `tests/unit/MemoryStream.php`
- Modify: `lib/Service/IncludeResolver.php` (`viewOnly()` ~761, `fileSize()` ~803, `content()` ~815 and their callers)
- Test: `tests/unit/FileReaderTest.php`

**Interfaces:**
- Produces: `FileReader::read(File $file, int $limit): ?string`, `FileReader::size(File $file): ?int`, `FileReader::downloadForbidden(File $file): bool`; `MemoryStream::of(string $content)` (a `php://memory` resource) for tests.

- [ ] **Step 1: Write the failing test**

`tests/unit/MemoryStream.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

/** A readable stream holding `$content`, as a File's fopen('r') gives. */
final class MemoryStream {
	/** @return resource */
	public static function of(string $content) {
		$handle = fopen('php://memory', 'r+');
		if (!is_resource($handle)) {
			throw new \RuntimeException('no memory stream');
		}
		fwrite($handle, $content);
		rewind($handle);
		return $handle;
	}
}
```

`tests/unit/FileReaderTest.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\FileReader;
use OCP\Files\File;
use OCP\Files\Storage\IStorage;
use OCP\Files\Storage\ISharedStorage;
use OCP\Lock\LockedException;
use OCP\Share\IAttributes;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;

final class FileReaderTest extends TestCase {
	private function file(mixed $stream): File {
		$file = $this->createStub(File::class);
		$file->method('fopen')->willReturn($stream);
		return $file;
	}

	private function onStorage(IStorage $storage): File {
		$file = $this->createStub(File::class);
		$file->method('getStorage')->willReturn($storage);
		return $file;
	}

	private function share(?bool $download): ISharedStorage {
		$attributes = $this->createStub(IAttributes::class);
		$attributes->method('getAttribute')->willReturnCallback(static fn (string $scope, string $key): ?bool => [$scope, $key] === ['permissions', 'download'] ? $download : null);
		$share = $this->createStub(IShare::class);
		$share->method('getAttributes')->willReturn($attributes);
		$storage = $this->createStub(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturnCallback(static fn (string $class): bool => $class === 'OCA\Files_Sharing\SharedStorage');
		$storage->method('getShare')->willReturn($share);
		return $storage;
	}

	public function testReadStopsOneByteAfterTheLimit(): void {
		self::assertSame('01234', FileReader::read($this->file(MemoryStream::of('0123456789')), 4));
	}

	public function testReadIsNullWithoutAStream(): void {
		self::assertNull(FileReader::read($this->file(false), 4));
	}

	public function testReadIsNullWhenTheStorageRefuses(): void {
		$file = $this->createStub(File::class);
		$file->method('fopen')->willThrowException(new LockedException('locked'));
		self::assertNull(FileReader::read($file, 4));
	}

	public function testDownloadForbiddenOnAViewOnlyShare(): void {
		self::assertTrue(FileReader::downloadForbidden($this->onStorage($this->share(false))));
	}

	public function testDownloadAllowedOnAShareThatAllowsIt(): void {
		self::assertFalse(FileReader::downloadForbidden($this->onStorage($this->share(null))));
	}

	public function testDownloadAllowedOffAShare(): void {
		$storage = $this->createStub(IStorage::class);
		$storage->method('instanceOfStorage')->willReturn(false);
		self::assertFalse(FileReader::downloadForbidden($this->onStorage($storage)));
	}

	public function testDownloadForbiddenWhenTheStorageThrows(): void {
		$file = $this->createStub(File::class);
		$file->method('getStorage')->willThrowException(new \Exception('no storage'));
		self::assertTrue(FileReader::downloadForbidden($file));
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `composer run test:unit -- --filter FileReaderTest`
Expected: FAIL, `Class "OCA\PlantUml\Service\FileReader" not found`.

- [ ] **Step 3: Write minimal implementation**

`lib/Service/FileReader.php` takes the bodies of `IncludeResolver::content()` and `fileSize()` as they are today, and the share half of `viewOnly()`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\Files_Sharing\SharedStorage;
use OCP\Files\ConnectionLostException;
use OCP\Files\File;
use OCP\Files\ForbiddenException;
use OCP\Files\GenericFileException;
use OCP\Files\InvalidPathException;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Files\StorageInvalidException;
use OCP\Files\StorageNotAvailableException;
use OCP\Lock\LockedException;

/** Reading a user's file as the resolver and the template library both do. */
final class FileReader {
	/**
	 * At most `$limit` + 1 bytes, read through a stream: a stored size can be
	 * wrong. Null when there is no stream, rather than a read of any size.
	 */
	public static function read(File $file, int $limit): ?string {
		try {
			$handle = $file->fopen('r');
			if (!is_resource($handle)) {
				return null;
			}
			try {
				$content = stream_get_contents($handle, $limit + 1);
			} finally {
				fclose($handle);
			}
			return $content === false ? null : $content;
		} catch (NotPermittedException|GenericFileException|LockedException|NotFoundException|InvalidPathException|StorageNotAvailableException|StorageInvalidException|ForbiddenException|ConnectionLostException) {
			return null;
		}
	}

	public static function size(File $file): ?int {
		try {
			return (int)$file->getSize();
		} catch (InvalidPathException|NotFoundException|StorageNotAvailableException|StorageInvalidException|ForbiddenException) {
			return null;
		}
	}

	/**
	 * On a share whose owner forbids download, which a picture or a copy of
	 * its text would get around; as files_sharing's ViewOnly decides it. A
	 * storage that cannot say is taken to forbid it.
	 */
	public static function downloadForbidden(File $file): bool {
		try {
			$storage = $file->getStorage();
			return $storage->instanceOfStorage(SharedStorage::class)
				&& $storage->getShare()->getAttributes()?->getAttribute('permissions', 'download') === false;
		} catch (\Throwable) {
			// Core throws a bare Exception for a node without storage.
			return true;
		}
	}
}
```

In `IncludeResolver`, delete `content()` and `fileSize()`, replace each `self::content(` with `FileReader::read(` and each `self::fileSize(` with `FileReader::size(`, drop the `use` lines nothing else in the file needs (`ConnectionLostException`, `GenericFileException` and `LockedException` if `grep` finds no other use), and make `viewOnly()`:

```php
	private function viewOnly(File $file): bool {
		return FileReader::downloadForbidden($file)
			&& ($this->ownShare === null || self::shareOf($file) !== $this->ownShare);
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `composer run test:unit`
Expected: PASS, `FileReaderTest` and an unchanged `IncludeResolverTest` green.

- [ ] **Step 5: Commit**

```bash
git add lib/Service/FileReader.php lib/Service/IncludeResolver.php tests/unit/FileReaderTest.php tests/unit/MemoryStream.php
git commit -m "FileReader: the resolver's file reads, for the template library too"
```

---

### Task 2: `TemplateLibrary` (TP1–TP3)

**Files:**
- Create: `lib/Service/TemplateLibrary.php`
- Modify: `tests/ocp-stubs.php` (stub methods below)
- Test: `tests/unit/TemplateLibraryTest.php`

**Interfaces:**
- Consumes: `FileReader::read`, `FileReader::downloadForbidden` (Task 1).
- Produces: `TemplateLibrary` with `KEY_FOLDER`, `KEY_ACTOR`, `DEFAULT_FOLDER`, `MAX_FILES`, `MAX_BYTES`, `TYPES` (A6's 27 words); `folder(): string`; `setFolder(string $path): void` (throws `\InvalidArgumentException`); `actor(): ?string`; `ensureFolder(): ?Folder` (makes it); `files(): list<array{source: 'shared'|'yours', path: string, text: string}>` (makes the folder first); `summary(): array{actor: ?string, templates: int, files: int}` (never makes it); `static blocks(string $text): int`.

- [ ] **Step 1: Add the stub methods the library needs**

In `tests/ocp-stubs.php`, the `IGroup`, `IGroupManager` and `Folder` declarations become:

```php
	if (!interface_exists(IGroup::class, false)) {
		interface IGroup {
			public function getGID(): string;

			// TemplateLibrary takes the first member of `admin` as its actor.
			/** @return list<IUser> */
			public function getUsers(): array;
		}
	}
	if (!interface_exists(IGroupManager::class, false)) {
		interface IGroupManager {
			/** @return list<IGroup> */
			public function search(string $search): array;

			// TemplateLibrary's actor fallback, and TemplateSettings' status line (admins only).
			public function get(string $gid): ?IGroup;

			public function isAdmin(string $userId): bool;
		}
	}
```

```php
	if (!interface_exists(Folder::class, false)) {
		interface Folder extends Node {
			/** @return list<Node> */
			public function getDirectoryListing(): array;

			public function nodeExists(string $path): bool;

			public function get(string $path): Node;

			public function newFolder(string $path): Folder;

			public function newFile(string $path, mixed $content = null): File;

			// TemplateLibrary lists a template folder's `.puml` files in one cache query,
			// and names each by its path in its owner's files.
			/** @return list<Node> */
			public function searchByMime(string $mimetype): array;

			public function getRelativePath(string $path): ?string;
		}
	}
```

- [ ] **Step 2: Write the failing test**

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\TemplateLibrary;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\Storage\IStorage;
use OCP\Files\Storage\ISharedStorage;
use OCP\Files\NotPermittedException;
use OCP\Files\Template\ITemplateManager;
use OCP\IAppConfig;
use OCP\IGroup;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Share\IAttributes;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * An in-memory Nextcloud: `$files` and `$folders` keyed by full path
 * (`/admin/files/Templates/a.puml`), the admin `admin` and the caller `drk`.
 */
final class TemplateLibraryTest extends TestCase {
	/** @var array<string,string> */
	private array $stored = [];
	/** @var array<string,File> */
	private array $files = [];
	/** @var array<string,true> */
	private array $folders = ['/admin/files' => true, '/drk/files' => true];
	/** @var list<string> */
	private array $made = [];
	private int $ids = 0;
	/** @var list<string> */
	private array $admins = ['admin'];
	private string $caller = 'drk';
	private string $ownTemplates = '/Templates';
	private bool $searchFails = false;
	private bool $newFolderFails = false;
	private LoggerInterface $logger;

	protected function setUp(): void {
		parent::setUp();
		$this->logger = $this->createStub(LoggerInterface::class);
	}

	private function library(): TemplateLibrary {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturnCallback(fn (string $app, string $key, string $default = ''): string => $this->stored["$app/$key"] ?? $default);
		$config->method('setValueString')->willReturnCallback(function (string $app, string $key, string $value): bool {
			$this->stored["$app/$key"] = $value;
			return true;
		});
		$config->method('deleteKey')->willReturnCallback(function (string $app, string $key): void {
			unset($this->stored["$app/$key"]);
		});
		$group = $this->createStub(IGroup::class);
		$group->method('getUsers')->willReturnCallback(fn (): array => array_map($this->user(...), $this->admins));
		$groups = $this->createStub(IGroupManager::class);
		$groups->method('get')->willReturnCallback(static fn (string $gid): ?IGroup => $gid === 'admin' ? $group : null);
		$users = $this->createStub(IUserManager::class);
		$users->method('userExists')->willReturnCallback(static fn (string $uid): bool => in_array($uid, ['admin', 'drk'], true));
		$root = $this->createStub(IRootFolder::class);
		$root->method('getUserFolder')->willReturnCallback(fn (string $uid): Folder => $this->folderAt("/$uid/files"));
		$templates = $this->createStub(ITemplateManager::class);
		$templates->method('getTemplatePath')->willReturnCallback(fn (): string => $this->ownTemplates);
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturnCallback(fn (): IUser => $this->user($this->caller));
		return new TemplateLibrary($config, $groups, $users, $root, $templates, $session, $this->logger);
	}

	private function user(string $uid): IUser {
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn($uid);
		return $user;
	}

	private function folderAt(string $path): Folder {
		$folder = $this->createStub(Folder::class);
		$folder->method('getPath')->willReturn($path);
		$folder->method('nodeExists')->willReturnCallback(fn (string $name): bool => isset($this->folders["$path/$name"]) || isset($this->files["$path/$name"]));
		$folder->method('get')->willReturnCallback(function (string $name) use ($path): Node {
			$at = $path . '/' . ltrim($name, '/');
			return $this->files[$at] ?? (isset($this->folders[$at]) ? $this->folderAt($at) : throw new NotFoundException($at));
		});
		$folder->method('newFolder')->willReturnCallback(function (string $name) use ($path): Folder {
			if ($this->newFolderFails) {
				throw new NotPermittedException('read-only');
			}
			$this->folders["$path/$name"] = true;
			$this->made[] = "$path/$name";
			return $this->folderAt("$path/$name");
		});
		$folder->method('searchByMime')->willReturnCallback(function () use ($path): array {
			if ($this->searchFails) {
				throw new \RuntimeException('storage gone');
			}
			return array_values(array_filter($this->files, static fn (File $f): bool => str_starts_with($f->getPath(), "$path/")));
		});
		$folder->method('getRelativePath')->willReturnCallback(static fn (string $p): ?string => str_starts_with($p, "$path/") ? substr($p, strlen($path)) : null);
		return $folder;
	}

	private function put(string $path, string $text, ?IStorage $storage = null, bool $readable = true): void {
		$own = $this->createStub(IStorage::class);
		$own->method('instanceOfStorage')->willReturn(false);
		$file = $this->createStub(File::class);
		$file->method('getId')->willReturn(++$this->ids);
		$file->method('getPath')->willReturn($path);
		$file->method('getStorage')->willReturn($storage ?? $own);
		$file->method('fopen')->willReturnCallback(static fn () => $readable ? MemoryStream::of($text) : false);
		$this->files[$path] = $file;
		$this->folders[dirname($path)] = true;
	}

	private function viewOnlyShare(): ISharedStorage {
		$attributes = $this->createStub(IAttributes::class);
		$attributes->method('getAttribute')->willReturn(false);
		$share = $this->createStub(IShare::class);
		$share->method('getAttributes')->willReturn($attributes);
		$storage = $this->createStub(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturnCallback(static fn (string $class): bool => $class === 'OCA\Files_Sharing\SharedStorage');
		$storage->method('getShare')->willReturn($share);
		return $storage;
	}

	/** @return list<string> "source path" */
	private function listed(): array {
		return array_map(static fn (array $f): string => "{$f['source']} {$f['path']}", $this->library()->files());
	}

	public function testTheFolderDefaultsToTemplates(): void {
		self::assertSame('Templates', $this->library()->folder());
	}

	public function testAnEmptyFolderGoesBackToTheDefault(): void {
		$this->stored['plantuml/template_folder'] = 'Diagrams';
		$this->library()->setFolder(' / ');
		self::assertArrayNotHasKey('plantuml/template_folder', $this->stored);
	}

	public function testSavingTheFolderMakesItInTheActorsFiles(): void {
		$this->library()->setFolder('/Diagrams/Templates/');
		self::assertSame('Diagrams/Templates', $this->stored['plantuml/template_folder']);
		self::assertSame(['/admin/files/Diagrams', '/admin/files/Diagrams/Templates'], $this->made);
	}

	/** @return iterable<string, array{string}> */
	public static function climbing(): iterable {
		yield 'up' => ['../x'];
		yield 'here' => ['a/./b'];
		yield 'empty segment' => ['a//b'];
		yield 'control' => ["a\nb"];
	}

	#[DataProvider('climbing')]
	public function testAFolderThatClimbsIsRefused(string $path): void {
		try {
			$this->library()->setFolder($path);
			self::fail('expected a refusal');
		} catch (\InvalidArgumentException $e) {
			self::assertSame("Template folder must be a folder in the actor's files", $e->getMessage());
		}
		self::assertSame([], $this->stored);
		self::assertSame([], $this->made);
	}

	public function testAFolderThroughAFileIsRefused(): void {
		$this->put('/admin/files/a', 'not a folder');
		$this->expectException(\InvalidArgumentException::class);
		try {
			$this->library()->setFolder('a/b');
		} finally {
			self::assertSame([], $this->stored);
		}
	}

	public function testAFolderTheActorCannotMakeIsRefusedAndLogged(): void {
		$this->newFolderFails = true;
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::once())->method('warning');
		$this->logger = $logger;
		try {
			$this->library()->setFolder('Diagrams');
			self::fail('expected a refusal');
		} catch (\InvalidArgumentException $e) {
			self::assertSame("Template folder cannot be made in the actor's files", $e->getMessage());
			self::assertInstanceOf(NotPermittedException::class, $e->getPrevious());
		}
		self::assertSame([], $this->stored);
	}

	public function testTheActorIsTheConfiguredUser(): void {
		$this->stored['plantuml/template_actor'] = 'drk';
		self::assertSame('drk', $this->library()->actor());
	}

	public function testAConfiguredActorWhoIsGoneMeansNoActor(): void {
		$this->stored['plantuml/template_actor'] = 'ghost';
		self::assertNull($this->library()->actor());
	}

	public function testTheActorFallsBackToTheFirstAdmin(): void {
		$this->admins = ['admin', 'drk'];
		self::assertSame('admin', $this->library()->actor());
	}

	public function testNoAdminMeansNoActorAndOnlyYourOwn(): void {
		$this->admins = [];
		$this->put('/drk/files/Templates/x.puml', "@startuml\n@enduml");
		$library = $this->library();
		self::assertNull($library->actor());
		self::assertSame(['yours Templates/x.puml'], $this->listed());
		self::assertNull($library->summary()['actor']);
	}

	public function testSharedThenYoursEachByPath(): void {
		$this->put('/admin/files/Templates/sub/b.puml', "@startuml\n@enduml");
		$this->put('/admin/files/Templates/a.puml', "@startuml\n@enduml");
		$this->put('/drk/files/Templates/x.puml', "@startuml\n@enduml");
		self::assertSame(['shared Templates/a.puml', 'shared Templates/sub/b.puml', 'yours Templates/x.puml'], $this->listed());
	}

	public function testAFileInBothIsListedOnceAsShared(): void {
		$this->caller = 'admin';
		$this->put('/admin/files/Templates/a.puml', "@startuml\n@enduml");
		self::assertSame(['shared Templates/a.puml'], $this->listed());
	}

	public function testAViewOnlyShareInTheFolderIsLeftOut(): void {
		$this->put('/admin/files/Templates/theirs.puml', "@startuml\nsecret\n@enduml", $this->viewOnlyShare());
		$this->put('/admin/files/Templates/a.puml', "@startuml\n@enduml");
		self::assertSame(['shared Templates/a.puml'], $this->listed());
	}

	public function testTheSixtyFifthFileIsLeftOut(): void {
		for ($i = 10; $i < 75; $i++) {
			$this->put("/admin/files/Templates/t$i.puml", "@startuml\n@enduml");
		}
		$listed = $this->listed();
		self::assertCount(64, $listed);
		self::assertNotContains('shared Templates/t74.puml', $listed);
	}

	public function testTextPastAMegabyteInAllIsLeftOut(): void {
		$this->put('/admin/files/Templates/a.puml', str_repeat('a', 600000));
		$this->put('/admin/files/Templates/b.puml', str_repeat('b', 600000));
		$this->put('/admin/files/Templates/c.puml', "@startuml\n@enduml");
		self::assertSame(['shared Templates/a.puml', 'shared Templates/c.puml'], $this->listed());
	}

	public function testInvalidUtf8IsLeftOut(): void {
		$this->put('/admin/files/Templates/bad.puml', "@startuml\n\xff\n@enduml");
		self::assertSame([], $this->listed());
	}

	public function testAnUnreadableFileIsLeftOut(): void {
		$this->put('/admin/files/Templates/a.puml', '', null, false);
		self::assertSame([], $this->listed());
	}

	public function testNoTemplatesFolderSetGivesOnlyShared(): void {
		$this->ownTemplates = '';
		$this->put('/admin/files/Templates/a.puml', "@startuml\n@enduml");
		$this->put('/drk/files/Templates/x.puml', "@startuml\n@enduml");
		self::assertSame(['shared Templates/a.puml'], $this->listed());
	}

	public function testAMissingTemplatesFolderGivesOnlyShared(): void {
		$this->ownTemplates = '/Gone';
		$this->put('/admin/files/Templates/a.puml', "@startuml\n@enduml");
		self::assertSame(['shared Templates/a.puml'], $this->listed());
	}

	public function testListingMakesTheFolderAgain(): void {
		$this->library()->files();
		self::assertSame(['/admin/files/Templates'], $this->made);
	}

	public function testAStorageFailureLeavesTheSourceOutAndIsLogged(): void {
		$this->searchFails = true;
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::atLeastOnce())->method('warning');
		$this->logger = $logger;
		self::assertSame([], $this->listed());
	}

	public function testSummaryCountsTemplatesAndFiles(): void {
		$this->put('/admin/files/Templates/a.puml', "@startuml\n@enduml\n@startgantt\n@endgantt\n@startmindmap\n@endmindmap");
		$this->put('/admin/files/Templates/b.puml', "@startuml\n@enduml");
		$this->put('/drk/files/Templates/x.puml', "@startuml\n@enduml");
		self::assertSame(['actor' => 'admin', 'templates' => 4, 'files' => 2], $this->library()->summary());
	}

	public function testSummaryNeverMakesTheFolder(): void {
		self::assertSame(['actor' => 'admin', 'templates' => 0, 'files' => 0], $this->library()->summary());
		self::assertSame([], $this->made);
	}

	/** @return iterable<string, array{string, int}> */
	public static function texts(): iterable {
		yield 'two closed blocks' => ["@startuml\nA\n@enduml\n@startgantt\n@endgantt", 2];
		yield 'no block' => ['A -> B', 0];
		yield 'never closed' => ['  @startmindmap x', 0];
		yield 'definitions, no drawing' => ["@startdef\n!define A\n@enddef", 0];
		yield 'a type no one draws' => ["@startfoo\n@endfoo", 0];
		yield 'one block of two pages' => ["@startuml\nA\nnewpage\nB\n@enduml", 1];
		yield 'an unclosed block before a closed one' => ["@startuml\nA\n@startgantt\n@endgantt", 1];
		yield 'CRLF' => ["@startuml\r\nA\r\n@enduml\r\n", 1];
	}

	/** A9: a template is a closed block of a type Add diagram lists. */
	#[DataProvider('texts')]
	public function testBlocksCountsTemplatesAsTheEditorCutsThem(string $text, int $count): void {
		self::assertSame($count, TemplateLibrary::blocks($text));
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `composer run test:unit -- --filter TemplateLibraryTest`
Expected: FAIL, `Class "OCA\PlantUml\Service\TemplateLibrary" not found`.

- [ ] **Step 4: Write minimal implementation**

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\AppInfo\Application;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\Template\ITemplateManager;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IUserManager;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * What Add diagram can start from (TP1–TP3): the `.puml` files under the
 * admin's template folder, read as the folder's owner (the actor), so every
 * logged-in user gets them without a share; and those in the caller's own
 * Templates folder. Within caps; a file that cannot be read is left out.
 */
final class TemplateLibrary {
	public const KEY_FOLDER = 'template_folder';
	public const KEY_ACTOR = 'template_actor';
	public const DEFAULT_FOLDER = 'Templates';
	public const MAX_FILES = 64;
	public const MAX_BYTES = 1048576;
	/** A6's types, what a template's block may be; tests/js/add-data.test.js keeps it equal to src/editor/add/types.js. */
	public const TYPES = ['uml', 'bpm', 'board', 'chart', 'chen', 'creole', 'dot', 'ditaa', 'ebnf', 'files', 'flow', 'gantt', 'git', 'hcl', 'json', 'latex', 'math', 'mindmap', 'project', 'regex', 'salt', 'sprites', 'wbs', 'wire', 'yaml', 'nwdiag', 'packetdiag'];
	private const ADMIN_GROUP = 'admin';
	private const REFUSED = "Template folder must be a folder in the actor's files";
	private const UNMADE = "Template folder cannot be made in the actor's files";

	public function __construct(
		private readonly IAppConfig $config,
		private readonly IGroupManager $groups,
		private readonly IUserManager $users,
		private readonly IRootFolder $root,
		private readonly ITemplateManager $templates,
		private readonly IUserSession $session,
		private readonly LoggerInterface $logger,
	) {
	}

	public function folder(): string {
		$stored = $this->config->getValueString(Application::APP_ID, self::KEY_FOLDER, '');
		return $stored === '' ? self::DEFAULT_FOLDER : $stored;
	}

	/**
	 * Made in the actor's files at once (`mkdir -p`), as the siblings' ensureFolder.
	 *
	 * @throws \InvalidArgumentException for a path that climbs, runs through a file, or cannot be made
	 */
	public function setFolder(string $path): void {
		$path = trim(trim($path), '/');
		if ($path === '') {
			$this->config->deleteKey(Application::APP_ID, self::KEY_FOLDER);
			$this->ensureFolder();
			return;
		}
		$segments = explode('/', $path);
		if (preg_match('/[\x00-\x1f]/', $path) === 1 || array_intersect($segments, ['', '.', '..']) !== []) {
			throw new \InvalidArgumentException(self::REFUSED);
		}
		$actor = $this->actor();
		if ($actor !== null) {
			try {
				self::mkdirP($this->root->getUserFolder($actor), $segments);
			} catch (\InvalidArgumentException $e) {
				throw $e;
			} catch (\Throwable $e) {
				// NotPermittedException from a read-only mount, a full quota, an outage.
				$this->logger->warning("Template folder {folder} cannot be made in {actor}'s files", ['folder' => $path, 'actor' => $actor, 'exception' => $e]);
				throw new \InvalidArgumentException(self::UNMADE, 0, $e);
			}
		}
		$this->config->setValueString(Application::APP_ID, self::KEY_FOLDER, $path);
	}

	/** `template_actor` while that user exists, else the first member of `admin`. */
	public function actor(): ?string {
		$configured = $this->config->getValueString(Application::APP_ID, self::KEY_ACTOR, '');
		if ($configured !== '') {
			return $this->users->userExists($configured) ? $configured : null;
		}
		foreach ($this->groups->get(self::ADMIN_GROUP)?->getUsers() ?? [] as $user) {
			return $user->getUID();
		}
		return null;
	}

	public function ensureFolder(): ?Folder {
		$actor = $this->actor();
		if ($actor === null) {
			return null;
		}
		try {
			return self::mkdirP($this->root->getUserFolder($actor), explode('/', $this->folder()));
		} catch (\Throwable $e) {
			$this->logger->warning("Template folder {folder} cannot be made in {actor}'s files", ['folder' => $this->folder(), 'actor' => $actor, 'exception' => $e]);
			return null;
		}
	}

	/** Makes the folder again if it has gone (TP2). @return list<array{source: 'shared'|'yours', path: string, text: string}> */
	public function files(): array {
		$budget = ['files' => 0, 'bytes' => 0, 'seen' => []];
		$shared = $this->collect('shared', $this->sharedSource(true), $budget);
		return [...$shared, ...$this->collect('yours', $this->ownSource(), $budget)];
	}

	/** What the shared folder holds, for the admin card; never makes the folder. @return array{actor: ?string, templates: int, files: int} */
	public function summary(): array {
		$budget = ['files' => 0, 'bytes' => 0, 'seen' => []];
		$shared = $this->collect('shared', $this->sharedSource(false), $budget);
		return [
			'actor' => $this->actor(),
			'templates' => array_sum(array_map(static fn (array $file): int => self::blocks($file['text']), $shared)),
			'files' => count($shared),
		];
	}

	/**
	 * The templates the editor cuts from a text (A9), read as B1 reads blocks: a
	 * `@start` line opens one (dropping an unclosed one before it), an `@end`
	 * line closes it, and only a closed block of an A6 type is a template.
	 */
	public static function blocks(string $text): int {
		$count = 0;
		$open = null;
		foreach (preg_split('/\r?\n/', $text) ?: [] as $line) {
			if (preg_match('/^\s*@start(\w+)/', $line, $start) === 1) {
				$open = $start[1];
			} elseif ($open !== null && preg_match('/^\s*@end\w*\s*$/', $line) === 1) {
				$count += in_array($open, self::TYPES, true) ? 1 : 0;
				$open = null;
			}
		}
		return $count;
	}

	/** @return array{0: Folder, 1: Folder}|null the folder to search, and the files its paths are relative to */
	private function sharedSource(bool $make): ?array {
		$actor = $this->actor();
		if ($actor === null) {
			return null;
		}
		$folder = $make ? $this->ensureFolder() : $this->existingFolder($actor);
		return $folder === null ? null : [$folder, $this->root->getUserFolder($actor)];
	}

	private function existingFolder(string $actor): ?Folder {
		try {
			$folder = $this->root->getUserFolder($actor)->get($this->folder());
			return $folder instanceof Folder ? $folder : null;
		} catch (NotFoundException) {
			return null;
		} catch (\Throwable $e) {
			$this->logger->warning("Template folder {folder} cannot be read in {actor}'s files", ['folder' => $this->folder(), 'actor' => $actor, 'exception' => $e]);
			return null;
		}
	}

	/** @return array{0: Folder, 1: Folder}|null */
	private function ownSource(): ?array {
		try {
			$user = $this->session->getUser();
			$path = $this->templates->getTemplatePath();
			if ($user === null || $path === '') {
				return null;
			}
			$home = $this->root->getUserFolder($user->getUID());
			$folder = $home->get(ltrim($path, '/'));
			return $folder instanceof Folder ? [$folder, $home] : null;
		} catch (NotFoundException) {
			return null;
		} catch (\Throwable $e) {
			$this->logger->warning('Your Templates folder cannot be read', ['exception' => $e]);
			return null;
		}
	}

	/**
	 * @param array{0: Folder, 1: Folder}|null $from
	 * @param array{files: int, bytes: int, seen: array<int, true>} $budget across both sources
	 * @return list<array{source: 'shared'|'yours', path: string, text: string}>
	 */
	private function collect(string $source, ?array $from, array &$budget): array {
		if ($from === null) {
			return [];
		}
		[$folder, $home] = $from;
		try {
			$byPath = [];
			foreach ($folder->searchByMime(Application::MIMETYPE) as $node) {
				if ($node instanceof File) {
					$byPath[ltrim((string)$home->getRelativePath($node->getPath()), '/')] = $node;
				}
			}
		} catch (\Throwable $e) {
			$this->logger->warning('Templates in {folder} cannot be listed', ['folder' => $folder->getPath(), 'exception' => $e]);
			return [];
		}
		ksort($byPath, SORT_STRING);
		$list = [];
		foreach ($byPath as $path => $file) {
			if ($budget['files'] >= self::MAX_FILES) {
				break;
			}
			$id = $file->getId();
			if (isset($budget['seen'][$id]) || FileReader::downloadForbidden($file)) {
				continue;
			}
			$room = self::MAX_BYTES - $budget['bytes'];
			$text = FileReader::read($file, $room);
			if ($text === null || strlen($text) > $room || !mb_check_encoding($text, 'UTF-8')) {
				continue;
			}
			$budget['seen'][$id] = true;
			$budget['files']++;
			$budget['bytes'] += strlen($text);
			$list[] = ['source' => $source, 'path' => (string)$path, 'text' => $text];
		}
		return $list;
	}

	/** @param list<string> $segments */
	private static function mkdirP(Folder $base, array $segments): Folder {
		$current = $base;
		foreach ($segments as $segment) {
			if (!$current->nodeExists($segment)) {
				$current = $current->newFolder($segment);
				continue;
			}
			$child = $current->get($segment);
			if (!$child instanceof Folder) {
				throw new \InvalidArgumentException(self::REFUSED);
			}
			$current = $child;
		}
		return $current;
	}
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `composer run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/Service/TemplateLibrary.php tests/unit/TemplateLibraryTest.php tests/ocp-stubs.php
git commit -m "Templates: the admin's folder, its actor and the caller's own, within caps"
```

---

### Task 3: `GET /apps/plantuml/templates`

**Files:**
- Create: `lib/Controller/TemplatesController.php`
- Modify: `appinfo/routes.php`
- Test: `tests/unit/TemplatesControllerTest.php`

**Interfaces:**
- Consumes: `TemplateLibrary::files()` (Task 2).
- Produces: route `templates#index`, `GET /apps/plantuml/templates` → `{"files": [{"source", "path", "text"}, …]}`, status 200.

- [ ] **Step 1: Write the failing test**

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Controller\TemplatesController;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

final class TemplatesControllerTest extends TestCase {
	/** @param list<array{source: string, path: string, text: string}> $files */
	private function controller(array $files): TemplatesController {
		$library = $this->createStub(TemplateLibrary::class);
		$library->method('files')->willReturn($files);
		return new TemplatesController($this->createStub(IRequest::class), $library);
	}

	public function testAnswersTheLibrarysFiles(): void {
		$files = [['source' => 'shared', 'path' => 'Templates/a.puml', 'text' => "@startuml\n@enduml"]];
		$response = $this->controller($files)->index();
		self::assertSame(200, $response->getStatus());
		self::assertSame(['files' => $files], $response->getData());
	}

	public function testNoTemplatesIsAnEmptyList(): void {
		self::assertSame(['files' => []], $this->controller([])->index()->getData());
	}

	public function testTheRouteIsForLoggedInUsers(): void {
		$method = new \ReflectionMethod(TemplatesController::class, 'index');
		$names = array_map(static fn (\ReflectionAttribute $a): string => $a->getName(), $method->getAttributes());
		self::assertContains(NoAdminRequired::class, $names);
		self::assertContains(NoCSRFRequired::class, $names);
		self::assertNotContains(PublicPage::class, $names);
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `composer run test:unit -- --filter TemplatesControllerTest`
Expected: FAIL, class not found.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/** `GET /templates` (TP3): asked each time Add diagram's modal opens. Logged-in users only. */
final class TemplatesController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly TemplateLibrary $library,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	// A read, fetched as /themes is.
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): JSONResponse {
		return new JSONResponse(['files' => $this->library->files()]);
	}
}
```

In `appinfo/routes.php`, after the `stdlib` route:

```php
		// {"files": [{source, path, text}]}, what Add diagram can start from
		['name' => 'templates#index', 'url' => '/templates', 'verb' => 'GET'],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `composer run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Controller/TemplatesController.php appinfo/routes.php tests/unit/TemplatesControllerTest.php
git commit -m "GET /templates: every template file the caller may start from"
```

---

### Task 4: The admin card's Templates section and `show-config` (TP4)

*Board* (`screens / admin`, `screens / admin-success`): title "Templates" (20/700), subtitle "Diagrams everyone can start from, in Add diagram" (15/400, maxcontrast), field "Template folder" holding `Templates`, status line "In admin's files · 12 templates in 4 files" (14/400, maxcontrast) under it. Core's declarative form draws the title, the description and a field's `description` as its helper line, in those styles.

**Files:**
- Create: `lib/Settings/TemplateSettings.php`
- Modify: `lib/AppInfo/Application.php`, `lib/Command/ShowConfig.php`
- Test: `tests/unit/TemplateSettingsTest.php`, `tests/unit/ShowConfigTest.php`

**Interfaces:**
- Consumes: `TemplateLibrary::folder()`, `setFolder()`, `actor()`, `summary()` (Task 2); `IGroupManager::isAdmin` (stubbed in Task 2 Step 1).
- Produces: declarative form `templates`, priority 20; `show-config` lines `template_folder: …`, `template_actor: …`.

- [ ] **Step 1: Write the failing test**

`tests/unit/TemplateSettingsTest.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\TemplateLibrary;
use OCA\PlantUml\Settings\TemplateSettings;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Settings\DeclarativeSettingsTypes;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class TemplateSettingsTest extends TestCase {
	/** @param array{actor: ?string, templates: int, files: int} $summary */
	private function settings(array $summary = ['actor' => 'admin', 'templates' => 12, 'files' => 4], ?TemplateLibrary $library = null, ?LoggerInterface $logger = null, bool $admin = true): TemplateSettings {
		if ($library === null) {
			$library = $this->createStub(TemplateLibrary::class);
			$library->method('summary')->willReturn($summary);
			$library->method('folder')->willReturn('Templates');
		}
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn($admin ? 'admin' : 'drk');
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$groups = $this->createStub(IGroupManager::class);
		$groups->method('isAdmin')->willReturnCallback(static fn (string $uid): bool => $uid === 'admin');
		return new TemplateSettings($library, $session, $groups, $logger ?? $this->createStub(LoggerInterface::class));
	}

	public function testTheSchemaIsTheTemplatesCard(): void {
		$schema = $this->settings()->getSchema();
		self::assertSame('templates', $schema['id']);
		// Below AdminTest's Test connection button (10): core sorts declarative and classic settings together.
		self::assertSame(20, $schema['priority']);
		self::assertSame('plantuml', $schema['section_id']);
		self::assertSame(DeclarativeSettingsTypes::SECTION_TYPE_ADMIN, $schema['section_type']);
		self::assertSame(DeclarativeSettingsTypes::STORAGE_TYPE_EXTERNAL, $schema['storage_type']);
		self::assertSame('Templates', $schema['title']);
		self::assertSame('Diagrams everyone can start from, in Add diagram', $schema['description']);
		self::assertCount(1, $schema['fields']);
		self::assertSame('template_folder', $schema['fields'][0]['id']);
		self::assertSame('Template folder', $schema['fields'][0]['title']);
		self::assertSame(DeclarativeSettingsTypes::TEXT, $schema['fields'][0]['type']);
		self::assertSame('Templates', $schema['fields'][0]['default']);
	}

	public function testTheStatusLineCountsTemplatesAndFiles(): void {
		self::assertSame("In admin's files · 12 templates in 4 files", $this->settings()->getSchema()['fields'][0]['description']);
	}

	public function testOneTemplateInOneFileIsSingular(): void {
		self::assertSame("In admin's files · 1 template in 1 file", $this->settings(['actor' => 'admin', 'templates' => 1, 'files' => 1])->getSchema()['fields'][0]['description']);
	}

	public function testNoActorMeansNoStatusLine(): void {
		self::assertArrayNotHasKey('description', $this->settings(['actor' => null, 'templates' => 0, 'files' => 0])->getSchema()['fields'][0]);
	}

	/** Core builds every form's schema on every settings page, for every user. */
	public function testANonAdminsSchemaReadsNoFile(): void {
		$library = $this->createMock(TemplateLibrary::class);
		$library->expects(self::never())->method('summary');
		$schema = $this->settings(library: $library, admin: false)->getSchema();
		self::assertArrayNotHasKey('description', $schema['fields'][0]);
	}

	public function testTheFolderIsReadOncePerPage(): void {
		$library = $this->createMock(TemplateLibrary::class);
		$library->expects(self::once())->method('summary')->willReturn(['actor' => 'admin', 'templates' => 1, 'files' => 1]);
		$settings = $this->settings(library: $library);
		$settings->getSchema();
		$settings->getSchema();
	}

	public function testTheFieldReadsTheFolder(): void {
		self::assertSame('Templates', $this->settings()->getValue('template_folder', $this->createStub(IUser::class)));
	}

	public function testSavingTheFolderGoesToTheLibrary(): void {
		$library = $this->createMock(TemplateLibrary::class);
		$library->expects(self::once())->method('setFolder')->with('Diagrams/Templates');
		$this->settings(library: $library)->setValue('template_folder', 'Diagrams/Templates', $this->createStub(IUser::class));
	}

	public function testARefusedFolderIsLoggedAndRethrown(): void {
		$library = $this->createStub(TemplateLibrary::class);
		$library->method('setFolder')->willThrowException(new \InvalidArgumentException("Template folder must be a folder in the actor's files"));
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::once())->method('info')->with('Template folder refused: {reason}', self::anything());
		$this->expectException(\InvalidArgumentException::class);
		$this->settings(library: $library, logger: $logger)->setValue('template_folder', '../x', $this->createStub(IUser::class));
	}
}
```

`tests/unit/ShowConfigTest.php` becomes:

```php
final class ShowConfigTest extends TestCase {
	private function tester(string $stored, ?string $actor = 'admin'): CommandTester {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn($stored);
		$library = $this->createStub(TemplateLibrary::class);
		$library->method('folder')->willReturn('Templates');
		$library->method('actor')->willReturn($actor);
		return new CommandTester(new ShowConfig(new ServerConfig($config), $library));
	}

	public function testPrintsTheUrl(): void {
		$tester = $this->tester('https://p.example.com');

		self::assertSame(0, $tester->execute([]));
		self::assertStringContainsString('server_url: https://p.example.com', $tester->getDisplay());
	}

	public function testSaysWhenNothingIsSetAndFails(): void {
		$tester = $this->tester('');

		self::assertSame(1, $tester->execute([]));
		self::assertStringContainsString('server_url: (not set)', $tester->getDisplay());
	}

	public function testPrintsTheTemplateFolderAndActor(): void {
		$tester = $this->tester('https://p.example.com');
		$tester->execute([]);
		self::assertStringContainsString("template_folder: Templates\ntemplate_actor: admin", $tester->getDisplay());
	}

	public function testPrintsNoActor(): void {
		$tester = $this->tester('https://p.example.com', null);
		$tester->execute([]);
		self::assertStringContainsString('template_actor: (none)', $tester->getDisplay());
	}

	public function testTheTemplateLinesShowWhenTheUrlIsUnset(): void {
		$tester = $this->tester('');
		self::assertSame(1, $tester->execute([]));
		self::assertStringContainsString('template_folder: Templates', $tester->getDisplay());
	}
}
```

(with `use OCA\PlantUml\Service\TemplateLibrary;` added.)

- [ ] **Step 2: Run test to verify it fails**

Run: `composer run test:unit -- --filter 'TemplateSettingsTest|ShowConfigTest'`
Expected: FAIL, `TemplateSettings` not found and `ShowConfig` taking one argument.

- [ ] **Step 3: Write minimal implementation**

`lib/Settings/TemplateSettings.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Settings;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Settings\DeclarativeSettingsTypes;
use OCP\Settings\IDeclarativeSettingsFormWithHandlers;
use Psr\Log\LoggerInterface;

/**
 * The admin card's Templates section (TP4): a form of its own under the server
 * URL's and its Test connection button, since a form has one title. EXTERNAL,
 * as InstanceSettings says why.
 *
 * Core builds every form's schema on every settings page, admin and personal,
 * for every user, and again on each value read or save: the status line reads
 * the folder, so it is worked out for an admin only, and once.
 */
final class TemplateSettings implements IDeclarativeSettingsFormWithHandlers {
	private bool $looked = false;
	private ?string $status = null;

	public function __construct(
		private readonly TemplateLibrary $library,
		private readonly IUserSession $session,
		private readonly IGroupManager $groups,
		private readonly LoggerInterface $logger,
	) {
	}

	#[\Override]
	public function getSchema(): array {
		$field = [
			'id' => TemplateLibrary::KEY_FOLDER,
			'title' => 'Template folder',
			'type' => DeclarativeSettingsTypes::TEXT,
			'default' => TemplateLibrary::DEFAULT_FOLDER,
		];
		$status = $this->status();
		if ($status !== null) {
			$field['description'] = $status;
		}
		return [
			'id' => 'templates',
			// Below AdminTest's Test connection button (10), which belongs to the URL card.
			'priority' => 20,
			'section_type' => DeclarativeSettingsTypes::SECTION_TYPE_ADMIN,
			'section_id' => Application::APP_ID,
			'storage_type' => DeclarativeSettingsTypes::STORAGE_TYPE_EXTERNAL,
			'title' => 'Templates',
			'description' => 'Diagrams everyone can start from, in Add diagram',
			'fields' => [$field],
		];
	}

	#[\Override]
	public function getValue(string $fieldId, IUser $user): mixed {
		return $fieldId === TemplateLibrary::KEY_FOLDER ? $this->library->folder() : null;
	}

	#[\Override]
	public function setValue(string $fieldId, mixed $value, IUser $user): void {
		if ($fieldId !== TemplateLibrary::KEY_FOLDER) {
			return;
		}
		try {
			$this->library->setFolder(is_string($value) ? $value : '');
		} catch (\InvalidArgumentException $e) {
			// Core shows only a generic "failed to save"; the reason goes to the log.
			$this->logger->info('Template folder refused: {reason}', ['reason' => $e->getMessage()]);
			throw $e;
		}
	}

	/** "In <actor>'s files · N templates in M files", for an admin; null for anyone else, or with no actor. */
	private function status(): ?string {
		if ($this->looked) {
			return $this->status;
		}
		$this->looked = true;
		$uid = $this->session->getUser()?->getUID();
		if ($uid === null || !$this->groups->isAdmin($uid)) {
			return null;
		}
		$summary = $this->library->summary();
		if ($summary['actor'] === null) {
			return null;
		}
		$n = $summary['templates'];
		$m = $summary['files'];
		return $this->status = sprintf("In %s's files · %d %s in %d %s", $summary['actor'], $n, $n === 1 ? 'template' : 'templates', $m, $m === 1 ? 'file' : 'files');
	}
}
```

`lib/AppInfo/Application.php::register()`, after `InstanceSettings`:

```php
		$context->registerDeclarativeSettings(TemplateSettings::class);
```

`lib/Command/ShowConfig.php`:

```php
	public function __construct(
		private ServerConfig $server,
		private TemplateLibrary $templates,
	) {
		parent::__construct();
	}

	#[\Override]
	protected function execute(InputInterface $input, OutputInterface $output): int {
		$set = $this->server->isSet();
		$output->writeln(ServerConfig::KEY_URL . ': ' . ($set ? $this->server->getUrl() : '(not set)'));
		$output->writeln(TemplateLibrary::KEY_FOLDER . ': ' . $this->templates->folder());
		$output->writeln(TemplateLibrary::KEY_ACTOR . ': ' . ($this->templates->actor() ?? '(none)'));
		return $set ? 0 : 1;
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `composer run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/Settings/TemplateSettings.php lib/AppInfo/Application.php lib/Command/ShowConfig.php tests/unit/TemplateSettingsTest.php tests/unit/ShowConfigTest.php
git commit -m "Admin: the template folder, and what it holds"
```

---

### Task 5: The four approved scenarios run (Behat)

Dr K approved four scenarios on 2026-10-17, now in `features/diagrams/edit.feature` under the RULE comment "templates come from the admin's folder and the user's own", each tagged `@api @unbuilt`:

```gherkin
  @api @unbuilt
  Scenario: The admin's template folder is offered to everyone
    Given the admin's template folder holds a diagram file "Flows.puml"
    When "drk" asks for the templates to start from
    Then "drk" is offered "Flows.puml" as a shared template

  @api @unbuilt
  Scenario: A user's own Templates folder is offered to them alone
    Given "drk" keeps a diagram file "Retro.puml" in their Templates folder
    When "alice" asks for the templates to start from
    Then "alice" is not offered "Retro.puml"

  @api @unbuilt
  Scenario: A file shared view-only into the template folder is not offered
    Given someone shares "Secret.puml" view-only into the admin's template folder
    When "drk" asks for the templates to start from
    Then "drk" is not offered "Secret.puml"

  @api @unbuilt
  Scenario: Setting the template folder makes it
    Given the admin's files hold no folder "Diagrams/Templates"
    When the admin sets the template folder to "Diagrams/Templates"
    Then the admin's files hold a folder "Diagrams/Templates"
```

This task writes every step definition and removes `@unbuilt` from these four. Dr K approved `.feature` edits this round: removing the tag, and changing a step's wording only if a definition truly cannot be written for it, with why recorded in `features/AGENTS.md`. **Behat runs in CI only** (never in the pod, never locally against the live instance); the three `bin/check-*.sh` scripts run locally.

**Files:**
- Create: `tests/integration/bootstrap/Steps/TemplateSteps.php`
- Modify: `tests/integration/bootstrap/FeatureContext.php` (`use TemplateSteps;`), `tests/integration/bootstrap/Steps/ShareSteps.php` (the received-share lookup becomes a method both traits use), `features/diagrams/edit.feature` (the four `@unbuilt` tags), `features/AGENTS.md` (`## diagrams/edit`)

**Interfaces:**
- Consumes: `GET /apps/plantuml/templates` (Task 3), the `templates` form's `template_folder` field (Task 4), `ShareSteps::ocsAs()`, `WebDavTrait::davClient()`, `davPath()`, `davPut()`, `davDelete()`, `davExists()`, `davEnsureFolder()`, `OccTrait::occ()`, `appConfigDelete()`.
- Produces: `ShareSteps::receivedShareTarget(string $id): string` — where a share made to the admin sits in the admin's files, accepted first when the server holds it as pending.

- [ ] **Step 1: Run the checks to see the four undefined**

Remove `@unbuilt` from the four scenarios (leave `@api`), then:

Run: `tests/integration/bin/check-step-definitions.sh`
Expected: FAIL, naming the four scenarios' steps as undefined.

- [ ] **Step 2: Give ShareSteps' lookup a name**

In `ShareSteps::aColleagueSharedATextFileWithMeThatMayBeViewedButNotDownloaded()`, the two `foreach` loops and the throw after them become `$this->sharedPath = $this->receivedShareTarget($id);`, and the trait gains:

```php
	/** Where share `$id`, made to me, sits in my files; accepted first when the server holds it as pending. */
	private function receivedShareTarget(string $id): string {
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

- [ ] **Step 3: Write the step definitions**

`tests/integration/bootstrap/Steps/TemplateSteps.php`:

```php
<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use GuzzleHttp\Client;

/**
 * Where Add diagram's templates come from (app spec TP1–TP4): the admin's
 * template folder, offered to every user, and each user's own Templates
 * folder, offered to them alone. Users are made through the provisioning API
 * as ShareSteps makes its colleague, and go after the scenario with all they own.
 */
trait TemplateSteps {
	/** The user whose view-only share lands in the admin's template folder. */
	private const SHARER = 'plantuml-sharer';
	/** One closed block: one template. */
	private const TEMPLATE_TEXT = "@startuml\nA -> B\n@enduml\n";

	/** @var array<string, string> uid => password, the users this scenario made */
	private array $templateUsers = [];
	/** @var list<string> paths in the admin's files this scenario made */
	private array $templatePaths = [];
	private string $offeredTo = '';
	/** @var list<array{source: string, path: string, text: string}> */
	private array $offered = [];

	/** @Given /^the admin's template folder holds a diagram file "([^"]*)"$/ */
	public function theAdminsTemplateFolderHoldsADiagramFile(string $name): void {
		$this->useTheDefaultTemplateFolder();
		$path = "Templates/{$name}";
		$status = $this->davPut($path, self::TEMPLATE_TEXT)->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT {$path} answered HTTP {$status}");
		}
		$this->templatePaths[] = $path;
	}

	/** @Given /^"([^"]*)" keeps a diagram file "([^"]*)" in their Templates folder$/ */
	public function keepsADiagramFileInTheirTemplatesFolder(string $user, string $name): void {
		$dav = $this->davAs($user);
		// Made already when the server copied its skeleton on the user's first visit; 405 then.
		$dav->request('MKCOL', 'Templates');
		$status = $dav->put('Templates/' . rawurlencode($name), ['body' => self::TEMPLATE_TEXT])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT Templates/{$name} as {$user} answered HTTP {$status}");
		}
		// What Files' "Templates folder" setting writes, and ITemplateManager::getTemplatePath() reads.
		$set = $this->occ(sprintf('user:setting %s core templateDirectory %s', escapeshellarg($user), escapeshellarg('/Templates')));
		if ($set['exit'] !== 0) {
			throw new \RuntimeException("user:setting failed (exit {$set['exit']}):\n{$set['output']}");
		}
	}

	/** @Given /^someone shares "([^"]*)" view-only into the admin's template folder$/ */
	public function someoneSharesViewOnlyIntoTheAdminsTemplateFolder(string $name): void {
		$this->useTheDefaultTemplateFolder();
		$password = $this->templateUser(self::SHARER);
		$status = $this->davAs(self::SHARER)->put(rawurlencode($name), ['body' => "@startuml\nsecret\n@enduml\n"])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT {$name} as " . self::SHARER . " answered HTTP {$status}");
		}
		$share = $this->ocsAs(self::SHARER, $password, 'POST', 'apps/files_sharing/api/v1/shares', [
			'path' => "/{$name}",
			'shareType' => 0,
			'shareWith' => $this->adminUser,
			'permissions' => 1,
			'attributes' => '[{"scope":"permissions","key":"download","value":false}]',
		]);
		$target = $this->receivedShareTarget((string)($share['id'] ?? ''));
		// A received share is moved in my files as any file of mine is.
		$moved = $this->davClient()->request('MOVE', $this->davPath($target), [
			'headers' => ['Destination' => $this->baseUrl . '/remote.php/dav/files/' . rawurlencode($this->adminUser) . '/' . $this->davPath("Templates/{$name}")],
		])->getStatusCode();
		if ($moved >= 300 || !$this->davExists("Templates/{$name}")) {
			throw new \RuntimeException("moving the share {$target} into Templates answered HTTP {$moved}");
		}
	}

	/** @Given /^the admin's files hold no folder "([^"]*)"$/ */
	public function theAdminsFilesHoldNoFolder(string $path): void {
		$this->davDelete($path);
		if ($this->davExists($path)) {
			throw new \RuntimeException("{$path} is still in the admin's files");
		}
		$this->templatePaths[] = $path;
	}

	/** @When /^"([^"]*)" asks for the templates to start from$/ */
	public function asksForTheTemplatesToStartFrom(string $user): void {
		$password = $this->templateUser($user);
		$response = (new Client(['auth' => [$user, $password], 'http_errors' => false]))
			->get($this->baseUrl . '/index.php/apps/plantuml/templates', ['headers' => ['Accept' => 'application/json']]);
		$files = json_decode((string)$response->getBody(), true)['files'] ?? null;
		if ($response->getStatusCode() !== 200 || !is_array($files)) {
			throw new \RuntimeException("GET /templates as {$user} answered HTTP {$response->getStatusCode()}:\n" . substr((string)$response->getBody(), 0, 500));
		}
		$this->offeredTo = $user;
		$this->offered = $files;
	}

	/**
	 * As the admin card saves it: core's declarative settings API, which hands
	 * the value to TemplateSettings::setValue. It answers `data: null`, so its
	 * status is checked here rather than through ocsAs().
	 *
	 * @When /^the admin sets the template folder to "([^"]*)"$/
	 */
	public function theAdminSetsTheTemplateFolderTo(string $path): void {
		$response = (new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]))
			->post($this->baseUrl . '/ocs/v2.php/settings/api/declarative/value', [
				'form_params' => ['app' => self::APP_ID, 'formId' => 'templates', 'fieldId' => 'template_folder', 'value' => $path],
				'headers' => ['OCS-APIRequest' => 'true', 'Accept' => 'application/json'],
			]);
		if ($response->getStatusCode() !== 200) {
			throw new \RuntimeException("saving the template folder answered HTTP {$response->getStatusCode()}:\n" . substr((string)$response->getBody(), 0, 500));
		}
	}

	/** @Then /^"([^"]*)" is offered "([^"]*)" as a shared template$/ */
	public function isOfferedAsASharedTemplate(string $user, string $name): void {
		foreach ($this->offeredBy($user) as $file) {
			if ($file['source'] === 'shared' && basename($file['path']) === $name && $file['text'] === self::TEMPLATE_TEXT) {
				return;
			}
		}
		throw new \RuntimeException("{$user} was not offered {$name} as a shared template; offered: " . json_encode(array_column($this->offered, 'path')));
	}

	/** @Then /^"([^"]*)" is not offered "([^"]*)"$/ */
	public function isNotOffered(string $user, string $name): void {
		foreach ($this->offeredBy($user) as $file) {
			if (basename($file['path']) === $name) {
				throw new \RuntimeException("{$user} was offered {$name} ({$file['source']} {$file['path']})");
			}
		}
	}

	/** @Then /^the admin's files hold a folder "([^"]*)"$/ */
	public function theAdminsFilesHoldAFolder(string $path): void {
		if (!$this->davExists($path)) {
			throw new \RuntimeException("{$path} is not in the admin's files");
		}
	}

	/** @AfterScenario */
	public function removeWhatTheTemplateStepsMade(): void {
		foreach (array_keys($this->templateUsers) as $user) {
			$this->removeTemplateUser($user);
		}
		foreach (array_reverse($this->templatePaths) as $path) {
			$this->davDelete($path);
		}
		if ($this->templateUsers !== [] || $this->templatePaths !== []) {
			$this->appConfigDelete('template_folder');
		}
		$this->templateUsers = [];
		$this->templatePaths = [];
		$this->offeredTo = '';
		$this->offered = [];
	}

	/** The template folder at its default, in the admin's files (the CI admin is the `admin` group's one member). */
	private function useTheDefaultTemplateFolder(): void {
		$this->appConfigDelete('template_folder');
		$this->appConfigDelete('template_actor');
		$this->davEnsureFolder('Templates');
	}

	/** @return list<array{source: string, path: string, text: string}> */
	private function offeredBy(string $user): array {
		if ($this->offeredTo !== $user) {
			throw new \RuntimeException("{$user} has not asked for the templates in this scenario");
		}
		return $this->offered;
	}

	/** A user of this scenario, made the first time it is named; its password. */
	private function templateUser(string $user): string {
		if (!isset($this->templateUsers[$user])) {
			// Left behind by a run that died before its cleanup.
			$this->removeTemplateUser($user);
			$password = 'Pu-' . bin2hex(random_bytes(12));
			$this->ocsAs($this->adminUser, $this->adminPass, 'POST', 'cloud/users', ['userid' => $user, 'password' => $password]);
			$this->templateUsers[$user] = $password;
		}
		return $this->templateUsers[$user];
	}

	private function davAs(string $user): Client {
		return new Client([
			'base_uri' => $this->baseUrl . '/remote.php/dav/files/' . rawurlencode($user) . '/',
			'auth' => [$user, $this->templateUser($user)],
			'http_errors' => false,
		]);
	}

	/** Their files and shares go with them. */
	private function removeTemplateUser(string $user): void {
		(new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]))
			->delete($this->baseUrl . '/ocs/v2.php/cloud/users/' . rawurlencode($user), ['headers' => ['OCS-APIRequest' => 'true']]);
	}
}
```

In `FeatureContext.php`: `use OCA\PlantUml\Tests\Integration\Steps\TemplateSteps;` with the other imports, and `use TemplateSteps;` between `use ShareSteps;` and `use WebDavTrait;`.

- [ ] **Step 4: Note the rule**

`features/AGENTS.md`, `## diagrams/edit`, after the "AN OPEN LINKED FILE IS DRAWN BEFORE IT IS SAVED" paragraph:

```markdown
TEMPLATES COME FROM THE ADMIN'S FOLDER AND THE USER'S OWN (app spec TP1–TP4).
The admin's folder is read as its owner, so every user is offered its files
without a share; a user's own Templates folder is offered to them alone. A file
shared view-only into the admin's folder is never offered, as an include of it
is never drawn: its text would reach every user. Setting the folder makes it.
The steps ask `GET /templates` as each user and set the folder through core's
declarative settings API, as the admin card does; the users they make (`drk`,
`alice`, `plantuml-sharer`) go after each scenario with everything they own.
```

- [ ] **Step 5: Run the checks to verify they pass**

Run: `tests/integration/bin/check-step-definitions.sh && tests/integration/bin/check-suites.sh && tests/integration/bin/check-notes-anchors.sh`
Expected: all three pass: no undefined, duplicate or unused step; the suites and tag filter unchanged; every anchor in `features/AGENTS.md` resolves.
Run: `php -l tests/integration/bootstrap/Steps/TemplateSteps.php && php -l tests/integration/bootstrap/Steps/ShareSteps.php`
Expected: `No syntax errors detected` twice.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/bootstrap features/diagrams/edit.feature features/AGENTS.md
git commit -m "Behat: the four template scenarios run"
```

The scenarios' first run is CI's, on the push after merge (`diagrams` suite). A red run there is fixed in the step definitions, never by putting `@unbuilt` back.

---

### Task 6: The editor's template data (A6, A7, A8)

**Files:**
- Create: `src/editor/data/template-icons.js`, `src/editor/data/templates.json`, `src/editor/add/types.js`, `img/icons/plus.svg`, `img/icons/chevron-down.svg`
- Test: `tests/js/add-data.test.js`

**Interfaces:**
- Produces: `ICONS: Record<string, string>` and `iconSvg(name: string, size = 20): string` in `template-icons.js`; `TYPES: { type, name, icon }[]` in `types.js`; `templates.json` `{ uml: { title, name, icon, description, text }[] }`.

- [ ] **Step 1: Write the failing test**

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import keywords from '../unit/fixtures/help-keywords.txt?raw'
import library from '../../lib/Service/TemplateLibrary.php?raw'
import { ICONS, iconSvg } from '../../src/editor/data/template-icons.js'
import templates from '../../src/editor/data/templates.json'
import { TYPES } from '../../src/editor/add/types.js'
import { blocksOf, scan } from '../../src/editor/blocks.js'

describe('the types Add diagram lists', () => {
  it('are the server\'s @start types less def, chronology and jcckit', () => {
    const served = new Set([...keywords.matchAll(/@start(\w+)/g)].map((m) => m[1]))
    for (const gone of ['def', 'chronology', 'jcckit']) served.delete(gone)
    expect(new Set(TYPES.map((t) => t.type))).toEqual(served)
    expect(TYPES).toHaveLength(27)
  })

  it('run UML first, then as the style guide orders them', () => {
    expect(TYPES.map((t) => t.name)).toEqual(['UML', 'BPM', 'Board', 'Chart', 'Chen ER', 'Creole', 'DOT', 'Ditaa', 'EBNF', 'Files', 'Flow', 'Gantt', 'Git', 'HCL', 'JSON', 'LaTeX', 'Math', 'MindMap', 'Project', 'Regex', 'Salt', 'Sprites', 'WBS', 'Wire', 'YAML', 'nwdiag', 'packetdiag'])
  })

  it('are the ones the server counts for the admin card (TemplateLibrary::TYPES)', () => {
    const [, list] = /public const TYPES = \[([^\]]*)\]/.exec(library)
    expect([...list.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual(TYPES.map((t) => t.type))
  })
})

describe('the icons', () => {
  it('are the 36 of A7, and every type and built-in names one of them', () => {
    expect(Object.keys(ICONS)).toHaveLength(36)
    for (const { icon } of [...TYPES, ...templates.uml]) expect(ICONS[icon]).toMatch(/^M/)
  })

  it('draw in currentColor at the size asked, and nothing for an unknown name', () => {
    const svg = iconSvg('chart-gantt', 24)
    expect(svg).toContain('fill="currentColor"')
    expect(svg).toContain('width="24"')
    expect(svg).toContain('aria-hidden="true"')
    expect(iconSvg('nope')).toBe('')
  })
})

describe('the built-in templates', () => {
  it('are nine UML diagrams in A8\'s order, one bare block each', () => {
    expect(templates.uml.map((t) => t.title)).toEqual(['Sequence', 'Class', 'Use case', 'Activity', 'Component', 'State', 'Deployment', 'Object', 'Timing'])
    for (const { text } of templates.uml) {
      const blocks = blocksOf(scan(text))
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('uml')
      expect(text.split('\n')[0]).toBe('@startuml')
      expect(blocks[0].end).toBe(text.split('\n').length)
    }
  })

  it('are named as the board adds Class', () => {
    expect(templates.uml.find((t) => t.title === 'Class').name).toBe('class-diagram')
    expect(templates.uml.find((t) => t.title === 'Use case').name).toBe('use-case-diagram')
  })

  it('never use skinparam', () => {
    for (const { text } of templates.uml) expect(text).not.toMatch(/^\s*skinparam\b/mi)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/js/add-data.test.js`
Expected: FAIL, cannot resolve `../../src/editor/data/template-icons.js`.

- [ ] **Step 3: Write minimal implementation**

Generate the icon module from `@mdi/js` 7.4.47 in the scratchpad (not committed):

```bash
REPO=$(git rev-parse --show-toplevel)   # run from inside the repo
SCRATCH=$(mktemp -d)                    # or the session's scratchpad folder
cd "$SCRATCH" && npm pack @mdi/js@7.4.47 && tar xzf mdi-js-7.4.47.tgz
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs"
const src = readFileSync("package/mdi.js", "utf8")
const names = ["shape-outline","view-column-outline","cog-transfer-outline","chart-bar","relation-one-to-many","format-text","draw","graph-outline","alphabetical-variant","file-tree-outline","transit-connection-variant","chart-gantt","calendar-range-outline","source-branch","code-equal","code-json","sigma","math-integral","head-lightbulb-outline","lan","table-row","regex","application-outline","checkerboard","sitemap-outline","connection","format-indent-increase","message-arrow-right-outline","card-bulleted-outline","account-circle-outline","arrow-decision-outline","puzzle-outline","state-machine","server-outline","cube-outline","chart-timeline-variant"]
const path = (n) => new RegExp(`export var mdi${n.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")} = "([^"]+)"`).exec(src)[1]
const rows = names.map((n) => `  "${n}": "${path(n)}",`).join("\n")
writeFileSync("template-icons.js", `/**\n * SPDX-FileCopyrightText: 2026 kubed-io\n * SPDX-License-Identifier: AGPL-3.0-or-later\n *\n * The diagram types\x27 and the UML templates\x27 icons (editor spec A7): Material Design\n * Icons path data, copied from @mdi/js 7.4.47 (Apache-2.0), the set Nextcloud uses.\n */\n\n/** @type {Record<string, string>} */\nexport const ICONS = {\n${rows}\n}\n\n/** The icon as an inline SVG in currentColor, or \x27\x27 for a name not here. */\nexport function iconSvg(name, size = 20) {\n  const d = ICONS[name]\n  return d ? \`<svg viewBox="0 0 24 24" width="\${size}" height="\${size}" aria-hidden="true" focusable="false"><path fill="currentColor" d="\${d}"/></svg>\` : \x27\x27\n}\n`)
for (const n of ["plus", "chevron-down"]) writeFileSync(`${n}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${path(n)}"/></svg>\n`)
'
cp template-icons.js "$REPO/src/editor/data/" && cp plus.svg chevron-down.svg "$REPO/img/icons/"
```

Then match the two SVGs' shape to `img/icons/code-tags.svg` (its attributes and any SPDX comment) by hand, and run `npx eslint --fix src/editor/data/template-icons.js` so its quotes follow the house style.

`src/editor/add/types.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The diagram types Add diagram lists (editor spec A6): the server's 30 `@start`
 * types less def (no drawing), chronology and jcckit (1.2026.8 draws neither),
 * named and iconed as the style guide's "Diagram icons" board.
 */

/** @type {{ type: string, name: string, icon: string }[]} */
export const TYPES = [
  { type: 'uml', name: 'UML', icon: 'shape-outline' },
  { type: 'bpm', name: 'BPM', icon: 'cog-transfer-outline' },
  { type: 'board', name: 'Board', icon: 'view-column-outline' },
  { type: 'chart', name: 'Chart', icon: 'chart-bar' },
  { type: 'chen', name: 'Chen ER', icon: 'relation-one-to-many' },
  { type: 'creole', name: 'Creole', icon: 'format-text' },
  { type: 'dot', name: 'DOT', icon: 'graph-outline' },
  { type: 'ditaa', name: 'Ditaa', icon: 'draw' },
  { type: 'ebnf', name: 'EBNF', icon: 'alphabetical-variant' },
  { type: 'files', name: 'Files', icon: 'file-tree-outline' },
  { type: 'flow', name: 'Flow', icon: 'transit-connection-variant' },
  { type: 'gantt', name: 'Gantt', icon: 'chart-gantt' },
  { type: 'git', name: 'Git', icon: 'source-branch' },
  { type: 'hcl', name: 'HCL', icon: 'code-equal' },
  { type: 'json', name: 'JSON', icon: 'code-json' },
  { type: 'latex', name: 'LaTeX', icon: 'sigma' },
  { type: 'math', name: 'Math', icon: 'math-integral' },
  { type: 'mindmap', name: 'MindMap', icon: 'head-lightbulb-outline' },
  { type: 'project', name: 'Project', icon: 'calendar-range-outline' },
  { type: 'regex', name: 'Regex', icon: 'regex' },
  { type: 'salt', name: 'Salt', icon: 'application-outline' },
  { type: 'sprites', name: 'Sprites', icon: 'checkerboard' },
  { type: 'wbs', name: 'WBS', icon: 'sitemap-outline' },
  { type: 'wire', name: 'Wire', icon: 'connection' },
  { type: 'yaml', name: 'YAML', icon: 'format-indent-increase' },
  { type: 'nwdiag', name: 'nwdiag', icon: 'lan' },
  { type: 'packetdiag', name: 'packetdiag', icon: 'table-row' },
]
```

`src/editor/data/templates.json` — these nine texts were drawn on 1.2026.8 on 2026-10-17 and all answer 200; Class is the board's own text:

```json
{
  "uml": [
    { "title": "Sequence", "name": "sequence-diagram", "icon": "message-arrow-right-outline", "description": "Messages between participants, in order",
      "text": "@startuml\nactor User\nparticipant App\ndatabase Store\nUser -> App : sign in\nApp -> Store : find user\nStore --> App : user\nApp --> User : welcome\n@enduml" },
    { "title": "Class", "name": "class-diagram", "icon": "card-bulleted-outline", "description": "Classes, their fields and how they relate",
      "text": "@startuml\nclass Customer\nclass Order {\n  id : int\n  total()\n}\nCustomer \"1\" -- \"*\" Order\n@enduml" },
    { "title": "Use case", "name": "use-case-diagram", "icon": "account-circle-outline", "description": "Actors and what they do with the system",
      "text": "@startuml\nleft to right direction\nactor Customer\nrectangle Shop {\n  usecase \"Browse\" as Browse\n  usecase \"Check out\" as Checkout\n}\nCustomer --> Browse\nCustomer --> Checkout\n@enduml" },
    { "title": "Activity", "name": "activity-diagram", "icon": "arrow-decision-outline", "description": "Steps, decisions and forks of a process",
      "text": "@startuml\nstart\n:Receive order;\nif (In stock?) then (yes)\n  fork\n    :Pack;\n  fork again\n    :Invoice;\n  end fork\n  :Ship;\nelse (no)\n  :Back-order;\nendif\nstop\n@enduml" },
    { "title": "Component", "name": "component-diagram", "icon": "puzzle-outline", "description": "Parts of a system and their interfaces",
      "text": "@startuml\ncomponent Web\ncomponent API\ninterface REST\ndatabase DB\nWeb --> REST\nREST - API\nAPI --> DB\n@enduml" },
    { "title": "State", "name": "state-diagram", "icon": "state-machine", "description": "States and the transitions between them",
      "text": "@startuml\n[*] --> Draft\nDraft --> Review : submit\nReview --> Draft : changes\nReview --> Published : approve\nPublished --> [*]\n@enduml" },
    { "title": "Deployment", "name": "deployment-diagram", "icon": "server-outline", "description": "Nodes and what runs on them",
      "text": "@startuml\nnode \"Web server\" {\n  artifact \"app.war\" as App\n}\nnode \"Database server\" {\n  database Orders\n}\nApp --> Orders\n@enduml" },
    { "title": "Object", "name": "object-diagram", "icon": "cube-outline", "description": "Instances and their links at one moment",
      "text": "@startuml\nobject alice {\n  name = \"Alice\"\n}\nobject order1 {\n  total = 42\n}\nalice --> order1 : placed\n@enduml" },
    { "title": "Timing", "name": "timing-diagram", "icon": "chart-timeline-variant", "description": "How states change over time",
      "text": "@startuml\nrobust \"Door\" as D\nconcise \"User\" as U\n@0\nD is Closed\nU is Idle\n@5\nD is Opening\nU is Waiting\n@10\nD is Open\nU is Entering\n@enduml" }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/js/add-data.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/data/template-icons.js src/editor/data/templates.json src/editor/add/types.js img/icons/plus.svg img/icons/chevron-down.svg tests/js/add-data.test.js
git commit -m "Add diagram: the types, their icons and the built-in UML templates"
```

---

### Task 7: The built-ins are drawn in CI (A8)

**Files:**
- Create: `scripts/template-examples.mjs`, `tests/js/template-examples.test.js`
- Modify: `scripts/lib.mjs`, `scripts/doc-examples.mjs`, `.github/workflows/integration.yml`
- Test: `tests/js/scripts-lib.test.js`

**Interfaces:**
- Consumes: `TYPES` (`src/editor/add/types.js`, Task 6, a plain module Node can import).
- Produces: `drawProblem(server: string, source: string): Promise<string>` in `scripts/lib.mjs` (moved from `doc-examples.mjs`'s `problem()`); `sources(templates, own, types): { key, source }[]` in `scripts/template-examples.mjs` — every built-in (`uml:<title>`) and every listed type's Example (`example:<type>`).

- [ ] **Step 1: Write the failing test**

`tests/js/template-examples.test.js`:

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

const fetchSpy = vi.spyOn(globalThis, 'fetch')
const { sources } = await import('../../scripts/template-examples.mjs')

describe('template-examples', () => {
  it('importing the script makes no network call', () => {
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('names each built-in by its type and title, sent as written', () => {
    const list = sources({ uml: [{ title: 'Class', text: '@startuml\nclass A\n@enduml' }] }, {}, [])
    expect(list).toEqual([{ key: 'uml:Class', source: '@startuml\nclass A\n@enduml' }])
  })

  it('adds each listed type\'s Example, and no other own.json entry', () => {
    const own = {
      'diagram:gantt': { example: '@startgantt\n[A] lasts 1 day\n@endgantt' },
      'diagram:def': { example: '@startdef\n!define A\n@enddef' },
      'keyword:as': { example: 'A as B' },
    }
    expect(sources({}, own, [{ type: 'gantt' }, { type: 'git' }])).toEqual([{ key: 'example:gantt', source: '@startgantt\n[A] lasts 1 day\n@endgantt' }])
  })
})
```

Add to `tests/js/scripts-lib.test.js`:

```js
import { drawProblem } from '../../scripts/lib.mjs'

describe('drawProblem', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('names the line the server finds a mistake on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', {
      status: 400,
      headers: { 'X-PlantUML-Diagram-Error': 'Syntax Error?', 'X-PlantUML-Diagram-Error-Line': '1' },
    })))
    expect(await drawProblem('http://plantuml', '@startuml\nx\n@enduml')).toBe('line 2: Syntax Error?')
  })

  it('is empty for a drawing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { status: 200 })))
    expect(await drawProblem('http://plantuml', '@startuml\n@enduml')).toBe('')
  })
})
```

(with `afterEach` and `vi` added to that file's `vitest` import if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/js/template-examples.test.js tests/js/scripts-lib.test.js`
Expected: FAIL, `scripts/template-examples.mjs` missing and `drawProblem` not exported.

- [ ] **Step 3: Write minimal implementation**

`scripts/lib.mjs` gains (the body of `doc-examples.mjs`'s `problem()`, now taking the server):

```js
/** The reason the PlantUML server at `server` gives for refusing `source`, or '' when it draws. */
export async function drawProblem(server, source) {
  const response = await fetch(`${server}/svg`, { method: 'POST', body: source })
  const text = await response.text()
  const error = response.headers.get('X-PlantUML-Diagram-Error')
  if (error) {
    return `line ${Number(response.headers.get('X-PlantUML-Diagram-Error-Line')) + 1}: ${error}`
  }
  if (!response.ok) {
    return `status ${response.status}`
  }
  return /Syntax Error|not supported/i.test(text) ? 'drawn as an error' : ''
}
```

In `scripts/doc-examples.mjs`, delete `problem()`, import `drawProblem`, and call `drawProblem(server, sourceOf(key, example))`.

`scripts/template-examples.mjs`:

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Draws every built-in template (editor spec A8) on the PlantUML server, the listed types'
// Examples (own.json's) included, and prints the ones it refuses; exits 1 if any. An Empty
// draws nothing, which the server answers with a 400, so it is not sent.
//
//   PLANTUML_URL=http://plantuml.flow.svc node scripts/template-examples.mjs
import { TYPES } from '../src/editor/add/types.js'
import { drawProblem, isMain, readData } from './lib.mjs'

const server = process.env.PLANTUML_URL ?? 'http://plantuml.flow.svc'

/** Each built-in as `<type>:<title>`, and each listed type's Example as `example:<type>`, with the text it adds. */
export function sources(templates, own, types) {
  const builtIn = Object.entries(templates).flatMap(([type, list]) => list.map(({ title, text }) => ({ key: `${type}:${title}`, source: text })))
  const examples = types
    .map(({ type }) => ({ key: `example:${type}`, source: own[`diagram:${type}`]?.example }))
    .filter(({ source }) => source)
  return [...builtIn, ...examples]
}

async function main() {
  let failed = 0
  for (const { key, source } of sources(await readData('data/templates.json'), await readData('data/docs/own.json'), TYPES)) {
    const reason = await drawProblem(server, source)
    if (reason) {
      failed++
      console.info(`${key}: ${reason}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

if (isMain(import.meta.url)) await main()
```

`.github/workflows/integration.yml`, right after the "Wait for PlantUML" step (the runner's own Node runs it: the script needs nothing but `fetch`, `fs` and the app's own modules). One leg is enough, since the server is the same image in every leg:

```yaml
    # A8: every built-in template, the Examples included, draws on the server the suite runs against.
    - name: Draw the built-in templates
      if: matrix.suite == 'diagrams'
      working-directory: apps/${{ env.APP_ID }}
      env:
        PLANTUML_URL: ${{ env.PLANTUML_URL }}
      run: node scripts/template-examples.mjs
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/js/template-examples.test.js tests/js/scripts-lib.test.js tests/js/doc-examples.test.js`
Expected: PASS.
Run: `PLANTUML_URL=http://plantuml.flow.svc node scripts/template-examples.mjs; echo $?`
Expected: no output, `0` (all 9 built-ins and all 27 Examples answered 200 on 2026-10-17).

- [ ] **Step 5: Commit**

```bash
git add scripts tests/js/template-examples.test.js tests/js/scripts-lib.test.js .github/workflows/integration.yml
git commit -m "CI: the built-in templates are drawn on the server"
```

---

### Task 8: The catalog (A5, A8, A9)

**Files:**
- Create: `src/editor/add/catalog.js`
- Modify: `src/editor/completion/directives.js` (`export const BRACED`)
- Test: `tests/js/add-catalog.test.js`

**Interfaces:**
- Consumes: `TYPES` (Task 6), `templates.json` (Task 6), `scan`, `blocksOf` (`src/editor/blocks.js`), `BRACED` (`directives.js`).
- Produces: `@typedef Template { type, title, name, description, text, icon, source: 'builtin'|'shared'|'yours' }`; `emptyText(type): string`; `builtins(own): Template[]`; `fromFiles(files): Template[]`; `arrange(builtins, files): Map<string, Template[]>`; `matching(arranged, query): string[]`.

- [ ] **Step 1: Write the failing test**

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { arrange, builtins, emptyText, fromFiles, matching } from '../../src/editor/add/catalog.js'

const OWN = {
  'diagram:uml': { summary: 'UML diagrams, drawn from text', example: '@startuml\nAlice -> Bob : hi\n@enduml' },
  'diagram:gantt': { example: '@startgantt\n[Task] lasts 3 days\n@endgantt' },
}

const titles = (list) => list.map((t) => t.title)

describe('emptyText', () => {
  it('is the two lines with a blank one between', () => {
    expect(emptyText('gantt')).toBe('@startgantt\n\n@endgantt')
  })

  it('braces salt and json, as the @start completion does', () => {
    expect(emptyText('salt')).toBe('@startsalt\n{\n\t\n}\n@endsalt')
    expect(emptyText('json')).toBe('@startjson\n{\n\t\n}\n@endjson')
  })
})

describe('builtins', () => {
  const all = builtins(OWN)
  const of = (type) => all.filter((t) => t.type === type)

  it('gives UML Empty, Example and its nine', () => {
    expect(titles(of('uml'))).toEqual(['Empty', 'Example', 'Sequence', 'Class', 'Use case', 'Activity', 'Component', 'State', 'Deployment', 'Object', 'Timing'])
  })

  it('names Empty and Example by the type\'s word and describes them as the board does', () => {
    const [empty, example] = of('uml')
    expect(empty).toMatchObject({ name: 'uml', description: '@startuml and @enduml, nothing between', text: '@startuml\n\n@enduml', icon: 'shape-outline', source: 'builtin' })
    expect(example).toMatchObject({ name: 'uml', description: 'Alice -> Bob : hi', text: OWN['diagram:uml'].example })
  })

  it('gives a type without an example Empty alone', () => {
    expect(titles(of('git'))).toEqual(['Empty'])
  })

  it('wears a UML built-in\'s own icon, any other its type\'s', () => {
    expect(of('uml').find((t) => t.title === 'Class').icon).toBe('card-bulleted-outline')
    expect(of('gantt')[0].icon).toBe('chart-gantt')
  })
})

describe('fromFiles', () => {
  const file = (text, path = 'Templates/flows.puml', source = 'shared') => fromFiles([{ source, path, text }])

  it('takes each block as written, @start line to @end line', () => {
    const [t] = file("' before\n@startuml(id=L) Login\nA -> B\n@enduml\nafter")
    expect(t.text).toBe('@startuml(id=L) Login\nA -> B\n@enduml')
    expect(t.type).toBe('uml')
  })

  it('titles a named block by its name', () => {
    expect(file('@startuml(id=L) Login\n@enduml')[0]).toMatchObject({ title: 'Login', name: 'Login' })
  })

  it('titles unnamed blocks by the file, numbered from the second', () => {
    expect(titles(file('@startuml\n@enduml\n@startuml\n@enduml\n@startuml\n@enduml'))).toEqual(['flows', 'flows 2', 'flows 3'])
  })

  it('describes a block by its first comment, else by the path', () => {
    expect(file("@startuml\n' Checkout steps\nA -> B\n@enduml")[0].description).toBe('Shared · Checkout steps')
    expect(file('@startuml\n@enduml', 'Templates/retro.puml', 'yours')[0].description).toBe('Yours · Templates/retro.puml')
  })

  it('gives nothing for a file with no block, or a block never closed', () => {
    expect(file('A -> B')).toEqual([])
    expect(file('@startuml\nA -> B')).toEqual([])
  })

  it('takes a multi-page block as one', () => {
    expect(file('@startuml\nA\nnewpage\nB\n@enduml')).toHaveLength(1)
  })

  it('leaves out a type Add diagram does not list', () => {
    expect(file('@startdef\n!define A\n@enddef')).toEqual([])
  })
})

describe('arrange', () => {
  it('puts the built-ins first, then shared, then yours, each by title', () => {
    const files = fromFiles([
      { source: 'yours', path: 'Templates/b.puml', text: '@startuml Zed\n@enduml' },
      { source: 'shared', path: 'Templates/a.puml', text: '@startuml Beta\n@enduml\n@startuml Alpha\n@enduml' },
    ])
    const uml = arrange(builtins(OWN), files).get('uml')
    expect(titles(uml).slice(-3)).toEqual(['Alpha', 'Beta', 'Zed'])
    expect(uml[0].title).toBe('Empty')
  })

  it('keys every type, in A6\'s order', () => {
    const keys = [...arrange(builtins(OWN), []).keys()]
    expect(keys).toHaveLength(27)
    expect(keys[0]).toBe('uml')
    expect(keys.at(-1)).toBe('packetdiag')
  })
})

describe('matching', () => {
  const arranged = arrange(builtins(OWN), [])

  it('finds a type by its name, word, @start word or a template\'s title', () => {
    expect(matching(arranged, 'mind')).toEqual(['mindmap'])
    expect(matching(arranged, '@startgantt')).toEqual(['gantt'])
    expect(matching(arranged, 'SEQ')).toEqual(['uml'])
  })

  it('keeps every type for a blank search', () => {
    expect(matching(arranged, '  ')).toHaveLength(27)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/js/add-catalog.test.js`
Expected: FAIL, cannot resolve `catalog.js`.

- [ ] **Step 3: Write minimal implementation**

In `src/editor/completion/directives.js`: `export const BRACED = ['salt', 'json']`.

`src/editor/add/catalog.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Every template Add diagram offers (editor spec A5, A8, A9), by type and in
 * order: the built-ins, then the admin's shared files, then the user's own.
 * Pure: the menu and the modal render what this gives.
 */
import templates from '../data/templates.json'
import { BRACED } from '../completion/directives.js'
import { blocksOf, scan } from '../blocks.js'
import { TYPES } from './types.js'

/**
 * @typedef {object} Template
 * @property {string} type the word after `@start`
 * @property {string} title what the row shows
 * @property {string} name what goes on the `@start` line when it is added (A4)
 * @property {string} description the row's second line
 * @property {string} text the block it adds, `@start` line to `@end` line
 * @property {string} icon an ICONS key
 * @property {'builtin'|'shared'|'yours'} source
 */

const BY_TYPE = new Map(TYPES.map((t) => [t.type, t]))
const FROM = { builtin: 0, shared: 1, yours: 2 }

/** Empty (A8): the two lines and a blank one, braces for salt and json as B8 inserts them. */
export function emptyText(type) {
  return `@start${type}\n${BRACED.includes(type) ? '{\n\t\n}' : ''}\n@end${type}`
}

/** The first line of a block's body with text on it. */
function firstLine(text) {
  return text.split('\n').slice(1, -1).find((line) => line.trim())?.trim() ?? ''
}

/**
 * @param {Record<string, { summary?: string, example?: string }>} own own.json
 * @returns {Template[]}
 */
export function builtins(own) {
  return TYPES.flatMap(({ type, icon }) => {
    const list = [{ type, title: 'Empty', name: type, description: `@start${type} and @end${type}, nothing between`, text: emptyText(type), icon, source: 'builtin' }]
    const example = own[`diagram:${type}`]?.example
    if (example?.startsWith(`@start${type}`)) {
      list.push({ type, title: 'Example', name: type, description: firstLine(example), text: example, icon, source: 'builtin' })
    }
    for (const t of templates[type] ?? []) {
      list.push({ type, title: t.title, name: t.name, description: t.description, text: t.text, icon: t.icon, source: 'builtin' })
    }
    return list
  })
}

/**
 * A9: each closed block of each file, of a type A6 lists.
 *
 * @param {{ source: 'shared'|'yours', path: string, text: string }[]} files
 * @returns {Template[]}
 */
export function fromFiles(files) {
  return files.flatMap(({ source, path, text }) => {
    const lines = text.split('\n')
    const base = path.split('/').pop().replace(/\.[^.]+$/, '')
    let unnamed = 0
    return blocksOf(scan(text))
      .filter((b) => b.end !== null && BY_TYPE.has(b.type))
      .map((b) => {
        const block = lines.slice(b.start - 1, b.end)
        const title = b.name || (++unnamed === 1 ? base : `${base} ${unnamed}`)
        const comment = block.slice(1, -1).find((line) => line.trim().startsWith("'"))
        const note = comment ? comment.trim().replace(/^'+\s*/, '') : path
        return { type: b.type, title, name: title, description: `${source === 'shared' ? 'Shared' : 'Yours'} · ${note}`, text: block.join('\n'), icon: BY_TYPE.get(b.type).icon, source }
      })
  })
}

/**
 * @param {Template[]} builtIn
 * @param {Template[]} files
 * @returns {Map<string, Template[]>} every type of A6, in its order
 */
export function arrange(builtIn, files) {
  const byType = new Map(TYPES.map(({ type }) => [type, []]))
  for (const t of builtIn) byType.get(t.type)?.push(t)
  const sorted = [...files].sort((a, b) => FROM[a.source] - FROM[b.source] || a.title.localeCompare(b.title))
  for (const t of sorted) byType.get(t.type)?.push(t)
  return byType
}

/** The types whose name, word, `@start` word or any template title holds `query`, any case. */
export function matching(arranged, query) {
  const q = query.trim().toLowerCase()
  return TYPES
    .filter(({ type, name }) => !q || [name, type, `@start${type}`, ...arranged.get(type).map((t) => t.title)].some((s) => s.toLowerCase().includes(q)))
    .map(({ type }) => type)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/js/add-catalog.test.js tests/js/completion.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/add/catalog.js src/editor/completion/directives.js tests/js/add-catalog.test.js
git commit -m "Add diagram: every template, by type and in order"
```

---

### Task 9: Appending a template (A4)

**Files:**
- Create: `src/editor/add/insert.js`
- Test: `tests/js/add-insert.test.js`

**Interfaces:**
- Consumes: `startCall` (`src/editor/lexicon/rules.js`).
- Produces: `takenNames(diagrams: Diagram[]): Set<string>` (each block's name, its type's word when unnamed, as its tab reads); `uniqueName(base: string, taken: Set<string>): string`; `named(block: string, name: string): string` (drops an `(id=…)`); `appendBlock(doc: string, block: string): { from: number, to: number, insert: string, start: number, cursor: number }` — `start` the offset of the new `@start` line, `cursor` the start of the line after it, both in the new document; a final newline the file had is kept after the block.

- [ ] **Step 1: Write the failing test**

```js
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { appendBlock, named, takenNames, uniqueName } from '../../src/editor/add/insert.js'
import { scan } from '../../src/editor/blocks.js'

const apply = (doc, c) => doc.slice(0, c.from) + c.insert + doc.slice(c.to)

describe('takenNames', () => {
  it('holds each block\'s name, and an unnamed block\'s type, as the tabs read', () => {
    expect(takenNames(scan('@startuml\n@enduml\n@startgantt plan\n@endgantt'))).toEqual(new Set(['uml', 'plan']))
  })
})

describe('uniqueName', () => {
  it('keeps a name the file does not have', () => {
    expect(uniqueName('class-diagram', new Set(['nodes']))).toBe('class-diagram')
  })

  it('numbers a taken one from -2', () => {
    expect(uniqueName('gantt', new Set(['gantt']))).toBe('gantt-2')
    expect(uniqueName('gantt', new Set(['gantt', 'gantt-2']))).toBe('gantt-3')
  })
})

describe('named', () => {
  it('writes the name on the @start line', () => {
    expect(named('@startuml\nA\n@enduml', 'class-diagram')).toBe('@startuml class-diagram\nA\n@enduml')
  })

  it('replaces the name the line had', () => {
    expect(named('@startuml Old\n@enduml', 'New')).toBe('@startuml New\n@enduml')
  })

  it('drops an id, which a second copy would duplicate, and keeps other arguments', () => {
    expect(named('@startuml(id=L) Old\n@enduml', 'New')).toBe('@startuml New\n@enduml')
    expect(named('@startuml( id = L )\n@enduml', 'New')).toBe('@startuml New\n@enduml')
    expect(named('@startditaa(--no-shadows)\n@endditaa', 'box')).toBe('@startditaa(--no-shadows) box\n@endditaa')
  })

  it('drops what a name cannot hold', () => {
    expect(named('@startuml\n@enduml', '"a {b}"')).toBe('@startuml a b\n@enduml')
  })
})

describe('appendBlock', () => {
  const block = '@startgantt gantt\n\n@endgantt'

  it('leaves exactly one blank line after the last text', () => {
    const doc = '@startuml\nA\n@enduml'
    const c = appendBlock(doc, block)
    const after = apply(doc, c)
    expect(after).toBe('@startuml\nA\n@enduml\n\n@startgantt gantt\n\n@endgantt')
    expect(after.slice(c.start).startsWith('@startgantt gantt\n')).toBe(true)
    expect(after.slice(0, c.cursor).split('\n')).toHaveLength(6)
  })

  it('trims blank lines at the end to that one, keeping the file\'s final newline', () => {
    const doc = '@startuml\nA\n@enduml\n\n\n  \n'
    expect(apply(doc, appendBlock(doc, block))).toBe('@startuml\nA\n@enduml\n\n@startgantt gantt\n\n@endgantt\n')
  })

  it('keeps a final newline the file had, and adds none it did not', () => {
    expect(apply('@enduml\n', appendBlock('@enduml\n', block)).endsWith('@endgantt\n')).toBe(true)
    expect(apply('@enduml', appendBlock('@enduml', block)).endsWith('@endgantt')).toBe(true)
  })

  it('gives an empty file the block alone', () => {
    for (const doc of ['', '\n\n']) {
      const c = appendBlock(doc, block)
      expect(apply(doc, c)).toBe(block)
      expect(c.start).toBe(0)
      expect(c.cursor).toBe('@startgantt gantt\n'.length)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/js/add-insert.test.js`
Expected: FAIL, cannot resolve `insert.js`.

- [ ] **Step 3: Write minimal implementation**

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Adding a template (editor spec A4): its block goes at the end of the file,
 * one blank line below the last text, under a name the file does not have yet.
 * Pure: the editor dispatches the change this gives.
 */
import { startCall } from '../lexicon/rules.js'

const START = /^(\s*@start\w+)(.*)$/
const ID = /^\(\s*id\s*=/

/** The names a new block may not take: each block's, or its type's word when unnamed, as its tab reads (B2). */
export function takenNames(diagrams) {
  return new Set(diagrams.map((d) => d.name || d.type))
}

/** `base`, else `base-2`, `base-3`, … */
export function uniqueName(base, taken) {
  if (!taken.has(base)) {
    return base
  }
  let n = 2
  while (taken.has(`${base}-${n}`)) {
    n++
  }
  return `${base}-${n}`
}

/**
 * The block with `name` on its `@start` line. An `(id=…)` is dropped: a second
 * copy of the template would give the file two blocks of one id. Other
 * arguments stay. What B1 cannot read as a name is dropped from `name`.
 */
export function named(block, name) {
  const [first, ...rest] = block.split('\n')
  const [, lead, after] = START.exec(first)
  const call = startCall.exec(after)?.[0] ?? ''
  const kept = ID.test(call) ? '' : call
  const clean = name.replace(/["“”{}\r\n]/g, '').trim()
  return [`${lead}${kept}${clean ? ` ${clean}` : ''}`, ...rest].join('\n')
}

/**
 * The change that ends `doc` with one blank line, then `block`, then the final
 * newline `doc` had, if it had one; an empty file gets the block alone.
 */
export function appendBlock(doc, block) {
  const lines = doc.split('\n')
  let last = lines.length
  while (last > 0 && !lines[last - 1].trim()) {
    last--
  }
  const from = last === 0 ? 0 : lines.slice(0, last).join('\n').length
  const eol = last > 0 && doc.endsWith('\n') ? '\n' : ''
  const insert = last === 0 ? block : `\n\n${block}${eol}`
  const start = last === 0 ? 0 : from + 2
  const newline = block.indexOf('\n')
  const cursor = newline === -1 ? start + block.length : start + newline + 1
  return { from, to: doc.length, insert, start, cursor }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/js/add-insert.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/add/insert.js tests/js/add-insert.test.js
git commit -m "Add diagram: a block appended one blank line down, under a name of its own"
```

---

### Task 10: The split button, the type menu, and adding (A1, A2, A4)

*Board* (`library / add diagram`, `overlay / type-menu`): the split button is 65 × 34 (`--default-clickable-area`), a pill with a 1 px inner `--color-border-dark` stroke; **+** half 36 wide, padding `0 4px 0 8px`, the 24 px `plus`; a 1 × 20 divider in `--color-border-dark`; **▾** half 28 wide, padding `0 8px 0 4px`, a 16 px chevron. HoverAdd puts `--color-background-hover` on the + half; Open puts `--color-primary-element-light` on the ▾ half; Focus makes the stroke 2 px `--color-primary-element`. The menu is 260 wide, `--color-main-background`, a 1 px `--color-border` stroke, `--border-radius-element` (8 px), `--box-shadow-popover`, padding `4px 0`; a row is 44 high with a 32 px icon slot holding the 24 px icon and the label at 15 px; 12 rows show (536 px in all) and the rest scroll.

**Files:**
- Create: `src/editor/add/button.js`, `src/editor/add/route.js`, `src/editor/add/menu.js`, `src/editor/add/index.js`
- Modify: `src/editor.js`, `css/editor.css`
- Test: `tests/js/add-menu.test.js`, `tests/js/editor.test.js`

**Interfaces:**
- Consumes: Tasks 6, 8, 9.
- Produces:
  - `createAddButton({ onAdd, onMenu }): { element: HTMLElement, menuButton: HTMLButtonElement, setMenuOpen(open: boolean): void }`;
  - `fetchTemplates(): Promise<{ source, path, text }[]>`;
  - `openTypeMenu({ container, anchor, types, onPick, onClose }): { close(): void }`;
  - `createAdd({ container, onAdd }): { openMenu(anchor, onClose): void, openModal(): void, destroy(): void }` — `openModal` is Task 11's, a stub that does nothing until then.

- [ ] **Step 1: Write the failing test**

`tests/js/add-menu.test.js`:

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openTypeMenu } from '../../src/editor/add/menu.js'
import { fetchTemplates } from '../../src/editor/add/route.js'
import { TYPES } from '../../src/editor/add/types.js'

const key = (target, k) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('the type menu', () => {
  let anchor
  let onPick
  let onClose
  let menu
  const items = () => [...document.querySelectorAll('.plantuml-add__menu [role="menuitem"]')]

  beforeEach(() => {
    document.body.innerHTML = '<div class="plantuml-editor"><button id="anchor">▾</button></div>'
    anchor = document.getElementById('anchor')
    onPick = vi.fn()
    onClose = vi.fn()
    menu = openTypeMenu({ container: document.querySelector('.plantuml-editor'), anchor, types: TYPES, onPick, onClose })
  })

  afterEach(() => menu.close())

  it('lists the 27 types by name, the first focused', () => {
    expect(items().map((i) => i.textContent)).toEqual(TYPES.map((t) => t.name))
    expect(document.activeElement).toBe(items()[0])
    expect(document.querySelector('.plantuml-add__menu').getAttribute('role')).toBe('menu')
  })

  it('moves with the arrows, wrapping, and jumps with Home and End', () => {
    key(document.activeElement, 'ArrowUp')
    expect(document.activeElement.textContent).toBe('packetdiag')
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement.textContent).toBe('UML')
    key(document.activeElement, 'End')
    expect(document.activeElement.textContent).toBe('packetdiag')
    key(document.activeElement, 'Home')
    expect(document.activeElement.textContent).toBe('UML')
  })

  it('picks the focused type on Enter and closes', () => {
    items().find((i) => i.textContent === 'Gantt').focus()
    key(document.activeElement, 'Enter')
    expect(onPick).toHaveBeenCalledWith('gantt')
    expect(items()).toHaveLength(0)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape, back on its button, and the editor never sees the key', () => {
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    const event = key(document.activeElement, 'Escape')
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(anchor)
  })

  it('closes on a click outside it', () => {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(items()).toHaveLength(0)
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe('fetchTemplates', () => {
  beforeEach(() => {
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => vi.unstubAllGlobals())

  it('asks the route and answers its files', async () => {
    const files = [{ source: 'shared', path: 'Templates/a.puml', text: '@startuml\n@enduml' }]
    const fetch = vi.fn(async () => new Response(JSON.stringify({ files }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchTemplates()).toEqual(files)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/templates', { credentials: 'same-origin' })
  })

  it('answers nothing for a failure or a body without files', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await fetchTemplates()).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"x":1}', { status: 200 })))
    expect(await fetchTemplates()).toEqual([])
  })
})
```

In `tests/js/editor.test.js`, a new block (add `waitFor` from `vitest`'s `vi`):

```js
describe('Add diagram', () => {
  const addButton = () => q('.plantuml-editor__add-new')
  const typeButton = () => q('.plantuml-editor__add-type')
  const view = () => EditorView.findFromDOM(q('.cm-editor'))
  const pickType = async (name) => {
    typeButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    ;[...document.querySelectorAll('.plantuml-add__menu [role="menuitem"]')].find((i) => i.textContent === name).click()
  }

  it('sits just before the Source toggle, once the file is there', async () => {
    let loaded
    seams.loadFile.mockReturnValue(new Promise((resolve) => { loaded = resolve }))
    window.OCA.PlantUml.openEditor({ path: '/Diagrams/Order flow.puml', basename: 'Order flow.puml' })
    expect(q('.plantuml-editor__add').hidden).toBe(true)
    loaded({ content: '@startuml\nA -> B\n@enduml\n', etag: '"get"' })
    await settle()
    expect(q('.plantuml-editor__add').hidden).toBe(false)
    expect(q('.plantuml-editor__add').nextElementSibling).toBe(toggle())
    expect(addButton().getAttribute('aria-label')).toBe('Add diagram')
    expect(addButton().title).toBe('Add diagram')
    expect(typeButton().getAttribute('aria-label')).toBe('Add a diagram of a type')
    expect(typeButton().getAttribute('aria-haspopup')).toBe('menu')
  })

  it('adds an empty Gantt from the type menu, one blank line down, its tab active', async () => {
    await open()
    await pickType('Gantt')
    expect(source()).toBe('@startuml\nA -> B\n@enduml\n\n@startgantt gantt\n\n@endgantt\n')
    expect(view().state.doc.lineAt(view().state.selection.main.head).number).toBe(6)
    expect(q('.plantuml-editor__tab[aria-selected="true"]').textContent).toBe('gantt')
  })

  it('names a second one gantt-2', async () => {
    await open()
    await pickType('Gantt')
    await pickType('Gantt')
    expect(source()).toContain('@startgantt gantt-2\n')
  })

  it('names an Empty UML uml-2 beside an unnamed @startuml, whose tab reads uml', async () => {
    await open()
    await pickType('UML')
    expect(source()).toContain('\n\n@startuml uml-2\n')
  })

  it('takes one undo to remove', async () => {
    await open()
    await pickType('Gantt')
    undo(view())
    expect(source()).toBe('@startuml\nA -> B\n@enduml\n')
  })

  it('is saved as any change is', async () => {
    seams.saveFile.mockResolvedValue('"put"')
    await open()
    vi.useFakeTimers()
    await pickType('Gantt')
    await vi.advanceTimersByTimeAsync(2000)
    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/Order flow.puml', expect.stringContaining('@startgantt gantt'), '"get"')
  })

  it('shows the ▾ half open while its menu is', async () => {
    await open()
    typeButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    expect(typeButton().getAttribute('aria-expanded')).toBe('true')
    typeButton().click()
    // The click reaches the menu through the loaded chunk's promise, a tick later.
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).toBeNull())
    expect(typeButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the editor open when Escape closes the menu', async () => {
    await open()
    typeButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()
    expect(q('.plantuml-add__menu')).toBeNull()
    expect(q('.plantuml-editor')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/js/add-menu.test.js tests/js/editor.test.js`
Expected: FAIL, `menu.js` and `route.js` missing; the editor tests find no `.plantuml-editor__add`.

- [ ] **Step 3: Write minimal implementation**

`src/editor/add/route.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The template files the server offers (GET /apps/plantuml/templates, app spec
 * TP3). A failure leaves the built-ins alone (A5), so it answers nothing.
 */
import { APP_ID } from '../../files-helpers.js'

/** @returns {Promise<{ source: 'shared'|'yours', path: string, text: string }[]>} */
export async function fetchTemplates() {
  try {
    const res = await fetch(OC.generateUrl(`/apps/${APP_ID}/templates`), { credentials: 'same-origin' })
    const body = res.ok ? await res.json() : null
    if (Array.isArray(body?.files)) {
      return body.files
    }
    console.error(`[${APP_ID}] could not list the templates`, res.status)
  } catch (e) {
    console.error(`[${APP_ID}] could not list the templates`, e)
  }
  return []
}
```

`src/editor/add/button.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The bar's Add diagram split button (editor spec A1): + opens the modal, ▾ the
 * type menu. In the editor entry; what it opens is loaded on the first click.
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import plusIcon from '../../../img/icons/plus.svg?raw'
import chevronIcon from '../../../img/icons/chevron-down.svg?raw'

/**
 * @param {{ onAdd: () => void, onMenu: (anchor: HTMLElement) => void }} handlers
 * @returns {{ element: HTMLElement, menuButton: HTMLButtonElement, setMenuOpen: (open: boolean) => void }}
 */
export function createAddButton({ onAdd, onMenu }) {
  const add = crelt('button', { class: 'plantuml-editor__add-new', type: 'button', 'aria-label': t(APP_ID, 'Add diagram'), title: t(APP_ID, 'Add diagram') })
  add.innerHTML = plusIcon
  const menuButton = crelt('button', { class: 'plantuml-editor__add-type', type: 'button', 'aria-label': t(APP_ID, 'Add a diagram of a type'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' })
  menuButton.innerHTML = chevronIcon
  const element = crelt('span', { class: 'plantuml-editor__add', hidden: '' }, add, crelt('span', { class: 'plantuml-editor__add-divider', 'aria-hidden': 'true' }), menuButton)
  add.addEventListener('click', onAdd)
  menuButton.addEventListener('click', () => onMenu(menuButton))
  return {
    element,
    menuButton,
    setMenuOpen(open) {
      menuButton.setAttribute('aria-expanded', String(open))
      element.classList.toggle('plantuml-editor__add--open', open)
    },
  }
}
```

`src/editor/add/menu.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The type menu under ▾ (editor spec A2): every type, its icon and name;
 * picking one adds its Empty. Fixed under its button, right edges aligned.
 * Every key it handles stops here, so the editor's Escape never closes the editor.
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { iconSvg } from '../data/template-icons.js'

/** 12 rows of 44 px and the menu's 4 px top and bottom (board `overlay / type-menu`). */
const MAX_HEIGHT = 12 * 44 + 8

/**
 * @param {{ container: HTMLElement, anchor: HTMLElement, types: { type: string, name: string, icon: string }[], onPick: (type: string) => void, onClose: () => void }} options
 * @returns {{ close: () => void }}
 */
export function openTypeMenu({ container, anchor, types, onPick, onClose }) {
  const menu = crelt('div', { class: 'plantuml-editor__menu plantuml-add__menu', role: 'menu', 'aria-label': t(APP_ID, 'Add a diagram of a type') })
  const items = types.map(({ type, name, icon }) => {
    const item = crelt('button', { class: 'plantuml-editor__menu-item plantuml-add__menu-item', type: 'button', role: 'menuitem', tabindex: '-1' })
    item.innerHTML = `<span class="plantuml-add__menu-icon">${iconSvg(icon, 24)}</span>`
    item.append(crelt('span', name))
    item.addEventListener('click', () => {
      close(false)
      onPick(type)
    })
    return item
  })
  menu.append(...items)
  container.append(menu)
  place()
  items[0]?.focus()

  function place() {
    const rect = anchor.getBoundingClientRect()
    menu.style.top = `${rect.bottom + 4}px`
    menu.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`
    menu.style.maxHeight = `${Math.min(MAX_HEIGHT, Math.max(160, window.innerHeight - rect.bottom - 12))}px`
  }

  function onKey(event) {
    const i = items.indexOf(document.activeElement)
    const to = { ArrowDown: (i + 1) % items.length, ArrowUp: (i - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key]
    if (to !== undefined) {
      items[to].focus()
    } else if (event.key === 'Enter' || event.key === ' ') {
      items[i]?.click()
    } else if (event.key === 'Escape') {
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
      return
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function outside(event) {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) {
      close(false)
    }
  }

  let open = true
  function close(refocus) {
    if (!open) {
      return
    }
    open = false
    document.removeEventListener('click', outside, true)
    window.removeEventListener('resize', place)
    menu.remove()
    if (refocus) {
      anchor.focus()
    }
    onClose()
  }

  menu.addEventListener('keydown', onKey)
  document.addEventListener('click', outside, true)
  window.addEventListener('resize', place)
  return { close: () => close(false) }
}
```

`src/editor/add/index.js` (Task 11 fills `openModal`):

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Add diagram's chunk, `import()`ed by the editor on the first click of its
 * split button: the template data, the type menu and the modal.
 */
import own from '../data/docs/own.json'
import { builtins } from './catalog.js'
import { openTypeMenu } from './menu.js'
import { TYPES } from './types.js'

/**
 * @param {{ container: HTMLElement, onAdd: (template: import('./catalog.js').Template) => void }} options
 */
export function createAdd({ container, onAdd }) {
  const builtIn = builtins(own)
  let menu = null

  /** The menu adds a type's Empty, which is built in, so it does not ask the route. */
  function openMenu(anchor, onClose) {
    if (menu) {
      menu.close()
      return
    }
    menu = openTypeMenu({
      container,
      anchor,
      types: TYPES,
      onPick: (type) => onAdd(builtIn.find((t) => t.type === type && t.title === 'Empty')),
      onClose: () => {
        menu = null
        onClose()
      },
    })
  }

  function openModal() {}

  function destroy() {
    menu?.close()
  }

  return { openMenu, openModal, destroy }
}
```

`src/editor.js`:
- imports: `isolateHistory` joins the `@codemirror/commands` import; add `import { createAddButton } from './editor/add/button.js'` and `import { appendBlock, named, takenNames, uniqueName } from './editor/add/insert.js'`.
- after `sourceToggle` is made:

```js
  // A1: the add chunk (menu, modal, template data) is loaded on the first click.
  let adding = null
  const addButton = createAddButton({
    onAdd: () => withAdd((add) => add.openModal()),
    onMenu: (anchor) => withAdd((add) => {
      addButton.setMenuOpen(true)
      add.openMenu(anchor, () => addButton.setMenuOpen(false))
    }),
  })

  /** A failed load is forgotten, so the next click tries again. */
  function withAdd(use) {
    adding ??= import('./editor/add/index.js').then(
      ({ createAdd }) => createAdd({ container: overlay, onAdd: addTemplate }),
      (e) => { adding = null; throw e },
    )
    adding.then((add) => { if (!closed) use(add) }, (e) => console.error(`[${APP_ID}] could not load Add diagram`, e))
  }
```

- the bar: `bar.append(icon, title, status, reloadButton, copyButton, addButton.element, sourceToggle, refreshButton, saveButton, closeButton)`.
- beside `showDiagram`:

```js
  /** A4: the template's block at the end, under a name of its own; its tab follows the cursor (B3). */
  function addTemplate(template) {
    if (!view || closed) {
      return
    }
    const name = uniqueName(template.name, takenNames(diagrams))
    const change = appendBlock(view.state.doc.toString(), named(template.text, name))
    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: { anchor: change.cursor },
      effects: EditorView.scrollIntoView(change.start, { y: 'start', yMargin: 20 }),
      // One undo step, never merged with typing before or after it.
      annotations: isolateHistory.of('full'),
      userEvent: 'input.add',
    })
    view.focus()
  }
```

- `close()`, before `overlay.remove()`: `adding?.then((add) => add.destroy(), () => {})`.
- on load, beside `sourceToggle.hidden = false`: `addButton.element.hidden = false`.

`css/editor.css`, after the Source toggle's rules:

```css
/* A1: the Add diagram split button (board library / add diagram). */
.plantuml-editor__add {
	display: inline-flex;
	flex: none;
	align-items: stretch;
	height: var(--default-clickable-area, 34px);
	box-sizing: border-box;
	border: 1px solid var(--color-border-dark);
	border-radius: var(--border-radius-pill, 100px);
	overflow: hidden;
}

.plantuml-editor__add[hidden] {
	display: none;
}

.plantuml-editor__add:has(:focus-visible) {
	border-color: var(--color-primary-element);
	box-shadow: inset 0 0 0 1px var(--color-primary-element);
}

/* button.* outranks core's button:not(.button-vue, …) pill background. */
.plantuml-editor__add button.plantuml-editor__add-new,
.plantuml-editor__add button.plantuml-editor__add-type {
	display: flex;
	align-items: center;
	min-height: 0;
	height: auto;
	margin: 0;
	border: none;
	border-radius: var(--border-radius-pill, 100px);
	background: transparent;
	color: var(--color-main-text);
	cursor: pointer;
}

.plantuml-editor__add button.plantuml-editor__add-new {
	width: 36px;
	padding: 0 4px 0 8px;
}

.plantuml-editor__add button.plantuml-editor__add-type {
	width: 28px;
	padding: 0 8px 0 4px;
}

.plantuml-editor__add button.plantuml-editor__add-new:hover,
.plantuml-editor__add button.plantuml-editor__add-type:hover {
	background: var(--color-background-hover);
}

.plantuml-editor__add--open button.plantuml-editor__add-type,
.plantuml-editor__add--open button.plantuml-editor__add-type:hover {
	background: var(--color-primary-element-light);
}

.plantuml-editor__add button:focus-visible {
	outline: none;
}

.plantuml-editor__add-new svg {
	width: 24px;
	height: 24px;
}

.plantuml-editor__add-type svg {
	width: 16px;
	height: 16px;
}

.plantuml-editor__add-divider {
	align-self: center;
	width: 1px;
	height: 20px;
	background: var(--color-border-dark);
}

/* A2: the type menu (board overlay / type-menu). */
.plantuml-editor__menu.plantuml-add__menu {
	width: 260px;
	max-width: none;
	padding: 4px 0;
	border-radius: var(--border-radius-element, 8px);
	box-shadow: 0 2px 12px var(--color-box-shadow);
}

.plantuml-add__menu button.plantuml-add__menu-item {
	align-items: center;
	justify-content: flex-start;
	gap: 0;
	min-height: 44px;
	padding: 0 12px 0 6px;
	border-radius: 0;
	font-size: 15px;
}

.plantuml-add__menu-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	margin-right: 6px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS.
Run: `npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js && gzip -c dist/plantuml-editor.js | wc -c`
Expected: build OK, guard OK; note the gzip size in the commit message beside main's (240.94 kB); it should grow by under 2 kB.

- [ ] **Step 5: Check for the Linked-files round**

Run: `grep -n "async function openLinked\|async function goBack" src/editor.js`
Expected: either both lines (the Linked-files round has landed; do Steps 6–8), or nothing (skip to Step 9).

Dr K, 2026-10-17: the split button is **hidden while a linked file is open**, and shows again on going back. A template is a diagram of the main file, and the source pane then holds the other file.

- [ ] **Step 6: Write the failing test**

Inside the `describe` of `tests/js/editor.test.js` that defines `openStyle()` (the Linked-files round's), beside its "goes back on %s" test:

```js
  it('hides Add diagram while the linked file is open, and shows it again on going back', async () => {
    await openStyle()
    expect(q('.plantuml-editor__add').hidden).toBe(true)

    q('.plantuml-editor__back').click()
    await settle()

    expect(q('.plantuml-editor__add').hidden).toBe(false)
  })

  it('closes an open type menu when a linked file opens', async () => {
    await open()
    q('.plantuml-editor__add-type').click()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).not.toBeNull())
    view().dispatch({})
    await settle()
    chip('UML_Fun.css').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await settle()
    await vi.waitFor(() => expect(q('.plantuml-add__menu')).toBeNull())
  })
```

Run: `npx vitest run tests/js/editor.test.js`
Expected: FAIL, `.plantuml-editor__add` still shown while the linked file is open.

- [ ] **Step 7: Write minimal implementation**

In `src/editor.js`, `openLinked()`, right after `crumbs.show(main.name, { name, readOnly })`:

```js
    // Dr K: Add diagram adds to the main file, so it is hidden while another file is open.
    addButton.element.hidden = true
    adding?.then((add) => add.destroy(), () => {})
```

`goBack()`, right after `crumbs.show(main.name, null)`:

```js
    addButton.element.hidden = false
```

and `addTemplate()`'s guard becomes `if (!view || closed || linked) {`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/js/editor.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/editor.js src/editor/add css/editor.css tests/js/add-menu.test.js tests/js/editor.test.js
git commit -m "Add diagram: the split button, and a type's Empty from its menu"
```

---

### Task 11: The Add diagram modal (A3)

*Board* (`screens / add-modal-uml`, `-mindmap`, `-hover`, `overlay / class-preview`, `library / add diagram`): a black backdrop at 50 % over the editor; the dialog 880 × 600, centred, `--color-main-background`, `--border-radius-large` (8 px), `--box-shadow-popover`. Header 58 high, padding `12px 24px`, the title "Add diagram" at 18/600 and a 34 px pill close button with the 24 px `close` icon. Body: a left column 288 wide, padding `0 16px 16px`, gap 8 — the search field 44 high, `--border-radius-element`, a 1 px `--color-border-maxcontrast` stroke, placeholder "Search" at 15 px in `--color-text-maxcontrast` — then the type rows; a 1 px `--color-border` divider; the right column, padding `0 16px 16px`, gap 4, the template rows. A type row: 40 high, padding `0 12px`, gap 12, radius 8, the 24 px icon, the name at 14 px, the count at 13 px in `--color-text-maxcontrast`; hover `--color-background-hover`; selected `--color-primary-element-light`, its icon, name (600) and count in `--color-primary-element-light-text`. A template row: 64 high, padding 12, gap 16, radius 8, a 40 px tile on `--color-background-dark` (radius 8) holding the 24 px icon, the title at 15/600 over the description at 13 px in `--color-text-maxcontrast`, gap 4; hover `--color-background-hover`. The preview card: 220 wide at least, 16 px right of the dialog and level with its row, `--color-main-background`, a 1 px `--color-border` stroke, radius 8, `--box-shadow-popover`, padding 12, the text at 13 px in the source font (`var(--font-face-monospace, monospace)`).

**Files:**
- Create: `src/editor/add/modal.js`
- Modify: `src/editor/add/index.js`, `css/editor.css`
- Test: `tests/js/add-modal.test.js`, `tests/js/editor.test.js`

**Interfaces:**
- Consumes: `arrange`, `builtins`, `fromFiles`, `matching` (Task 8), `iconSvg`, `TYPES`, `fetchTemplates` (Task 10), `DOC_HOVER.hoverTime` (500 ms, `src/editor/docs/hover.js`).
- Produces: `openAddModal({ container, arranged, onPick, onClose }): { update(arranged): void, close(): void }`; `createAdd`'s `openModal()` and `destroy()` close it too.

- [ ] **Step 1: Write the failing test**

`tests/js/add-modal.test.js`:

```js
// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openAddModal } from '../../src/editor/add/modal.js'
import { arrange, builtins, fromFiles } from '../../src/editor/add/catalog.js'

const OWN = { 'diagram:uml': { example: '@startuml\nAlice -> Bob : hi\n@enduml' } }
const q = (s) => document.querySelector(s)
const all = (s) => [...document.querySelectorAll(s)]
const rows = () => all('.plantuml-add__template')
const typeRows = () => all('.plantuml-add__type')
const key = (target, k, init = {}) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('the Add diagram modal', () => {
  let onPick
  let onClose
  let modal

  beforeEach(() => {
    document.body.innerHTML = '<div class="plantuml-editor"><button id="plus">+</button></div>'
    document.getElementById('plus').focus()
    onPick = vi.fn()
    onClose = vi.fn()
    modal = openAddModal({ container: q('.plantuml-editor'), arranged: arrange(builtins(OWN), []), onPick, onClose })
  })

  afterEach(() => {
    modal.close()
    vi.useRealTimers()
  })

  it('opens titled, on UML, its templates in order, the search focused', () => {
    expect(q('.plantuml-add__dialog').getAttribute('role')).toBe('dialog')
    expect(q('.plantuml-add__title').textContent).toBe('Add diagram')
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('UML')
    expect(rows().map((r) => r.querySelector('.plantuml-add__template-title').textContent).slice(0, 3)).toEqual(['Empty', 'Example', 'Sequence'])
    expect(document.activeElement).toBe(q('.plantuml-add__search'))
    expect(q('.plantuml-add__search').placeholder).toBe('Search')
  })

  it('shows each type\'s template count', () => {
    expect(typeRows()[0].querySelector('.plantuml-add__count').textContent).toBe('11')
    expect(typeRows().find((r) => r.textContent.startsWith('Git')).querySelector('.plantuml-add__count').textContent).toBe('1')
  })

  it('narrows the types as the search is typed, selecting the first left', () => {
    const search = q('.plantuml-add__search')
    search.value = 'mind'
    search.dispatchEvent(new Event('input'))
    expect(typeRows().map((r) => r.querySelector('.plantuml-add__type-name').textContent)).toEqual(['MindMap'])
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('MindMap')
  })

  it('shows a template\'s text once the pointer has rested on it 500 ms', () => {
    vi.useFakeTimers()
    const klass = rows().find((r) => r.textContent.startsWith('Class'))
    klass.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(499)
    expect(q('.plantuml-add__preview').hidden).toBe(true)
    vi.advanceTimersByTime(1)
    expect(q('.plantuml-add__preview').hidden).toBe(false)
    expect(q('.plantuml-add__preview').textContent).toBe('@startuml\nclass Customer\nclass Order {\n  id : int\n  total()\n}\nCustomer "1" -- "*" Order\n@enduml')
  })

  it('shows it at once for a row reached with the keyboard', () => {
    rows()[1].focus()
    expect(q('.plantuml-add__preview').hidden).toBe(false)
    expect(q('.plantuml-add__preview').textContent).toBe(OWN['diagram:uml'].example)
  })

  it('picks a clicked row and closes', () => {
    rows()[2].click()
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sequence' }))
    expect(q('.plantuml-add')).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('picks a row on Enter', () => {
    rows()[0].focus()
    key(rows()[0], 'Enter')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: 'Empty', type: 'uml' }))
  })

  it('closes on Escape without picking, and the editor never sees the key', () => {
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    key(document.activeElement, 'Escape')
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(q('.plantuml-add')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.getElementById('plus'))
  })

  it('closes from its close button without picking', () => {
    q('.plantuml-add__close').click()
    expect(q('.plantuml-add')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('keeps Tab inside: search, the type, the template, the close button, round again', () => {
    const order = []
    for (let i = 0; i < 5; i++) {
      key(document.activeElement, 'Tab')
      order.push(document.activeElement.className)
    }
    expect(order).toEqual(['plantuml-add__type', 'plantuml-add__template', 'plantuml-add__close', 'plantuml-add__search', 'plantuml-add__type'])
  })

  it('moves within a list with the arrows; on the types, that selects', () => {
    typeRows()[0].focus()
    key(document.activeElement, 'ArrowDown')
    expect(document.activeElement.textContent).toContain('BPM')
    expect(q('.plantuml-add__type[aria-selected="true"]').textContent).toContain('BPM')
  })

  it('takes in the route\'s templates after the built-ins, keeping the selection', () => {
    rows()[1].focus()
    modal.update(arrange(builtins(OWN), fromFiles([{ source: 'shared', path: 'Templates/a.puml', text: "@startuml Login\n' Sign in\n@enduml" }])))
    const last = rows().at(-1)
    expect(last.querySelector('.plantuml-add__template-title').textContent).toBe('Login')
    expect(last.querySelector('.plantuml-add__description').textContent).toBe('Shared · Sign in')
    expect(document.activeElement).toBe(rows()[1])
  })
})
```

In `tests/js/editor.test.js`'s `Add diagram` block:

```js
  it('adds the template picked in the modal, under its name', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }))
    await open()
    addButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__dialog')).not.toBeNull())
    ;[...document.querySelectorAll('.plantuml-add__template')].find((r) => r.textContent.startsWith('Class')).click()
    expect(source()).toContain('\n\n@startuml class-diagram\nclass Customer\n')
    expect(q('.plantuml-editor__tab[aria-selected="true"]').textContent).toBe('class-diagram')
  })

  it('changes nothing when the modal is closed', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }))
    await open()
    addButton().click()
    await vi.waitFor(() => expect(q('.plantuml-add__dialog')).not.toBeNull())
    q('.plantuml-add__close').click()
    expect(source()).toBe('@startuml\nA -> B\n@enduml\n')
    expect(q('.plantuml-editor')).not.toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/js/add-modal.test.js tests/js/editor.test.js`
Expected: FAIL, `modal.js` missing; the editor's + opens nothing.

- [ ] **Step 3: Write minimal implementation**

`src/editor/add/modal.js`:

```js
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Add diagram modal (editor spec A3): the types on the left, the selected
 * type's templates on the right, the text a row adds in a card beside it.
 * NcModal's look built by hand, since the editor has no Vue. Every key it
 * handles stops here, so the editor's Escape never closes the editor.
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { DOC_HOVER } from '../docs/hover.js'
import { iconSvg } from '../data/template-icons.js'
import { matching } from './catalog.js'
import { TYPES } from './types.js'
import closeIcon from '../../../img/icons/close.svg?raw'

const BY_TYPE = new Map(TYPES.map((x) => [x.type, x]))

/**
 * @param {{ container: HTMLElement, arranged: Map<string, import('./catalog.js').Template[]>, onPick: (template: import('./catalog.js').Template) => void, onClose: () => void }} options
 * @returns {{ update: (arranged: Map<string, import('./catalog.js').Template[]>) => void, close: () => void }}
 */
export function openAddModal({ container, arranged, onPick, onClose }) {
  let all = arranged
  let selected = TYPES[0].type
  let timer = 0
  let open = true
  const opener = document.activeElement

  const title = crelt('h2', { class: 'plantuml-add__title', id: 'plantuml-add-title' }, t(APP_ID, 'Add diagram'))
  const closeButton = crelt('button', { class: 'plantuml-add__close', type: 'button', 'aria-label': t(APP_ID, 'Close') })
  closeButton.innerHTML = closeIcon
  const search = crelt('input', { class: 'plantuml-add__search', type: 'search', placeholder: t(APP_ID, 'Search'), 'aria-label': t(APP_ID, 'Search') })
  const typeList = crelt('div', { class: 'plantuml-add__types', role: 'listbox', 'aria-label': t(APP_ID, 'Types') })
  const templateList = crelt('div', { class: 'plantuml-add__templates', role: 'listbox', 'aria-label': t(APP_ID, 'Templates') })
  const dialog = crelt('div', { class: 'plantuml-add__dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title.id },
    crelt('header', { class: 'plantuml-add__header' }, title, closeButton),
    crelt('div', { class: 'plantuml-add__body' },
      crelt('div', { class: 'plantuml-add__left' }, search, typeList),
      crelt('div', { class: 'plantuml-add__divider', 'aria-hidden': 'true' }),
      crelt('div', { class: 'plantuml-add__right' }, templateList)))
  const preview = crelt('pre', { class: 'plantuml-add__preview', hidden: '' })
  const mask = crelt('div', { class: 'plantuml-add' }, dialog, preview)

  function renderTypes() {
    const shown = matching(all, search.value)
    if (!shown.includes(selected)) {
      selected = shown[0] ?? null
    }
    typeList.replaceChildren(...shown.map((type) => {
      const { name, icon } = BY_TYPE.get(type)
      const row = crelt('button', { class: 'plantuml-add__type', type: 'button', role: 'option', 'data-type': type, 'aria-selected': String(type === selected), tabindex: type === selected ? '0' : '-1' })
      row.innerHTML = iconSvg(icon, 24)
      row.append(crelt('span', { class: 'plantuml-add__type-name' }, name), crelt('span', { class: 'plantuml-add__count' }, String(all.get(type).length)))
      row.addEventListener('click', () => select(type))
      return row
    }))
    renderTemplates()
  }

  function renderTemplates() {
    hidePreview()
    const list = selected ? all.get(selected) : []
    templateList.replaceChildren(...list.map((template, i) => {
      const tile = crelt('span', { class: 'plantuml-add__tile', 'aria-hidden': 'true' })
      tile.innerHTML = iconSvg(template.icon, 24)
      const row = crelt('button', { class: 'plantuml-add__template', type: 'button', role: 'option', tabindex: i === 0 ? '0' : '-1' },
        tile,
        crelt('span', { class: 'plantuml-add__text' },
          crelt('span', { class: 'plantuml-add__template-title' }, template.title),
          crelt('span', { class: 'plantuml-add__description' }, template.description)))
      row.addEventListener('click', () => pick(template))
      row.addEventListener('pointerenter', () => {
        clearTimeout(timer)
        timer = setTimeout(() => showPreview(row, template), DOC_HOVER.hoverTime)
      })
      row.addEventListener('pointerleave', () => {
        clearTimeout(timer)
        if (document.activeElement !== row) {
          hidePreview()
        }
      })
      row.addEventListener('focus', () => showPreview(row, template))
      row.addEventListener('blur', hidePreview)
      return row
    }))
  }

  function select(type) {
    selected = type
    renderTypes()
    typeList.querySelector(`[data-type="${type}"]`)?.focus()
  }

  function showPreview(row, template) {
    preview.textContent = template.text
    preview.hidden = false
    const box = dialog.getBoundingClientRect()
    preview.style.left = `${Math.min(box.right + 16, window.innerWidth - preview.offsetWidth - 8)}px`
    preview.style.top = `${row.getBoundingClientRect().top}px`
  }

  function hidePreview() {
    clearTimeout(timer)
    preview.hidden = true
  }

  function pick(template) {
    close()
    onPick(template)
  }

  /** Round the four stops: close, search, the selected type, the first template (roving within each list). */
  function trap(event) {
    const stops = [closeButton, search, typeList.querySelector('[tabindex="0"]'), templateList.querySelector('[tabindex="0"]')].filter(Boolean)
    const i = stops.indexOf(document.activeElement)
    const next = event.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i + 1) % stops.length
    stops[next].focus()
  }

  function move(list, step) {
    const rows = [...list.children]
    const next = rows[(rows.indexOf(document.activeElement) + step + rows.length) % rows.length]
    if (list === typeList) {
      select(next.dataset.type)
      return
    }
    for (const row of rows) row.tabIndex = row === next ? 0 : -1
    next.focus()
  }

  function onKey(event) {
    const inList = typeList.contains(event.target) ? typeList : templateList.contains(event.target) ? templateList : null
    if (event.key === 'Escape') {
      close()
    } else if (event.key === 'Tab') {
      trap(event)
    } else if (inList && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      move(inList, event.key === 'ArrowDown' ? 1 : -1)
    } else if (inList === templateList && event.key === 'Enter') {
      event.target.click()
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function update(next) {
    const row = [...templateList.children].indexOf(document.activeElement)
    const onType = typeList.contains(document.activeElement)
    all = next
    renderTypes()
    if (row >= 0) {
      templateList.children[Math.min(row, templateList.children.length - 1)]?.focus()
    } else if (onType) {
      typeList.querySelector('[aria-selected="true"]')?.focus()
    }
  }

  function close() {
    if (!open) {
      return
    }
    open = false
    clearTimeout(timer)
    mask.remove()
    opener?.focus?.()
    onClose()
  }

  search.addEventListener('input', renderTypes)
  closeButton.addEventListener('click', close)
  mask.addEventListener('keydown', onKey)
  container.append(mask)
  renderTypes()
  search.focus()
  return { update, close }
}
```

`src/editor/add/index.js` — `openModal` and `destroy` become:

```js
  let modal = null

  /** Open at once on the built-ins; the files' templates join when the route answers (A5). */
  function openModal() {
    if (modal) {
      return
    }
    const opened = openAddModal({ container, arranged: arrange(builtIn, []), onPick: onAdd, onClose: () => { modal = null } })
    modal = opened
    fetchTemplates().then((files) => {
      if (modal === opened && files.length) {
        opened.update(arrange(builtIn, fromFiles(files)))
      }
    })
  }

  function destroy() {
    menu?.close()
    modal?.close()
  }
```

(with `arrange`, `fromFiles` from `./catalog.js`, `fetchTemplates` from `./route.js` and `openAddModal` from `./modal.js` imported.)

`css/editor.css`:

```css
/* A3: the Add diagram modal (boards screens / add-modal-*, library / add diagram). */
.plantuml-add {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.5);
}

.plantuml-add__dialog {
	display: flex;
	flex-direction: column;
	width: 880px;
	max-width: calc(100vw - 32px);
	height: 600px;
	max-height: calc(100vh - 32px);
	border-radius: var(--border-radius-large, 8px);
	background: var(--color-main-background);
	box-shadow: 0 2px 12px var(--color-box-shadow);
	color: var(--color-main-text);
}

.plantuml-add__header {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: space-between;
	height: 58px;
	box-sizing: border-box;
	padding: 12px 24px;
}

.plantuml-add__title {
	margin: 0;
	font-size: 18px;
	font-weight: 600;
}

.plantuml-add button.plantuml-add__close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: var(--default-clickable-area, 34px);
	height: var(--default-clickable-area, 34px);
	min-height: 0;
	margin: 0;
	padding: 0;
	border: none;
	border-radius: var(--border-radius-pill, 100px);
	background: transparent;
	color: var(--color-main-text);
	cursor: pointer;
}

.plantuml-add button.plantuml-add__close:hover {
	background: var(--color-background-hover);
}

.plantuml-add__close svg {
	width: 24px;
	height: 24px;
}

.plantuml-add__body {
	display: flex;
	flex: 1;
	min-height: 0;
}

.plantuml-add__left,
.plantuml-add__right {
	display: flex;
	flex-direction: column;
	min-height: 0;
	box-sizing: border-box;
	padding: 0 16px 16px;
	overflow-y: auto;
}

.plantuml-add__left {
	flex: none;
	width: 288px;
	gap: 8px;
}

.plantuml-add__right {
	flex: 1;
	gap: 4px;
}

.plantuml-add__divider {
	flex: none;
	width: 1px;
	background: var(--color-border);
}

.plantuml-add input.plantuml-add__search {
	flex: none;
	width: 100%;
	height: 44px;
	margin: 0;
	border: 1px solid var(--color-border-maxcontrast);
	border-radius: var(--border-radius-element, 8px);
	background: var(--color-main-background);
	font-size: 15px;
}

.plantuml-add__types,
.plantuml-add__templates {
	display: flex;
	flex-direction: column;
}

.plantuml-add__templates {
	gap: 4px;
}

.plantuml-add button.plantuml-add__type,
.plantuml-add button.plantuml-add__template {
	display: flex;
	flex: none;
	min-height: 0;
	margin: 0;
	border: none;
	border-radius: var(--border-radius-element, 8px);
	background: transparent;
	color: var(--color-main-text);
	font-weight: normal;
	text-align: start;
	cursor: pointer;
}

.plantuml-add button.plantuml-add__type {
	align-items: center;
	gap: 12px;
	height: 40px;
	padding: 0 12px;
	font-size: 14px;
}

.plantuml-add__type-name {
	flex: 1;
}

.plantuml-add__count {
	color: var(--color-text-maxcontrast);
	font-size: 13px;
}

.plantuml-add button.plantuml-add__type[aria-selected="true"] {
	background: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text);
	font-weight: 600;
}

.plantuml-add__type[aria-selected="true"] .plantuml-add__count {
	color: var(--color-primary-element-light-text);
	font-weight: normal;
}

.plantuml-add button.plantuml-add__template {
	align-items: flex-start;
	gap: 16px;
	height: 64px;
	padding: 12px;
}

.plantuml-add button.plantuml-add__type:hover:not([aria-selected="true"]),
.plantuml-add button.plantuml-add__template:hover {
	background: var(--color-background-hover);
}

.plantuml-add button:focus-visible,
.plantuml-add input:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: -2px;
}

.plantuml-add__tile {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border-radius: var(--border-radius-element, 8px);
	background: var(--color-background-dark);
}

.plantuml-add__text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.plantuml-add__template-title {
	font-size: 15px;
	font-weight: 600;
}

.plantuml-add__description {
	overflow: hidden;
	color: var(--color-text-maxcontrast);
	font-size: 13px;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.plantuml-add__preview {
	position: fixed;
	min-width: 220px;
	max-width: 360px;
	max-height: 60vh;
	box-sizing: border-box;
	margin: 0;
	padding: 12px;
	overflow: auto;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-element, 8px);
	background: var(--color-main-background);
	box-shadow: 0 2px 12px var(--color-box-shadow);
	color: var(--color-main-text);
	font-family: var(--font-face-monospace, monospace);
	font-size: 13px;
	white-space: pre;
}

.plantuml-add__preview[hidden] {
	display: none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npm run lint && npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`
Expected: all PASS, lint clean, guard OK.

- [ ] **Step 5: Commit**

```bash
git add src/editor/add css/editor.css tests/js/add-modal.test.js tests/js/editor.test.js
git commit -m "Add diagram: the modal, with a type's templates and their text"
```

---

### Task 12: Docs, deploy and the live check

**Files:**
- Modify: `CHANGELOG.md`, `features/AGENTS.md`, `README.md` (only if its feature list names editor features), `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`, `docs/superpowers/specs/2026-10-14-editor-design.md`

- [ ] **Step 1: Write the docs**

`CHANGELOG.md`, Unreleased → Added: `- Add diagram in the editor: a type's empty diagram from ▾, or any template from +, built in, from the admin's template folder or from your own Templates folder.` `features/AGENTS.md`, `diagrams/edit` notes (after Task 5's paragraph): one line each for `GET /templates` and where the built-ins live (`src/editor/data/templates.json`, drawn in CI by `scripts/template-examples.mjs`). `README.md`: at most one advertising line, no explanation.

- [ ] **Step 2: Mark the round shipped in the specs**

In `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`:
- the table of features, row 10: `(agreed, TP1–TP5, editor spec A1–A9)` → `(shipped, add-diagram round; TP1–TP5, editor spec A1–A9)`, and its last cell `to propose to Dr K, \`diagrams/edit.feature\`` → `` `diagrams/edit.feature` ``;
- the unit rows: `` `Controller/TemplatesController`, `Service/TemplateLibrary` (agreed) `` → `(shipped, add-diagram round)`, adding `Settings/TemplateSettings` to that row's name cell; the `Settings/InstanceSettings` row's `the Templates section (TP4, agreed)` → `the Templates section (TP4) is its own form, \`Settings/TemplateSettings\`, priority 20 so it sits under Test connection`;
- the route row `` `GET /apps/plantuml/templates` (agreed, TP3) `` → `(shipped, TP3)`;
- the heading `## Templates (agreed 2026-10-17, add-diagram round)` → `## Templates (agreed 2026-10-17, shipped in the add-diagram round)`, and TP1–TP5's status cell `agreed (add-diagram round)` → `shipped (add-diagram round)`.

In `docs/superpowers/specs/2026-10-14-editor-design.md`: A1–A9's status cell `agreed (add-diagram round)` → `shipped (add-diagram round)`.

Check: `grep -c "agreed (add-diagram round)" docs/superpowers/specs/*.md` → `0` for both files.

- [ ] **Step 3: Record the rulings in the specs**

App spec, a paragraph after the TP table, `**Rulings (add-diagram round, 2026-10-17).**`, one sentence each, as the plan's Rulings section words them: the second declarative form at priority 20; the status line worked out only for an admin, once per page, and reading never making the folder; N counting closed blocks of A6's types (`TemplateLibrary::TYPES`, kept equal to the editor's by a test); a file template's `path` being its path in its owner's files; a folder setting that climbs, runs through a file or cannot be made being refused with the reason logged; a download-forbidden file in the folder never being offered.

Editor spec, a paragraph after the A table, `**Rulings (add-diagram round, 2026-10-17).**`: the built-ins' names (`<title>-diagram`; Empty's and Example's the type's word); Example's description its first body line; an added block dropping its `(id=…)`; the file's final newline kept; an unnamed block's type word counting as a taken name; the menu not asking `GET /templates`; the modal built by hand at 880 × 600; the split button hidden while a linked file is open (Dr K); Empties not drawn in CI, the built-ins and the Examples drawn by `scripts/template-examples.mjs`.

- [ ] **Step 4: Run everything**

Run: `composer run test:unit && npx vitest run && npm run lint && npm run build && ! grep -Eq "(^|[;}])import *([^(\"']*from *)?[\"']\./chunks/" dist/plantuml-editor.js`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md features/AGENTS.md README.md docs/superpowers/specs
git commit -m "Docs: Add diagram"
```

- [ ] **Step 6: Deploy**

As the previous rounds did: `P=$(kubectl -n cloud get pod -l app.kubernetes.io/name=nextcloud -o name | head -1)`, the `tar -C . --exclude=node_modules --exclude=vendor --exclude=.git --exclude=.superpowers --exclude=.signing --exclude='*.map' --exclude=./docs -cf - . | kubectl -n cloud exec -i $P -c nextcloud -- tar -C /var/www/html/custom_apps/plantuml -xf -` pipe, then `chown -R www-data:www-data` on the app folder; compare the md5 sums of this build's `dist/plantuml-*.js dist/chunks/*.js` only. In the pod: `php -l` on the new PHP files and `occ plantuml:show-config`; never Behat, psalm or cs-fixer there.

- [ ] **Step 7: Live check**

In the shared `claudecode` selenium-flow browser (signed in with the `grafana` secret, which allows the Nextcloud site), against the boards:
- the split button in light and dark;
- ▾ → Gantt adds an empty Gantt one blank line down, its tab active;
- + → the modal on UML: holding the pointer on Class shows its text, and a click adds `class-diagram`;
- "mind" leaves MindMap;
- Escape closes the modal, not the editor;
- a `.puml` put in the admin's `Templates` is listed as shared the next time the modal opens, with no reload;
- the admin card's Templates section with its status line.

`end_browser` when done.
