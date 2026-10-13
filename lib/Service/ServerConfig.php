<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\AppInfo\Application;
use OCP\IAppConfig;

/**
 * The app's one setting: where the PlantUML server is. Plain appconfig, because
 * a URL is not a secret. Stored without a trailing slash so every reader can
 * append `/svg` or `/txt` as is.
 */
final class ServerConfig {
	public const KEY_URL = 'server_url';

	public function __construct(
		private readonly IAppConfig $config,
	) {
	}

	public function getUrl(): string {
		return $this->config->getValueString(Application::APP_ID, self::KEY_URL, '');
	}

	public function isSet(): bool {
		return $this->getUrl() !== '';
	}

	/** Unset the URL; every render then answers "not set". */
	public function clear(): void {
		$this->config->deleteKey(Application::APP_ID, self::KEY_URL);
	}

	/**
	 * Only the shape is checked: whether a PlantUML server answers there is the
	 * health check's question, and the URL may be set before the server is up.
	 *
	 * @throws \InvalidArgumentException unless the URL is absolute http(s) with a host
	 */
	public function setUrl(string $url): void {
		$url = rtrim(trim($url), '/');
		$parts = parse_url($url) ?: [];
		$scheme = strtolower($parts['scheme'] ?? '');
		if (!in_array($scheme, ['http', 'https'], true) || ($parts['host'] ?? '') === '') {
			throw new \InvalidArgumentException('Server URL must be an http or https address, got: ' . $url);
		}
		$this->config->setValueString(Application::APP_ID, self::KEY_URL, $url);
	}
}
