<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

/**
 * A file read into its diagrams as the editor's tabs read it (src/editor/blocks.js,
 * editor spec B1): one per `@start…` block, one per `newpage` page of a uml block,
 * each with the image PlantUML draws for it. tests/fixtures/diagrams/expected.json
 * holds both to the same answers.
 *
 * `drawn` is the server's own, not the editor's: whether PlantUML draws an image for the diagram at
 * all. A block left open after the last closed one has a `render` past the last image, and the
 * server answers that with a 400 page, not a picture.
 *
 * @psalm-type Diagram = array{index: int, type: string, name: string, id: ?string, page: int, pages: int, render: int, drawn: bool}
 */
final class Diagrams {
	/** The characters of JavaScript's `\s`, which PCRE's is narrower than; bare, to go inside other classes. */
	private const SC = '\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';
	private const S = '[' . self::SC . ']';
	/** JavaScript's `\w`: under `/u`, PCRE's would take any letter. */
	private const W = '[A-Za-z0-9_]';
	private const START = '/^' . self::S . '*@start(' . self::W . '+)(.*)$/u';
	private const END = '/^' . self::S . '*@end' . self::W . '*' . self::S . '*$/u';
	private const NEWPAGE = '/^' . self::S . '*newpage(?:' . self::S . '.*)?$/u';
	private const CALL = '/^\(([^)]*)\)/u';
	private const ID = '/^' . self::S . '*id' . self::S . '*=' . self::S . '*/u';
	/** A name's lead: the space or `{` after the type, then spaces and quotes. */
	private const LEAD = '/^[' . self::SC . '{][' . self::SC . '"“”]*/u';
	/** A name's tail, read from the end one character at a time: as `[…]*$`, it backtracks quadratically. */
	private const TAIL = '/^[' . self::SC . '}"“”]$/u';
	private const QUOTE = '/["“”]/u';
	private const SPACE = '/^' . self::S . '$/u';

