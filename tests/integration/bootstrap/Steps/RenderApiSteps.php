<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use GuzzleHttp\Client;
use Psr\Http\Message\ResponseInterface;

/** The render route, asked for a picture by path as the Viewer asks for it. */
trait RenderApiSteps {
	private ?ResponseInterface $renderResponse = null;

	/** @When /^I request the image of "([^"]*)"$/ */
	public function iRequestTheImageOf(string $path): void {
		$client = new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]);
		$this->renderResponse = $client->get($this->baseUrl . '/index.php/apps/plantuml/render', [
			'query' => ['path' => $path],
		]);
	}

	/** @Then I receive the diagram as an SVG image */
	public function iReceiveTheDiagramAsAnSvgImage(): void {
		$response = $this->lastRenderResponse();
		$body = (string)$response->getBody();
		if ($response->getStatusCode() !== 200
			|| !str_starts_with($response->getHeaderLine('Content-Type'), 'image/svg+xml')
			|| !str_contains($body, '<svg')) {
			throw new \RuntimeException(sprintf(
				"expected a 200 SVG, got HTTP %d %s:\n%s",
				$response->getStatusCode(),
				$response->getHeaderLine('Content-Type'),
				substr($body, 0, 500),
			));
		}
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
}
