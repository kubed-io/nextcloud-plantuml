<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\Exception\RenderException;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use OCP\ICacheFactory;
use Psr\Log\LoggerInterface;

/**
 * The one place the app talks to the PlantUML server: `POST <server>/<format>`
 * with the diagram source as the body.
 *
 * Every failure becomes one of {@see RenderException}'s three problems, in this
 * order: no URL, then no answer, then an answer that is not PlantUML's. The
 * cause is logged, because the problem word alone does not say which status or
 * connect error produced it.
 */
final class RenderService {
	private const VERSION_DIAGRAM = "@startuml\nversion\n@enduml\n";
	private const THEMES_DIAGRAM = "@startuml\nhelp themes\n@enduml\n";
	private const THEMES_MARKER = 'The possible themes are';
	private const THEMES_MAX = 200;
	private const ICONS_DIAGRAM = "@startuml\nlistopeniconic\n@enduml\n";
	private const ICONS_MAX = 500;
	private const EMOJI_MAX = 2000;
	private const EMOJI_BLOCKS_MAX = 16;
	/** The server's lists change only with its version. */
	private const LISTS_TTL = 86400;
	/** The error rides out as a response header, so it stays one short line. */
	private const ERROR_MAX = 200;

	public function __construct(
		private readonly ServerConfig $config,
		private readonly IClientService $clientService,
		private readonly ICacheFactory $cacheFactory,
		private readonly LoggerInterface $logger,
	) {
	}

	/**
	 * The server draws the n-th diagram of the file (0-based) at `svg/n`.
	 *
	 * @throws RenderException
	 */
	public function render(string $source, int $index = 0): Rendered {
		$response = $this->post($index === 0 ? 'svg' : 'svg/' . $index, $source);
		// An image is a render whatever the status: PlantUML answers a mistake in
		// the diagram with a 400 and the error drawn in. Anything that is not an
		// image, a 200 page from a catch-all web server included, is not PlantUML.
		$contentType = $response->getHeader('Content-Type');
		if (!str_starts_with(strtolower($contentType), 'image/')) {
			throw $this->notPlantUml(sprintf('svg answered HTTP %d %s', $response->getStatusCode(), $contentType));
		}
		$line = $response->getHeader('X-PlantUML-Diagram-Error-Line');
		return new Rendered(
			(string)$response->getBody(),
			$contentType,
			self::oneLine($response->getHeader('X-PlantUML-Diagram-Error')),
			ctype_digit($line) ? (int)$line : null,
		);
	}

	/**
	 * The built-in themes the server knows, read off its `help themes` diagram
	 * rendered as text: the names after "The possible themes are", whitespace
	 * apart. Cached a day per server URL.
	 *
	 * @return list<string>
	 * @throws RenderException
	 */
	public function themes(): array {
		return $this->cached('themes', fn (): array => $this->readThemes());
	}

	/**
	 * @return list<string>
	 * @throws RenderException
	 */
	private function readThemes(): array {
		$response = $this->post('txt', self::THEMES_DIAGRAM);
		if ($response->getStatusCode() >= 400) {
			throw $this->notPlantUml('txt answered help themes with HTTP ' . $response->getStatusCode());
		}
		$body = (string)$response->getBody();
		$at = strpos($body, self::THEMES_MARKER);
		$list = $at === false ? '' : substr($body, $at + strlen(self::THEMES_MARKER));
		$tokens = preg_split('/\s+/', trim(ltrim(trim($list), ':')), -1, PREG_SPLIT_NO_EMPTY);
		// Only what looks like a theme name, and a sane number of them: anything a
		// later server prints after the list must not become a theme.
		$themes = array_slice(array_values(array_filter(
			$tokens === false ? [] : $tokens,
			static fn (string $token): bool => preg_match('/^[\w-]{1,64}$/', $token) === 1,
		)), 0, self::THEMES_MAX);
		if ($themes === []) {
			throw $this->notPlantUml('txt answered help themes without a list of themes');
		}
		return $themes;
	}

	/**
	 * The OpenIconic icons the server draws for `<&name>`, read off its
	 * `listopeniconic` diagram as SVG: one `<text>` per icon name, beside a
	 * title and a credit that are not names. Its text rendering sets them in
	 * columns, so there the credit's words would pass for icons.
	 *
	 * @return list<string>
	 * @throws RenderException
	 */
	public function icons(): array {
		return $this->cached('icons', function (): array {
			$response = $this->post('svg', self::ICONS_DIAGRAM);
			if ($response->getStatusCode() >= 400) {
				throw $this->notPlantUml('svg answered listopeniconic with HTTP ' . $response->getStatusCode());
			}
			preg_match_all('/<text\b[^>]*>([^<]*)<\/text>/', (string)$response->getBody(), $m);
			$texts = array_map(static fn (string $text): string => html_entity_decode(trim($text)), $m[1]);
			$icons = self::names($texts, '/^[a-z0-9-]{1,64}$/', self::ICONS_MAX);
			if ($icons === []) {
				throw $this->notPlantUml('svg answered listopeniconic without icon names');
			}
			return $icons;
		});
	}

