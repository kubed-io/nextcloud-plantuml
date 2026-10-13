<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Command\ShowConfig;
use OCA\PlantUml\Service\ServerConfig;
use OCP\IAppConfig;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;

final class ShowConfigTest extends TestCase {
	private function tester(string $stored): CommandTester {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn($stored);
		return new CommandTester(new ShowConfig(new ServerConfig($config)));
	}

	public function testPrintsTheUrl(): void {
		$tester = $this->tester('https://p.example.com');

		self::assertSame(0, $tester->execute([]));
		self::assertStringContainsString('server_url: https://p.example.com', $tester->getDisplay());
	}

	public function testSaysWhenNothingIsSetAndFails(): void {
		$tester = $this->tester('');

		self::assertSame(1, $tester->execute([]));
		self::assertStringContainsString('server_url: (not set)', $tester->getDisplay());
	}
}
