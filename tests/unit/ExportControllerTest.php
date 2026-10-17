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
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\Response;
use OCP\Files\Node;
use OCP\IRequest;
use OCP\ITempManager;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ExportControllerTest extends TestCase {
	use StoredFiles;

	private const SCREENS = "@startuml nodes\nA -> B\n@enduml\n@startuml login\nC -> D\n@enduml\n";

	/** @var list<string> the temporary files a test made, removed after it */
	private array $temporary = [];

	protected function tearDown(): void {
		foreach ($this->temporary as $path) {
			if (is_file($path)) {
				unlink($path);
			}
		}
		$this->temporary = [];
	}

	/** @param array<string, Node> $files the caller's files by path from their root */
	private function controllerOver(RenderService $render, array $files): ExportController {
		[$root, $session] = $this->signedInWith($this->userFolderOver($files));
		$temp = $this->createStub(ITempManager::class);
		$temp->method('getTemporaryFile')->willReturnCallback(fn (): string => $this->temporaryFile());
		return new ExportController('plantuml', $this->createStub(IRequest::class), $render, new DiagramFiles(new IncludeResolver(), $root, $session), $temp);
	}

	private function controller(RenderService $render, string $name, string $content, string $mimetype = 'text/x-plantuml'): ExportController {
		return $this->controllerOver($render, ["Diagrams/{$name}" => $this->diagram($mimetype, $content, name: $name)]);
	}

	private function temporaryFile(): string {
		$path = tempnam(sys_get_temp_dir(), 'export');
		self::assertIsString($path);
		$this->temporary[] = $path;
		return $path;
	}

	/**
	 * A render service that answers `<format>:<index>` as each body, and records the calls.
	 *
	 * @param list<array{int, string}>|null $calls
	 */
	private function drawing(?array &$calls = []): RenderService {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturnCallback(static function (string $source, int $index = 0, string $format = 'svg') use (&$calls): Rendered {
			$calls[] = [$index, $format];
			return new Rendered("{$format}:{$index}", RenderService::FORMATS[$format]);
		});
		return $render;
	}

	private function drawingNothing(): RenderService {
		$render = $this->createMock(RenderService::class);
		$render->expects(self::never())->method('render');
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

	/** Core's default, set outright, as the picture route sets it: an SVG opened on its own runs no script. */
	public function testADownloadRunsNoScript(): void {
		$controller = $this->controller($this->drawing(), 'Screens.puml', self::SCREENS);
		self::assertEquals(new EmptyContentSecurityPolicy(), self::policySet($controller->export('Diagrams/Screens.puml', 'svg', ['login'])));
		self::assertEquals(new EmptyContentSecurityPolicy(), self::policySet($controller->export('Diagrams/Screens.puml', 'svg')));
	}

	/** The policy the route set; getContentSecurityPolicy() makes up an empty one when none was. */
	private static function policySet(Response $response): ?EmptyContentSecurityPolicy {
		return \Closure::bind(fn () => $this->contentSecurityPolicy, $response, Response::class)();
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
		self::assertSame("attachment; filename=\"Screens.zip\"; filename*=UTF-8''Screens.zip", self::header($response, 'Content-Disposition'));
		self::assertSame(['Screens - nodes.svg' => 'svg:0', 'Screens - login.svg' => 'svg:1'], $this->entries($response->render()));
	}

	public function testCheckedDiagramsInFileOrderEachOnce(): void {
		$this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', ['2', '1', 'login']);
		self::assertSame([[0, 'svg'], [1, 'svg']], $calls);
	}

	/** The Viewer's form (F1): the 0-based place, whatever the diagrams are named. */
	public function testAnIndexPicksByPlace(): void {
		$response = $this->controller($this->drawing($calls), 'Doc.puml', "@startuml 2\n@enduml\n@startuml a\n@enduml\n@startuml b\n@enduml\n")->export('Diagrams/Doc.puml', 'png', null, ['1']);
		self::assertSame([[1, 'png']], $calls);
		self::assertSame("attachment; filename=\"Doc - a.png\"; filename*=UTF-8''Doc%20-%20a.png", self::header($response, 'Content-Disposition'));
	}

	public function testOneStringIndexWorksToo(): void {
		$this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', null, '0');
		self::assertSame([[0, 'svg']], $calls);
	}

	public function testIndexesDecideOverDiagrams(): void {
		$this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', ['nodes'], ['1']);
		self::assertSame([[1, 'svg']], $calls);
	}

	public function testIndexesInFileOrderEachOnceNamedByTheirDiagrams(): void {
		$response = $this->controller($this->drawing($calls), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', null, ['1', '0', '1']);
		self::assertSame([[0, 'svg'], [1, 'svg']], $calls);
		self::assertSame(['Screens - nodes.svg', 'Screens - login.svg'], array_keys($this->entries($response->render())));
	}

	/** The index is the diagram's place; the image asked for is the one PlantUML draws for it, pages counted. */
	public function testAnIndexDrawsItsDiagramsImage(): void {
		$this->controller($this->drawing($calls), 'Doc.puml', "@startuml a\nA\nnewpage\nB\n@enduml\n@startuml b\n@enduml\n")->export('Diagrams/Doc.puml', 'svg', null, ['2']);
		self::assertSame([[2, 'svg']], $calls);
	}

	/** @return array<string, array{mixed}> */
	public static function badIndexes(): array {
		return [
			'negative' => [['-1']],
			'past 999' => [['1000']],
			'a name' => [['login']],
			'empty' => [['']],
			'a fraction' => [['1.5']],
			'nested' => [[['1']]],
			'not a list' => [['a' => '1']],
			'empty string' => [''],
		];
	}

	#[DataProvider('badIndexes')]
	public function testAnIndexOutsideZeroTo999Is400(mixed $index): void {
		$response = $this->controller($this->drawingNothing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', null, $index);
		self::assertSame(400, $response->getStatus());
	}

	public function testNoSuchIndexIs404(): void {
		$response = $this->controller($this->drawingNothing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', null, ['5']);
		self::assertSame(404, $response->getStatus());
		self::assertSame(['problem' => 'no diagram 6'], $response->getData());
	}

	/** A block left open after the last closed one: PlantUML draws no image for it, and its 400 is no server problem. */
	private const PAST_END = "@startuml a\nA -> B\n@enduml\n@startuml b\nC -> D\n";

	public function testEveryDiagramLeavesOutOneWithNoImage(): void {
		$response = $this->controller($this->drawing($calls), 'Doc.puml', "@startuml a\n@enduml\n@startuml b\n@enduml\n@startuml c\n")->export('Diagrams/Doc.puml', 'svg');
		self::assertSame([[0, 'svg'], [1, 'svg']], $calls);
		self::assertSame(['Doc - a.svg' => 'svg:0', 'Doc - b.svg' => 'svg:1'], $this->entries($response->render()));
	}

	public function testEveryDiagramOfOneDrawnIsThatOneFile(): void {
		$response = $this->controller($this->drawing($calls), 'Doc.puml', self::PAST_END)->export('Diagrams/Doc.puml', 'png');
		self::assertSame([[0, 'png']], $calls);
		self::assertSame("attachment; filename=\"Doc - a.png\"; filename*=UTF-8''Doc%20-%20a.png", self::header($response, 'Content-Disposition'));
	}

	/** @return array<string, array{mixed, mixed}> */
	public static function undrawnAsked(): array {
		return [
			'by index' => [null, ['1']],
			'by name' => [['b'], null],
			'by number' => [['2'], null],
			'beside a drawn one' => [['a', 'b'], null],
		];
	}

	#[DataProvider('undrawnAsked')]
	public function testAnUndrawnDiagramAskedForIs404(mixed $diagram, mixed $index): void {
		$response = $this->controller($this->drawingNothing(), 'Doc.puml', self::PAST_END)->export('Diagrams/Doc.puml', 'svg', $diagram, $index);
		self::assertSame(404, $response->getStatus());
		self::assertSame(['problem' => 'no image for b'], $response->getData());
	}

	/** Controls, C1 controls and format characters such as the bidi override U+202E go as `/` does. */
	public function testNamesLoseEveryUnsafeAndInvisibleCharacter(): void {
		$name = "a\\b*c?d<e>f|g\th\u{202E}i\u{9B}j\u{200B}k";
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml x\n@enduml\n@startuml {$name}\n@enduml\n")->export('Diagrams/Doc.puml', 'svg', null, ['1']);
		self::assertSame(
			"attachment; filename=\"Doc - a - b - c - d - e - f - g - h - i - j - k.svg\"; filename*=UTF-8''" . rawurlencode('Doc - a - b - c - d - e - f - g - h - i - j - k.svg'),
			self::header($response, 'Content-Disposition'),
		);
	}

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
		$only = $this->controller($this->drawing(), $file, "@startuml\n@enduml\n")->export("Diagrams/{$file}", 'svg');
		self::assertStringEndsWith("; filename*=UTF-8''" . rawurlencode($stem . '.svg'), (string)self::header($only, 'Content-Disposition'));
	}

	/** A name of joiners alone is none, and a cut never leaves a joiner dangling at the end. */
	public function testJoinersAtTheEdgesOfAStemGo(): void {
		$only = $this->controller($this->drawing(), "\u{200D}\u{200C}.puml", "@startuml\n@enduml\n")->export("Diagrams/\u{200D}\u{200C}.puml", 'svg');
		self::assertStringEndsWith("; filename*=UTF-8''diagram.svg", (string)self::header($only, 'Content-Disposition'));
		$file = str_repeat('a', 197) . "\u{200D}b.puml";
		$cut = $this->controller($this->drawing(), $file, "@startuml\n@enduml\n")->export("Diagrams/{$file}", 'svg');
		self::assertStringEndsWith("; filename*=UTF-8''" . str_repeat('a', 197) . '.svg', (string)self::header($cut, 'Content-Disposition'));
	}

	/** A label past 150 characters is cut there, for the download and for the zip entry alike. */
	public function testALongLabelIsCutAt150Characters(): void {
		$long = str_repeat('x', 140) . str_repeat('ö', 20) . 'tail';
		$text = "@startuml x\n@enduml\n@startuml {$long}\n@enduml\n";
		$cut = 'Doc - ' . str_repeat('x', 140) . str_repeat('ö', 10) . '.svg';
		$one = $this->controller($this->drawing(), 'Doc.puml', $text)->export('Diagrams/Doc.puml', 'svg', null, ['1']);
		self::assertStringEndsWith("; filename*=UTF-8''" . rawurlencode($cut), (string)self::header($one, 'Content-Disposition'));
		$all = $this->controller($this->drawing(), 'Doc.puml', $text)->export('Diagrams/Doc.puml', 'svg');
		self::assertSame(['Doc - x.svg', $cut], array_keys($this->entries($all->render())));
	}

	/** Review focus 2: two unnamed diagrams of one type. */
	public function testSameLabelsStayApart(): void {
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml\n@enduml\n@startuml\n@enduml\n@startuml\n@enduml\n")->export('Diagrams/Doc.puml', 'svg');
		self::assertSame(['Doc - uml.svg' => 'svg:0', 'Doc - uml (2).svg' => 'svg:1', 'Doc - uml (3).svg' => 'svg:2'], $this->entries($response->render()));
	}

	/** Review focus 3: `/`, `"`, `:` and non-ASCII. */
	public function testNamesAreSafeAndReadable(): void {
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml \"Login / Sign-up\"\n@enduml\n@startuml Größe\n@enduml\n@startuml a:b\n@enduml\n")->export('Diagrams/Doc.puml', 'svg');
		self::assertSame(['Doc - Login - Sign-up.svg', 'Doc - Größe.svg', 'Doc - a - b.svg'], array_keys($this->entries($response->render())));
	}

	public function testANonAsciiDownloadHasAnAsciiFallback(): void {
		$response = $this->controller($this->drawing(), 'Doc.puml', "@startuml a\n@enduml\n@startuml Größe\n@enduml\n")->export('Diagrams/Doc.puml', 'svg', ['Größe']);
		self::assertSame("attachment; filename=\"Doc - Gr__e.svg\"; filename*=UTF-8''Doc%20-%20Gr%C3%B6%C3%9Fe.svg", self::header($response, 'Content-Disposition'));
	}

	/** @return list<array{string}> */
	public static function badFormats(): array {
		return [['latex'], ['utxt'], [''], ['SVG']];
	}

	#[DataProvider('badFormats')]
	public function testAnotherFormatIs400(string $format): void {
		self::assertSame(400, $this->controller($this->drawingNothing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', $format)->getStatus());
	}

	/** @return array<string, array{mixed}> */
	public static function badDiagrams(): array {
		return [
			'nested' => [[['x']]],
			'not a list' => [['a' => 'x']],
		];
	}

	#[DataProvider('badDiagrams')]
	public function testANonListDiagramIs400(mixed $diagram): void {
		self::assertSame(400, $this->controller($this->drawingNothing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', $diagram)->getStatus());
	}

	public function testNoSuchDiagramIs404(): void {
		$response = $this->controller($this->drawingNothing(), 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg', ['login', 'signup']);
		self::assertSame(404, $response->getStatus());
		self::assertSame(['problem' => 'no diagram named signup'], $response->getData());
	}

	public function testANonDiagramIsRefusedAsRenderRefusesIt(): void {
		self::assertSame(404, $this->controller($this->drawingNothing(), 'notes.txt', 'x', 'text/plain')->export('Diagrams/notes.txt', 'svg')->getStatus());
	}

	public function testAFileTooLargeToDrawIsRefusedAsRenderRefusesIt(): void {
		$response = $this->controllerOver($this->drawingNothing(), ['Diagrams/Big.puml' => $this->sizedDiagram(DiagramFiles::MAX_SOURCE + 1, '', false)])->export('Diagrams/Big.puml', 'svg');
		self::assertSame(413, $response->getStatus());
		self::assertSame(['problem' => 'The diagram is too large to draw'], $response->getData());
	}

	public function testAServerProblemIs503(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_SET));
		$response = $this->controller($render, 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'svg');
		self::assertSame(503, $response->getStatus());
		self::assertSame(['problem' => 'not set'], $response->getData());
	}

	/** The live server answers a broken diagram with a 400 in the format asked, the mistake drawn in; that is the file. */
	public function testADiagramWithAMistakeExportsWithTheMistakeDrawnIn(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered('%PDF-2.0 Syntax Error?', 'application/pdf', 'Syntax Error?', 1));
		$response = $this->controller($render, 'Order flow.puml', "@startuml\nA -> \n@enduml\n")->export('Diagrams/Order flow.puml', 'pdf');
		self::assertSame(200, $response->getStatus());
		self::assertSame('%PDF-2.0 Syntax Error?', $response->render());
	}

	public function testMoreThanAHundredDiagramsIs413(): void {
		$response = $this->controller($this->drawingNothing(), 'Many.puml', str_repeat("@startuml\n@enduml\n", ExportController::MAX_DIAGRAMS + 1))->export('Diagrams/Many.puml', 'svg');
		self::assertSame(413, $response->getStatus());
		self::assertSame(['problem' => 'The export is too large'], $response->getData());
	}

	public function testAHundredDiagramsExport(): void {
		$response = $this->controller($this->drawing(), 'Many.puml', str_repeat("@startuml\n@enduml\n", ExportController::MAX_DIAGRAMS))->export('Diagrams/Many.puml', 'svg');
		self::assertSame(200, $response->getStatus());
		self::assertCount(ExportController::MAX_DIAGRAMS, $this->entries($response->render()));
	}

	public function testMoreThan50MiBDrawnIs413(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered(str_repeat('a', 26 * 1048576), 'image/png'));
		$response = $this->controller($render, 'Screens.puml', self::SCREENS)->export('Diagrams/Screens.puml', 'png');
		self::assertSame(413, $response->getStatus());
		self::assertSame(['problem' => 'The export is too large'], $response->getData());
	}

	/** The coordinator's ruling: Export is a download, which the share forbids. */
	public function testADownloadForbiddenShareIsRefused(): void {
		$file = $this->diagram(content: self::SCREENS, name: 'Screens.puml', storage: $this->shareStorage(false));
		self::assertSame(404, $this->controllerOver($this->drawingNothing(), ['Shared/Screens.puml' => $file])->export('Shared/Screens.puml', 'svg')->getStatus());
	}

	/** @return array<string, array{?bool}> */
	public static function downloadable(): array {
		return ['download allowed' => [true], 'no download attribute' => [null]];
	}

	#[DataProvider('downloadable')]
	public function testAShareThatAllowsDownloadExports(?bool $download): void {
		$file = $this->diagram(content: "@startuml\n@enduml\n", name: 'Screens.puml', storage: $this->shareStorage($download));
		self::assertSame(200, $this->controllerOver($this->drawing(), ['Shared/Screens.puml' => $file])->export('Shared/Screens.puml', 'svg')->getStatus());
	}

	public function testIncludesAreDrawn(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturnCallback(static function (string $source) use (&$sent): Rendered {
			$sent = $source;
			return new Rendered('<svg/>', 'image/svg+xml');
		});
		$this->controllerOver($render, [
			'Diagrams/Order flow.puml' => $this->diagram(content: "@startuml\n!include parts.puml\n@enduml\n"),
			'Diagrams/parts.puml' => $this->diagram(content: "A -> B\n", etag: 'p1', name: 'parts.puml'),
		])->export('Diagrams/Order flow.puml', 'svg');
		self::assertIsString($sent);
		self::assertStringContainsString('A -> B', $sent);
	}

	/** @return array<string, string> entry name => content */
	private function entries(string $zip): array {
		$path = $this->temporaryFile();
		file_put_contents($path, $zip);
		$archive = new \ZipArchive();
		self::assertTrue($archive->open($path));
		$entries = [];
		for ($i = 0; $i < $archive->numFiles; $i++) {
			$entries[(string)$archive->getNameIndex($i)] = (string)$archive->getFromIndex($i);
		}
		$archive->close();
		return $entries;
	}
}
