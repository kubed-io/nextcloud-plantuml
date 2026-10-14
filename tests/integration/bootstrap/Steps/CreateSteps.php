<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

/**
 * A new diagram, created through Files' own create endpoint as the + New
 * entry creates it. What the file holds is the app's doing, not the client's.
 */
trait CreateSteps {
	/** @When /^I create a new diagram in "([^"]*)"$/ */
	public function iCreateANewDiagramIn(string $folder): void {
		$this->davEnsureFolder($folder);
		$path = trim($folder, '/') . '/New diagram.puml';
		$this->putFiles[] = $path;
		$response = $this->httpClient()->post($this->baseUrl . '/ocs/v2.php/apps/files/api/v1/templates/create', [
			'json' => ['filePath' => '/' . $path],
			'headers' => ['OCS-APIRequest' => 'true', 'Accept' => 'application/json'],
		]);
		if ($response->getStatusCode() !== 200) {
			throw new \RuntimeException(sprintf(
				"creating %s answered HTTP %d:\n%s",
				$path,
				$response->getStatusCode(),
				substr((string)$response->getBody(), 0, 500),
			));
		}
	}

	/** @Then /^"([^"]*)" holds an empty diagram$/ */
	public function holdsAnEmptyDiagram(string $path): void {
		$this->assertFileHolds($path, "@startuml\n\n@enduml\n");
	}
}
