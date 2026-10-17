<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Controller\RenderController;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\IncludeResolver;
use OCA\PlantUml\Service\Rendered;
use OCA\PlantUml\Service\RenderService;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\ForbiddenException;
use OCP\Files\InvalidPathException;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Files\Storage\ISharedStorage;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Lock\LockedException;
use OCP\Share\IAttributes;
use OCP\Share\IShare;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/stream-get-contents.php';

final class RenderControllerTest extends TestCase {
	/** Whether the controller's stream_get_contents fails, see stream-get-contents.php. */
	public static bool $unreadable = false;

	private const SOURCE = "@startuml\nCustomer -> Shop : place order\n@enduml\n";
	private const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Customer</text></svg>';

	/**
	 * What the caller's folder answers for any path, or the caller's files by path from their root.
	 *
	 * @param Node|\Throwable|array<string, Node> $resolved
	 */
	private function controller(RenderService $render, Node|\Throwable|array $resolved, string $ifNoneMatch = ''): RenderController {
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
		$root->method('getUserFolder')->willReturnCallback(
			static fn (string $uid): Folder => $uid === 'drk' ? $folder : throw new \LogicException("not drk's folder: $uid"),
		);
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn('drk');
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$request = $this->createStub(IRequest::class);
		$request->method('getHeader')->willReturnCallback(
			static fn (string $name): string => $name === 'If-None-Match' ? $ifNoneMatch : '',
		);
		return new RenderController('plantuml', $request, $render, new IncludeResolver(), $root, $session);
	}

	/** A file in the caller's `Diagrams` folder. */
	private function diagram(string $mimetype = 'text/x-plantuml', string $content = self::SOURCE, string $etag = 'abc123'): File {
		$parent = $this->createStub(Folder::class);
		$parent->method('getPath')->willReturn('/drk/files/Diagrams');
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn($mimetype);
		$file->method('getEtag')->willReturn($etag);
		$file->method('getContent')->willReturn($content);
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

	/** Sends whatever it is given back as its SVG, so a test can read what was sent. */
	private function rendering(Rendered $rendered, ?string &$sent = null): RenderService {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturnCallback(static function (string $source) use ($rendered, &$sent): Rendered {
			$sent = $source;
			return $rendered;
		});
		return $render;
	}

	private function renderingNothing(): RenderService {
		$render = $this->createMock(RenderService::class);
		$render->expects(self::never())->method('render');
		return $render;
	}

	private function renderingSvg(string $svg = self::SVG): RenderService {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered($svg, 'image/svg+xml'));
		return $render;
	}

	protected function tearDown(): void {
		self::$unreadable = false;
	}

	/** getHeaders() asks the server container for the request id; read the set headers directly. */
	private static function header(Response $response, string $name): ?string {
		return \Closure::bind(fn () => $this->headers[$name] ?? null, $response, Response::class)();
	}

	private const TOO_LARGE = ['problem' => 'The diagram is too large to draw'];

