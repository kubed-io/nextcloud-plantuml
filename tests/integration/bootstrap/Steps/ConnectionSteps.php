<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use Behat\Gherkin\Node\TableNode;

/**
 * The admin card and its Test connection button, driven through their occ
 * twins against the real PlantUML server the workflow started.
 */
trait ConnectionSteps {
	/** @Given no server is configured yet */
	public function noServerIsConfiguredYet(): void {
		$this->appConfigDelete('server_url');
	}

	/**
	 * "Connected" implies "enabled": CI never pre-enables the app, so a feature
	 * whose Background starts here would otherwise run set-url as an unknown
	 * command.
	 *
	 * @Given the app is connected to a PlantUML server
	 */
	public function theAppIsConnectedToAPlantUmlServer(): void {
		$this->theAppIsEnabled();
		$res = $this->occ('plantuml:set-url ' . escapeshellarg($this->plantumlUrl));
		if ($res['exit'] !== 0) {
			throw new \RuntimeException("set-url failed (exit {$res['exit']}):\n{$res['output']}");
		}
	}

	/**
	 * A cell names the KIND of URL; the real one comes from the environment.
	 * Not asserted to succeed: a refused URL leaves none stored, which is a
	 * state the health check has to name.
	 *
	 * @When the admin fills in the connection details:
	 */
	public function theAdminFillsInTheConnectionDetails(TableNode $table): void {
		foreach ($table->getRowsHash() as $field => $value) {
			if ($field !== 'url') {
				throw new \RuntimeException("no connection field called '{$field}'");
			}
			if ($value === '') {
				$this->appConfigDelete('server_url');
				continue;
			}
			$this->occ('plantuml:set-url ' . escapeshellarg($this->urlFor($value)));
		}
	}

	private function urlFor(string $kind): string {
		return match ($kind) {
			'the test server' => $this->plantumlUrl,
			// Port 9 (discard) has nothing listening on a CI runner.
			'an unreachable host' => 'http://127.0.0.1:9',
			// Nextcloud itself: a web server that answers, and is not PlantUML.
			'a server that is not PlantUML' => $this->baseUrl,
			default => throw new \RuntimeException("no URL kind called '{$kind}'"),
		};
	}

	/** @When the admin tests the connection */
	public function theAdminTestsTheConnection(): void {
		$this->occ('plantuml:test-connection');
	}

	/** @Then the health check reports success */
	public function theHealthCheckReportsSuccess(): void {
		if ($this->lastExit !== 0) {
			throw new \RuntimeException("expected the health check to succeed:\n{$this->lastOutput}");
		}
	}

	/** @Then the health check reports an error */
	public function theHealthCheckReportsAnError(): void {
		if ($this->lastExit === 0) {
			throw new \RuntimeException("expected the health check to fail:\n{$this->lastOutput}");
		}
	}

	/** @Then the health check names the PlantUML version the server is running */
	public function theHealthCheckNamesThePlantUmlVersion(): void {
		if (preg_match('/PlantUML \d+\.\d+\.\d+/', $this->lastOutput) !== 1) {
			throw new \RuntimeException("expected a PlantUML version, got:\n{$this->lastOutput}");
		}
	}

	/** @Then /^the message says the server is (.+)$/ */
	public function theMessageSaysTheServerIs(string $problem): void {
		$line = match ($problem) {
			'not set' => 'Server URL is not set',
			'unreachable' => 'Server is unreachable',
			'not a PlantUML server' => 'Server is not a PlantUML server',
			default => throw new \RuntimeException("no problem called '{$problem}'"),
		};
		if (!str_contains($this->lastOutput, $line)) {
			throw new \RuntimeException("expected '{$line}', got:\n{$this->lastOutput}");
		}
	}
}
