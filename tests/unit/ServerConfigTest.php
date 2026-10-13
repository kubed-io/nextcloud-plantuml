<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\ServerConfig;
use OCP\IAppConfig;
use PHPUnit\Framework\TestCase;

final class ServerConfigTest extends TestCase {
	public function testUnsetReadsAsEmpty(): void {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturnMap([
			['plantuml', 'server_url', '', false, false, ''],
		]);
		$server = new ServerConfig($config);

		self::assertSame('', $server->getUrl());
		self::assertFalse($server->isSet());
	}

	public function testSetStoresWithoutTrailingSlash(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::once())
			->method('setValueString')
			->with('plantuml', 'server_url', 'https://p.example.com');

		(new ServerConfig($config))->setUrl('https://p.example.com/');
	}

	public function testReadsTheStoredUrl(): void {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn('https://p.example.com');
		$server = new ServerConfig($config);

		self::assertSame('https://p.example.com', $server->getUrl());
		self::assertTrue($server->isSet());
	}

	public function testRejectsUrlWithoutScheme(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::never())->method('setValueString');

		$this->expectException(\InvalidArgumentException::class);
		(new ServerConfig($config))->setUrl('p.example.com');
	}

	public function testRejectsFtp(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::never())->method('setValueString');

		$this->expectException(\InvalidArgumentException::class);
		(new ServerConfig($config))->setUrl('ftp://p.example.com');
	}
}
