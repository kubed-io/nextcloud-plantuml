<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

/** What the server drew: the image bytes and their content type. */
final class Rendered {
	public function __construct(
		public readonly string $body,
		public readonly string $contentType,
	) {
	}
}
