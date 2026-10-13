<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Support;

/**
 * The occ transport. Runs the command the workflow names in OCC (default
 * `php occ`), in the Nextcloud server root, and records the exit code and the
 * output for the Then steps to read.
 */
trait OccTrait {
	/**
	 * @return array{exit:int, output:string}
	 */
	private function occ(string $args): array {
		$output = [];
		$exit = 0;
		exec($this->occ . ' ' . $args . ' 2>&1', $output, $exit);
		$this->lastExit = $exit;
		$this->lastOutput = implode("\n", $output);
		return ['exit' => $exit, 'output' => $this->lastOutput];
	}

	private function appConfigSet(string $key, string $value): void {
		$this->occ(sprintf('config:app:set %s %s --value=%s', self::APP_ID, $key, escapeshellarg($value)));
	}

	private function appConfigDelete(string $key): void {
		$this->occ(sprintf('config:app:delete %s %s', self::APP_ID, $key));
	}
}
