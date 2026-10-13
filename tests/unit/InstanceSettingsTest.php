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
use Psr\Log\LoggerInterface;

final class InstanceSettingsTest extends TestCase {
	/** @var array<string,string> appconfig as the fake below holds it, keyed "app/key" */
	private array $stored = [];
	private InstanceSettings $settings;
	private ServerConfig $server;

	protected function setUp(): void {
		parent::setUp();
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturnCallback(
			fn (string $app, string $key, string $default = ''): string => $this->stored["$app/$key"] ?? $default,
		);
		$config->method('deleteKey')->willReturnCallback(
			function (string $app, string $key): void {
				unset($this->stored["$app/$key"]);
			},
		);
		$config->method('setValueString')->willReturnCallback(
			function (string $app, string $key, string $value): bool {
				$this->stored["$app/$key"] = $value;
				return true;
			},
		);
		$this->server = new ServerConfig($config);
		$this->settings = new InstanceSettings($this->server, $this->createStub(LoggerInterface::class));
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

	/** Emptying the field and saving unsets the URL, rather than failing the save. */
	public function testAnEmptySubmitClearsTheUrl(): void {
		$admin = $this->createStub(IUser::class);
		$this->stored['plantuml/server_url'] = 'https://p.example.com';

		$this->settings->setValue('server_url', '  ', $admin);

		self::assertArrayNotHasKey('plantuml/server_url', $this->stored);
		self::assertSame('', $this->settings->getValue('server_url', $admin));
	}

	/** Core turns the throw into a generic toast, so the reason is logged. */
	public function testARefusedUrlIsLoggedWithItsReasonAndNotStored(): void {
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::once())
			->method('info')
			->with(self::anything(), self::callback(
				static fn (array $context): bool => str_contains($context['reason'], 'http or https'),
			));

		try {
			(new InstanceSettings($this->server, $logger))->setValue('server_url', 'plantuml.example.com', $this->createStub(IUser::class));
			self::fail('expected the URL to be refused');
		} catch (\InvalidArgumentException) {
		}
		self::assertArrayNotHasKey('plantuml/server_url', $this->stored);
	}
}
