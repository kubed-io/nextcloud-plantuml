<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\Expanded;
use OCA\PlantUml\Service\IncludeResolver;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\ForbiddenException;
use OCP\Files\InvalidPathException;
use OCP\Files\NotFoundException;
use OCP\Files\Storage\ISharedStorage;
use OCP\Files\Storage\IStorage;
use OCP\Files\StorageNotAvailableException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/register-shutdown-function.php';

final class IncludeResolverTest extends TestCase {
	use StoredFiles;

	private const USER_ROOT = '/drk/files';

	/** @var list<callable> what the resolver left to PHP's shutdown, see register-shutdown-function.php */
	public static array $atShutdown = [];

	/** @var list<string> every path the user's root was asked for */
	private array $asked = [];

	/**
	 * A user's files: root-relative path => content or a `File`, the diagram in `docs/`.
	 *
	 * @param array<string, string|File> $files
	 * @return array{0: Folder, 1: Folder} the diagram's folder and the user's root
	 */
	private function tree(array $files, string $base = 'docs'): array {
		$root = $this->createStub(Folder::class);
		$root->method('getPath')->willReturn(self::USER_ROOT);
		$root->method('get')->willReturnCallback(function (string $path) use ($files): File {
			$this->asked[] = $path;
			if (!array_key_exists($path, $files)) {
				throw new NotFoundException($path);
			}
			$file = $files[$path];
			return $file instanceof File ? $file : $this->file($path, $file);
		});
		$folder = $this->createStub(Folder::class);
		$folder->method('getPath')->willReturn(self::USER_ROOT . ($base === '' ? '' : '/' . $base));
		$folder->method('get')->willThrowException(new \LogicException('resolve from the root, not the diagram folder'));
		return [$folder, $root];
	}

	private function file(string $path, string $content, ?int $size = null, ?IStorage $storage = null): File {
		$file = $this->createStub(File::class);
		$file->method('getContent')->willReturn($content);
		$file->method('fopen')->willReturnCallback(static fn () => self::stream($content));
		$file->method('getSize')->willReturn($size ?? strlen($content));
		$file->method('getEtag')->willReturn('etag:' . $path);
		$file->method('getPath')->willReturn(self::USER_ROOT . '/' . $path);
		$file->method('getStorage')->willReturn($storage ?? $this->ownStorage());
		return $file;
	}

	/** The user's own storage, no share. */
	private function ownStorage(): IStorage {
		$storage = $this->createStub(IStorage::class);
		$storage->method('instanceOfStorage')->willReturn(false);
		return $storage;
	}

	/** A file on a share that forbids download, which fails the test if any of it is read. */
	private function viewOnly(string $share = 'S'): File {
		$file = $this->createMock(File::class);
		$file->method('getStorage')->willReturn($this->shareStorage(false, $share));
		$file->expects(self::never())->method('fopen');
		$file->expects(self::never())->method('getContent');
		$file->expects(self::never())->method('getSize');
		return $file;
	}

	/** @return resource */
	private static function stream(string $content) {
		$handle = fopen('php://memory', 'r+');
		self::assertIsResource($handle);
		fwrite($handle, $content);
		rewind($handle);
		return $handle;
	}

	/** @param array<string, string|File> $files */
	private function expand(string $source, array $files, string $base = 'docs', ?File $self = null): Expanded {
		[$folder, $root] = $this->tree($files, $base);
		return (new IncludeResolver())->expand($source, $folder, $root, $self);
	}

	/** A Folder double that fails the test if it is asked for any file. */
	private function untouchable(string $path): Folder {
		$folder = $this->createMock(Folder::class);
		$folder->method('getPath')->willReturn($path);
		$folder->expects(self::never())->method('get');
		return $folder;
	}

	/** @param array<string, string> $entries */
	private static function zip(array $entries, bool $stored = false): string {
		$path = tempnam(sys_get_temp_dir(), 'plantuml-test-');
		self::assertIsString($path);
		$zip = new \ZipArchive();
		self::assertTrue($zip->open($path, \ZipArchive::OVERWRITE));
		foreach ($entries as $name => $content) {
			$zip->addFromString($name, $content);
			if ($stored) {
				$zip->setCompressionName($name, \ZipArchive::CM_STORE);
			}
		}
		$zip->close();
		$bytes = file_get_contents($path);
		unlink($path);
		self::assertIsString($bytes);
		return $bytes;
	}

	/** @return iterable<string, array{string, string}> */
	public static function pathForms(): iterable {
		yield 'bare' => ['foo.puml', 'docs/foo.puml'];
		yield 'dot slash' => ['./foo.puml', 'docs/foo.puml'];
		yield 'quoted' => ['"foo.puml"', 'docs/foo.puml'];
		yield 'parent' => ['../shared/foo.puml', 'shared/foo.puml'];
		yield 'user root' => ['/x.puml', 'x.puml'];
	}

