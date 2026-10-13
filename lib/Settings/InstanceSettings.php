<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Settings;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Service\ServerConfig;
use OCP\IUser;
use OCP\Settings\DeclarativeSettingsTypes;
use OCP\Settings\IDeclarativeSettingsFormWithHandlers;
use Psr\Log\LoggerInterface;

/**
 * The admin card: one field, the server URL. Saved through {@see ServerConfig},
 * so the card and `occ plantuml:set-url` normalise and validate alike.
 *
 * EXTERNAL storage, as in the siblings: core answers an app's storage type from
 * the first schema it registered, so an INTERNAL card here would decide it for
 * every card the app ever adds.
 */
final class InstanceSettings implements IDeclarativeSettingsFormWithHandlers {
	public function __construct(
		private readonly ServerConfig $server,
		private readonly LoggerInterface $logger,
	) {
	}

	#[\Override]
	public function getSchema(): array {
		return [
			// Not app-prefixed: the settings frontend strips a leading "<app>_"
			// before saving, and the save then misses this form.
			'id' => 'instance',
			'priority' => 5,
			'section_type' => DeclarativeSettingsTypes::SECTION_TYPE_ADMIN,
			'section_id' => Application::APP_ID,
			'storage_type' => DeclarativeSettingsTypes::STORAGE_TYPE_EXTERNAL,
			'title' => 'PlantUML',
			'description' => 'Point to your PlantUML server',
			'fields' => [
				[
					'id' => ServerConfig::KEY_URL,
					'title' => 'Server URL',
					'type' => DeclarativeSettingsTypes::URL,
					'default' => '',
				],
			],
		];
	}

	#[\Override]
	public function getValue(string $fieldId, IUser $user): mixed {
		return $fieldId === ServerConfig::KEY_URL ? $this->server->getUrl() : null;
	}

	#[\Override]
	public function setValue(string $fieldId, mixed $value, IUser $user): void {
		if ($fieldId !== ServerConfig::KEY_URL) {
			return;
		}
		$url = is_string($value) ? trim($value) : '';
		if ($url === '') {
			$this->server->clear();
			return;
		}
		try {
			$this->server->setUrl($url);
		} catch (\InvalidArgumentException $e) {
			// Core shows only a generic "failed to save"; the reason goes to the log.
			$this->logger->info('Server URL refused: {reason}', ['reason' => $e->getMessage()]);
			throw $e;
		}
	}
}