	/** A diagram whose stored size and whose stream may disagree; fopen is optional to call. */
	private function sizedDiagram(int $storedSize, string $streamed, bool $mayOpen = true): File {
		$file = $mayOpen ? $this->createStub(File::class) : $this->createMock(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getEtag')->willReturn('abc123');
		$file->method('getSize')->willReturn($storedSize);
		$file->method('getParent')->willReturn($this->createStub(Folder::class));
		if ($mayOpen) {
			$file->method('fopen')->willReturnCallback(static function () use ($streamed) {
				$handle = fopen('php://memory', 'r+');
				fwrite($handle, $streamed);
				rewind($handle);
				return $handle;
			});
		} else {
			$file->expects(self::never())->method('fopen');
		}
		return $file;
	}

	public function testBySourceOverAMegabyteIs413(): void {
		$response = $this->controller($this->renderingNothing(), new NotFoundException())->bySource(str_repeat('a', RenderController::MAX_SOURCE + 1));

		self::assertSame(413, $response->getStatus());
		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(self::TOO_LARGE, $response->getData());
	}

	public function testBySourceOfExactlyAMegabyteIsRendered(): void {
		$response = $this->controller($this->renderingSvg(), new NotFoundException())->bySource(str_repeat('a', RenderController::MAX_SOURCE));

		self::assertSame(200, $response->getStatus());
	}

	public function testByPathOverTheStoredSizeIs413WithoutOpening(): void {
		$file = $this->sizedDiagram(RenderController::MAX_SOURCE + 1, '', false);

		$response = $this->controller($this->renderingNothing(), $file)->byPath('Diagrams/big.puml');

		self::assertSame(413, $response->getStatus());
		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(self::TOO_LARGE, $response->getData());
	}

	/** A stored size can be wrong; the stream is what is read, and read only to the limit. */
	public function testByPathWhoseStreamIsLargerThanItsSizeIs413(): void {
		$file = $this->sizedDiagram(10, str_repeat('a', RenderController::MAX_SOURCE + 5));

		$response = $this->controller($this->renderingNothing(), $file)->byPath('Diagrams/liar.puml');

		self::assertSame(413, $response->getStatus());
		self::assertSame(self::TOO_LARGE, $response->getData());
	}

	public function testByPathOfExactlyAMegabyteIsRendered(): void {
		$file = $this->sizedDiagram(RenderController::MAX_SOURCE, str_repeat('a', RenderController::MAX_SOURCE));

		$response = $this->controller($this->renderingSvg(), $file)->byPath('Diagrams/edge.puml');

		self::assertSame(200, $response->getStatus());
	}

	public function testByPathOfAFileCoreWillNotOpenIs404(): void {
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getSize')->willReturn(10);
		$file->method('getEtag')->willReturn('abc123');
		$file->method('fopen')->willThrowException(new NotPermittedException('no'));

		$response = $this->controller($this->renderingNothing(), $file)->byPath('Diagrams/x.puml');

		self::assertSame(404, $response->getStatus());
	}

	/** Z7: an access rule (files_accesscontrol) refuses as core does, never a 500. */
	public function testByPathOfAFileAnAccessRuleForbidsIs404(): void {
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getSize')->willReturn(10);
		$file->method('fopen')->willThrowException(new ForbiddenException('Access denied', false));

		$response = $this->controller($this->renderingNothing(), $file)->byPath('Diagrams/x.puml');

		self::assertSame(404, $response->getStatus());
	}

	/** A stream that cannot be read is no file to draw, not one too large. */
	public function testByPathOfAStreamThatCannotBeReadIs404(): void {
		self::$unreadable = true;

		$response = $this->controller($this->renderingNothing(), $this->diagram())->byPath('Diagrams/Order flow.puml');

		self::assertSame(404, $response->getStatus());
	}

	public function testByPathOfALockedFileIs423(): void {
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getSize')->willReturn(10);
		$file->method('getEtag')->willReturn('abc123');
		$file->method('fopen')->willThrowException(new LockedException('/drk/files/x.puml'));

		$response = $this->controller($this->renderingNothing(), $file)->byPath('Diagrams/x.puml');

		self::assertSame(423, $response->getStatus());
	}

	/** @return array<string, array{string, string}> */
	public static function imageTypes(): array {
		return ['svg' => ['image/svg+xml', 'diagram.svg'], 'png' => ['image/png', 'diagram.png']];
	}

	#[DataProvider('imageTypes')]
	public function testEveryImageIsDefended(string $type, string $filename): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered('x', $type));

