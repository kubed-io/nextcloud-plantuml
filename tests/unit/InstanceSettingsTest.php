<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\ServerConfig;
use OCA\PlantUml\Settings\InstanceSettings;
use OCP\IAppConfig;
use OCP\IUser;
use OCP\Settings\DeclarativeSettingsTypes;
use PHPUnit\Framework\TestCase;

final class InstanceSettingsTest extends TestCase {
	/** @var array<string,string> appconfig as the fake below holds it, keyed "app/key" */
	private array $stored = [];
	private InstanceSettings $settings;

	protected function setUp(): void {
		parent::setUp();
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturnCallback(
			fn (string $app, string $key, string $default = ''): string => $this->stored["$app/$key"] ?? $default,
		);
		$config->method('setValueString')->willReturnCallback(
			function (string $app, string $key, string $value): bool {
				$this->stored["$app/$key"] = $value;
				return true;
			},
		);
		$this->settings = new InstanceSettings(new ServerConfig($config));
	}

	public function testTheCardIsTitledAndSubtitledAsDesigned(): void {
		$schema = $this->settings->getSchema();

		self::assertSame('plantuml', $schema['section_id']);
		self::assertSame(DeclarativeSettingsTypes::SECTION_TYPE_ADMIN, $schema['section_type']);
		self::assertSame('PlantUML', $schema['title']);
		self::assertSame('Point to your PlantUML server', $schema['description']);
	}

	public function testTheOnlyFieldIsTheServerUrl(): void {
		$fields = $this->settings->getSchema()['fields'];

		self::assertCount(1, $fields);
		self::assertSame('server_url', $fields[0]['id']);
		self::assertSame(DeclarativeSettingsTypes::URL, $fields[0]['type']);
		self::assertSame('Server URL', $fields[0]['title']);
	}

	public function testASavedUrlIsStoredNormalisedAndReadBack(): void {
		$admin = $this->createStub(IUser::class);

		$this->settings->setValue('server_url', 'https://p.example.com/', $admin);

		self::assertSame('https://p.example.com', $this->stored['plantuml/server_url']);
		self::assertSame('https://p.example.com', $this->settings->getValue('server_url', $admin));
	}
}
