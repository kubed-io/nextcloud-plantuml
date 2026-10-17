<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\Tests\Unit\IncludeResolverTest;

/**
 * PHP looks for a function in the caller's namespace before the global one, so
 * this stands in for PHP's own inside the resolver. It keeps what is handed to
 * it for the test to run, as a request that dies on a fatal error leaves it to
 * PHP to run, and registers nothing.
 */
function register_shutdown_function(callable $callback, mixed ...$args): void {
	IncludeResolverTest::$atShutdown[] = static fn () => $callback(...$args);
}
