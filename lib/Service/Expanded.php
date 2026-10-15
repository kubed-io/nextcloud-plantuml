<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

/**
 * A diagram with its files beside it read in ({@see IncludeResolver}): the
 * source to send, where each sent line came from, and what could not be read.
 * Lines are counted from 0; `inner` is the line in the included file, null for
 * the `<style>` and `</style>` lines a style file is wrapped in.
 */
final class Expanded {
	/**
	 * @param list<int> $lineMap sent line => the diagram's own line
	 * @param list<array{line: int, path: string, inner: int|null}> $origins sent lines that came from a file
	 * @param list<array{line: int, message: string}> $mistakes on the diagram's own lines
	 * @param list<string> $etags every file read in, in include order
	 */
	public function __construct(
		public readonly string $source,
		public readonly array $lineMap,
		public readonly array $origins,
		public readonly array $mistakes,
		public readonly array $etags,
	) {
	}

	/**
	 * The server's mistake on a sent line, moved to the diagram's own line; one
	 * inside an included file lands on the include line and names the file.
	 *
	 * @return array{line: int, message: string}
	 */
	public function mapError(int $sentLine, string $message): array {
		$last = count($this->lineMap) - 1;
		if ($sentLine < 0 || $last < 0) {
			return ['line' => $sentLine, 'message' => $message];
		}
		if ($sentLine > $last) {
			return ['line' => $this->lineMap[$last] + $sentLine - $last, 'message' => $message];
		}
		foreach ($this->origins as $origin) {
			if ($origin['line'] === $sentLine) {
				return [
					'line' => $this->lineMap[$sentLine],
					'message' => $origin['inner'] === null
						? sprintf('In %s: %s', $origin['path'], $message)
						: sprintf('In %s, line %d: %s', $origin['path'], $origin['inner'] + 1, $message),
				];
			}
		}
		return ['line' => $this->lineMap[$sentLine], 'message' => $message];
	}
}