	/**
	 * The emoji names the server draws for `<:name:>`. `emoji` alone lists
	 * one Unicode block and names every block it has, which are then asked
	 * for one by one, as text: drawn, the largest takes most of the timeout.
	 * Each emoji appears as its code point and its name, and only the name is
	 * kept.
	 *
	 * @return list<string>
	 * @throws RenderException
	 */
	public function emoji(): array {
		return $this->cached('emoji', function (): array {
			$first = $this->emojiBlock('');
			if (preg_match('/Blocks available:([^)]*)\)/', $first, $m) !== 1) {
				throw $this->notPlantUml('txt answered emoji without its blocks');
			}
			$blocks = array_slice(array_values(array_filter(
				array_map(static fn (string $block): string => strtolower(trim($block)), explode(',', $m[1])),
				static fn (string $block): bool => preg_match('/^[0-9a-f]{1,5}$/', $block) === 1,
			)), 0, self::EMOJI_BLOCKS_MAX);
			$shown = preg_match('/Unicode Block ([0-9a-f]+)/i', $first, $b) === 1 ? strtolower($b[1]) : '';
			$bodies = [$first];
			foreach ($blocks as $block) {
				if ($block !== $shown) {
					$bodies[] = $this->emojiBlock(strtoupper($block));
				}
			}
			preg_match_all('/<:([a-z0-9_+-]{1,64}):>/', implode("\n", $bodies), $tokens);
			$codePoint = '/^(?:' . implode('|', $blocks) . ')[0-9a-f]{2}$/';
			$emoji = self::names(
				array_filter($tokens[1], static fn (string $token): bool => preg_match($codePoint, $token) !== 1),
				'/^[a-z0-9_+-]{1,64}$/',
				self::EMOJI_MAX,
			);
			if ($emoji === []) {
				throw $this->notPlantUml('txt answered emoji without emoji names');
			}
			return $emoji;
		});
	}

	/**
	 * A list from the server, cached a day per server URL.
	 *
	 * @param callable(): list<string> $read
	 * @return list<string>
	 * @throws RenderException
	 */
	private function cached(string $name, callable $read): array {
		$cache = $this->cacheFactory->createDistributed('plantuml-' . $name);
		$key = md5($this->config->getUrl());
		$cached = $cache->get($key);
		if (is_array($cached)) {
			/** @var list<string> */
			return $cached;
		}
		$list = $read();
		$cache->set($key, $list, self::LISTS_TTL);
		return $list;
	}

	/**
	 * Only what looks like a name, once each, sorted, and a sane number of them.
	 *
	 * @param array<string> $tokens
	 * @return list<string>
	 */
	private static function names(array $tokens, string $pattern, int $max): array {
		$names = array_unique(array_filter($tokens, static fn (string $token): bool => preg_match($pattern, $token) === 1));
		sort($names, SORT_STRING);
		return array_slice($names, 0, $max);
	}

	/**
	 * One block's emoji as text; `''` for the server's first.
	 *
	 * @throws RenderException
	 */
	private function emojiBlock(string $block): string {
		$command = $block === '' ? 'emoji' : "emoji {$block}";
		$response = $this->post('txt', "@startuml\n{$command}\n@enduml\n");
		if ($response->getStatusCode() >= 400) {
			throw $this->notPlantUml("txt answered emoji {$block} with HTTP " . $response->getStatusCode());
		}
		return (string)$response->getBody();
	}

	private static function oneLine(string $text): string {
		$line = trim((string)preg_replace('/[\x00-\x1f\x7f]+/', ' ', $text));
		return mb_substr($line, 0, self::ERROR_MAX);
	}

	/**
	 * The server's PlantUML version, read off the `version` diagram rendered as
	 * text. Only a PlantUML server can answer it, which is what makes it the
	 * health check.
	 *
	 * @throws RenderException
	 */
	public function version(): string {
		$response = $this->post('txt', self::VERSION_DIAGRAM);
		if ($response->getStatusCode() >= 400) {
			throw $this->notPlantUml('txt answered HTTP ' . $response->getStatusCode());
		}
		if (preg_match('/PlantUML\s+(\d+\.\d+\.\d+)/', (string)$response->getBody(), $m) !== 1) {
			throw $this->notPlantUml('txt answered without a PlantUML version');
		}
		return $m[1];
	}

	/** @throws RenderException */
	private function post(string $format, string $source): IResponse {
		$url = $this->config->getUrl();
		if ($url === '') {
			throw new RenderException(RenderException::PROBLEM_NOT_SET);
		}
		try {
			return $this->clientService->newClient()->post($url . '/' . $format, [
				'body' => $source,
				'headers' => ['Content-Type' => 'text/plain; charset=utf-8'],
				'timeout' => 10,
				// The status is classified below, so a 4xx must come back as a
				// response rather than as an exception that reads as unreachable.
				'http_errors' => false,
				// Homelab PlantUML servers live at in-cluster addresses.
				'nextcloud' => ['allow_local_address' => true],
			]);
		} catch (\Throwable $e) {
			$this->logger->info('PlantUML server at {url} is unreachable', ['url' => $url, 'exception' => $e]);
			throw new RenderException(RenderException::PROBLEM_UNREACHABLE, $e);
		}
	}

	private function notPlantUml(string $cause): RenderException {
		$this->logger->info('PlantUML server at {url} is not a PlantUML server: {cause}', [
			'url' => $this->config->getUrl(),
			'cause' => $cause,
		]);
		return new RenderException(RenderException::PROBLEM_NOT_PLANTUML);
	}
}
