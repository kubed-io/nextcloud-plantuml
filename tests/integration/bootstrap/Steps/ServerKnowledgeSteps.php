<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use GuzzleHttp\Client;
use Psr\Http\Message\ResponseInterface;

/**
 * What the editor learns from the PlantUML server through the app: the themes
 * it ships, and the line a mistake is on. Both are checked against the test
 * server itself, never against a list written down here.
 */
trait ServerKnowledgeSteps {
	private ?ResponseInterface $themesResponse = null;
	private ?ResponseInterface $mistakeResponse = null;
	private int $mistakeLine = 0;

	/** @When I ask for the themes the server offers */
	public function iAskForTheThemesTheServerOffers(): void {
		$this->themesResponse = $this->httpClient()->get($this->baseUrl . '/index.php/apps/plantuml/themes');
	}

	/** @Then I receive the themes the PlantUML server lists */
	public function iReceiveTheThemesThePlantumlServerLists(): void {
		$response = $this->themesResponse ?? throw new \LogicException('no themes were asked for');
		$offered = json_decode((string)$response->getBody(), true)['themes'] ?? null;
		if ($response->getStatusCode() !== 200 || !is_array($offered) || $offered === []) {
			throw new \RuntimeException("expected a list of themes, got HTTP {$response->getStatusCode()}: " . substr((string)$response->getBody(), 0, 300));
		}
		$listed = $this->themesTheServerLists();
		sort($offered);
		sort($listed);
		if ($offered !== $listed) {
			throw new \RuntimeException(sprintf(
				"the app offers %d themes and the server lists %d\nonly offered: %s\nonly listed: %s",
				count($offered),
				count($listed),
				implode(' ', array_diff($offered, $listed)),
				implode(' ', array_diff($listed, $offered)),
			));
		}
	}

	/**
	 * The mistake goes on the line before `@enduml`, so its line number in the
	 * document is known whatever the file held.
	 *
	 * @When /^I change the source of "([^"]*)" to one with a mistake, without saving$/
	 */
	public function iChangeTheSourceToOneWithAMistake(string $path): void {
		$response = $this->davGet($path);
		if ($response->getStatusCode() !== 200) {
			throw new \RuntimeException("GET {$path} answered HTTP {$response->getStatusCode()}");
		}
		$lines = explode("\n", (string)$response->getBody());
		$end = array_search('@enduml', $lines, true);
		if ($end === false) {
			throw new \RuntimeException("{$path} has no @enduml line");
		}
		array_splice($lines, $end, 0, ['this line is not PlantUML']);
		$this->mistakeLine = $end + 1;
		$this->mistakeResponse = $this->renderBySource(implode("\n", $lines));
	}

	/** @Then the diagram names the line the mistake is on */
	public function theDiagramNamesTheLineTheMistakeIsOn(): void {
		$response = $this->mistakeResponse ?? throw new \LogicException('no mistake was drawn');
		$error = $response->getHeaderLine('X-PlantUML-Diagram-Error');
		$line = $response->getHeaderLine('X-PlantUML-Diagram-Error-Line');
		// The server counts from 0 at the top of the source; the document from 1.
		if ($error === '' || !ctype_digit($line) || (int)$line + 1 !== $this->mistakeLine) {
			throw new \RuntimeException(sprintf(
				"expected an error on line %d, got HTTP %d, error '%s', line '%s'",
				$this->mistakeLine,
				$response->getStatusCode(),
				$error,
				$line,
			));
		}
	}

	/** @return list<string> the names after "The possible themes are" in the server's own help */
	private function themesTheServerLists(): array {
		$body = (string)(new Client(['http_errors' => false]))->post($this->plantumlUrl . '/txt', [
			'body' => "@startuml\nhelp themes\n@enduml\n",
		])->getBody();
		$at = strpos($body, 'The possible themes are');
		$tokens = preg_split('/\s+/', $at === false ? '' : substr($body, $at + strlen('The possible themes are')), -1, PREG_SPLIT_NO_EMPTY) ?: [];
		return array_values(array_filter($tokens, static fn (string $t): bool => preg_match('/^[\w-]+$/', $t) === 1));
	}
}
