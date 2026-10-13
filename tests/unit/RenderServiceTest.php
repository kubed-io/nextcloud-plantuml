<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\RenderService;
use OCA\PlantUml\Service\ServerConfig;
use OCP\Http\Client\IClient;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use OCP\Http\Client\LocalServerException;
use OCP\IAppConfig;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

/**
 * The response shapes below are what plantuml/plantuml-server answers, read off
 * a live one: 200 + SVG for a diagram, 400 + SVG + X-PlantUML-Diagram-Error for
 * a diagram with a mistake in it, 405/404 from anything else.
 */
final class RenderServiceTest extends TestCase {
	private const URL = 'https://p.example.com';
	private const SOURCE = "@startuml\nCustomer -> Shop : place order\n@enduml\n";

	private function service(IClient $client, string $url = self::URL): RenderService {
		$clients = $this->createStub(IClientService::class);
		$clients->method('newClient')->willReturn($client);
		return $this->serviceWith($clients, $url);
	}

	private function serviceWith(IClientService $clients, string $url): RenderService {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn($url);
		return new RenderService(new ServerConfig($config), $clients, new NullLogger());
	}

	/** A client whose every POST answers (or throws) the same. */
	private function clientAnswering(IResponse|\Throwable $answer): IClient {
		$client = $this->createStub(IClient::class);
		if ($answer instanceof \Throwable) {
			$client->method('post')->willThrowException($answer);
		} else {
			$client->method('post')->willReturn($answer);
		}
		return $client;
	}

	/** @param array<string,string> $headers */
	private function response(int $status, string $body, array $headers = []): IResponse {
		$response = $this->createStub(IResponse::class);
		$response->method('getStatusCode')->willReturn($status);
		$response->method('getBody')->willReturn($body);
		$response->method('getHeader')->willReturnCallback(
			static fn (string $key): string => $headers[$key] ?? '',
		);
		return $response;
	}

	private function problemOf(callable $call): string {
		try {
			$call();
		} catch (RenderException $e) {
			return $e->getProblem();
		}
		self::fail('expected a RenderException');
	}

	public function testRenderPostsSourceToSvg(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/svg', self::callback(static function (array $options): bool {
				return $options['body'] === self::SOURCE
					&& $options['timeout'] === 10
					&& $options['http_errors'] === false
					&& $options['nextcloud'] === ['allow_local_address' => true];
			}))
			->willReturn($this->response(200, '<svg/>', ['Content-Type' => 'image/svg+xml']));

		$rendered = $this->service($client)->render(self::SOURCE);

		self::assertSame('<svg/>', $rendered->body);
		self::assertSame('image/svg+xml', $rendered->contentType);
	}

	public function testUnsetUrlIsNotSet(): void {
		$clients = $this->createMock(IClientService::class);
		$clients->expects(self::never())->method('newClient');

		self::assertSame(RenderException::PROBLEM_NOT_SET, $this->problemOf(fn () => $this->serviceWith($clients, '')->render(self::SOURCE)));
	}

	public function testConnectFailureIsUnreachable(): void {
		$service = $this->service($this->clientAnswering(new \Exception('cURL error 7')));

		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $service->render(self::SOURCE)));
	}

	public function testLocalServerExceptionIsUnreachable(): void {
		$service = $this->service($this->clientAnswering(new LocalServerException('Host violates local access rules')));

		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $service->render(self::SOURCE)));
	}

	public function testHttp405IsNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(405, 'Method Not Allowed')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE)));
	}

	public function testHttp404IsNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(404, 'Not Found')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE)));
	}

	/** PlantUML draws a mistake into the image and answers it with a 400. */
	public function testDiagramErrorIsStillRendered(): void {
		$service = $this->service($this->clientAnswering($this->response(400, '<svg>Syntax Error?</svg>', [
			'Content-Type' => 'image/svg+xml',
			'X-PlantUML-Diagram-Error' => 'Syntax Error? (Assumed diagram type: sequence)',
		])));

		$rendered = $service->render("@startuml\nthis is not valid ((\n@enduml\n");

		self::assertSame('<svg>Syntax Error?</svg>', $rendered->body);
		self::assertSame('image/svg+xml', $rendered->contentType);
	}

	public function testVersionParsesTxt(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/txt', self::callback(
				static fn (array $options): bool => $options['body'] === "@startuml\nversion\n@enduml\n",
			))
			->willReturn($this->response(200, "     PlantUML   1.2026.8   \n     Git Commit   149874a\n"));

		self::assertSame('1.2026.8', $this->service($client)->version());
	}

	public function testVersionWithoutMarkerIsNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->version()));
	}

	public function testAdminMessages(): void {
		self::assertSame('Server URL is not set', (new RenderException(RenderException::PROBLEM_NOT_SET))->adminMessage());
		self::assertSame('Server is unreachable', (new RenderException(RenderException::PROBLEM_UNREACHABLE))->adminMessage());
		self::assertSame('Server is not a PlantUML server', (new RenderException(RenderException::PROBLEM_NOT_PLANTUML))->adminMessage());
	}
}