		foreach ([
			$this->controller($render, $this->diagram())->byPath('Diagrams/Order flow.puml'),
			$this->controller($render, new NotFoundException())->bySource(self::SOURCE),
		] as $response) {
			self::assertSame('nosniff', self::header($response, 'X-Content-Type-Options'));
			self::assertSame('inline; filename="' . $filename . '"', self::header($response, 'Content-Disposition'));
			self::assertEquals(new EmptyContentSecurityPolicy(), $response->getContentSecurityPolicy());
		}
	}

	/** F6: a source that names no file never reaches the resolver, which would need the file's folder. */
	public function testBySourceWithPathButNoIncludeNeverResolves(): void {
		$file = $this->createMock(File::class);
		$file->expects(self::never())->method('getParent');

		$response = $this->controller($this->renderingSvg(), $file)->bySource(self::SOURCE, 0, 'Diagrams/Order flow.puml');

		self::assertSame(200, $response->getStatus());
	}

	public function testPathOutsideUserFolderIs404(): void {
		$response = $this->controller($this->renderingNothing(), new NotFoundException())->byPath('../other/x.puml');

		self::assertSame(404, $response->getStatus());
	}

	/** Core refuses a path that climbs out with `..` as NotPermitted, not NotFound. */
	public function testPathClimbingOutIs404(): void {
		$response = $this->controller($this->renderingNothing(), new NotPermittedException('Invalid path'))->byPath('../../admin/files/x.puml');

		self::assertSame(404, $response->getStatus());
	}

	public function testMissingPathIs404(): void {
		// No ?path= at all: the default resolves to the user folder itself, a folder.
		$response = $this->controller($this->renderingNothing(), $this->createStub(Folder::class))->byPath();

		self::assertSame(404, $response->getStatus());
	}

	public function testFolderIs404(): void {
		$response = $this->controller($this->renderingNothing(), $this->createStub(Folder::class))->byPath('Diagrams');

		self::assertSame(404, $response->getStatus());
	}

	public function testPlainTextIs404(): void {
		$response = $this->controller($this->renderingNothing(), $this->diagram('text/plain'))->byPath('Diagrams/notes.txt');

		self::assertSame(404, $response->getStatus());
	}

	public function testRendersSvgWithEtag(): void {
		$render = $this->createMock(RenderService::class);
		$render->expects(self::once())->method('render')->with(self::SOURCE)->willReturn(new Rendered(self::SVG, 'image/svg+xml'));

		$response = $this->controller($render, $this->diagram())->byPath('Diagrams/Order flow.puml');

		self::assertSame(200, $response->getStatus());
		self::assertSame(self::SVG, $response->render());
		self::assertSame('image/svg+xml', self::header($response, 'Content-Type'));
		self::assertSame('abc123', $response->getETag());
	}

	public function testIfNoneMatchIs304(): void {
		$response = $this->controller($this->renderingNothing(), $this->diagram(), '"abc123"')->byPath('Diagrams/Order flow.puml');

		self::assertSame(304, $response->getStatus());
		self::assertSame('', $response->render());
	}

	public function testServerProblemIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willThrowException(new RenderException(RenderException::PROBLEM_UNREACHABLE));

		$response = $this->controller($render, $this->diagram())->byPath('Diagrams/Order flow.puml');

		self::assertSame(503, $response->getStatus());
		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(['problem' => 'unreachable'], $response->getData());
	}

	public function testBySourceRendersVerbatim(): void {
		$render = $this->createMock(RenderService::class);
		$render->expects(self::once())->method('render')->with(self::SOURCE, 0)->willReturn(new Rendered(self::SVG, 'image/svg+xml'));

		$response = $this->controller($render, new NotFoundException())->bySource(self::SOURCE);

		self::assertSame(200, $response->getStatus());
		self::assertSame(self::SVG, $response->render());
		self::assertSame('image/svg+xml', self::header($response, 'Content-Type'));
	}

	/** Nothing to draw is the caller's mistake, not a server problem. */
	public function testMissingSourceIs400(): void {
		$response = $this->controller($this->renderingNothing(), new NotFoundException())->bySource();

		self::assertSame(400, $response->getStatus());
	}

	/** @return array<string, array{mixed}> */
	public static function badIndexes(): array {
		return ['negative' => [-1], 'past 999' => [1000], 'word' => ['x'], 'float' => [1.5], 'list' => [[]]];
	}

	#[DataProvider('badIndexes')]
	public function testRefusesAnIndexOutsideZeroTo999(mixed $index): void {
		$response = $this->controller($this->renderingNothing(), new NotFoundException())->bySource(self::SOURCE, $index);

		self::assertSame(400, $response->getStatus());
	}

	public function testPassesTheIndexToTheService(): void {
		$render = $this->createMock(RenderService::class);
		$render->expects(self::exactly(2))->method('render')
			->with(self::SOURCE, self::callback(static fn (int $index): bool => $index === 3))
			->willReturn(new Rendered(self::SVG, 'image/svg+xml'));
		$controller = $this->controller($render, new NotFoundException());

		self::assertSame(200, $controller->bySource(self::SOURCE, 3)->getStatus());
		self::assertSame(200, $controller->bySource(self::SOURCE, '3')->getStatus());
	}

	public function testBySourceServerProblemIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_SET));

		$response = $this->controller($render, new NotFoundException())->bySource(self::SOURCE);

		self::assertSame(503, $response->getStatus());
		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(['problem' => 'not set'], $response->getData());
	}

	/** The editor underlines the line PlantUML names; the image is drawn either way. */
	public function testBySourceForwardsTheServersErrorAndLine(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered(self::SVG, 'image/svg+xml', 'Syntax Error? (Assumed diagram type: sequence)', 2));

		$response = $this->controller($render, new NotFoundException())->bySource(self::SOURCE);

		self::assertSame(200, $response->getStatus());
		self::assertSame('Syntax Error? (Assumed diagram type: sequence)', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame('2', self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	public function testByPathForwardsTheServersError(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered(self::SVG, 'image/svg+xml', 'Cannot load theme nope', 1));

		$response = $this->controller($render, $this->diagram())->byPath('Diagrams/Order flow.puml');

		self::assertSame('Cannot load theme nope', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame('1', self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	public function testACleanRenderForwardsNoError(): void {
		$response = $this->controller($this->renderingSvg(), new NotFoundException())->bySource(self::SOURCE);

		self::assertNull(self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertNull(self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	/** An error with no line names none. */
	public function testAnErrorWithoutALineForwardsNoLine(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willReturn(new Rendered(self::SVG, 'image/svg+xml', 'Syntax Error?'));

		$response = $this->controller($render, new NotFoundException())->bySource(self::SOURCE);

		self::assertSame('Syntax Error?', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertNull(self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	public function testThemesAreTheServersList(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('themes')->willReturn(['_none_', 'cerulean', 'vibrant']);

		$response = $this->controller($render, new NotFoundException())->themes();

		self::assertSame(200, $response->getStatus());
		self::assertSame(['themes' => ['_none_', 'cerulean', 'vibrant']], $response->getData());
	}

	public function testThemesFromAServerThatCannotAnswerIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('themes')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_PLANTUML));

		$response = $this->controller($render, new NotFoundException())->themes();

		self::assertSame(503, $response->getStatus());
		self::assertSame(['problem' => 'not a PlantUML server'], $response->getData());
	}

	public function testKeywordsAreTheServersLists(): void {
		$lists = ['diagrams' => ['uml'], 'types' => ['actor'], 'keywords' => ['alt', 'floating note']];
		$render = $this->createStub(RenderService::class);
		$render->method('keywords')->willReturn($lists);

		$response = $this->controller($render, new NotFoundException())->keywords();

		self::assertSame(200, $response->getStatus());
		self::assertSame($lists, $response->getData());
	}

	public function testKeywordsFromAServerThatCannotAnswerIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('keywords')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_PLANTUML));

		$response = $this->controller($render, new NotFoundException())->keywords();

		self::assertSame(503, $response->getStatus());
		self::assertSame(['problem' => 'not a PlantUML server'], $response->getData());
	}

	public function testFontsAreTheServersList(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('fonts')->willReturn(['DejaVu Sans', 'Dialog']);

		$response = $this->controller($render, new NotFoundException())->fonts();

		self::assertSame(200, $response->getStatus());
		self::assertSame(['fonts' => ['DejaVu Sans', 'Dialog']], $response->getData());
	}

	public function testFontsFromAServerThatCannotAnswerIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('fonts')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_PLANTUML));

		$response = $this->controller($render, new NotFoundException())->fonts();

		self::assertSame(503, $response->getStatus());
		self::assertSame(['problem' => 'not a PlantUML server'], $response->getData());
	}

	public function testStdlibIsTheServersLibraries(): void {
		$render = $this->createStub(RenderService::class);
		$library = ['name' => 'c4', 'version' => '2.13.0', 'source' => 'https://github.com/plantuml-stdlib/C4-PlantUML'];
		$render->method('stdlib')->willReturn([$library]);

		$response = $this->controller($render, new NotFoundException())->stdlib();

		self::assertSame(200, $response->getStatus());
		self::assertSame(['stdlib' => [$library]], $response->getData());
	}

	public function testStdlibFromAServerThatCannotAnswerIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('stdlib')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_PLANTUML));

		$response = $this->controller($render, new NotFoundException())->stdlib();

		self::assertSame(503, $response->getStatus());
		self::assertSame(['problem' => 'not a PlantUML server'], $response->getData());
	}

	public function testIconsAndEmojiAreTheServersLists(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('icons')->willReturn(['account-login', 'clock']);
		$render->method('emoji')->willReturn(['smile', 'sunny']);
		$controller = $this->controller($render, new NotFoundException());

		self::assertSame(['icons' => ['account-login', 'clock']], $controller->icons()->getData());
		self::assertSame(['emoji' => ['smile', 'sunny']], $controller->emoji()->getData());
		self::assertSame(200, $controller->emoji()->getStatus());
	}

	public function testIconsAndEmojiFromAServerThatCannotAnswerAre503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('icons')->willThrowException(new RenderException(RenderException::PROBLEM_UNREACHABLE));
		$render->method('emoji')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_SET));
		$controller = $this->controller($render, new NotFoundException());

		self::assertSame([503, ['problem' => 'unreachable']], [$controller->icons()->getStatus(), $controller->icons()->getData()]);
		self::assertSame([503, ['problem' => 'not set']], [$controller->emoji()->getStatus(), $controller->emoji()->getData()]);
	}

	public function testColorsAreTheServersNamesWithTheirHex(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('colors')->willReturn(['APPLICATION' => '#C2F0FF', 'AliceBlue' => '#F0F8FF', 'Odd' => null]);

		$response = $this->controller($render, new NotFoundException())->colors();

		self::assertSame(200, $response->getStatus());
		self::assertSame(['colors' => ['APPLICATION' => '#C2F0FF', 'AliceBlue' => '#F0F8FF', 'Odd' => null]], $response->getData());
		self::assertSame('{"colors":{"APPLICATION":"#C2F0FF","AliceBlue":"#F0F8FF","Odd":null}}', $response->render());
	}

	public function testColorsFromAServerThatCannotAnswerAre503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('colors')->willThrowException(new RenderException(RenderException::PROBLEM_UNREACHABLE));

		$response = $this->controller($render, new NotFoundException())->colors();

		self::assertSame([503, ['problem' => 'unreachable']], [$response->getStatus(), $response->getData()]);
	}

	public function testSyntaxErrorIsStillAnImage(): void {
		$errorImage = '<svg xmlns="http://www.w3.org/2000/svg"><text>Syntax Error?</text></svg>';

		$response = $this->controller($this->renderingSvg($errorImage), $this->diagram())->byPath('Diagrams/broken.puml');

		self::assertSame(200, $response->getStatus());
		self::assertSame($errorImage, $response->render());
	}

	/** @return array<string, array{\Throwable}> */
	public static function unreadable(): array {
		return [
			'missing' => [new NotFoundException()],
			'climbing out' => [new NotPermittedException('Invalid path')],
			'too long for Nextcloud' => [new InvalidPathException('File name is too long')],
		];
	}

	/** R4: a path the caller cannot read is refused as GET refuses it. */
	#[DataProvider('unreadable')]
	public function testBySourceWithAPathTheCallerCannotReadIs404(\Throwable $refusal): void {
		$response = $this->controller($this->renderingNothing(), $refusal)->bySource(self::SOURCE, 0, '../../admin/files/x.puml');

		self::assertSame(404, $response->getStatus());
	}

	public function testBySourceWithAFolderForAPathIs404(): void {
		$response = $this->controller($this->renderingNothing(), $this->createStub(Folder::class))->bySource(self::SOURCE, 0, 'Diagrams');

		self::assertSame(404, $response->getStatus());
	}

	/** @return array<string, array{int, string, string}> */
	public static function sentMistakes(): array {
		return [
			'on the diagram\'s own line' => [3, '2', 'Syntax Error?'],
			'inside the included file' => [2, '1', 'In parts.iuml, line 2: Syntax Error?'],
		];
	}

	/** R3, R4: the resolved source is sent, and the server's mistake comes back on the diagram's own line. */
	#[DataProvider('sentMistakes')]
	public function testBySourceWithAPathSendsTheResolvedSourceAndMapsTheErrorLine(int $sentLine, string $line, string $message): void {
		$files = [
			'Diagrams/Order flow.puml' => $this->diagram(),
			'Diagrams/parts.iuml' => $this->diagram('text/x-plantuml', "X -> Y\nZ -> W\n", 'parts1'),
		];
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml', 'Syntax Error?', $sentLine), $sent);

		$response = $this->controller($render, $files)->bySource("@startuml\n!include parts.iuml\nA -> B\n@enduml\n", 0, '/Diagrams/Order flow.puml');

		self::assertSame(200, $response->getStatus());
		self::assertSame("@startuml\nX -> Y\nZ -> W\nA -> B\n@enduml\n", $sent);
		self::assertSame($message, self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame($line, self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	/** A README fence resolves against the README's folder, though a README is no diagram. */
	public function testBySourceResolvesAgainstAReadmesFolder(): void {
		$files = [
			'Diagrams/README.md' => $this->diagram('text/markdown', "# Diagrams\n"),
			'Diagrams/parts.iuml' => $this->diagram('text/x-plantuml', "X -> Y\n", 'parts1'),
		];
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $files)->bySource("@startuml\n!include parts.iuml\n@enduml\n", 0, '/Diagrams/README.md');

		self::assertSame(200, $response->getStatus());
		self::assertSame("@startuml\nX -> Y\n@enduml\n", $sent);
	}

	/** Without a path, includes go to the server as written, as they always have. */
	public function testBySourceWithoutAPathSendsIncludesAsWritten(): void {
		$source = "@startuml\n!include parts.iuml\n@enduml\n";
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, new \LogicException('no file is read without a path'))->bySource($source);

		self::assertSame(200, $response->getStatus());
		self::assertSame($source, $sent);
		self::assertNull(self::header($response, 'X-PlantUML-Diagram-Error'));
	}

	/** R3: a file that cannot be found is a mistake on its line, sent like the server's own. */
	public function testAResolverMistakeWithACleanRenderIsSentInTheErrorHeaders(): void {
		$files = ['Diagrams/Order flow.puml' => $this->diagram()];
		$controller = $this->controller($this->rendering(new Rendered(self::SVG, 'image/svg+xml')), $files);

		$response = $controller->bySource("@startuml\n!include nope.iuml\n@enduml\n", 0, 'Diagrams/Order flow.puml');

		self::assertSame(200, $response->getStatus());
		self::assertSame(self::SVG, $response->render());
		self::assertSame('Cannot find nope.iuml', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame('1', self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	/** On the line the resolver could not read, its reason is the one that explains the server's. */
	public function testAResolverMistakeWinsOverTheServersOnItsLine(): void {
		$files = ['Diagrams/Order flow.puml' => $this->diagram()];
		$controller = $this->controller($this->rendering(new Rendered(self::SVG, 'image/svg+xml', 'Cannot include nope.iuml', 1)), $files);

		$response = $controller->bySource("@startuml\n!include nope.iuml\n@enduml\n", 0, 'Diagrams/Order flow.puml');

		self::assertSame('Cannot find nope.iuml', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame('1', self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	public function testByPathSendsTheResolvedSourceAndItsMistakes(): void {
		$files = [
			'Diagrams/Order flow.puml' => $this->diagram('text/x-plantuml', "@startuml\n!include parts.iuml\n!include nope.iuml\n@enduml\n"),
			'Diagrams/parts.iuml' => $this->diagram('text/x-plantuml', "X -> Y\n", 'parts1'),
		];
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $files)->byPath('Diagrams/Order flow.puml');

		self::assertSame("@startuml\nX -> Y\n!include nope.iuml\n@enduml\n", $sent);
		self::assertSame('Cannot find nope.iuml', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame('2', self::header($response, 'X-PlantUML-Diagram-Error-Line'));
	}

	/** @param array<string, string|array{string, string}> $includes path => ETag, or [ETag, content] */
	private function etagWith(array $includes, string $content = "@startuml\n!include parts.iuml\n@enduml\n", string $ifNoneMatch = ''): Response {
		$files = ['Diagrams/Order flow.puml' => $this->diagram('text/x-plantuml', $content)];
		foreach ($includes as $path => $include) {
			[$etag, $text] = is_array($include) ? $include : [$include, "X -> Y\n"];
			$files[$path] = $this->diagram('text/x-plantuml', $text, $etag);
		}
		return $this->controller($this->renderingSvg(), $files, $ifNoneMatch)->byPath('Diagrams/Order flow.puml');
	}

	/** A changed include is a new answer, not a 304. */
	public function testByPathEtagChangesWhenAnIncludedFileChanges(): void {
		$before = $this->etagWith(['Diagrams/parts.iuml' => 'parts1'])->getETag();
		$after = $this->etagWith(['Diagrams/parts.iuml' => 'parts2'])->getETag();

		self::assertSame(md5('abc123,parts1,'), $before);
		self::assertSame(md5('abc123,parts2,'), $after);
	}

	/** A missing include created later must change the answer too. */
	public function testByPathEtagCoversAMissingInclude(): void {
		$response = $this->etagWith([]);

		self::assertSame(md5('abc123,,parts.iuml'), $response->getETag());
	}

	public function testByPathIs304OnlyForTheEtagThatCoversTheIncludes(): void {
		$includes = ['Diagrams/parts.iuml' => 'parts1'];

		self::assertSame(200, $this->etagWith($includes, ifNoneMatch: '"abc123"')->getStatus());
		self::assertSame(304, $this->etagWith($includes, ifNoneMatch: '"' . md5('abc123,parts1,') . '"')->getStatus());
	}

	/** Nothing included: the file's own ETag, so today's caching is unchanged. */
	public function testByPathEtagIsTheFilesWhenNothingIsIncluded(): void {
		self::assertSame('abc123', $this->etagWith([], self::SOURCE)->getETag());
	}

	/** A section added later to a file already there is a new answer. */
	public function testByPathEtagCoversAFileWithoutTheSectionAskedFor(): void {
		$content = "@startuml\n!includesub parts.iuml!ACTORS\n@enduml\n";
		$before = $this->etagWith(['Diagrams/parts.iuml' => ['parts1', "!startsub OTHER\nX\n!endsub\n"]], $content)->getETag();
		$after = $this->etagWith(['Diagrams/parts.iuml' => ['parts2', "!startsub ACTORS\nX\n!endsub\n"]], $content)->getETag();

		self::assertSame(md5('abc123,parts1,'), $before);
		self::assertSame(md5('abc123,parts2,'), $after);
	}

	public function testByPathEtagChangesWhenAMissingIncludeIsCreated(): void {
		$before = $this->etagWith([])->getETag();
		$after = $this->etagWith(['Diagrams/parts.iuml' => 'parts1'])->getETag();

		self::assertSame(md5('abc123,,parts.iuml'), $before);
		self::assertSame(md5('abc123,parts1,'), $after);
	}

	/** A file with no line that could name another is never handed to the resolver. */
	public function testByPathWithNothingToIncludeNeverReadsTheFolder(): void {
		foreach (['"abc123"' => 304, '' => 200] as $ifNoneMatch => $status) {
			$file = $this->createMock(File::class);
			$file->method('getMimetype')->willReturn('text/x-plantuml');
			$file->method('getEtag')->willReturn('abc123');
			$file->method('fopen')->willReturnCallback(static function () {
				$handle = fopen('php://memory', 'r+');
				fwrite($handle, "@startuml\n' include nothing\nA -> B : <style>\n@enduml\n");
				rewind($handle);
				return $handle;
			});
			$file->expects(self::never())->method('getParent');

			$response = $this->controller($this->renderingSvg(), $file, (string)$ifNoneMatch)->byPath('Diagrams/Order flow.puml');

			self::assertSame($status, $response->getStatus());
			self::assertSame('abc123', $response->getETag());
		}
	}

	/** R2: the diagram's own file is a cycle from its first include of itself, on either route. */
	public function testTheDiagramsOwnFileIsNotIncludedInItself(): void {
		$content = "@startuml\n!include \"Order flow.puml\"\n@enduml\n";
		$files = ['Diagrams/Order flow.puml' => $this->diagram('text/x-plantuml', $content)];

		$byPath = $this->controller($this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sentByPath), $files)->byPath('Diagrams/Order flow.puml');
		$bySource = $this->controller($this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sentBySource), $files)->bySource($content, 0, 'Diagrams/Order flow.puml');

		foreach ([[$byPath, $sentByPath], [$bySource, $sentBySource]] as [$response, $sent]) {
			self::assertSame($content, $sent);
			self::assertSame('Order flow.puml includes itself', self::header($response, 'X-PlantUML-Diagram-Error'));
		}
	}

	public function testAPathTooLongForNextcloudIs404(): void {
		$path = str_repeat('a', 5000) . '.puml';
		$response = $this->controller($this->renderingNothing(), new InvalidPathException('File name is too long'))->byPath($path);

		self::assertSame(404, $response->getStatus());
	}

	/** A header is ASCII: the message goes percent-encoded, `%` and anything past ASCII. */
	public function testANonAsciiMistakeIsSentPercentEncoded(): void {
		$files = ['Diagrams/Order flow.puml' => $this->diagram()];
		$response = $this->controller($this->rendering(new Rendered(self::SVG, 'image/svg+xml')), $files)
			->bySource("@startuml\n!include Übersicht.puml\n@enduml\n", 0, 'Diagrams/Order flow.puml');

		self::assertSame('Cannot find %C3%9Cbersicht.puml', self::header($response, 'X-PlantUML-Diagram-Error'));
		self::assertSame('Cannot find Übersicht.puml', rawurldecode((string)self::header($response, 'X-PlantUML-Diagram-Error')));
	}

	public function testAnEncodedMistakeKeeps200CharactersOnceDecoded(): void {
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml', '100% ' . str_repeat('é', 300), 1));

		$header = (string)self::header($this->controller($render, new \LogicException('no file'))->bySource(self::SOURCE), 'X-PlantUML-Diagram-Error');

		self::assertStringStartsWith('100%25 %C3%A9', $header);
		self::assertSame('100% ' . str_repeat('é', 195), rawurldecode($header));
		self::assertMatchesRegularExpression('/^[\x20-\x7e]*$/', $header);
	}

	/**
	 * A file at `$path` on share S, as its recipient sees a share they may
	 * only read and whose owner forbids download.
	 */
	private function onViewOnlyShare(string $path, string $content, string $mimetype = 'text/x-plantuml'): File {
		$attributes = $this->createStub(IAttributes::class);
		$attributes->method('getAttribute')->willReturnCallback(static fn (string $scope, string $key): ?bool => [$scope, $key] === ['permissions', 'download'] ? false : null);
		$share = $this->createStub(IShare::class);
		$share->method('getAttributes')->willReturn($attributes);
		$share->method('getPermissions')->willReturn(Constants::PERMISSION_READ);
		$share->method('getId')->willReturn('S');
		$storage = $this->createStub(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturnCallback(static fn (string $class): bool => $class === 'OCA\Files_Sharing\SharedStorage');
		$storage->method('getShare')->willReturn($share);
		$storage->method('getId')->willReturn('shared::/S');
		$parent = $this->createStub(Folder::class);
		$parent->method('getPath')->willReturn('/drk/files' . (str_contains($path, '/') ? '/' . dirname($path) : ''));
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn($mimetype);
		$file->method('getEtag')->willReturn('etag:' . $path);
		$file->method('getSize')->willReturn(strlen($content));
		$file->method('fopen')->willReturnCallback(static function () use ($content) {
			$handle = fopen('php://memory', 'r+');
			self::assertIsResource($handle);
			fwrite($handle, $content);
			rewind($handle);
			return $handle;
		});
		$file->method('getParent')->willReturn($parent);
		$file->method('getPath')->willReturn("/drk/files/$path");
		$file->method('getStorage')->willReturn($storage);
		return $file;
	}

	private const FIGURES = "@startuml\nlegend\n!include secret.txt\nendlegend\n@enduml\n";
	private const README = "# Figures\n\nIts line is !include secret.txt\n\n```plantuml\n@startuml\n!include ./secret.txt\n@enduml\n```\n";

	/** @return array<string, array<string, File>> a view-only share S: a diagram, a README and the secret beside them */
	private function viewOnlyShare(): array {
		return [
			'Shared/Figures.puml' => $this->onViewOnlyShare('Shared/Figures.puml', self::FIGURES),
			'Shared/README.md' => $this->onViewOnlyShare('Shared/README.md', self::README, 'text/markdown'),
			'Shared/secret.txt' => $this->onViewOnlyShare('Shared/secret.txt', "TOP SECRET\n", 'text/plain'),
		];
	}

	/** @return array<string, array{string, string}> */
	public static function foreignSources(): array {
		return [
			'a diagram as its base' => ["@startuml\nlegend\n!include secret.txt\nendlegend\n@enduml\nA -> B\n", 'Shared/Figures.puml'],
			'a README as its base' => ["@startuml\nlegend\n!include secret.txt\nendlegend\n@enduml\n", 'Shared/README.md'],
			'the end of a README line' => ['!include secret.txt', 'Shared/README.md'],
		];
	}

	/** Z4: the reader writes what POST sends, so it takes nothing from the share its base is on. */
	#[DataProvider('foreignSources')]
	public function testBySourceOfTheReadersOwnTextCannotReadAViewOnlyShare(string $source, string $base): void {
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $this->viewOnlyShare())->bySource($source, 0, $base);

		self::assertSame(200, $response->getStatus());
		self::assertStringNotContainsString('TOP SECRET', (string)$sent);
		self::assertSame('Cannot read secret.txt', self::header($response, 'X-PlantUML-Diagram-Error'));
	}

	/** The editor's preview of a shared diagram left as it is draws as GET draws it. */
	public function testBySourceOfTheBasesOwnContentReadsItsShare(): void {
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $this->viewOnlyShare())->bySource(self::FIGURES, 0, 'Shared/Figures.puml');

		self::assertSame("@startuml\nlegend\nTOP SECRET\nendlegend\n@enduml\n", $sent);
		self::assertNull(self::header($response, 'X-PlantUML-Diagram-Error'));
	}

	/** A fence of a shared README is the owner's text too, so it draws the files beside it. */
	public function testBySourceOfAReadmesOwnFenceReadsItsShare(): void {
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $this->viewOnlyShare())->bySource("@startuml\n!include ./secret.txt\n@enduml", 0, 'Shared/README.md');

		self::assertSame("@startuml\nTOP SECRET\n@enduml", $sent);
		self::assertNull(self::header($response, 'X-PlantUML-Diagram-Error'));
	}

	/** Z4: a file shared on its own is never drawn as a style of itself (the resolver refuses its own file too). */
	public function testBySourceNeverReadsItsBaseAsAStyle(): void {
		$files = ['Figures.txt' => $this->onViewOnlyShare('Figures.txt', "TOP SECRET\n", 'text/plain')];
		$render = $this->rendering(new Rendered(self::SVG, 'image/svg+xml'), $sent);

		$response = $this->controller($render, $files)->bySource("@startuml\n<style file=Figures.txt>\n@enduml\n", 0, 'Figures.txt');

		self::assertStringNotContainsString('TOP SECRET', (string)$sent);
		self::assertSame('Cannot read Figures.txt', self::header($response, 'X-PlantUML-Diagram-Error'));
	}
}
