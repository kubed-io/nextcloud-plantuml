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
	private ?ResponseInterface $iconsResponse = null;
	private ?ResponseInterface $emojiResponse = null;
	private ?ResponseInterface $mistakeResponse = null;
	private int $mistakeLine = 0;

	/** @Given the PlantUML server offers its own themes */
	public function thePlantumlServerOffersItsOwnThemes(): void {
		if ($this->themesTheServerLists() === []) {
			throw new \RuntimeException('the test server lists no themes');
		}
	}

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

	/** @Given the PlantUML server offers its own icons */
	public function thePlantumlServerOffersItsOwnIcons(): void {
		if ($this->iconsTheServerLists() === []) {
			throw new \RuntimeException('the test server lists no icons');
		}
	}

	/** @When I ask for the icons the server offers */
	public function iAskForTheIconsTheServerOffers(): void {
		$this->iconsResponse = $this->httpClient()->get($this->baseUrl . '/index.php/apps/plantuml/icons');
	}

	/** @Then I receive the icons the PlantUML server lists */
	public function iReceiveTheIconsThePlantumlServerLists(): void {
		$offered = $this->listIn($this->iconsResponse, 'icons');
		$missing = array_diff($this->iconsTheServerLists(), $offered);
		if ($missing !== []) {
			throw new \RuntimeException('icons the server lists and the app does not offer: ' . implode(' ', array_slice($missing, 0, 20)));
		}
	}

	/** @Given the PlantUML server offers its own emoji */
	public function thePlantumlServerOffersItsOwnEmoji(): void {
		if ($this->emojiTheServerShowsFirst() === []) {
			throw new \RuntimeException('the test server lists no emoji');
		}
	}

	/** @When I ask for the emoji the server offers */
	public function iAskForTheEmojiTheServerOffers(): void {
		$this->emojiResponse = $this->httpClient()->get($this->baseUrl . '/index.php/apps/plantuml/emoji');
	}

	/**
	 * The server lists its emoji a Unicode block at a time; every one of the
	 * block it shows first is offered.
	 *
	 * @Then I receive the emoji the PlantUML server lists
	 */
	public function iReceiveTheEmojiThePlantumlServerLists(): void {
		$offered = $this->listIn($this->emojiResponse, 'emoji');
		$missing = array_diff($this->emojiTheServerShowsFirst(), $offered);
		if ($missing !== []) {
			throw new \RuntimeException('emoji the server lists and the app does not offer: ' . implode(' ', array_slice($missing, 0, 20)));
		}
	}

	/** @return list<string> the app's non-empty list under `$key`, from a 200 answer */
	private function listIn(?ResponseInterface $response, string $key): array {
		$response ??= throw new \LogicException("no {$key} were asked for");
		$list = json_decode((string)$response->getBody(), true)[$key] ?? null;
		if ($response->getStatusCode() !== 200 || !is_array($list) || $list === []) {
			throw new \RuntimeException("expected a list of {$key}, got HTTP {$response->getStatusCode()}: " . substr((string)$response->getBody(), 0, 300));
		}
		return $list;
	}

	/** @return list<string> the icon names the server's `listopeniconic` draws */
	private function iconsTheServerLists(): array {
		$body = (string)(new Client(['http_errors' => false]))->post($this->plantumlUrl . '/svg', [
			'body' => "@startuml\nlistopeniconic\n@enduml\n",
		])->getBody();
		preg_match_all('/<text\b[^>]*>([^<]*)<\/text>/', $body, $m);
		$names = array_map(static fn (string $text): string => html_entity_decode(trim($text)), $m[1]);
		// The title and the credit are text too; an icon name is lowercase with dashes.
		return array_values(array_unique(array_filter($names, static fn (string $n): bool => preg_match('/^[a-z0-9-]{1,64}$/', $n) === 1)));
	}

	/** @return list<string> the emoji names of the block the server's `emoji` shows first */
	private function emojiTheServerShowsFirst(): array {
		$body = (string)(new Client(['http_errors' => false]))->post($this->plantumlUrl . '/txt', [
			'body' => "@startuml\nemoji\n@enduml\n",
		])->getBody();
		preg_match_all('/<:([a-z0-9_+-]{1,64}):>/', $body, $m);
		$block = preg_match('/Unicode Block ([0-9a-f]+)/i', $body, $b) === 1 ? strtolower($b[1]) : '';
		// Each emoji appears by its code point too, which is not a name.
		return array_values(array_unique(array_filter($m[1], static fn (string $n): bool => $block === '' || preg_match('/^' . $block . '[0-9a-f]{2}$/', $n) !== 1)));
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
