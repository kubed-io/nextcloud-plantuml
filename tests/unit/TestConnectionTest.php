<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Command\TestConnection;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\RenderService;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;

final class TestConnectionTest extends TestCase {
	public function testSuccessPrintsTheVersion(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('version')->willReturn('1.2026.8');
		$tester = new CommandTester(new TestConnection($render));

		self::assertSame(0, $tester->execute([]));
		self::assertStringContainsString('PlantUML 1.2026.8', $tester->getDisplay());
	}

	public function testAProblemPrintsItsAdminLineAndFails(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('version')->willThrowException(new RenderException(RenderException::PROBLEM_UNREACHABLE));
		$tester = new CommandTester(new TestConnection($render));

		self::assertSame(1, $tester->execute([]));
		self::assertStringContainsString('Server is unreachable', $tester->getDisplay());
	}
}
