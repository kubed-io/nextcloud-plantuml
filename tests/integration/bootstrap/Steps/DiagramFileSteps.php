<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

/** Files in the admin's folder, put there over WebDAV as a client would. */
trait DiagramFileSteps {
	private const DIAGRAM = "@startuml\nCustomer -> Shop : place order\n@enduml\n";

	/** @Given /^a diagram file "([^"]*)" in "([^"]*)"$/ */
	public function aDiagramFileIn(string $name, string $folder): void {
		$this->putFile($folder, $name, self::DIAGRAM);
	}

	/** @Given /^a file "([^"]*)" in "([^"]*)"$/ */
	public function aFileIn(string $name, string $folder): void {
		$this->putFile($folder, $name, "Some notes, not a diagram.\n");
	}

	private function putFile(string $folder, string $name, string $body): void {
		$this->davEnsureFolder($folder);
		$status = $this->davPut($folder . '/' . $name, $body)->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT {$folder}/{$name} answered HTTP {$status}");
		}
	}
}
