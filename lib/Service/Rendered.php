<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

/**
 * What the server drew: the image bytes and their content type, and, when the
 * diagram has a mistake, PlantUML's one line about it and the line it names
 * (counted from 0 at the top of the source sent).
 */
final class Rendered {
	public function __construct(
		public readonly string $body,
		public readonly string $contentType,
		public readonly string $error = '',
		public readonly ?int $errorLine = null,
	) {
	}
}