	#[DataProvider('pathForms')]
	public function testIncludeResolvesInTheUsersFiles(string $written, string $stored): void {
		$expanded = $this->expand("@startuml\n!include $written\n@enduml\n", [$stored => "Alice -> Bob\n"]);

		self::assertSame("@startuml\nAlice -> Bob\n@enduml\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
		self::assertSame([$stored], $this->asked);
	}

	public function testASourceWithoutIncludesIsSentAsItIs(): void {
		$source = "@startuml\r\nAlice -> Bob\r\n@enduml\r\n";
		$expanded = (new IncludeResolver())->expand($source, $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame($source, $expanded->source);
		self::assertSame([0, 1, 2, 3], $expanded->lineMap);
		self::assertSame([], $expanded->origins);
		self::assertSame([], $expanded->etags);
	}

	public function testAFileWithABlockGivesTheLinesInsideIt(): void {
		$expanded = $this->expand("!include foo.puml\n", ['docs/foo.puml' => "' header\n@startuml\nA -> B\n@enduml\n"]);

		self::assertSame("A -> B\n", $expanded->source);
	}

	public function testABlockIsPickedByIndexOrById(): void {
		$file = "@startuml\nfirst\n@enduml\n@startuml(id=MINE) Mine\nsecond\n@enduml\n@startuml(id=THIRD)\nthird\n@enduml\n";
		$expanded = $this->expand("!include_many f.puml!1\n!include_many f.puml!MINE\n!include_many f.puml!THIRD\n!include_many f.puml!0\n", ['docs/f.puml' => $file]);

		self::assertSame("second\nsecond\nthird\nfirst\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testAStartInsideAnUnclosedBlockEndsItAndStartsTheNext(): void {
		$file = "@startuml(id=A)\nfirst\n@startuml(id=B)\nsecond\n@enduml\n";
		$expanded = $this->expand("!include_many f.puml!1\n!include_many f.puml!B\n!include_many f.puml!0\n!include_many f.puml!A\n", ['docs/f.puml' => $file]);

		self::assertSame("second\nsecond\nfirst\nfirst\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testABareNameIsNotASelectorAndTheMistakeSaysHowToWriteOne(): void {
		$file = "@startuml foo\nfirst\n@enduml\n@startuml My Fun Diagram\nsecond\n@enduml\n";
		$expanded = $this->expand("!include parts.puml!foo\n!include parts.puml!My\n!include parts.puml!nothere\n", ['docs/parts.puml' => $file]);

		self::assertSame("!include parts.puml!foo\n!include parts.puml!My\n!include parts.puml!nothere\n", $expanded->source);
		self::assertSame([
			['line' => 0, 'message' => 'parts.puml has no block with id=foo: write @startuml(id=foo) to include it by name'],
			['line' => 1, 'message' => 'Cannot find parts.puml!My'],
			['line' => 2, 'message' => 'Cannot find parts.puml!nothere'],
		], $expanded->mistakes);
	}

	public function testAnIdBeatsTheNameOfAnEarlierBlock(): void {
		$file = "@startuml bar\nfirst\n@enduml\n@startuml(id=bar) Bar diagram\nsecond\n@enduml\n";
		$expanded = $this->expand("!include parts.puml!bar\n", ['docs/parts.puml' => $file]);

		self::assertSame("second\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testAMissingBlockIsAMistake(): void {
		$expanded = $this->expand("!include f.puml!7\n", ['docs/f.puml' => "@startuml\nfirst\n@enduml\n"]);

		self::assertSame("!include f.puml!7\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot find f.puml!7']], $expanded->mistakes);
	}

	public function testASecondPlainIncludeIsDropped(): void {
		$expanded = $this->expand("!include f.puml\nmiddle\n!include f.puml\n", ['docs/f.puml' => "A -> B\n"]);

		self::assertSame("A -> B\nmiddle\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testIncludeManyRepeats(): void {
		$expanded = $this->expand("!include_many f.puml\n!include_many f.puml\n", ['docs/f.puml' => "A -> B\n"]);

		self::assertSame("A -> B\nA -> B\n", $expanded->source);
	}

	public function testASecondIncludeOnceIsAMistake(): void {
		$expanded = $this->expand("!include_once f.puml\nmiddle\n!include_once f.puml\n", ['docs/f.puml' => "A -> B\n"]);

		self::assertSame("A -> B\nmiddle\n!include_once f.puml\n", $expanded->source);
		self::assertSame([['line' => 2, 'message' => 'f.puml is already included']], $expanded->mistakes);
	}

	public function testIncludesubCollectsEverySectionOfThatName(): void {
		$file = "@startuml\n!startsub BASIC\nA -> B\n!endsub\nskipped\n!startsub OTHER\nnot this\n!endsub\n!startsub BASIC\nB -> C\n!endsub\n@enduml\n";
		$expanded = $this->expand("!includesub f.puml!BASIC\n", ['docs/f.puml' => $file]);

		self::assertSame("A -> B\nB -> C\n", $expanded->source);
	}

	public function testIncludesubWithoutANameIsLeftForTheServer(): void {
		$source = "@startuml\n!startsub ACTORS\nactor A\n!endsub\n!includesub ACTORS\n@enduml\n";
		$expanded = (new IncludeResolver())->expand($source, $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame($source, $expanded->source);
		self::assertSame([], $expanded->mistakes);
		self::assertSame([], $expanded->etags);
		self::assertSame([], $expanded->missing);
	}

	// Dr K: PlantUML's own "cannot include ./parts.puml" does not say what is missing.
	public function testIncludesubOfAFileWithoutANameNamesItsSections(): void {
		$parts = "!startsub ACTORS\nactor A\n!endsub\n!startsub LEGEND\nlegend\n!endsub\n!startsub ACTORS\nactor B\n!endsub\n";
		$expanded = $this->expand("A -> B\n!includesub ./parts.puml\n", ['docs/parts.puml' => $parts]);

		self::assertSame("A -> B\n!includesub ./parts.puml\n", $expanded->source);
		self::assertSame([['line' => 1, 'message' => './parts.puml needs a section name: add !ACTORS or !LEGEND']], $expanded->mistakes);
		self::assertSame(['etag:docs/parts.puml'], $expanded->etags);
	}

	public function testIncludesubOfAFileWithoutSectionsSaysItHasNone(): void {
		$expanded = $this->expand("!includesub parts.puml\n", ['docs/parts.puml' => "actor A\n"]);

		self::assertSame([['line' => 0, 'message' => 'parts.puml needs a section name, but it has no !startsub']], $expanded->mistakes);
	}

	// A section of the same diagram may hold a dot; with no file of that name it is the server's.
	public function testIncludesubOfADottedSectionOfTheSameDiagramIsLeftForTheServer(): void {
		$source = "@startuml\n!startsub V1.2\nactor A\n!endsub\n!includesub V1.2\n@enduml\n";
		$expanded = $this->expand($source, []);

		self::assertSame($source, $expanded->source);
		self::assertSame([], $expanded->mistakes);
		self::assertSame(['V1.2'], $expanded->missing);
	}

	public function testIncludesubOfAFileInsideAnIncludeNamesItsSectionsThere(): void {
		$expanded = $this->expand("!include outer.puml\n", [
			'docs/outer.puml' => "A -> B\n!includesub \"parts.puml\"\n",
			'docs/parts.puml' => "!startsub ACTORS\n!startsub INNER\nactor A\n!endsub\n!endsub\n",
		]);

		self::assertSame([['line' => 0, 'message' => 'In outer.puml, line 2: parts.puml needs a section name: add !ACTORS or !INNER']], $expanded->mistakes);
	}

	public function testIncludesubOfAMissingFileWithoutANameCannotFindIt(): void {
		$expanded = $this->expand("!includesub ./nope.puml\n", []);

		self::assertSame([['line' => 0, 'message' => 'Cannot find ./nope.puml']], $expanded->mistakes);
		self::assertSame(['./nope.puml'], $expanded->missing);
	}

	public function testAStyleFileBecomesAStyleBlock(): void {
		$expanded = $this->expand("<style file=./a.css>\nA -> B\n<style file=\"b.css\">\n", [
			'docs/a.css' => "node {\n  FontColor red\n}\n",
			'docs/b.css' => "arrow { LineColor blue }\n",
		]);

		self::assertSame("<style>\nnode {\n  FontColor red\n}\n</style>\nA -> B\n<style>\narrow { LineColor blue }\n</style>\n", $expanded->source);
	}

	public function testANestedIncludeResolvesAgainstItsOwnFolder(): void {
		$expanded = $this->expand("!include sub/a.puml\n", [
			'docs/sub/a.puml' => "!include ../../shared/b.puml\nfrom a\n",
			'shared/b.puml' => "!include c.puml\n",
			'shared/c.puml' => "from c\n",
		]);

		self::assertSame("from c\nfrom a\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testStdlibAndUrlIncludesGoUnchanged(): void {
		$source = "!include <C4/C4_Container>\n!include https://example.com/x.puml\n!includeurl http://example.com/y.puml\n<style file=https://example.com/s.css>\n";
		$expanded = (new IncludeResolver())->expand($source, $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame($source, $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testAMissingFileKeepsItsLineAndIsAMistake(): void {
		$expanded = $this->expand("@startuml\n!include nope.puml\n@enduml\n", []);

		self::assertSame("@startuml\n!include nope.puml\n@enduml\n", $expanded->source);
		self::assertSame([['line' => 1, 'message' => 'Cannot find nope.puml']], $expanded->mistakes);
	}

	/** @return iterable<string, array{0: string, 1?: string}> */
	public static function climbOuts(): iterable {
		yield 'parents' => ['../../../../x.puml'];
		yield 'one too many' => ['../../x.puml'];
		yield 'above the root' => ['/../x.puml'];
		yield 'style' => ['<style file=../../x.css>'];
		yield 'backslash from the root' => ['..\\x.puml', ''];
		yield 'backslashes' => ['..\\..\\x.puml'];
		yield 'NUL byte' => ["foo\0.puml"];
		yield 'control character' => ["foo\x01.puml"];
		yield 'longer than 1024 bytes' => [str_repeat('a/', 600) . 'x.puml'];
	}

	#[DataProvider('climbOuts')]
	public function testAPathAboveTheUsersRootIsNeverAskedFor(string $written, string $base = '/docs'): void {
		$line = str_starts_with($written, '<') ? $written : "!include $written";
		$expanded = (new IncludeResolver())->expand("$line\n", $this->untouchable(self::USER_ROOT . $base), $this->untouchable(self::USER_ROOT));

		self::assertSame("$line\n", $expanded->source);
		self::assertCount(1, $expanded->mistakes);
		self::assertStringStartsWith('Cannot find ', $expanded->mistakes[0]['message']);
	}

	public function testACycleStopsWithAMistake(): void {
		$expanded = $this->expand("@startuml\n!include a.puml\n@enduml\n", [
			'docs/a.puml' => "from a\n!include_many b.puml\n",
			'docs/b.puml' => "from b\n!include_many a.puml\n",
		]);

		self::assertSame("@startuml\nfrom a\nfrom b\n!include_many a.puml\n@enduml\n", $expanded->source);
		self::assertSame([['line' => 1, 'message' => 'In b.puml, line 2: a.puml is included in a cycle']], $expanded->mistakes);
	}

	public function testASelfIncludeStopsWithAMistake(): void {
		$expanded = $this->expand("!include self.puml\n", ['docs/self.puml' => "!include self.puml\n"]);

		self::assertSame("!include self.puml\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'In self.puml, line 1: self.puml includes itself']], $expanded->mistakes);
	}

	public function testANinthLevelIsAMistake(): void {
		$files = [];
		for ($n = 1; $n <= 9; $n++) {
			$files["docs/f$n.puml"] = $n < 9 ? 'level ' . $n . "\n!include f" . ($n + 1) . ".puml\n" : "level 9\n";
		}
		$expanded = $this->expand("!include f1.puml\n", $files);

		self::assertStringContainsString("level 8\n!include f9.puml\n", $expanded->source);
		self::assertStringNotContainsString('level 9', $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'In f8.puml, line 2: f9.puml is more than 8 levels deep']], $expanded->mistakes);
	}

	public function testThe65thFileIsAMistake(): void {
		$files = [];
		$source = '';
		for ($n = 1; $n <= 65; $n++) {
			$files["docs/f$n.puml"] = "file $n\n";
			$source .= "!include f$n.puml\n";
		}
		$expanded = $this->expand($source, $files);

		self::assertStringContainsString("file 64\n!include f65.puml\n", $expanded->source);
		self::assertSame([['line' => 64, 'message' => 'f65.puml is past the limit of 64 files']], $expanded->mistakes);
	}

	public function testMoreThanOneMegabyteIsAMistake(): void {
		$half = str_repeat("' padding\n", 60000);
		$expanded = $this->expand("!include a.puml\n!include b.puml\n", ['docs/a.puml' => $half, 'docs/b.puml' => $half]);

		self::assertStringEndsWith("!include b.puml\n", $expanded->source);
		self::assertSame([['line' => 1, 'message' => 'b.puml is past the limit of 1 MB in all']], $expanded->mistakes);
	}

	public function testAnImportedZipIsSearchedBeforeTheFolder(): void {
		$expanded = $this->expand("@startuml\n!import lib.zip\n!include inner.puml\n!include other.puml\n@enduml\n", [
			'docs/lib.zip' => self::zip(['inner.puml' => "!include part/deep.puml\n", 'part/deep.puml' => "!include sibling.puml\n", 'part/sibling.puml' => "from the zip\n"]),
			'docs/inner.puml' => "from the folder\n",
			'docs/other.puml' => "other from the folder\n",
		]);

		self::assertSame("@startuml\nfrom the zip\nother from the folder\n@enduml\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
		self::assertSame(['etag:docs/lib.zip', 'etag:docs/other.puml'], $expanded->etags);
		self::assertSame([0, 2, 3, 4, 5], $expanded->lineMap);
		self::assertSame(['line' => 2, 'message' => 'In lib.zip/part/sibling.puml, line 1: boom'], $expanded->mapError(1, 'boom'));
	}

	public function testAnImportFromTheUsersRoot(): void {
		$expanded = $this->expand("!import /libs/lib.zip\n!include inner.puml\n", ['libs/lib.zip' => self::zip(['inner.puml' => "zipped\n"])]);

		self::assertSame("zipped\n", $expanded->source);
	}

	public function testAnUnreadableZipIsAMistake(): void {
		$expanded = $this->expand("!import lib.zip\n!include inner.puml\n", ['docs/lib.zip' => 'not a zip at all', 'docs/inner.puml' => "folder\n"]);

		self::assertSame("!import lib.zip\nfolder\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot read lib.zip']], $expanded->mistakes);
	}

	public function testAZipBombStopsAtTheLimit(): void {
		$big = str_repeat("' padding\n", 60000);
		$expanded = $this->expand("!import lib.zip\n!include a.puml\n!include b.puml\n", ['docs/lib.zip' => self::zip(['a.puml' => $big, 'b.puml' => $big])]);

		self::assertLessThan(1048576, strlen($expanded->source));
		self::assertStringEndsWith("!include b.puml\n", $expanded->source);
		self::assertSame([['line' => 2, 'message' => 'b.puml is past the limit of 1 MB in all']], $expanded->mistakes);
	}

	public function testAnErrorAfterAnIncludeMapsToItsSourceLine(): void {
		$ten = implode("\n", array_map(static fn (int $n): string => "line $n", range(1, 10))) . "\n";
		$expanded = $this->expand("@startuml\n!include ten.puml\nBob ->\n@enduml\n", ['docs/ten.puml' => $ten]);

		self::assertSame(['line' => 2, 'message' => 'Syntax Error?'], $expanded->mapError(11, 'Syntax Error?'));
		self::assertSame(['line' => 0, 'message' => 'Syntax Error?'], $expanded->mapError(0, 'Syntax Error?'));
	}

	public function testAnErrorInsideAnIncludeLandsOnTheIncludeLine(): void {
		$expanded = $this->expand("@startuml\n!include foo.puml\n@enduml\n", ['docs/foo.puml' => "@startuml\nA -> B\nC -> D\nbroken\n@enduml\n"]);

		self::assertSame(['line' => 1, 'origins' => ['line' => 3, 'path' => 'foo.puml', 'inner' => 3]], ['line' => $expanded->lineMap[3], 'origins' => $expanded->origins[2]]);
		self::assertSame(['line' => 1, 'message' => 'In foo.puml, line 4: Syntax Error?'], $expanded->mapError(3, 'Syntax Error?'));
	}

	public function testAnIncludeOutsideTheDiagramFolderIsNamedRelativeToIt(): void {
		$expanded = $this->expand("!include /shared/foo.puml\n", ['shared/foo.puml' => "a\nb\nbroken\n"]);

		self::assertSame(['line' => 0, 'message' => 'In ../shared/foo.puml, line 3: Syntax Error?'], $expanded->mapError(2, 'Syntax Error?'));
	}

	public function testAStyleLineMapsToTheFileAndItsTagsToTheStyleLine(): void {
		$expanded = $this->expand("<style file=a.css>\n", ['docs/a.css' => "node {\n  broken\n}\n"]);

		self::assertSame(['line' => 0, 'message' => 'In a.css, line 2: bad'], $expanded->mapError(2, 'bad'));
		self::assertSame(['line' => 0, 'message' => 'In a.css: bad'], $expanded->mapError(0, 'bad'));
	}

	public function testEtagsListEveryIncludedFileInIncludeOrder(): void {
		$expanded = $this->expand("!include b.puml\n!include a.puml\n!include_many b.puml\n<style file=s.css>\n", [
			'docs/a.puml' => "a\n",
			'docs/b.puml' => "b\n",
			'docs/s.css' => "s\n",
		]);

		self::assertSame(['etag:docs/b.puml', 'etag:docs/a.puml', 'etag:docs/s.css'], $expanded->etags);
	}

	/** @return iterable<string, array{string}> */
	public static function expressions(): iterable {
		yield 'include' => ['!include $p'];
		yield 'include_many' => ['!include_many %dirpath()%/x.puml'];
		yield 'include_once' => ['!include_once "$dir/x.puml"'];
		yield 'includesub' => ['!includesub $f!BASIC'];
		yield 'import' => ['!import $lib'];
		yield 'style' => ['<style file=$s>'];
	}

	#[DataProvider('expressions')]
	public function testAnExpressionPathIsLeftToTheServer(string $line): void {
		$expanded = (new IncludeResolver())->expand("$line\n", $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame("$line\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testAnImportInAnIncludedFileResolvesAgainstItsFolder(): void {
		$expanded = $this->expand("!include ../shared/x.puml\n", [
			'shared/x.puml' => "!import lib.zip\n!include inner.puml\n",
			'shared/lib.zip' => self::zip(['inner.puml' => "zipped\n"]),
		]);

		self::assertSame("zipped\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
		self::assertSame(['shared/x.puml', 'shared/lib.zip'], $this->asked);
	}

	public function testALongPathIsShownCutShort(): void {
		$written = str_repeat('a/', 600) . 'x.puml';
		$expanded = (new IncludeResolver())->expand("!include $written\n", $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame([['line' => 0, 'message' => 'Cannot find ' . substr($written, 0, 100) . '…']], $expanded->mistakes);
	}

	public function testAPathNextcloudRefusesIsNotFound(): void {
		$root = $this->createStub(Folder::class);
		$root->method('getPath')->willReturn(self::USER_ROOT);
		$root->method('get')->willThrowException(new InvalidPathException('path too long'));
		$expanded = (new IncludeResolver())->expand("!include x.puml\n", $this->untouchable(self::USER_ROOT . '/docs'), $root);

		self::assertSame([['line' => 0, 'message' => 'Cannot find x.puml']], $expanded->mistakes);
	}

	public function testABackslashIsAFolderSeparator(): void {
		$expanded = $this->expand("!include sub\\a.puml\n", [
			'docs/sub/a.puml' => "!include b.puml\n",
			'docs/sub/b.puml' => "from b\n",
		]);

		self::assertSame("from b\n", $expanded->source);
		self::assertSame(['docs/sub/a.puml', 'docs/sub/b.puml'], $this->asked);
	}

	public function testAZipOver8MegabytesIsAMistake(): void {
		$expanded = $this->expand("!import lib.zip\n", ['docs/lib.zip' => $this->file('docs/lib.zip', self::zip(['a.puml' => "a\n"]), 9 * 1048576)]);

		self::assertSame("!import lib.zip\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'lib.zip is past the limit of 8 MB for a library']], $expanded->mistakes);
	}

	public function testLibrariesOver16MegabytesInAllAreAMistake(): void {
		$big = self::zip(['big.bin' => str_repeat('a', 6 * 1048576)], true);
		self::assertGreaterThan(6 * 1048576, strlen($big));
		$expanded = $this->expand("!import a.zip\n!import b.zip\n!import c.zip\n", ['docs/a.zip' => $big, 'docs/b.zip' => $big, 'docs/c.zip' => $big]);

		self::assertSame("!import c.zip\n", $expanded->source);
		self::assertSame([['line' => 2, 'message' => 'c.zip is past the limit of 16 MB of libraries in all']], $expanded->mistakes);
	}

	public function testAFileLargerThanItsStoredSizeIsNotReadWhole(): void {
		$content = str_repeat("' padding\n", 420000);
		$file = $this->createMock(File::class);
		$file->method('getSize')->willReturn(10);
		$file->method('fopen')->willReturnCallback(static fn () => CountingStream::open($content));
		$file->method('getStorage')->willReturn($this->ownStorage());
		$file->expects(self::never())->method('getContent');
		$expanded = $this->expand("!include a.puml\n", ['docs/a.puml' => $file]);

		self::assertSame("!include a.puml\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'a.puml is past the limit of 1 MB in all']], $expanded->mistakes);
		// Review Focus 1: one byte past the megabyte, not the 4 MB the stream holds.
		self::assertLessThanOrEqual(1048576 + 1 + CountingStream::CHUNK, CountingStream::$served);
	}

	public function testABangInsideQuotesIsPartOfTheName(): void {
		$expanded = $this->expand("!include \"a!b.puml\"\n!include \"f.puml\"!1\n", [
			'docs/a!b.puml' => "from a!b\n",
			'docs/f.puml' => "@startuml\nfirst\n@enduml\n@startuml\nsecond\n@enduml\n",
		]);

		self::assertSame("from a!b\nsecond\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	/** A file found but not taken still counts, so its ETag is there for the GET's. */
	public function testEtagsCoverAFileFoundButNotTaken(): void {
		$expanded = $this->expand("!includesub parts.puml!ACTORS\n!include big.puml\n", [
			'docs/parts.puml' => "!startsub OTHER\nA\n!endsub\n",
			'docs/big.puml' => $this->file('docs/big.puml', "x\n", 2 * 1048576),
		]);

		self::assertSame(['etag:docs/parts.puml', 'etag:docs/big.puml'], $expanded->etags);
		self::assertSame([], $expanded->missing);
	}

	public function testEtagsCoverAFileTooDeepToRead(): void {
		$files = [];
		for ($n = 1; $n <= 9; $n++) {
			$files["docs/f$n.puml"] = '!include f' . ($n + 1) . ".puml\n";
		}
		$expanded = $this->expand("!include f1.puml\n", $files);

		self::assertContains('etag:docs/f9.puml', $expanded->etags);
	}

	public function testMissingListsThePathsNotFoundAsWritten(): void {
		$expanded = $this->expand("!include nope.puml\n!includesub parts.puml!ACTORS\n<style file=../gone.css>\n!import lib.zip\n", [
			'docs/parts.puml' => "A\n",
		]);

		self::assertSame(['nope.puml', '../gone.css', 'lib.zip'], $expanded->missing);
	}

	/** @return iterable<string, array{class-string<\Exception>}> */
	public static function storageRefusals(): iterable {
		yield 'storage not available' => [StorageNotAvailableException::class];
		yield 'forbidden' => [ForbiddenException::class];
	}

	/**
	 * Without its constructor, which asks the server for a translation.
	 *
	 * @param class-string<\Exception> $class
	 */
	private static function refusal(string $class): \Exception {
		return (new \ReflectionClass($class))->newInstanceWithoutConstructor();
	}

	#[DataProvider('storageRefusals')]
	/** @param class-string<\Exception> $class */
	public function testAStorageThatRefusesTheLookupIsUnreadable(string $class): void {
		$refusal = self::refusal($class);
		$root = $this->createStub(Folder::class);
		$root->method('getPath')->willReturn(self::USER_ROOT);
		$root->method('get')->willThrowException($refusal);
		$expanded = (new IncludeResolver())->expand("!include x.puml\n<style file=s.css>\n!import l.zip\n", $this->untouchable(self::USER_ROOT . '/docs'), $root);

		self::assertSame([
			['line' => 0, 'message' => 'Cannot read x.puml'],
			['line' => 1, 'message' => 'Cannot read s.css'],
			['line' => 2, 'message' => 'Cannot read l.zip'],
		], $expanded->mistakes);
		self::assertSame(['x.puml', 's.css', 'l.zip'], $expanded->missing);
	}

	#[DataProvider('storageRefusals')]
	/** @param class-string<\Exception> $class */
	public function testAStorageThatRefusesTheReadIsUnreadable(string $class): void {
		$refusal = self::refusal($class);
		$file = $this->createStub(File::class);
		$file->method('getSize')->willReturn(10);
		$file->method('getEtag')->willThrowException($refusal);
		$file->method('fopen')->willThrowException($refusal);
		$file->method('getStorage')->willReturn($this->ownStorage());
		$expanded = $this->expand("!include a.puml\n", ['docs/a.puml' => $file]);

		self::assertSame("!include a.puml\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot read a.puml']], $expanded->mistakes);
	}

	/** No unbounded read: a file that will not open as a stream is not read whole instead. */
	public function testAFileThatWillNotOpenIsUnreadable(): void {
		$file = $this->createMock(File::class);
		$file->method('getSize')->willReturn(10);
		$file->method('fopen')->willReturn(false);
		$file->method('getStorage')->willReturn($this->ownStorage());
		$file->expects(self::never())->method('getContent');
		$expanded = $this->expand("!include a.puml\n", ['docs/a.puml' => $file]);

		self::assertSame([['line' => 0, 'message' => 'Cannot read a.puml']], $expanded->mistakes);
	}

	/** @return iterable<string, array{string}> */
	public static function expressionSelectors(): iterable {
		yield 'includesub' => ['!includesub f.puml!$name'];
		yield 'include' => ['!include f.puml!$n'];
		yield 'quoted' => ['!include "f.puml"!%n()'];
	}

	#[DataProvider('expressionSelectors')]
	public function testAnExpressionSelectorIsLeftToTheServer(string $line): void {
		$expanded = (new IncludeResolver())->expand("$line\n", $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame("$line\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testTextAfterAClosingQuoteIsAMistake(): void {
		$expanded = (new IncludeResolver())->expand("!include \"a.puml\" junk\n", $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame("!include \"a.puml\" junk\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot find a.puml junk']], $expanded->mistakes);
	}

	public function testTheDiagramsOwnFileIsNeverIncludedInItself(): void {
		$files = ['docs/x.puml' => "@startuml\n!include x.puml\n@enduml\n"];
		[$folder, $root] = $this->tree($files);
		$self = $this->file('docs/x.puml', $files['docs/x.puml']);
		$expanded = (new IncludeResolver())->expand($files['docs/x.puml'], $folder, $root, $self);

		self::assertSame($files['docs/x.puml'], $expanded->source);
		self::assertSame([['line' => 1, 'message' => 'x.puml includes itself']], $expanded->mistakes);
	}

	public function testALeadingByteOrderMarkIsDropped(): void {
		$expanded = $this->expand("!include a.puml\n<style file=s.css>\n", [
			'docs/a.puml' => "\u{FEFF}@startuml\nAlice -> Bob\n@enduml\n",
			'docs/s.css' => "\u{FEFF}node { }\n",
		]);

		self::assertSame("Alice -> Bob\n<style>\nnode { }\n</style>\n", $expanded->source);
	}

	public function testLookupsStopAt256(): void {
		$source = '';
		for ($n = 1; $n <= 300; $n++) {
			$source .= "!include missing$n.puml\n";
		}
		$expanded = $this->expand($source, []);

		self::assertCount(256, $this->asked);
		self::assertSame($source, $expanded->source);
		self::assertCount(300, $expanded->mistakes);
		self::assertSame(['line' => 255, 'message' => 'Cannot find missing256.puml'], $expanded->mistakes[255]);
		self::assertSame(['line' => 256, 'message' => 'missing257.puml is past the limit of 256 lookups'], $expanded->mistakes[256]);
		self::assertSame(['line' => 299, 'message' => 'missing300.puml is past the limit of 256 lookups'], $expanded->mistakes[299]);
	}

	public function testNothingIsLookedUpOnce64FilesAreRead(): void {
		$files = ['docs/more.puml' => "more\n", 'docs/s.css' => "s\n", 'docs/l.zip' => self::zip(['a.puml' => "a\n"]), 'docs/parts.puml' => "!startsub A\n!endsub\n"];
		$source = '';
		for ($n = 1; $n <= 64; $n++) {
			$files["docs/f$n.puml"] = "file $n\n";
			$source .= "!include f$n.puml\n";
		}
		$expanded = $this->expand($source . "!include more.puml\n<style file=s.css>\n!import l.zip\n!includesub parts.puml\n", $files);

		self::assertCount(64, $this->asked);
		self::assertSame([
			['line' => 64, 'message' => 'more.puml is past the limit of 64 files'],
			['line' => 65, 'message' => 's.css is past the limit of 64 files'],
			['line' => 66, 'message' => 'l.zip is past the limit of 64 files'],
		], $expanded->mistakes);
	}

	/** @return iterable<string, array{string, string}> */
	public static function viewOnlyLines(): iterable {
		yield 'include' => ['!include /Shared/notes.txt', '/Shared/notes.txt'];
		yield 'include_many' => ['!include_many ../Shared/notes.txt', '../Shared/notes.txt'];
		yield 'includesub' => ['!includesub /Shared/notes.txt!A', '/Shared/notes.txt'];
		yield 'style' => ['<style file=/Shared/notes.txt>', '/Shared/notes.txt'];
		yield 'import' => ['!import /Shared/notes.txt', '/Shared/notes.txt'];
	}

	/** Its size would say something about it too, so not even that is asked. */
	#[DataProvider('viewOnlyLines')]
	public function testAFileSharedViewOnlyIsNeverRead(string $line, string $written): void {
		$expanded = $this->expand("$line\n", ['Shared/notes.txt' => $this->viewOnly()]);

		self::assertSame("$line\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => "Cannot read $written"]], $expanded->mistakes);
	}

	public function testAZipSharedViewOnlyIsNeverOpened(): void {
		$expanded = $this->expand("!import lib.zip\n!include inner.puml\n", ['docs/lib.zip' => $this->viewOnly()]);

		self::assertSame("!import lib.zip\n!include inner.puml\n", $expanded->source);
		self::assertSame([
			['line' => 0, 'message' => 'Cannot read lib.zip'],
			['line' => 1, 'message' => 'Cannot find inner.puml'],
		], $expanded->mistakes);
	}

	/** @return iterable<string, array{bool|null}> */
	public static function downloadAllowed(): iterable {
		yield 'download allowed' => [true];
		yield 'no download attribute' => [null];
	}

	#[DataProvider('downloadAllowed')]
	public function testAFileSharedForDownloadIsRead(?bool $download): void {
		$expanded = $this->expand("!include /Shared/notes.puml\n", ['Shared/notes.puml' => $this->file('Shared/notes.puml', "shared\n", null, $this->shareStorage($download))]);

		self::assertSame("shared\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testAFileInTheUsersOwnStorageIsRead(): void {
		$storage = $this->createMock(IStorage::class);
		$storage->expects(self::once())->method('instanceOfStorage')->with('OCA\Files_Sharing\SharedStorage')->willReturn(false);
		$expanded = $this->expand("!include a.puml\n", ['docs/a.puml' => $this->file('docs/a.puml', "mine\n", null, $storage)]);

		self::assertSame("mine\n", $expanded->source);
	}

	/** A federated share's storage has no share to ask; files_sharing's ViewOnly does not ask it either. */
	public function testAShareFromAnotherServerIsRead(): void {
		$storage = $this->createMock(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturn(false);
		$storage->expects(self::never())->method('getShare');
		$expanded = $this->expand("!include /Remote/a.puml\n", ['Remote/a.puml' => $this->file('Remote/a.puml', "remote\n", null, $storage)]);

		self::assertSame("remote\n", $expanded->source);
	}

	/** @return iterable<string, array{string}> */
	public static function otherLeadingWhitespace(): iterable {
		yield 'vertical tab' => ["\v!include a.puml"];
		yield 'form feed' => ["\f!include a.puml"];
		yield 'carriage return' => ["\r!include a.puml"];
		yield 'style after a form feed' => ["\f<style file=a.css>"];
	}

	/** As the render route's own check reads a line, so the two agree on every line. */
	#[DataProvider('otherLeadingWhitespace')]
	public function testOnlySpacesAndTabsLeadALineThatNamesAFile(string $line): void {
		$expanded = (new IncludeResolver())->expand("$line\n", $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertSame("$line\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	public function testSpacesAndTabsMayLeadALineThatNamesAFile(): void {
		$expanded = $this->expand(" \t!include a.puml\n\t <style file=s.css>\n", ['docs/a.puml' => "a\n", 'docs/s.css' => "s\n"]);

		self::assertSame("a\n<style>\ns\n</style>\n", $expanded->source);
	}

	/** In a process of its own, so no pattern is already compiled with the JIT. */
	#[RunInSeparateProcess]
	public function testAMegabyteOfNewlinesIsQuickWithoutTheJit(): void {
		ini_set('pcre.jit', '0');
		self::assertSame('0', ini_get('pcre.jit'));
		$source = str_repeat("\n", 1048576);
		$start = hrtime(true);
		$expanded = (new IncludeResolver())->expand($source, $this->untouchable(self::USER_ROOT . '/docs'), $this->untouchable(self::USER_ROOT));

		self::assertLessThan(1.0, (hrtime(true) - $start) / 1e9);
		self::assertSame($source, $expanded->source);
	}

	/** @return iterable<string, array{string, string, list<array{line: int, message: string}>}> */
	public static function longWhitespace(): iterable {
		yield 'a megabyte of trailing spaces' => ['!include a.puml' . str_repeat(' ', 1048576), "a\n", []];
		yield 'trailing whitespace of every kind' => ["!include a.puml \t\f\v\r", "a\n", []];
		$inner = 'a' . str_repeat(' ', 50000) . 'b';
		yield 'a long run inside the path' => ["!include $inner", "!include $inner\n", [['line' => 0, 'message' => 'Cannot find a' . str_repeat(' ', 99) . '…']]];
	}

	/** In a process of its own, so no pattern is already compiled with the JIT. */
	#[DataProvider('longWhitespace')]
	#[RunInSeparateProcess]
	public function testALongWhitespaceRunIsQuickWithoutTheJit(string $line, string $sent, array $mistakes): void {
		ini_set('pcre.jit', '0');
		$start = hrtime(true);
		$expanded = $this->expand("$line\n", ['docs/a.puml' => "a\n"]);

		self::assertLessThan(1.0, (hrtime(true) - $start) / 1e9);
		self::assertSame($sent, $expanded->source);
		self::assertSame($mistakes, $expanded->mistakes);
	}

	/** Core throws more than Exceptions; whatever a share throws, its file is unreadable. */
	public function testAShareThatThrowsAnErrorIsRefused(): void {
		$storage = $this->createStub(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturn(true);
		$storage->method('getShare')->willThrowException(new \Error('no share'));
		$expanded = $this->expand("!include /S/notes.txt\n", ['S/notes.txt' => $this->file('S/notes.txt', "secret\n", null, $storage)]);

		self::assertSame("!include /S/notes.txt\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot read /S/notes.txt']], $expanded->mistakes);
	}

	/** The zip copies on disk now, from a list taken before. */
	private static function copiesSince(array $before): array {
		return array_values(array_diff(glob(sys_get_temp_dir() . '/plantuml-*') ?: [], $before));
	}

	private static function shutdown(): void {
		foreach (self::$atShutdown as $cleanup) {
			$cleanup();
		}
	}

	/** `finally` does not run on a fatal error, so the copy is left to shutdown as well. */
	public function testAZipCopyIsRemovedAtShutdownToo(): void {
		$before = glob(sys_get_temp_dir() . '/plantuml-*') ?: [];
		$copies = [];
		$left = [];
		$last = $this->createStub(File::class);
		$last->method('getSize')->willReturn(2);
		$last->method('getStorage')->willReturn($this->ownStorage());
		// Mid-expansion, where a fatal error would stop it.
		$last->method('fopen')->willReturnCallback(static function () use ($before, &$copies, &$left) {
			$copies = self::copiesSince($before);
			self::shutdown();
			$left = array_values(array_filter($copies, 'file_exists'));
			return self::stream("x\n");
		});
		$expanded = $this->expand("!import lib.zip\n!include last.puml\n", ['docs/lib.zip' => self::zip(['a.puml' => "a\n"]), 'docs/last.puml' => $last]);

		self::assertSame("x\n", $expanded->source);
		self::assertCount(1, $copies);
		self::assertSame([], $left);
	}

	/** One hook for every copy, and a path another process has since been given is not its to remove. */
	public function testShutdownLeavesAFinishedCopysPathAlone(): void {
		$before = glob(sys_get_temp_dir() . '/plantuml-*') ?: [];
		$copies = [];
		$last = $this->createStub(File::class);
		$last->method('getSize')->willReturn(2);
		$last->method('getStorage')->willReturn($this->ownStorage());
		$last->method('fopen')->willReturnCallback(static function () use ($before, &$copies) {
			$copies = self::copiesSince($before);
			return self::stream("x\n");
		});
		$this->expand("!import a.zip\n!import b.zip\n!include last.puml\n", ['docs/a.zip' => self::zip(['a.puml' => "a\n"]), 'docs/b.zip' => self::zip(['b.puml' => "b\n"]), 'docs/last.puml' => $last]);
		self::assertCount(2, $copies);
		foreach ($copies as $path) {
			self::assertFileDoesNotExist($path);
			touch($path);
		}
		self::shutdown();
		$kept = array_values(array_filter($copies, 'file_exists'));
		array_map('unlink', $kept);

		self::assertSame($copies, $kept);
		self::assertCount(1, self::$atShutdown);
	}

	/** @return iterable<string, array{string, int}> */
	public static function repeats(): iterable {
		yield 'include, dropped' => ['include', 0];
		yield 'include_many, each one more file' => ['include_many', 257 - 64];
	}

	/** A file already found is not looked up again, however often it is named. */
	#[DataProvider('repeats')]
	public function testRepeatsOfOneFileAreLookedUpOnce(string $kind, int $pastTheFileLimit): void {
		$expanded = $this->expand(str_repeat("!$kind ./c.puml\n!$kind c.puml\n", 128) . "!$kind c.puml\n", ['docs/c.puml' => "c\n"]);

		self::assertSame(['docs/c.puml'], $this->asked);
		self::assertCount($pastTheFileLimit, $expanded->mistakes);
		foreach ($expanded->mistakes as $mistake) {
			self::assertStringEndsWith('c.puml is past the limit of 64 files', $mistake['message']);
		}
	}

	public function testAFileIncludedAgainAt64FilesIsFree(): void {
		$files = ['docs/common.puml' => "common\n", 'docs/lib.zip' => self::zip(['z.puml' => "z\n"])];
		$source = "!import lib.zip\n!include common.puml\n";
		for ($n = 1; $n <= 62; $n++) {
			$files["docs/f$n.puml"] = "file $n\n";
			$source .= "!include f$n.puml\n";
		}
		$expanded = $this->expand($source . "!include common.puml\n!import lib.zip\n", $files);

		self::assertSame([], $expanded->mistakes);
		self::assertCount(64, $this->asked);
		self::assertCount(64, array_unique($this->asked));
	}

	public function testIncludesubWithoutANameLooksTheFileUpOnce(): void {
		$this->expand("!includesub parts.puml\n", ['docs/parts.puml' => "!startsub A\n!endsub\n"]);

		self::assertSame(['docs/parts.puml'], $this->asked);
	}

	public function testPastALimitADottedSectionIsLeftToTheServer(): void {
		$source = '';
		for ($n = 1; $n <= 256; $n++) {
			$source .= "!include missing$n.puml\n";
		}
		$expanded = $this->expand($source . "!includesub V1.2\n", []);

		self::assertCount(256, $this->asked);
		self::assertCount(256, $expanded->mistakes);
		self::assertStringEndsWith("!includesub V1.2\n", $expanded->source);
	}

	/**
	 * A diagram on share `S` with `$permissions` and what `!include b.puml`
	 * beside it gives, the sibling on `$sibling` (share S, read-only, by default);
	 * `$ownersText` as the route says whether the source is the diagram's own.
	 */
	private function drawnInShare(int $permissions, ?ISharedStorage $sibling = null, bool $ownersText = true): Expanded {
		$files = ['Shared/b.puml' => $this->file('Shared/b.puml', "beside\n", null, $sibling ?? $this->shareStorage(false))];
		[$folder, $root] = $this->tree($files, 'Shared');
		$self = $this->file('Shared/a.puml', "!include b.puml\n", null, $this->shareStorage(false, 'S', $permissions));
		return (new IncludeResolver())->expand("!include b.puml\n", $folder, $root, $self, $ownersText);
	}

	/** Viewing a shared diagram is unchanged, and so are the files beside it in that share. */
	public function testADiagramInAReadOnlyViewOnlyShareReadsItsOwnShare(): void {
		$expanded = $this->drawnInShare(Constants::PERMISSION_READ);

		self::assertSame("beside\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}

	/** @return iterable<string, array{int}> */
	public static function writableShares(): iterable {
		yield 'create' => [Constants::PERMISSION_READ | Constants::PERMISSION_CREATE];
		yield 'update' => [Constants::PERMISSION_READ | Constants::PERMISSION_UPDATE];
	}

	/** Else a diagram of one's own, saved into the share, reads everything beside it. */
	#[DataProvider('writableShares')]
	public function testADiagramInAViewOnlyShareItMayWriteToCannotReadIt(int $permissions): void {
		$expanded = $this->drawnInShare($permissions, $this->shareStorage(false, 'S', $permissions));

		self::assertSame([['line' => 0, 'message' => 'Cannot read b.puml']], $expanded->mistakes);
	}

	/** @return iterable<string, array{string}> */
	public static function brokenIds(): iterable {
		yield 'share id' => ['share'];
		yield 'storage id' => ['storage'];
	}

	/** A share that cannot say which it is is no diagram's own: refused, wherever the diagram is. */
	#[DataProvider('brokenIds')]
	public function testAViewOnlyFileWhoseShareCannotBeNamedIsRefused(string $broken): void {
		$sibling = $this->shareStorage(false, 'S', Constants::PERMISSION_READ, $broken);
		$inShare = $this->drawnInShare(Constants::PERMISSION_READ, $sibling);
		[$folder, $root] = $this->tree(['Shared/b.puml' => $this->file('Shared/b.puml', "beside\n", null, $sibling)], 'Shared');
		$own = (new IncludeResolver())->expand("!include b.puml\n", $folder, $root, $this->file('Shared/a.puml', '', null, $this->ownStorage()));

		self::assertSame([['line' => 0, 'message' => 'Cannot read b.puml']], $inShare->mistakes);
		self::assertSame([['line' => 0, 'message' => 'Cannot read b.puml']], $own->mistakes);
	}

	/** @return iterable<string, array{string}> */
	public static function otherShares(): iterable {
		yield 'own storage' => [''];
		yield 'another view-only share' => ['T'];
	}

	#[DataProvider('otherShares')]
	public function testADiagramOutsideAViewOnlyShareCannotReadIt(string $own): void {
		[$folder, $root] = $this->tree(['S/notes.txt' => $this->viewOnly('S')], '');
		$self = $this->file('mine.puml', '', null, $own === '' ? $this->ownStorage() : $this->shareStorage(false, $own));
		$expanded = (new IncludeResolver())->expand("!include /S/notes.txt\n", $folder, $root, $self);

		self::assertSame([['line' => 0, 'message' => 'Cannot read /S/notes.txt']], $expanded->mistakes);
	}

	/** Z4: text the reader sent, not the owner's, takes nothing from the share it names as its base. */
	public function testASourceThatIsNotTheDiagramsOwnCannotReadItsShare(): void {
		$expanded = $this->drawnInShare(Constants::PERMISSION_READ, null, false);

		self::assertSame("!include b.puml\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Cannot read b.puml']], $expanded->mistakes);
	}

	/** @return iterable<string, array{string}> */
	public static function selfLines(): iterable {
		yield 'style' => ['<style file=Figures.txt>'];
		yield 'includesub without a section' => ['!includesub Figures.txt'];
		yield 'import' => ['!import Figures.txt'];
	}

	/**
	 * Z4: a file shared on its own is the share; the diagram's own file is
	 * never read into it, whatever the line, so it cannot be drawn as text.
	 */
	#[DataProvider('selfLines')]
	public function testTheDiagramsOwnFileIsNeverReadOnASingleFileShare(string $line): void {
		$self = $this->viewOnly('F');
		$self->method('getPath')->willReturn(self::USER_ROOT . '/Figures.txt');
		[$folder, $root] = $this->tree(['Figures.txt' => $self], '');
		$expanded = (new IncludeResolver())->expand("$line\n", $folder, $root, $self, true);

		self::assertSame("$line\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'Figures.txt includes itself']], $expanded->mistakes);
	}
}
