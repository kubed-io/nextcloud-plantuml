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

	/** @var list<string> what this scenario PUT, removed after it */
	private array $putFiles = [];

	private string $bigDiagramPath = '';

	/** @Given /^a diagram file "([^"]*)" in "([^"]*)"$/ */
	public function aDiagramFileIn(string $name, string $folder): void {
		$this->putFile($folder, $name, self::DIAGRAM);
	}

	/** @Given /^a file "([^"]*)" in "([^"]*)"$/ */
	public function aFileIn(string $name, string $folder): void {
		$this->putFile($folder, $name, "Some notes, not a diagram.\n");
	}

	/** @Given I have a diagram file of more than a megabyte */
	public function iHaveADiagramFileOfMoreThanAMegabyte(): void {
		$this->bigDiagramPath = 'Diagrams/Too big.puml';
		$this->putFile('Diagrams', 'Too big.puml', "@startuml\n" . str_repeat("' padding padding padding padding\n", 31000) . "@enduml\n");
	}

	/** @Given /^"([^"]*)" holds a diagram$/ */
	public function holdsADiagram(string $path): void {
		$response = $this->davGet($path);
		if ($response->getStatusCode() !== 200 || !str_contains((string)$response->getBody(), '@startuml')) {
			throw new \RuntimeException("{$path} holds no diagram (HTTP {$response->getStatusCode()})");
		}
	}

	/**
	 * Each block draws a participant named after it, so the picture says which
	 * block it is.
	 *
	 * @Given /^"([^"]*)" holds the diagrams "([^"]*)" and "([^"]*)"$/
	 */
	public function holdsTheDiagrams(string $path, string $first, string $second): void {
		$body = '';
		foreach ([$first, $second] as $name) {
			$body .= "@startuml {$name}\n" . self::markerOf($name) . " -> Shop : open\n@enduml\n";
		}
		$this->putFile(dirname($path), basename($path), $body);
	}

	private static function markerOf(string $name): string {
		return ucfirst($name) . 'Marker';
	}

	private function putFile(string $folder, string $name, string $body): void {
		$this->davEnsureFolder($folder);
		$path = $folder . '/' . $name;
		$this->putFiles[] = $path;
		$status = $this->davPut($path, $body)->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT {$path} answered HTTP {$status}");
		}
	}

	/** @AfterScenario */
	public function deleteTheFilesThisScenarioPut(): void {
		foreach ($this->putFiles as $path) {
			$this->davDelete($path);
		}
		$this->putFiles = [];
	}
}
