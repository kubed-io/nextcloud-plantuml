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
