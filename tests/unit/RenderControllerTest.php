<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Controller\RenderController;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\Rendered;
use OCA\PlantUml\Service\RenderService;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

final class RenderControllerTest extends TestCase {
	private const SOURCE = "@startuml\nCustomer -> Shop : place order\n@enduml\n";
	private const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Customer</text></svg>';

	private function controller(RenderService $render, Node|\Throwable $resolved, string $ifNoneMatch = ''): RenderController {
		$folder = $this->createStub(Folder::class);
		if ($resolved instanceof \Throwable) {
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
		return new RenderController('plantuml', $request, $render, $root, $session);
	}

	private function diagram(string $mimetype = 'text/x-plantuml'): File {
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn($mimetype);
		$file->method('getEtag')->willReturn('abc123');
		$file->method('getContent')->willReturn(self::SOURCE);
		return $file;
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

	/** getHeaders() asks the server container for the request id; read the set headers directly. */
	private static function header(Response $response, string $name): ?string {
		return \Closure::bind(fn () => $this->headers[$name] ?? null, $response, Response::class)();
	}

	public function testPathOutsideUserFolderIs404(): void {
		$response = $this->controller($this->renderingNothing(), new NotFoundException())->byPath('../other/x.puml');

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
		$render->expects(self::once())->method('render')->with(self::SOURCE)->willReturn(new Rendered(self::SVG, 'image/svg+xml'));

		$response = $this->controller($render, new NotFoundException())->bySource(self::SOURCE);

		self::assertSame(200, $response->getStatus());
		self::assertSame(self::SVG, $response->render());
		self::assertSame('image/svg+xml', self::header($response, 'Content-Type'));
	}

	public function testBySourceServerProblemIs503WithProblem(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('render')->willThrowException(new RenderException(RenderException::PROBLEM_NOT_SET));

		$response = $this->controller($render, new NotFoundException())->bySource(self::SOURCE);

		self::assertSame(503, $response->getStatus());
		self::assertInstanceOf(JSONResponse::class, $response);
		self::assertSame(['problem' => 'not set'], $response->getData());
	}

	public function testSyntaxErrorIsStillAnImage(): void {
		$errorImage = '<svg xmlns="http://www.w3.org/2000/svg"><text>Syntax Error?</text></svg>';

		$response = $this->controller($this->renderingSvg($errorImage), $this->diagram())->byPath('Diagrams/broken.puml');

		self::assertSame(200, $response->getStatus());
		self::assertSame($errorImage, $response->render());
	}
}
