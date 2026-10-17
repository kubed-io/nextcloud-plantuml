<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

/** A readable stream holding `$content`, as a File's fopen('r') gives. */
final class MemoryStream {
	/** @return resource */
	public static function of(string $content) {
		$handle = fopen('php://memory', 'r+');
		if (!is_resource($handle)) {
			throw new \RuntimeException('no memory stream');
		}
		fwrite($handle, $content);
		rewind($handle);
		return $handle;
	}
}
