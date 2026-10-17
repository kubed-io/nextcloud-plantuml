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
	private const FIXTURES = __DIR__ . '/../fixtures/diagrams/';

	/**
	 * The editor's own fixture (tests/js/blocks.test.js reads the same files): each .puml with the
	 * fields the server keeps, the JS-only ones (line ranges) left off.
	 *
	 * @return array<string, array{string, list<array<string, mixed>>}>
	 */
	public static function cases(): array {
		$expected = json_decode((string)file_get_contents(self::FIXTURES . 'expected.json'), true, 512, JSON_THROW_ON_ERROR);
		$keep = array_flip(['index', 'type', 'name', 'id', 'page', 'pages', 'render', 'drawn']);
		$cases = [];
		foreach ($expected as $file => $rows) {
			$cases[$file] = [
				(string)file_get_contents(self::FIXTURES . $file),
				array_map(static fn (array $row): array => array_intersect_key($row, $keep), $rows),
			];
		}
		return $cases;
	}

	#[DataProvider('cases')]
	public function testScansAsTheEditorDoes(string $text, array $diagrams): void {
		self::assertSame($diagrams, Diagrams::scan($text));
	}

	/** Of the shared fixtures, only the block left open after the last image has none of its own. */
	public function testEveryFixtureDiagramIsDrawnButOneLeftOpenPastTheLast(): void {
		$undrawn = [];
		foreach (array_keys(self::cases()) as $file) {
			foreach (Diagrams::scan((string)file_get_contents(self::FIXTURES . $file)) as $d) {
				if (!$d['drawn']) {
					$undrawn[] = "{$file} " . Diagrams::label($d);
				}
			}
		}
		self::assertSame(['render-past-end.puml b'], $undrawn);
	}

	/** Drawn: PlantUML has an image for it (its `render` is below the image count); `/svg/<n>` past the last answers 400. */
	public function testMarksWhatIsDrawn(): void {
		$drawn = static fn (string $text): array => array_column(Diagrams::scan($text), 'drawn');
		self::assertSame([true, false], $drawn("@startuml a\n@enduml\n@startuml b\n"));
		self::assertSame([true, false, false], $drawn("@startuml a\n@enduml\n@startuml b\nA\nnewpage\nB\n"));
		// A block an unclosed one swallows shows the image that closes over it.
		self::assertSame([true, true], $drawn("@startyaml\na: 1\n@startuml\nA -> B\n@enduml\n"));
		// Nothing closes: drawn as if wrapped in @startuml…@enduml.
		self::assertSame([true, true], $drawn("@startuml a\nA\n@startuml b\nB\n"));
		self::assertSame([true], $drawn(''));
	}

	public function testSaysWhatHasNoImage(): void {
		$diagrams = Diagrams::scan("@startuml a\n@enduml\n@startuml b\nA\nnewpage\nB\n");
		self::assertSame('no image for b 2', Diagrams::noImage($diagrams[2]));
		self::assertSame('no image for uml', Diagrams::noImage(Diagrams::scan("@startuml a\n@enduml\n@startuml\n")[1]));
	}

	/** A long run of spaces inside a name used to exhaust PCRE (false at ~1,400), so the line was no `@start` line. */
	public function testANameWithAHugeRunOfSpacesIsRead(): void {
		$name = 'a' . str_repeat(' ', 200000) . 'b';
		$diagrams = Diagrams::scan("@startuml {$name}   \nA\n@enduml\n@startuml c\n@enduml\n");
		self::assertSame([$name, 'c'], array_column($diagrams, 'name'));
		self::assertSame([0, 1], array_column($diagrams, 'render'));
	}

	public function testAnIdWithAHugeRunOfSpacesIsRead(): void {
		$id = 'x' . str_repeat(' ', 200000) . 'y';
		$diagrams = Diagrams::scan("@startuml(id={$id}   )\n@enduml\n");
		self::assertSame([$id, $id], [$diagrams[0]['id'], $diagrams[0]['name']]);
	}

	/** A long `@start` word and a line separator once exhausted PCRE's backtrack limit and threw; PlantUML opens the block. */
	public function testALongStartWordWithALineSeparatorAfterItOpensItsBlock(): void {
		$diagrams = Diagrams::scan('@start' . str_repeat('a', 40000) . "\u{2028}x\n@enduml\n");
		self::assertSame(['x'], array_column($diagrams, 'name'));
		self::assertSame([str_repeat('a', 40000)], array_column($diagrams, 'type'));
	}

	/** Quotes stay out of a name: one inside it opens no block, as in the editor. */
	public function testAQuoteInsideANameOpensNoBlock(): void {
		self::assertSame('', Diagrams::scan("@startuml a \"b\" c\n@enduml\n")[0]['name']);
		self::assertSame(null, Diagrams::scan("@startuml a \"b\" c\n@enduml\n")[0]['id']);
		self::assertSame('a b', Diagrams::scan("@startuml \"a b\" }\n@enduml\n")[0]['name']);
	}

	public function testTheBomFixtureStartsWithTheBom(): void {
		self::assertSame("\xEF\xBB\xBF", substr((string)file_get_contents(self::FIXTURES . 'bom.puml'), 0, 3));
	}

	public function testCrlfScansAsLf(): void {
		self::assertSame(
			Diagrams::scan("@startuml a\nA -> B\n@enduml\n@startuml b\n@enduml\n"),
			Diagrams::scan("@startuml a\r\nA -> B\r\n@enduml\r\n@startuml b\r\n@enduml\r\n"),
		);
	}

	public function testBomAndCrlfScanAsPlainLf(): void {
		self::assertSame(
			Diagrams::scan("@startuml a\nA -> B\n@enduml\n@startuml b\n@enduml\n"),
			Diagrams::scan("\u{FEFF}@startuml a\r\nA -> B\r\n@enduml\r\n@startuml b\r\n@enduml\r\n"),
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
		self::assertSame(1, Diagrams::find($diagrams, 'login')['render'] ?? null);
	}

	public function testFindsTheFirstPageOfANamedBlock(): void {
		$diagrams = Diagrams::scan("@startuml nodes\nA\nnewpage\nB\n@enduml\n");
		self::assertSame(1, Diagrams::find($diagrams, 'nodes')['page'] ?? null);
	}

	public function testFindsByPositionCountingPages(): void {
		$diagrams = Diagrams::scan("@startuml nodes\nA\nnewpage\nB\nnewpage\nC\n@enduml\n");
		self::assertSame(2, Diagrams::find($diagrams, '3')['render'] ?? null);
	}

	/** Position 1 is the first diagram, `a`; the name `1` is the third. The name must win. */
	public function testANameWinsOverANumber(): void {
		$diagrams = Diagrams::scan("@startuml a\n@enduml\n@startuml b\n@enduml\n@startuml 1\n@enduml\n");
		self::assertSame(2, Diagrams::find($diagrams, '1')['index'] ?? null);
	}

	/** The Viewer sends a 0-based index; the image to ask the server for is that diagram's `render`. */
	public function testAnIndexIsTheImageToSend(): void {
		$diagrams = Diagrams::scan("@startuml a\nA\n@startuml b\nB\n@enduml\n@startuml c\nC\nnewpage\nD\n@enduml\n");
		self::assertSame([0, 0, 1, 2], array_column($diagrams, 'render'));
	}

	/** A block PlantUML drops has no image of its own; its index still resolves, past the end when none follows. */
	public function testAnIndexPastTheDrawnImagesIsTheNextOne(): void {
		$diagrams = Diagrams::scan("@startuml a\n@enduml\n@startuml b\n");
		self::assertSame(1, $diagrams[1]['render']);
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
