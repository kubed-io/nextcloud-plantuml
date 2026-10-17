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
			['plantuml', 'server_url', '', false, ''],
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

	public function testClearDeletesTheKey(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::once())->method('deleteKey')->with('plantuml', 'server_url');
		$config->expects(self::never())->method('setValueString');

		(new ServerConfig($config))->clear();
	}

	public function testEmptyIsNotAUrl(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::never())->method('setValueString');

		$this->expectException(\InvalidArgumentException::class);
		(new ServerConfig($config))->setUrl('');
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

	public function testRedactedKeepsOnlySchemeHostAndPort(): void {
		self::assertSame('https://h:8443', ServerConfig::redacted('https://user:pw@h:8443/p?q'));
		self::assertSame('http://p.example.com', ServerConfig::redacted('HTTP://p.example.com/plantuml'));
		self::assertSame('', ServerConfig::redacted('not a url'));
		self::assertSame('', ServerConfig::redacted(''));
	}

	public function testARefusedUrlNeverCarriesItsPassword(): void {
		$config = $this->createStub(IAppConfig::class);
		try {
			(new ServerConfig($config))->setUrl('ftp://user:secretpw@h/p');
			self::fail('expected the URL to be refused');
		} catch (\InvalidArgumentException $e) {
			self::assertStringNotContainsString('secretpw', $e->getMessage());
			self::assertStringContainsString('http or https', $e->getMessage());
		}
	}
}
