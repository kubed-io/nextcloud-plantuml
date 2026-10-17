<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

/**
 * A read-only stream of `$content` that counts the bytes it hands out, so a
 * test can see where a capped read stopped once the handle is closed. PHP
 * reads a stream in chunks of CHUNK, so up to one more than was asked for.
 */
final class CountingStream {
	public const CHUNK = 8192;
	private const SCHEME = 'plantuml-counting';

	/** The bytes handed out by the last stream opened. */
	public static int $served = 0;
	private static string $content = '';

	/** @var resource|null set by PHP for a stream wrapper */
	public $context;
	private int $position = 0;

	/** @return resource */
	public static function open(string $content) {
		if (!in_array(self::SCHEME, stream_get_wrappers(), true)) {
			stream_wrapper_register(self::SCHEME, self::class);
		}
		self::$content = $content;
		self::$served = 0;
		$handle = fopen(self::SCHEME . '://content', 'r');
		\PHPUnit\Framework\Assert::assertIsResource($handle);
		return $handle;
	}

	public function stream_open(string $path, string $mode, int $options, ?string &$opened): bool {
		return $mode === 'r';
	}

	public function stream_read(int $count): string {
		$chunk = substr(self::$content, $this->position, $count);
		$this->position += strlen($chunk);
		self::$served += strlen($chunk);
		return $chunk;
	}

	public function stream_eof(): bool {
		return $this->position >= strlen(self::$content);
	}

	/** @return array<string, int> */
	public function stream_stat(): array {
		return [];
	}
}
