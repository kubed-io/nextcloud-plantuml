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
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
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

	private function serviceWith(IClientService $clients, string $url, ?LoggerInterface $logger = null): RenderService {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn($url);
		$caches = $this->createStub(ICacheFactory::class);
		$caches->method('createDistributed')->willReturn($this->cache);
		return new RenderService(new ServerConfig($config), $clients, $caches, $logger ?? new NullLogger());
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

	/** @return array<string, array{string, int, string, string}> */
	public static function formats(): array {
		return [
			'svg' => ['svg', 0, 'image/svg+xml', '/svg'],
			'png past the first' => ['png', 2, 'image/png', '/png/2'],
			'pdf' => ['pdf', 1, 'application/pdf', '/pdf/1'],
			'eps' => ['eps', 0, 'application/postscript', '/eps'],
			'text with a charset' => ['txt', 3, 'text/plain;charset=utf-8', '/txt/3'],
		];
	}

	#[DataProvider('formats')]
	public function testDrawsInTheFormatAsked(string $format, int $index, string $answered, string $path): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())->method('post')
			->with(self::URL . $path, self::anything())
			->willReturn($this->response(200, 'BODY', ['Content-Type' => $answered]));

		$rendered = $this->service($client)->render(self::SOURCE, $index, $format);

		self::assertSame('BODY', $rendered->body);
		self::assertSame($answered, $rendered->contentType);
	}

	public function testAPageWhereAPdfWasAskedIsNotPlantUml(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>', ['Content-Type' => 'text/html'])));
		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE, 0, 'pdf')));
	}

	public function testAPastTheEndIndexIsNotPlantUml(): void {
		$service = $this->service($this->clientAnswering($this->response(400, '', ['Content-Type' => 'text/html;charset=iso-8859-1'])));
		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->render(self::SOURCE, 5, 'pdf')));
	}

	public function testAnUnknownFormatIsNeverSent(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::never())->method('post');
		$this->expectException(\InvalidArgumentException::class);
		$this->service($client)->render(self::SOURCE, 0, 'latex');
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

	/**
	 * A client answering `help keywords` and `help types`, and noting what it was asked.
	 *
	 * @param list<string> $asked
	 */
	private function keywordsServer(array &$asked, ?string $keywords = null, int $status = 200): IClient {
		$client = $this->createStub(IClient::class);
		$client->method('post')->willReturnCallback(function (string $url, array $options) use (&$asked, $keywords, $status): IResponse {
			$asked[] = substr($url, strlen(self::URL)) . ' ' . $options['body'];
			return str_contains($options['body'], 'help types')
				? $this->response($status, (string)file_get_contents(__DIR__ . '/fixtures/help-types.txt'))
				: $this->response($status, $keywords ?? (string)file_get_contents(__DIR__ . '/fixtures/help-keywords.txt'));
		});
		return $client;
	}

	public function testKeywordsAreTheServersLists(): void {
		$asked = [];

		$lists = $this->service($this->keywordsServer($asked))->keywords();

		self::assertSame(
			["/txt @startuml\nhelp keywords\n@enduml\n", "/txt @startuml\nhelp types\n@enduml\n"],
			$asked,
		);
		self::assertSame(['diagrams', 'types', 'keywords'], array_keys($lists));
		self::assertCount(30, $lists['diagrams']);
		self::assertSame(['board', 'bpm', 'chart'], array_slice($lists['diagrams'], 0, 3));
		self::assertContains('uml', $lists['diagrams']);
		self::assertContains('creole', $lists['diagrams']);
		self::assertContains('files', $lists['diagrams']);
		self::assertCount(53, $lists['types']);
		foreach (['actor', 'usecase', 'json'] as $type) {
			self::assertContains($type, $lists['types']);
		}
		foreach (['alt', 'hnote', 'newpage', 'left to right direction', 'floating note', 'v2-axis'] as $keyword) {
			self::assertContains($keyword, $lists['keywords']);
		}
		foreach ($lists as $list) {
			foreach ($list as $word) {
				self::assertStringNotContainsString('@', $word);
			}
		}
		self::assertSame($lists['keywords'], array_values(array_unique($lists['keywords'])));
	}

	public function testKeywordsKeepOnlyLinesThatLookLikeKeywords(): void {
		$body = (string)file_get_contents(__DIR__ . '/fixtures/help-keywords.txt')
			. "\n  See https://plantuml.com/ (more soon!)\n" . str_repeat('x', 80) . "\n";
		$asked = [];

		$lists = $this->service($this->keywordsServer($asked, $body))->keywords();

		self::assertNotContains('See https://plantuml.com/ (more soon!)', $lists['keywords']);
		self::assertNotContains(str_repeat('x', 80), $lists['keywords']);
		self::assertContains('while', $lists['keywords']);
	}

	public function testKeywordsAreAskedOncePerServerForADay(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::exactly(4))->method('post')->willReturnCallback(
			fn (string $url, array $options): IResponse => $this->response(200, (string)file_get_contents(
				__DIR__ . '/fixtures/' . (str_contains($options['body'], 'help types') ? 'help-types.txt' : 'help-keywords.txt'),
			)),
		);

		$this->service($client)->keywords();
		$cached = $this->service($client)->keywords();
		$this->service($client, 'https://other.example.com')->keywords();

		self::assertCount(30, $cached['diagrams']);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testKeywordsWithoutTheListAreNotPlantumlAndNotCached(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->keywords()));
		self::assertSame([], $this->cache->values);
	}

	public function testKeywordsAnswered404AreNotPlantuml(): void {
		$asked = [];
		$service = $this->service($this->keywordsServer($asked, null, 404));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->keywords()));
	}

	/** `help font` as text, as plantuml/plantuml-server answers it. */
	private static function helpFont(): string {
		return (string)file_get_contents(__DIR__ . '/fixtures/help-font.txt');
	}

	public function testFontsAreTheServersList(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/txt', self::callback(
				static fn (array $options): bool => $options['body'] === "@startuml\nhelp font\n@enduml\n",
			))
			->willReturn($this->response(200, self::helpFont()));

		$fonts = $this->service($client)->fonts();

		self::assertCount(25, $fonts);
		self::assertSame('DejaVu Sans', $fonts[0]);
		foreach (['DejaVu Sans', 'DejaVu Sans Mono', 'Dialog', 'Noto Sans Mono CJK TC', 'SansSerif'] as $font) {
			self::assertContains($font, $fonts);
		}
		foreach ($fonts as $font) {
			self::assertSame(trim($font), $font);
			self::assertNotSame('', $font);
		}
		self::assertNotContains('Help on font', $fonts);
		self::assertNotContains('The possible font on your system are :', $fonts);
		$sorted = array_values(array_unique($fonts));
		sort($sorted, SORT_STRING);
		self::assertSame($sorted, $fonts, 'the server lists them unsorted; the answer is sorted and once each');
	}

	public function testFontsKeepPunctuationAndOnlyOnce(): void {
		$body = self::helpFont() . "            Nimbus Sans L (X)\n            Foo's & Bar+Baz.Q\n            Dialog\n"
			. "            <b>Tagged</b>\n";

		$fonts = $this->service($this->clientAnswering($this->response(200, $body)))->fonts();

		self::assertContains('Nimbus Sans L (X)', $fonts);
		self::assertContains("Foo's & Bar+Baz.Q", $fonts);
		self::assertSame(1, count(array_keys($fonts, 'Dialog', true)));
		self::assertNotContains('<b>Tagged</b>', $fonts);
		self::assertCount(27, $fonts);
	}

	public function testFontsAreAskedOncePerServerForADay(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::exactly(2))->method('post')->willReturn($this->response(200, self::helpFont()));

		$this->service($client)->fonts();
		$cached = $this->service($client)->fonts();
		$this->service($client, 'https://other.example.com')->fonts();

		self::assertCount(25, $cached);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testFontsWithoutTheListAreNotPlantumlAndNotCached(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->fonts()));
		self::assertSame([], $this->cache->values);
	}

	public function testFontsAnswered404AreNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(404, self::helpFont())));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->fonts()));
	}

	/** `stdlib` as text, raw: each library is three indented lines, blank lines between. */
	private static function stdlibText(): string {
		return (string)file_get_contents(__DIR__ . '/fixtures/stdlib.txt');
	}

	public function testStdlibIsTheServersLibraries(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())
			->method('post')
			->with(self::URL . '/txt', self::callback(
				static fn (array $options): bool => $options['body'] === "@startuml\nstdlib\n@enduml\n",
			))
			->willReturn($this->response(200, self::stdlibText()));

		$libraries = $this->service($client)->stdlib();

		self::assertCount(34, $libraries);
		self::assertSame(
			['name' => 'adaml', 'version' => '0.1.2', 'source' => 'https://github.com/rocher/AdaML'],
			$libraries[0],
		);
		self::assertContains(
			['name' => 'c4', 'version' => '2.13.0', 'source' => 'https://github.com/plantuml-stdlib/C4-PlantUML'],
			$libraries,
		);
		self::assertContains(
			['name' => 'material7', 'version' => '7.4.47', 'source' => 'https://github.com/Templarian/MaterialDesign-SVG/'],
			$libraries,
		);
		self::assertSame('tupadr3', $libraries[33]['name']);
		$names = array_column($libraries, 'name');
		self::assertSame(array_values(array_unique($names)), $names);
	}

	public function testStdlibSkipsWhatIsNotALibraryEntry(): void {
		$body = "     stray words here\n\n     orphan\n     Version 1.0\n     Nope https://x.example\n"
			. "     good\n     Version 2.1\n     Delivered by https://x.example/good\n";

		$libraries = $this->service($this->clientAnswering($this->response(200, $body)))->stdlib();

		self::assertSame([['name' => 'good', 'version' => '2.1', 'source' => 'https://x.example/good']], $libraries);
	}

	public function testStdlibIsAskedOncePerServerForADay(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::exactly(2))->method('post')->willReturn($this->response(200, self::stdlibText()));

		$this->service($client)->stdlib();
		$cached = $this->service($client)->stdlib();
		$this->service($client, 'https://other.example.com')->stdlib();

		self::assertCount(34, $cached);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testStdlibWithoutLibrariesIsNotPlantumlAndNotCached(): void {
		$service = $this->service($this->clientAnswering($this->response(200, '<html>')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->stdlib()));
		self::assertSame([], $this->cache->values);
	}

	public function testStdlibAnswered404IsNotPlantuml(): void {
		$service = $this->service($this->clientAnswering($this->response(404, self::stdlibText())));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $service->stdlib()));
	}

	public function testThemesFromAnUnsetOrUnreachableServer(): void {
		$clients = $this->createStub(IClientService::class);

		self::assertSame(RenderException::PROBLEM_NOT_SET, $this->problemOf(fn () => $this->serviceWith($clients, '')->themes()));
		$down = $this->service($this->clientAnswering(new \Exception('cURL error 7')));
		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $down->themes()));
	}

	/** `help colors` as text and `colors` as SVG, as plantuml/plantuml-server 1.2026.8 answers them. */
	private static function colorsFixture(string $name): string {
		return (string)file_get_contents(__DIR__ . "/fixtures/{$name}");
	}

	/**
	 * A client answering `help colors` and `colors`, and noting what it was asked.
	 *
	 * @param list<string> $asked
	 */
	private function colorsServer(array &$asked, ?IResponse $text = null, ?IResponse $svg = null): IClient {
		$client = $this->createStub(IClient::class);
		$client->method('post')->willReturnCallback(function (string $url, array $options) use (&$asked, $text, $svg): IResponse {
			$asked[] = substr($url, strlen(self::URL)) . ' ' . $options['body'];
			return str_ends_with($url, '/txt')
				? $text ?? $this->response(200, self::colorsFixture('help-colors.txt'))
				: $svg ?? $this->response(200, self::colorsFixture('colors.svg'), ['Content-Type' => 'image/svg+xml']);
		});
		return $client;
	}

	public function testColorsAreTheNamesTheServerListsWithTheHexItDraws(): void {
		$asked = [];

		$colors = $this->service($this->colorsServer($asked))->colors();

		self::assertSame(["/txt @startuml\nhelp colors\n@enduml\n", "/svg @startuml\ncolors\n@enduml\n"], $asked);
		self::assertCount(154, $colors);
		self::assertSame(['APPLICATION', 'AliceBlue', 'AntiqueWhite'], array_slice(array_keys($colors), 0, 3));
		self::assertSame('#F0F8FF', $colors['AliceBlue']);
		self::assertSame('#C2F0FF', $colors['APPLICATION']);
		// The drawing writes some as three digits; they come back as six.
		self::assertSame('#FF0000', $colors['Red']);
		self::assertSame('#778899', $colors['LightSlateGray']);
		self::assertSame('#9ACD32', $colors['YellowGreen']);
		self::assertNotContains('possible', array_keys($colors));
	}

	public function testAColorTheDrawingLacksHasNoHex(): void {
		$asked = [];
		$svg = $this->response(200, '<svg><rect x="0" fill="#F0F8FF" style="stroke:#F0F8FF;"/><text x="5">AliceBlue</text><text>Red</text></svg>');

		$colors = $this->service($this->colorsServer($asked, svg: $svg))->colors();

		self::assertCount(154, $colors);
		self::assertSame('#F0F8FF', $colors['AliceBlue']);
		self::assertArrayHasKey('Red', $colors);
		self::assertNull($colors['Red']);
	}

	public function testColorsAreOnlyNameLikeWordsAndCapped(): void {
		$asked = [];
		$names = implode("\n", array_map(static fn (int $i): string => sprintf('C%03d', $i), range(1, 600)));
		$text = $this->response(200, "Help on colors\n The possible colors are :\n 1st <b> Two-words\n{$names}\n");

		$colors = $this->service($this->colorsServer($asked, $text))->colors();

		self::assertCount(500, $colors);
		self::assertSame('C001', array_key_first($colors));
	}

	public function testColorsAreAskedOncePerServerForADay(): void {
		$asked = [];
		$client = $this->colorsServer($asked);

		$this->service($client)->colors();
		$cached = $this->service($client)->colors();
		$this->service($client, 'https://other.example.com')->colors();

		self::assertCount(4, $asked);
		self::assertSame('#F0F8FF', $cached['AliceBlue']);
		self::assertSame([86400, 86400], array_values($this->cache->ttls));
	}

	public function testColorsWithoutTheListOrADrawingAreNotPlantumlAndNotCached(): void {
		$asked = [];
		$page = $this->service($this->colorsServer($asked, $this->response(200, '<html>')));
		$noText = $this->service($this->colorsServer($asked, $this->response(404, self::colorsFixture('help-colors.txt'))));
		$noSvg = $this->service($this->colorsServer($asked, svg: $this->response(500, 'Internal Server Error')));

		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $page->colors()));
		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $noText->colors()));
		self::assertSame(RenderException::PROBLEM_NOT_PLANTUML, $this->problemOf(fn () => $noSvg->colors()));
		self::assertSame([], $this->cache->values);
	}

	public function testColorsFromAnUnsetOrUnreachableServer(): void {
		$unset = $this->serviceWith($this->createStub(IClientService::class), '');
		$down = $this->service($this->clientAnswering(new \Exception('cURL error 7')));

		self::assertSame(RenderException::PROBLEM_NOT_SET, $this->problemOf(fn () => $unset->colors()));
		self::assertSame(RenderException::PROBLEM_UNREACHABLE, $this->problemOf(fn () => $down->colors()));
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

	/** @return list<string> every message and context a render of the credentialed URL logged */
	private function loggedFor(IResponse|\Throwable $answer, callable $call): array {
		$logged = [];
		$logger = $this->createStub(LoggerInterface::class);
		foreach (['debug', 'info', 'notice', 'warning', 'error'] as $level) {
			$logger->method($level)->willReturnCallback(static function ($message, array $context = []) use (&$logged): void {
				$logged[] = $message . ' ' . print_r($context, true);
			});
		}
		$clients = $this->createStub(IClientService::class);
		$clients->method('newClient')->willReturn($this->clientAnswering($answer));
		$service = $this->serviceWith($clients, 'https://user:secretpw@p.example.com:8443', $logger);
		try {
			$call($service);
		} catch (RenderException) {
		}
		return $logged;
	}

	public function testAnUnreachableServerIsLoggedWithoutItsCredentials(): void {
		$cause = new \RuntimeException('cURL error 7: Failed to connect to https://user:secretpw@p.example.com:8443/svg');
		$logged = $this->loggedFor($cause, static fn (RenderService $s) => $s->render(self::SOURCE));

		self::assertNotSame([], $logged);
		self::assertStringContainsString('https://p.example.com:8443', implode("\n", $logged));
		self::assertStringNotContainsString('secretpw', implode("\n", $logged));
	}

	/** The cause's message names the URL, userinfo and all, so it is not carried on to whoever logs the problem. */
	public function testAnUnreachableServersProblemCarriesNoCause(): void {
		$clients = $this->createStub(IClientService::class);
		$clients->method('newClient')->willReturn($this->clientAnswering(new \RuntimeException('cURL error 7: Failed to connect to https://user:secretpw@p.example.com:8443/svg')));
		$service = $this->serviceWith($clients, 'https://user:secretpw@p.example.com:8443');

		try {
			$service->render(self::SOURCE);
			self::fail('no problem');
		} catch (RenderException $e) {
			self::assertSame(RenderException::PROBLEM_UNREACHABLE, $e->getProblem());
			self::assertNull($e->getPrevious());
		}
	}

	public function testANonPlantUmlAnswerIsLoggedWithoutItsCredentials(): void {
		$logged = $this->loggedFor($this->response(500, ''), static fn (RenderService $s) => $s->themes());

		self::assertStringContainsString('txt answered help themes with HTTP 500', implode("\n", $logged));
		self::assertStringContainsString('https://p.example.com:8443', implode("\n", $logged));
		self::assertStringNotContainsString('secretpw', implode("\n", $logged));
	}

	public function testTheRequestStillGoesToTheStoredUrl(): void {
		$client = $this->createMock(IClient::class);
		$client->expects(self::once())->method('post')
			->with('https://user:secretpw@p.example.com:8443/txt', self::anything())
			->willReturn($this->response(200, 'PlantUML 1.2026.8'));
		$clients = $this->createStub(IClientService::class);
		$clients->method('newClient')->willReturn($client);

		$this->serviceWith($clients, 'https://user:secretpw@p.example.com:8443')->version();
	}
}
