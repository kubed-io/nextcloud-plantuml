<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Support;

use GuzzleHttp\Client;
use Psr\Http\Message\ResponseInterface;

/**
 * The WebDAV transport: what a browser or a desktop client sends when a user
 * acts in the Files app. Every call is made as the admin user against the
 * running Nextcloud the workflow started.
 */
trait WebDavTrait {
	private ?Client $dav = null;

	private function davClient(): Client {
		if ($this->dav === null) {
			$this->dav = new Client([
				'base_uri' => $this->baseUrl . '/remote.php/dav/files/' . $this->adminUser . '/',
				'auth' => [$this->adminUser, $this->adminPass],
				'http_errors' => false,
			]);
		}
		return $this->dav;
	}

	private function davPath(string $path): string {
		return implode('/', array_map('rawurlencode', explode('/', trim($path, '/'))));
	}

	private function davPut(string $path, string $body, ?string $contentType = null): ResponseInterface {
		$headers = $contentType === null ? [] : ['Content-Type' => $contentType];
		return $this->davClient()->put($this->davPath($path), ['body' => $body, 'headers' => $headers]);
	}

	private function davGet(string $path): ResponseInterface {
		return $this->davClient()->get($this->davPath($path));
	}

	private function davMkcol(string $path): ResponseInterface {
		return $this->davClient()->request('MKCOL', $this->davPath($path));
	}

	private function davDelete(string $path): ResponseInterface {
		return $this->davClient()->delete($this->davPath($path));
	}

	private function davExists(string $path): bool {
		return $this->davClient()->request('PROPFIND', $this->davPath($path), ['headers' => ['Depth' => '0']])->getStatusCode() === 207;
	}

	/** The mimetype Nextcloud detected for a file, from its DAV properties. */
	private function davContentType(string $path): ?string {
		$body = <<<'XML'
<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getcontenttype/></d:prop></d:propfind>
XML;
		$response = $this->davClient()->request('PROPFIND', $this->davPath($path), ['headers' => ['Depth' => '0'], 'body' => $body]);
		if ($response->getStatusCode() !== 207) {
			return null;
		}
		if (preg_match('#<d:getcontenttype>([^<]*)</d:getcontenttype>#', (string)$response->getBody(), $m) !== 1) {
			return null;
		}
		return $m[1];
	}

	/** Make sure a folder exists, creating each missing segment. */
	private function davEnsureFolder(string $path): void {
		$built = '';
		foreach (array_filter(explode('/', trim($path, '/'))) as $segment) {
			$built .= '/' . $segment;
			if (!$this->davExists($built)) {
				$this->davMkcol($built);
			}
		}
	}

	private function assertFileHolds(string $path, string $expected): void {
		$response = $this->davGet($path);
		$body = (string)$response->getBody();
		if ($response->getStatusCode() !== 200 || $body !== $expected) {
			throw new \RuntimeException(sprintf(
				"expected %s to hold:\n%s\ngot HTTP %d:\n%s",
				$path,
				$expected,
				$response->getStatusCode(),
				$body,
			));
		}
	}
}
