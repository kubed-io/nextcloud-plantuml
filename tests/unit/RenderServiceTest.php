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
use OCP\ICache;
use OCP\ICacheFactory;
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

	/** What every test's cache holds; one per test, so a cached list never leaks across. */
	private ICache $cache;

	protected function setUp(): void {
		$this->cache = new class implements ICache {
			/** @var array<string,mixed> */
			public array $values = [];

			/** @var array<string,int> */
			public array $ttls = [];

			public function get($key) {
				return $this->values[$key] ?? null;
			}

			public function set($key, $value, $ttl = 0) {
				$this->values[$key] = $value;
				$this->ttls[$key] = $ttl;
				return true;
			}

			public function hasKey($key) {
				return isset($this->values[$key]);
			}

			public function remove($key) {
				unset($this->values[$key]);
				return true;
			}

			public function clear($prefix = '') {
				$this->values = [];
				return true;
			}

			public static function isAvailable(): bool {
				return true;
			}
		};
	}

	private function service(IClient $client, string $url = self::URL): RenderService {
		$clients = $this->createStub(IClientService::class);
		$clients->method('newClient')->willReturn($client);
		return $this->serviceWith($clients, $url);
	}

	private function serviceWith(IClientService $clients, string $url): RenderService {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn($url);
		$caches = $this->createStub(ICacheFactory::class);
		$caches->method('createDistributed')->willReturn($this->cache);
		return new RenderService(new ServerConfig($config), $clients, $caches, new NullLogger());
	}

	/** `help themes` as plantuml/plantuml-server 1.2026.8 answers it, trailing padding trimmed. */
	private static function helpThemes(): string {
		return (string)file_get_contents(__DIR__ . '/fixtures/help-themes.txt');
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

	public function testRendersTheDiagramAtAnIndex(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/svg/2', self::callback(static fn (array $options): bool => $options['body'] === self::SOURCE))
			->willReturn($this->response(200, '<svg/>', ['Content-Type' => 'image/svg+xml']));

		$rendered = $this->service($client)->render(self::SOURCE, 2);

		self::assertSame('<svg/>', $rendered->body);
	}

	public function testIndexZeroPostsToSvgAsBefore(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/svg')
			->willReturn($this->response(200, '<svg/>', ['Content-Type' => 'image/svg+xml']));

		$this->service($client)->render(self::SOURCE, 0);
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

	/** A catch-all web server answering any POST with a page is not PlantUML. */
	public function testHtmlAnswerToSvgIsNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html></html>', ['Content-Type' => 'text/html'])));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE)));
	}

	/** The image is what makes it a render, header or not. */
	public function testImageAnswerWith400IsRendered(): void {
		$service = $this->service($this->clientAnswering($this->response(400, '<svg/>', ['Content-Type' => 'image/svg+xml'])));

		self::assertSame('<svg/>', $service->render(self::SOURCE)->body);
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

	public function testThemesAreTheNamesTheServerLists(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/txt', self::callback(
				static fn (array $options): bool => $options['body'] === "@startuml\nhelp themes\n@enduml\n",
			))
			->willReturn($this->response(200, self::helpThemes()));

		$themes = $this->service($client)->themes();

		self::assertCount(44, $themes);
		self::assertSame(['_none_', 'amiga', 'aws-orange', 'black-knight'], array_slice($themes, 0, 4));
		self::assertSame('vibrant', end($themes));
		self::assertContains('cerulean-outline', $themes);
		self::assertContains('reddress-lightorange', $themes);
		self::assertNotContains('themes', $themes);
		self::assertNotContains(':', $themes);
	}

	public function testThemesKeepOnlyNamesNotTextAfterTheList(): void {
		$body = self::helpThemes() . "\n\nSee https://plantuml.com/theme (more soon!)\n" . str_repeat('x', 80) . "\n";
		$themes = $this->service($this->clientAnswering($this->response(200, $body)))->themes();

		self::assertCount(45, $themes); // the 44, and the one bare word "See"
		self::assertNotContains('https://plantuml.com/theme', $themes);
		self::assertNotContains('(more', $themes);
		self::assertNotContains(str_repeat('x', 80), $themes);
	}

	public function testThemesAreAskedOncePerServerForADay(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::exactly(2))->method('post')->willReturn($this->response(200, self::helpThemes()));

		$this->service($client)->themes();
		$cached = $this->service($client)->themes();
		$this->service($client, 'https://other.example.com')->themes();

		self::assertCount(44, $cached);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testThemesWithoutTheListAreNotPlantumlAndNotCached(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->themes()));
		self::assertSame([], $this->cache->values);
	}

	public function testThemesAnswered404AreNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(404, self::helpThemes())));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->themes()));
	}

	public function testThemesFromAnUnsetOrUnreachableServer(): void {
		$clients = $this->createStub(IClientService::class);

		self::assertSame(RenderException::PROBLEM_NOT_SET, $this->problemOf(fn () => $this->serviceWith($clients, '')->themes()));
		$down = $this->service($this->clientAnswering(new \Exception('cURL error 7')));
		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $down->themes()));
	}

	/** `listopeniconic` as plantuml/plantuml-server 1.2026.8 draws it to SVG, the icons' paths removed. */
	private static function listOpenIconic(): string {
		return (string)file_get_contents(__DIR__ . '/fixtures/listopeniconic.svg');
	}

	public function testIconsAreTheNamesTheServerDraws(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/svg', self::callback(
				static fn (array $options): bool => $options['body'] === "@startuml\nlistopeniconic\n@enduml\n",
			))
			->willReturn($this->response(200, self::listOpenIconic(), ['Content-Type' => 'image/svg+xml']));

		$icons = $this->service($client)->icons();

		self::assertCount(223, $icons);
		self::assertSame(['account-login', 'account-logout', 'action-redo'], array_slice($icons, 0, 3));
		self::assertSame('zoom-out', end($icons));
		self::assertContains('clock', $icons);
		self::assertNotContains('List Open Iconic', $icons);
		self::assertNotContains('https://useiconic.com/open', $icons);
	}

	public function testIconsAreOnlyNameLikeTextUniqueSortedAndCapped(): void {
		$texts = '<text>zeta</text><text>&lt;b&gt;</text><text>alpha</text><text>alpha</text><text>Two words</text>';
		for ($i = 0; $i < 600; $i++) {
			$texts .= sprintf('<text x="1">n%03d</text>', $i);
		}
		$icons = $this->service($this->clientAnswering($this->response(200, "<svg>{$texts}</svg>")))->icons();

		self::assertCount(500, $icons);
		self::assertSame(['alpha', 'n000'], array_slice($icons, 0, 2));
		self::assertNotContains('<b>', $icons);
	}

	public function testIconsAreAskedOncePerServerForADay(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::exactly(2))->method('post')->willReturn($this->response(200, self::listOpenIconic()));

		$this->service($client)->icons();
		$cached = $this->service($client)->icons();
		$this->service($client, 'https://other.example.com')->icons();

		self::assertCount(223, $cached);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testIconsWithoutNamesOrAnswered404AreNotPlantumlAndNotCached(): void {
		$page = $this->service($this->clientAnswering($this->response(200, '<html><body>Welcome</body></html>')));
		$missing = $this->service($this->clientAnswering($this->response(404, self::listOpenIconic())));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $page->icons()));
		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $missing->icons()));
		self::assertSame([], $this->cache->values);
	}

	/**
	 * `emoji [block]` as plantuml/plantuml-server 1.2026.8 answers it as text, padding squeezed.
	 * With no block it answers block 26 and names every block it has.
	 */
	private static function emojiBlock(string $block): string {
		$name = $block === '' ? 'emoji' : "emoji-{$block}";
		return (string)file_get_contents(__DIR__ . "/fixtures/{$name}.txt");
	}

	/**
	 * A client answering each `emoji` diagram from its fixture, and noting the blocks asked for.
	 *
	 * @param list<string> $asked
	 * @param array<string,IResponse> $instead a block's answer replaced
	 */
	private function emojiServer(array &$asked, array $instead = []): IClient {
		$client = $this->createStub(IClient::class);
		$client->method('post')->willReturnCallback(function (string $url, array $options) use (&$asked, $instead): IResponse {
			self::assertStringEndsWith('/txt', $url);
			self::assertSame(1, preg_match('/^@startuml\nemoji(?: (\w+))?\n@enduml\n$/', $options['body'], $m));
			$m[1] ??= '';
			$asked[] = $m[1];
			return $instead[$m[1]] ?? $this->response(200, self::emojiBlock($m[1]));
		});
		return $client;
	}

	public function testEmojiAreTheNamesInEveryBlockTheServerHas(): void {
		$asked = [];

		$emoji = $this->service($this->emojiServer($asked))->emoji();

		self::assertSame(['', '27', '1F3', '1F4', '1F5', '1F6', '1F9'], $asked);
		self::assertCount(1163, $emoji);
		self::assertSame(['100', '1234', '1st_place_medal'], array_slice($emoji, 0, 3));
		self::assertSame('zzz', end($emoji));
		foreach (['sunny', 'scissors', 'pinched_fingers', 'abcd', '8ball'] as $name) {
			self::assertContains($name, $emoji);
		}
		// Each emoji is listed under its code point too; those are not names.
		self::assertNotContains('2600', $emoji);
		self::assertNotContains('1f90c', $emoji);
	}

	public function testEmojiAreAskedOncePerServerForADay(): void {
		$asked = [];
		$client = $this->emojiServer($asked);

		$this->service($client)->emoji();
		$this->service($client)->emoji();
		$this->service($client, 'https://other.example.com')->emoji();

		self::assertCount(14, $asked);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testEmojiAndTheirBlocksAreCapped(): void {
		$names = implode(' ', array_map(static fn (int $i): string => sprintf('<:e%04d:>', $i), range(1, 2500)));
		$blocks = implode(', ', array_map(static fn (int $i): string => sprintf('%X', 0x1F00 + $i), range(0, 39)));
		$client = $this->createMock(IClient::class);
		$client->expects(self::exactly(16))->method('post')
			->willReturn($this->response(200, "Emoji available on Unicode Block 1F00\n(Blocks available: {$blocks})\n{$names}\n"));

		self::assertCount(2000, $this->service($client)->emoji());
	}

	public function testEmojiWhenABlockFailsAreNotPlantumlAndNotCached(): void {
		$asked = [];
		$service = $this->service($this->emojiServer($asked, ['1F5' => $this->response(500, 'Internal Server Error')]));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->emoji()));
		self::assertSame([], $this->cache->values);
	}

	public function testEmojiWithoutTheirBlocksAreNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->emoji()));
	}

	public function testIconsAndEmojiFromAnUnsetOrUnreachableServer(): void {
		$unset = $this->serviceWith($this->createStub(IClientService::class), '');
		$down = $this->service($this->clientAnswering(new \Exception('cURL error 7')));

		self::assertSame(RenderException::PROBLEM_NOT_SET, $this->problemOf(fn () => $unset->icons()));
		self::assertSame(RenderException::PROBLEM_NOT_SET, $this->problemOf(fn () => $unset->emoji()));
		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $down->icons()));
		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $down->emoji()));
	}

	/** The header counts lines from 0 at the top of the source sent. */
	public function testDiagramErrorCarriesTheServersMessageAndLine(): void {
		$service = $this->service($this->clientAnswering($this->response(400, '<svg/>', [
			'Content-Type' => 'image/svg+xml',
			'X-PlantUML-Diagram-Error' => 'Syntax Error? (Assumed diagram type: sequence)',
			'X-PlantUML-Diagram-Error-Line' => '2',
		])));

		$rendered = $service->render("@startuml\nA -> B\nthis is (( bad\n@enduml\n");

		self::assertSame('Syntax Error? (Assumed diagram type: sequence)', $rendered->error);
		self::assertSame(2, $rendered->errorLine);
	}

	public function testACleanRenderHasNoError(): void {
		$rendered = $this->service($this->clientAnswering($this->response(200, '<svg/>', ['Content-Type' => 'image/svg+xml'])))->render(self::SOURCE);

		self::assertSame('', $rendered->error);
		self::assertNull($rendered->errorLine);
	}

	/** It is forwarded as a header, so it is kept to one short line and a number. */
	public function testDiagramErrorIsOneShortLine(): void {
		$service = $this->service($this->clientAnswering($this->response(400, '<svg/>', [
			'Content-Type' => 'image/svg+xml',
			'X-PlantUML-Diagram-Error' => "Cannot load\r\nX-Injected: 1\t" . str_repeat('x', 400),
			'X-PlantUML-Diagram-Error-Line' => '2; drop',
		])));

		$rendered = $service->render(self::SOURCE);

		self::assertStringStartsWith('Cannot load X-Injected: 1 x', $rendered->error);
		self::assertSame(200, mb_strlen($rendered->error));
		self::assertNull($rendered->errorLine);
	}

	public function testAdminMessages(): void {
		self::assertSame('Server URL is not set', (new RenderException(RenderException::PROBLEM_NOT_SET))->adminMessage());
		self::assertSame('Server is unreachable', (new RenderException(RenderException::PROBLEM_UNREACHABLE))->adminMessage());
		self::assertSame('Server is not a PlantUML server', (new RenderException(RenderException::PROBLEM_NOT_PLANTUML))->adminMessage());
	}
}
