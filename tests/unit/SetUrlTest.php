<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Command\SetUrl;
use OCA\PlantUml\Service\ServerConfig;
use OCP\IAppConfig;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;

final class SetUrlTest extends TestCase {
	public function testStoresTheUrl(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::once())
			->method('setValueString')
			->with('plantuml', 'server_url', 'https://p.example.com');
		$tester = new CommandTester(new SetUrl(new ServerConfig($config)));

		self::assertSame(0, $tester->execute(['url' => 'https://p.example.com/']));
	}

	public function testRejectsAnythingButAnHttpUrl(): void {
		$config = $this->createMock(IAppConfig::class);
		$config->expects(self::never())->method('setValueString');
		$tester = new CommandTester(new SetUrl(new ServerConfig($config)));

		self::assertSame(1, $tester->execute(['url' => 'example']));
		self::assertStringContainsString('http or https', $tester->getDisplay());
	}
}
