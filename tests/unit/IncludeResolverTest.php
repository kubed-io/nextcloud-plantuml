<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\Expanded;
use OCA\PlantUml\Service\IncludeResolver;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\InvalidPathException;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class IncludeResolverTest extends TestCase {
	private const USER_ROOT = '/drk/files';

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

	private function file(string $path, string $content, ?int $size = null): File {
		$file = $this->createStub(File::class);
		$file->method('getContent')->willReturn($content);
		$file->method('fopen')->willReturnCallback(static fn () => self::stream($content));
		$file->method('getSize')->willReturn($size ?? strlen($content));
		$file->method('getEtag')->willReturn('etag:' . $path);
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
	private function expand(string $source, array $files, string $base = 'docs'): Expanded {
		[$folder, $root] = $this->tree($files, $base);
		return (new IncludeResolver())->expand($source, $folder, $root);
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
		$file = "@startuml\nfirst\n@enduml\n@startuml(id=MINE)\nsecond\n@enduml\n@startuml THIRD\nthird\n@enduml\n";
		$expanded = $this->expand("!include_many f.puml!1\n!include_many f.puml!MINE\n!include_many f.puml!THIRD\n!include_many f.puml!0\n", ['docs/f.puml' => $file]);

		self::assertSame("second\nsecond\nthird\nfirst\n", $expanded->source);
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
		$content = str_repeat("' padding\n", 120000);
		$file = $this->createMock(File::class);
		$file->method('getSize')->willReturn(10);
		$file->method('fopen')->willReturnCallback(static fn () => self::stream($content));
		$file->expects(self::never())->method('getContent');
		$expanded = $this->expand("!include a.puml\n", ['docs/a.puml' => $file]);

		self::assertSame("!include a.puml\n", $expanded->source);
		self::assertSame([['line' => 0, 'message' => 'a.puml is past the limit of 1 MB in all']], $expanded->mistakes);
	}

	public function testABangInsideQuotesIsPartOfTheName(): void {
		$expanded = $this->expand("!include \"a!b.puml\"\n!include \"f.puml\"!1\n", [
			'docs/a!b.puml' => "from a!b\n",
			'docs/f.puml' => "@startuml\nfirst\n@enduml\n@startuml\nsecond\n@enduml\n",
		]);

		self::assertSame("from a!b\nsecond\n", $expanded->source);
		self::assertSame([], $expanded->mistakes);
	}
}
