<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit {
	/** When the services' stream_get_contents fails; a test sets it and tearDown clears it. */
	final class Streams {
		public static bool $unreadable = false;
	}
}

namespace OCA\PlantUml\Service {
	use OCA\PlantUml\Tests\Unit\Streams;

	/**
	 * PHP looks for a function in the caller's namespace before the global one, so
	 * this stands in for PHP's own inside the services. PHP's answers false only
	 * on a failed seek, which no stream a test can make gives; the test says when.
	 *
	 * @param resource $stream
	 */
	function stream_get_contents($stream, ?int $length = null, int $offset = -1): string|false {
		return Streams::$unreadable ? false : \stream_get_contents($stream, $length, $offset);
	}
}