	/** @return list<Diagram> */
	public static function scan(string $text): array {
		// Bytes that are not UTF-8 would fail every `/u` pattern; mb_scrub makes each a `?` (the browser
		// reads U+FFFD), so only such a diagram's name can differ from the editor's, never its place.
		$text = mb_scrub($text, 'UTF-8');
		$lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $text));
		$found = [];
		$block = null;
		$close = static function () use (&$block, &$found): void {
			if ($block === null) {
				return;
			}
			$pages = count($block['pages']);
			foreach ($block['pages'] as $i => $from) {
				$found[] = ['type' => $block['type'], 'name' => $block['name'], 'id' => $block['id'], 'page' => $i + 1, 'pages' => $pages, 'from' => $from];
			}
			$block = null;
		};
		foreach ($lines as $i => $line) {
			$n = $i + 1;
			$open = self::startOf($line);
			if ($open !== null) {
				$close();
				$block = $open + ['pages' => [$n]];
			} elseif ($block !== null && self::matches(self::END, $line)) {
				$close();
			} elseif ($block !== null && $block['type'] === 'uml' && self::matches(self::NEWPAGE, $line)) {
				$block['pages'][] = $n;
			}
		}
		$close();
		if ($found === []) {
			$found[] = ['type' => 'uml', 'name' => '', 'id' => null, 'page' => 1, 'pages' => 1, 'from' => 1];
		}
		$drawn = self::images($lines);
		$diagrams = [];
		foreach ($found as $index => $d) {
			$render = count($drawn);
			foreach ($drawn as $at => $last) {
				if ($last >= $d['from']) {
					$render = $at;
					break;
				}
			}
			$diagrams[] = ['index' => $index, 'type' => $d['type'], 'name' => $d['name'], 'id' => $d['id'], 'page' => $d['page'], 'pages' => $d['pages'], 'render' => $render, 'drawn' => $render < count($drawn)];
		}
		return $diagrams;
	}

	/**
	 * @param list<Diagram> $diagrams
	 * @return Diagram|null
	 */
	public static function find(array $diagrams, string $diagram): ?array {
		foreach ($diagrams as $d) {
			if ($d['name'] !== '' && $d['name'] === $diagram && $d['page'] === 1) {
				return $d;
			}
		}
		return preg_match('/^\d{1,4}$/', $diagram) === 1 ? ($diagrams[(int)$diagram - 1] ?? null) : null;
	}

	/** @param Diagram $diagram */
	public static function label(array $diagram): string {
		$base = $diagram['name'] !== '' ? $diagram['name'] : $diagram['type'];
		return $diagram['pages'] > 1 ? "{$base} {$diagram['page']}" : $base;
	}

	/** @param Diagram $diagram */
	public static function noImage(array $diagram): string {
		return 'no image for ' . self::label($diagram);
	}

	public static function missing(string $diagram): string {
		return preg_match('/^\d+$/', $diagram) === 1 ? "no diagram {$diagram}" : "no diagram named {$diagram}";
	}

	/** @return array{type: string, id: ?string, name: string}|null */
	private static function startOf(string $line): ?array {
		if (!self::matches(self::START, $line, $open)) {
			return null;
		}
		$rest = $open[2];
		$id = null;
		if (self::matches(self::CALL, $rest, $call)) {
			if (self::matches(self::ID, $call[1], $lead)) {
				$id = self::untailed(substr($call[1], strlen($lead[0])), self::SPACE);
				$id = $id !== '' ? $id : null;
			}
			$rest = substr($rest, strlen($call[0]));
		}
		$name = self::nameOf($rest);
		if ($rest !== '' && $name === null) {
			return null;
		}
		return ['type' => $open[1], 'id' => $id, 'name' => $name !== null && $name !== '' ? $name : ($id ?? '')];
	}

	/**
	 * The name in what follows a `@start` line's type and arguments, its lead and tail (spaces,
	 * quotes, braces) taken off (the lexicon's `startName`); null when that is no name, as when
	 * a quote is left inside it.
	 */
	private static function nameOf(string $rest): ?string {
		if (!self::matches(self::LEAD, $rest, $lead)) {
			return null;
		}
		$name = self::untailed(substr($rest, strlen($lead[0])), self::TAIL);
		return self::matches(self::QUOTE, $name) ? null : $name;
	}

	/**
	 * `$text` without the characters at its end that `$char` (one character, anchored) matches.
	 *
	 * @param non-empty-string $char
	 */
	private static function untailed(string $text, string $char): string {
		$end = strlen($text);
		while ($end > 0) {
			// Back to the first byte of the last character: the text is valid UTF-8 (scan's mb_scrub).
			$start = $end - 1;
			while ($start > 0 && (ord($text[$start]) & 0xC0) === 0x80) {
				$start--;
			}
			if (!self::matches($char, substr($text, $start, $end - $start))) {
				break;
			}
			$end = $start;
		}
		return substr($text, 0, $end);
	}

	/**
	 * preg_match, loud when PCRE gives up (a backtrack or stack limit) instead of reading the
	 * line as no match, which would shift every diagram after it.
	 *
	 * @param non-empty-string $pattern
	 * @param-out array<array-key, string> $match
	 */
	private static function matches(string $pattern, string $subject, ?array &$match = null): bool {
		$found = preg_match($pattern, $subject, $match);
		if ($found === false) {
			throw new \RuntimeException('Could not read a diagram line: ' . preg_last_error_msg());
		}
		return $found === 1;
	}

	/**
	 * The last line of each image PlantUML draws, in its order (blocks.js `images`).
	 *
	 * @param list<string> $lines
	 * @return list<int>
	 */
	private static function images(array $lines, bool $wrapped = false): array {
		$lasts = [];
		$open = $wrapped ? ['type' => 'uml', 'pages' => []] : null;
		foreach ($lines as $i => $line) {
			$n = $i + 1;
			$start = self::startOf($line);
			if ($start !== null) {
				$open = ['type' => $start['type'], 'pages' => []];
			} elseif ($open !== null && self::matches(self::END, $line)) {
				array_push($lasts, ...$open['pages'], ...[$n]);
				$open = null;
			} elseif ($open !== null && $open['type'] === 'uml' && self::matches(self::NEWPAGE, $line)) {
				$open['pages'][] = $n - 1;
			}
		}
		if ($wrapped && $open !== null) {
			array_push($lasts, ...$open['pages'], ...[count($lines)]);
		}
		return $lasts !== [] || $wrapped ? $lasts : self::images($lines, true);
	}
}
