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

	/** @When /^I request the image of "([^"]*)"$/ */
	public function iRequestTheImageOf(string $path): void {
		$this->renderResponse = $this->renderByPath($path);
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
		$this->renderResponse = $this->httpClient()->post($this->baseUrl . '/index.php/apps/plantuml/render', [
			'json' => ['source' => $source, 'index' => $index],
			'headers' => ['OCS-APIRequest' => 'true'],
		]);
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
		if ($status !== 404) {
			throw new \RuntimeException("expected HTTP 404, got {$status}");
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

	/**
	 * The source route is CSRF-checked. A basic-auth client has no request
	 * token; Nextcloud passes the check for a request that sends OCS-APIRequest.
	 */
	private function renderBySource(string $source): ResponseInterface {
		return $this->httpClient()->post($this->baseUrl . '/index.php/apps/plantuml/render', [
			'json' => ['source' => $source],
			'headers' => ['OCS-APIRequest' => 'true'],
		]);
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
