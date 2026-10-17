<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Exception;

use OCP\AppFramework\Http\Response;

/** A stored diagram a route may not read, with the answer the route gives. */
final class FileRefusal extends \Exception {
	public function __construct(
		public readonly Response $response,
	) {
		parent::__construct('refused with HTTP ' . $response->getStatus());
	}
}
