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
use OCP\Files\NotPermittedException;
use OCP\Files\Storage\IStorage;
use OCP\Files\Template\ITemplateManager;
use OCP\IAppConfig;
use OCP\IGroup;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * An in-memory Nextcloud: `$files` and `$folders` keyed by full path
 * (`/admin/files/Templates/a.puml`), the admin `admin` and the caller `drk`.
 */
final class TemplateLibraryTest extends TestCase {
	use StoredFiles;

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
		$this->put('/admin/files/Templates/theirs.puml', "@startuml\nsecret\n@enduml", $this->shareStorage(false));
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
