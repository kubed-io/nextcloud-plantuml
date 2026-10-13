<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\Exception\RenderException;
use OCP\Http\Client\IClientService;
use OCP\Http\Client\IResponse;
use Psr\Log\LoggerInterface;

/**
 * The one place the app talks to the PlantUML server: `POST <server>/<format>`
 * with the diagram source as the body.
 *
 * Every failure becomes one of {@see RenderException}'s three problems, in this
 * order: no URL, then no answer, then an answer that is not PlantUML's. The
 * cause is logged, because the problem word alone does not say which status or
 * connect error produced it.
 */
final class RenderService {
	private const VERSION_DIAGRAM = "@startuml\nversion\n@enduml\n";

	public function __construct(
		private readonly ServerConfig $config,
		private readonly IClientService $clientService,
		private readonly LoggerInterface $logger,
	) {
	}

	/** @throws RenderException */
	public function render(string $source): Rendered {
		$response = $this->post('svg', $source);
		// An image is a render whatever the status: PlantUML answers a mistake in
		// the diagram with a 400 and the error drawn in. Anything that is not an
		// image, a 200 page from a catch-all web server included, is not PlantUML.
		$contentType = $response->getHeader('Content-Type');
		if (!str_starts_with(strtolower($contentType), 'image/')) {
			throw $this->notPlantUml(sprintf('svg answered HTTP %d %s', $response->getStatusCode(), $contentType));
		}
		return new Rendered((string)$response->getBody(), $contentType);
	}

	/**
	 * The server's PlantUML version, read off the `version` diagram rendered as
	 * text. Only a PlantUML server can answer it, which is what makes it the
	 * health check.
	 *
	 * @throws RenderException
	 */
	public function version(): string {
		$response = $this->post('txt', self::VERSION_DIAGRAM);
		if ($response->getStatusCode() >= 400) {
			throw $this->notPlantUml('txt answered HTTP ' . $response->getStatusCode());
		}
		if (preg_match('/PlantUML\s+(\d+\.\d+\.\d+)/', (string)$response->getBody(), $m) !== 1) {
			throw $this->notPlantUml('txt answered without a PlantUML version');
		}
		return $m[1];
	}

	/** @throws RenderException */
	private function post(string $format, string $source): IResponse {
		$url = $this->config->getUrl();
		if ($url === '') {
			throw new RenderException(RenderException::PROBLEM_NOT_SET);
		}
		try {
			return $this->clientService->newClient()->post($url . '/' . $format, [
				'body' => $source,
				'headers' => ['Content-Type' => 'text/plain; charset=utf-8'],
				'timeout' => 10,
				// The status is classified below, so a 4xx must come back as a
				// response rather than as an exception that reads as unreachable.
				'http_errors' => false,
				// Homelab PlantUML servers live at in-cluster addresses.
				'nextcloud' => ['allow_local_address' => true],
			]);
		} catch (\Throwable $e) {
			$this->logger->info('PlantUML server at {url} is unreachable', ['url' => $url, 'exception' => $e]);
			throw new RenderException(RenderException::PROBLEM_UNREACHABLE, $e);
		}
	}

	private function notPlantUml(string $cause): RenderException {
		$this->logger->info('PlantUML server at {url} is not a PlantUML server: {cause}', [
			'url' => $this->config->getUrl(),
			'cause' => $cause,
		]);
		return new RenderException(RenderException::PROBLEM_NOT_PLANTUML);
	}
}
