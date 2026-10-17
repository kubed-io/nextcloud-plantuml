<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCP\Files\File;

/** A stored diagram as a route reads it: the text as stored, what it includes, and the ETag covering both. */
final class DiagramFile {
	public function __construct(
		public readonly File $file,
		public readonly string $text,
		public readonly ?Expanded $expanded,
		public readonly string $etag,
	) {
	}
}
