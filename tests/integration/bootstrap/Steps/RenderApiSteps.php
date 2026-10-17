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
 * The render routes: a picture by path, as the Viewer asks for it, and by
 * source, as the editor and the README ask for it.
 */
trait RenderApiSteps {
	private ?ResponseInterface $renderResponse = null;

	/** The status a refusal of the last request is: 404, or 400 for an export of a format the server does not draw (ExportSteps). */
	private int $refusal = 404;

	/** @When /^I request the image of "([^"]*)"$/ */
	public function iRequestTheImageOf(string $path): void {
		$this->renderResponse = $this->renderByPath($path);
	}

	/** @When /^I request the image of the diagram "([^"]*)" of "([^"]*)"$/ */
	public function iRequestTheImageOfTheDiagramOf(string $diagram, string $path): void {
		$this->renderResponse = $this->httpClient()->get($this->baseUrl . '/index.php/apps/plantuml/render', [
			'query' => ['path' => $path, 'diagram' => $diagram],
		]);
	}

	/** @Then /^the answer says there is no diagram named "([^"]*)"$/ */
	public function theAnswerSaysThereIsNoDiagramNamed(string $name): void {
		$body = (string)$this->lastRenderResponse()->getBody();
		$answer = json_decode($body, true);
		$problem = is_array($answer) ? ($answer['problem'] ?? null) : null;
		if ($problem !== "no diagram named {$name}") {
			throw new \RuntimeException("expected the problem 'no diagram named {$name}', got: " . substr($body, 0, 300));
		}
	}

	/**
	 * As the editor draws the diagram its cursor is in: the file's source, and
	 * the diagram's place among the file's `@start` lines.
	 *
	 * @When /^I draw the diagram "([^"]*)" of "([^"]*)"$/
	 */
	public function iDrawTheDiagramOf(string $name, string $path): void {
		$response = $this->davGet($path);
		if ($response->getStatusCode() !== 200) {
			throw new \RuntimeException("GET {$path} answered HTTP {$response->getStatusCode()}");
		}
		$source = (string)$response->getBody();
		preg_match_all('/^[ \t]*@start\w+[ \t]*(\S*)/m', $source, $m);
		$index = array_search($name, $m[1], true);
		if ($index === false) {
			throw new \RuntimeException("{$path} has no diagram named {$name}");
		}
		$this->renderResponse = $this->renderWith($source, index: $index);
	}

	/** @Then /^I receive the diagram "([^"]*)"$/ */
	public function iReceiveTheDiagram(string $name): void {
		$response = $this->lastRenderResponse();
		$this->assertSvg($response, self::markerOf($name));
		preg_match_all('/\b(\w+)Marker\b/', (string)$response->getBody(), $m);
		$others = array_diff(array_unique($m[1]), [ucfirst($name)]);
		if ($others !== []) {
			throw new \RuntimeException('the picture also draws ' . implode(', ', $others));
		}
	}

	/** @When the diagram is drawn */
	public function theDiagramIsDrawn(): void {
		$this->renderResponse = $this->renderByPath($this->diagramPath);
	}

	/** @Then the answer says the diagram is too large to draw */
	public function theAnswerSaysTheDiagramIsTooLargeToDraw(): void {
		$response = $this->lastRenderResponse();
		$problem = json_decode((string)$response->getBody(), true)['problem'] ?? null;
		if ($response->getStatusCode() !== 413 || $problem !== 'The diagram is too large to draw') {
			throw new \RuntimeException("expected HTTP 413 'The diagram is too large to draw', got {$response->getStatusCode()} " . substr((string)$response->getBody(), 0, 200));
		}
	}

	/** @Then I receive the diagram as an SVG image */
	public function iReceiveTheDiagramAsAnSvgImage(): void {
		$this->assertSvg($this->lastRenderResponse());
	}

	/** @Then the request is refused */
	public function theRequestIsRefused(): void {
		$status = $this->lastRenderResponse()->getStatusCode();
		if ($status !== $this->refusal) {
			throw new \RuntimeException("expected HTTP {$this->refusal}, got {$status}");
		}
	}

	private function lastRenderResponse(): ResponseInterface {
		return $this->renderResponse ?? throw new \LogicException('no render request was made');
	}

	/** A basic-auth client for the app's routes and Nextcloud's own. */
	private function httpClient(): Client {
		return new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]);
	}

	private function renderByPath(string $path): ResponseInterface {
		return $this->httpClient()->get($this->baseUrl . '/index.php/apps/plantuml/render', [
			'query' => ['path' => $path],
		]);
	}

	/** The source alone, as a README's fence is drawn. */
	private function renderBySource(string $source): ResponseInterface {
		return $this->renderWith($source);
	}

	/**
	 * POST /render as the editor sends it: the file whose folder includes
	 * resolve against, and any linked file's unsaved text. The route is
	 * CSRF-checked. A basic-auth client has no request token; Nextcloud passes
	 * the check for a request that sends OCS-APIRequest.
	 *
	 * @param array<string, string> $overrides
	 */
	private function renderWith(string $source, string $path = '', array $overrides = [], int $index = 0): ResponseInterface {
		$body = ['source' => $source, 'index' => $index];
		if ($path !== '') {
			$body['path'] = $path;
		}
		if ($overrides !== []) {
			$body['overrides'] = $overrides;
		}
		return $this->httpClient()->post($this->baseUrl . '/index.php/apps/plantuml/render', [
			'json' => $body,
			'headers' => ['OCS-APIRequest' => 'true'],
		]);
	}

	/** The drawing's one mistake, as the routes send it: the message and the 0-based line. */
	private function assertMistake(string $expected, int $line): void {
		$response = $this->lastRenderResponse();
		$error = rawurldecode($response->getHeaderLine('X-PlantUML-Diagram-Error'));
		$at = $response->getHeaderLine('X-PlantUML-Diagram-Error-Line');
		if ($error !== $expected || $at !== (string)$line) {
			throw new \RuntimeException("expected '{$expected}' on line {$line}, got HTTP {$response->getStatusCode()}, error '{$error}', line '{$at}'");
		}
	}

	/** A 200 SVG and, when given, with that text drawn in it. */
	private function assertSvg(ResponseInterface $response, string $drawn = ''): void {
		$body = (string)$response->getBody();
		if ($response->getStatusCode() !== 200
			|| !str_starts_with($response->getHeaderLine('Content-Type'), 'image/svg+xml')
			|| !str_contains($body, '<svg')
			|| !str_contains($body, $drawn)) {
			throw new \RuntimeException(sprintf(
				"expected a 200 SVG%s, got HTTP %d %s:\n%s",
				$drawn === '' ? '' : " showing '{$drawn}'",
				$response->getStatusCode(),
				$response->getHeaderLine('Content-Type'),
				substr($body, 0, 500),
			));
		}
	}
}
