<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\AppInfo\Application;
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
	private const COLORS_DIAGRAM = "@startuml\nhelp colors\n@enduml\n";
	private const COLORS_MARKER = 'The possible colors are';
	private const SWATCHES_DIAGRAM = "@startuml\ncolors\n@enduml\n";
	private const COLORS_MAX = 500;
	private const KEYWORDS_DIAGRAM = "@startuml\nhelp keywords\n@enduml\n";
	private const KEYWORDS_MARKER = 'The possible keywords are';
	private const TYPES_DIAGRAM = "@startuml\nhelp types\n@enduml\n";
	private const TYPES_MARKER = 'The possible types are';
	private const KEYWORDS_MAX = 500;
	private const FONTS_DIAGRAM = "@startuml\nhelp font\n@enduml\n";
	private const FONTS_MARKER = 'The possible font on your system are';
	private const FONTS_MAX = 200;
	/** A family name: led by a word character, then anything but angle brackets and control characters, up to 64. */
	private const FONTS_LINE = '/^\w[^<>\x00-\x1F\x7F]{0,63}$/';
	private const STDLIB_DIAGRAM = "@startuml\nstdlib\n@enduml\n";
	private const STDLIB_MAX = 100;
	private const STDLIB_NAME = '/^[\w.-]{1,64}$/';
	private const STDLIB_VERSION = '/^Version (\S{1,32})$/';
	private const STDLIB_SOURCE = '#^Delivered by (https?://\S{1,200})$#';
	/** The server's lists change only with its version. */
	private const LISTS_TTL = 86400;

	public function __construct(
		private readonly ServerConfig $config,
		private readonly IClientService $clientService,
		private readonly ICacheFactory $cacheFactory,
		private readonly LoggerInterface $logger,
	) {
	}

	/** The formats the server draws (checked on 1.2026.8), each with the type it answers. */
	public const FORMATS = [
		'svg' => 'image/svg+xml',
		'png' => 'image/png',
		'pdf' => 'application/pdf',
		'eps' => 'application/postscript',
		'txt' => 'text/plain',
	];

	/**
	 * The server draws the n-th diagram of the file (0-based) at `<format>/n`.
	 *
	 * @throws RenderException
	 */
	public function render(string $source, int $index = 0, string $format = 'svg'): Rendered {
		$expected = self::FORMATS[$format] ?? throw new \InvalidArgumentException("No such format: {$format}");
		$response = $this->post($index === 0 ? $format : "{$format}/{$index}", $source);
		// A drawing is a render whatever the status: PlantUML answers a mistake in
		// the diagram with a 400 and the error drawn in. Anything else, a 200 page
		// from a catch-all web server included, is not PlantUML.
		$contentType = $response->getHeader('Content-Type');
		$type = strtolower(trim(explode(';', $contentType)[0]));
		if (str_starts_with($expected, 'image/') ? !str_starts_with($type, 'image/') : $type !== $expected) {
			throw $this->notPlantUml(sprintf('%s answered HTTP %d %s', $format, $response->getStatusCode(), $contentType));
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
		// Only what looks like a theme name: anything a later server prints after
		// the list must not become a theme.
		$themes = self::wordsAfter($this->answer('txt', self::THEMES_DIAGRAM, 'help themes'), self::THEMES_MARKER, '/^[\w-]{1,64}$/', self::THEMES_MAX);
		if ($themes === []) {
			throw $this->notPlantUml('txt answered help themes without a list of themes');
		}
		return $themes;
	}

	/**
	 * The named colours the server knows, each with its hex as `#RRGGBB`: the
	 * names after "The possible colors are" on `help colors` as text, the hex
	 * off the `colors` drawing, where each name's `<text>` follows its swatch's
	 * `<rect>`. A name the drawing lacks is null. In the server's order.
	 *
	 * @return array<string, string|null>
	 * @throws RenderException
	 */
	public function colors(): array {
		return $this->cached('colors', function (): array {
			$names = array_unique(self::wordsAfter($this->answer('txt', self::COLORS_DIAGRAM, 'help colors'), self::COLORS_MARKER, '/^[A-Za-z]\w{0,63}$/', self::COLORS_MAX));
			if ($names === []) {
				throw $this->notPlantUml('txt answered help colors without a list of colors');
			}
			$drawing = $this->answer('svg', self::SWATCHES_DIAGRAM, 'colors');
			preg_match_all(
				'/<rect\b[^>]*\bfill="#([\dA-Fa-f]{6}|[\dA-Fa-f]{3})"[^>]*\/>\s*<text\b[^>]*>([^<]*)<\/text>/',
				$drawing,
				$pairs,
				PREG_SET_ORDER,
			);
			$hex = [];
			foreach ($pairs as [, $digits, $name]) {
				$six = strlen($digits) === 3 ? $digits[0] . $digits[0] . $digits[1] . $digits[1] . $digits[2] . $digits[2] : $digits;
				$hex[html_entity_decode(trim($name))] ??= '#' . strtoupper($six);
			}
			$colors = [];
			foreach ($names as $name) {
				$colors[$name] = $hex[$name] ?? null;
			}
			return $colors;
		});
	}

	/**
	 * The diagram kinds (`@start…` without the `@start`), the other keywords and
	 * the element types the server knows, read off its `help keywords` and
	 * `help types` as text. A keyword may hold spaces (`left to right
	 * direction`), so each list is read by line. Cached a day per server URL.
	 *
	 * @return array{diagrams: list<string>, types: list<string>, keywords: list<string>}
	 * @throws RenderException
	 */
	public function keywords(): array {
		return $this->cached('keywords', function (): array {
			$words = self::linesAfter($this->answer('txt', self::KEYWORDS_DIAGRAM, 'help keywords'), self::KEYWORDS_MARKER);
			$types = array_slice(array_values(array_unique(
				self::linesAfter($this->answer('txt', self::TYPES_DIAGRAM, 'help types'), self::TYPES_MARKER),
			)), 0, self::KEYWORDS_MAX);
			$diagrams = [];
			$keywords = [];
			foreach ($words as $word) {
				if (preg_match('/^@start(\w+)$/', $word, $m) === 1) {
					$diagrams[] = $m[1];
				} elseif (!str_starts_with($word, '@')) {
					$keywords[] = $word;
				}
			}
			$keywords = array_slice(array_values(array_unique($keywords)), 0, self::KEYWORDS_MAX);
			if ($keywords === []) {
				throw $this->notPlantUml('txt answered help keywords without a list of keywords');
			}
			if ($types === []) {
				throw $this->notPlantUml('txt answered help types without a list of types');
			}
			return ['diagrams' => array_values(array_unique($diagrams)), 'types' => $types, 'keywords' => $keywords];
		});
	}

	/**
	 * The font families the server can draw, read off its `help font` as text:
	 * one per line after "The possible font on your system are", each with its
	 * spaces. Cached a day per server URL.
	 *
	 * @return list<string>
	 * @throws RenderException
	 */
	public function fonts(): array {
		return $this->cached('fonts', function (): array {
			$lines = self::linesAfter($this->answer('txt', self::FONTS_DIAGRAM, 'help font'), self::FONTS_MARKER, self::FONTS_LINE);
			$fonts = self::names($lines, self::FONTS_LINE, self::FONTS_MAX);
			if ($fonts === []) {
				throw $this->notPlantUml('txt answered help font without a list of fonts');
			}
			return $fonts;
		});
	}

	/**
	 * The standard libraries the server ships, read off its `stdlib` diagram as
	 * text: each one a name line, then `Version x`, then `Delivered by <url>`,
	 * in the server's order, with blank lines between. Cached a day per server URL.
	 *
	 * @return list<array{name: string, version: string, source: string}>
	 * @throws RenderException
	 */
	public function stdlib(): array {
		return $this->cached('stdlib', function (): array {
			$lines = array_values(array_filter(
				array_map('trim', explode("\n", $this->answer('txt', self::STDLIB_DIAGRAM, 'stdlib'))),
				static fn (string $line): bool => $line !== '',
			));
			$libraries = [];
			for ($i = 0; $i + 2 < count($lines) && count($libraries) < self::STDLIB_MAX; $i++) {
				if (
					preg_match(self::STDLIB_NAME, $lines[$i]) !== 1
					|| preg_match(self::STDLIB_VERSION, $lines[$i + 1], $version) !== 1
					|| preg_match(self::STDLIB_SOURCE, $lines[$i + 2], $source) !== 1
				) {
					continue;
				}
				$libraries[] = ['name' => $lines[$i], 'version' => $version[1], 'source' => $source[1]];
				$i += 2;
			}
			if ($libraries === []) {
				throw $this->notPlantUml('txt answered stdlib without a list of libraries');
			}
			return $libraries;
		});
	}

	/**
	 * The body of the server's answer to a diagram; `$what` names the question
	 * in the log when the status says the server is not PlantUML.
	 *
	 * @throws RenderException
	 */
	private function answer(string $format, string $diagram, string $what): string {
		$response = $this->post($format, $diagram);
		if ($response->getStatusCode() >= 400) {
			throw $this->notPlantUml("{$format} answered {$what} with HTTP " . $response->getStatusCode());
		}
		return (string)$response->getBody();
	}

	/**
	 * The trimmed lines after `$marker` in `$body` that match `$pattern`, by
	 * default a keyword: `@` or a word character, then word characters, spaces
	 * and hyphens, 64 characters at most.
	 *
	 * @param non-empty-string $pattern
	 * @return list<string>
	 */
	private static function linesAfter(string $body, string $marker, string $pattern = '/^[@\w][\w -]{0,63}$/'): array {
		$at = strpos($body, $marker);
		if ($at === false) {
			return [];
		}
		$lines = array_map('trim', explode("\n", substr($body, $at + strlen($marker))));
		return array_values(array_filter(
			$lines,
			static fn (string $line): bool => preg_match($pattern, $line) === 1,
		));
	}

	/**
	 * The words after `$marker` in `$body` that match `$pattern`, at most `$max`.
	 *
	 * @param non-empty-string $pattern
	 * @return list<string>
	 */
	private static function wordsAfter(string $body, string $marker, string $pattern, int $max): array {
		$at = strpos($body, $marker);
		$list = $at === false ? '' : substr($body, $at + strlen($marker));
		$tokens = preg_split('/\s+/', trim(ltrim(trim($list), ':')), -1, PREG_SPLIT_NO_EMPTY);
		return array_slice(array_values(array_filter(
			$tokens === false ? [] : $tokens,
			static fn (string $token): bool => preg_match($pattern, $token) === 1,
		)), 0, $max);
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
			preg_match_all('/<text\b[^>]*>([^<]*)<\/text>/', $this->answer('svg', self::ICONS_DIAGRAM, 'listopeniconic'), $m);
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
	 * @template T of array
	 * @param callable(): T $read
	 * @return T
	 * @throws RenderException
	 */
	private function cached(string $name, callable $read): array {
		$cache = $this->cacheFactory->createDistributed('plantuml-' . $name);
		$key = md5($this->config->getUrl());
		$cached = $cache->get($key);
		if (is_array($cached)) {
			/** @var T */
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
		return $this->answer('txt', "@startuml\n{$command}\n@enduml\n", "emoji {$block}");
	}

	private static function oneLine(string $text): string {
		$line = trim((string)preg_replace('/[\x00-\x1f\x7f]+/', ' ', $text));
		return mb_substr($line, 0, Application::ERROR_MAX);
	}

	/**
	 * The server's PlantUML version, read off the `version` diagram rendered as
	 * text. Only a PlantUML server can answer it, which is what makes it the
	 * health check.
	 *
	 * @throws RenderException
	 */
	public function version(): string {
		if (preg_match('/PlantUML\s+(\d+\.\d+\.\d+)/', $this->answer('txt', self::VERSION_DIAGRAM, 'version'), $m) !== 1) {
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
			// Guzzle's message names the URL it called, userinfo and all.
			$this->logger->info('PlantUML server at {url} is unreachable: {error}', [
				'url' => ServerConfig::redacted($url),
				'error' => (string)preg_replace('#(?<=//)[^/@\s]*@#', '', str_replace($url, ServerConfig::redacted($url), $e->getMessage())),
				'class' => $e::class,
			]);
			// Nor kept as the cause, which would carry that message on to whoever logs this.
			throw new RenderException(RenderException::PROBLEM_UNREACHABLE);
		}
	}

	private function notPlantUml(string $cause): RenderException {
		$this->logger->info('PlantUML server at {url} is not a PlantUML server: {cause}', [
			'url' => ServerConfig::redacted($this->config->getUrl()),
			'cause' => $cause,
		]);
		return new RenderException(RenderException::PROBLEM_NOT_PLANTUML);
	}
}
