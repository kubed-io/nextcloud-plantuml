<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\AppInfo\Application;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootstrap;
use PHPUnit\Framework\TestCase;

final class ApplicationTest extends TestCase {
	public function testAppIdIsPlantuml(): void {
		self::assertSame('plantuml', Application::APP_ID);
	}

	public function testIsABootstrappedApp(): void {
		$app = new Application();
		self::assertInstanceOf(App::class, $app);
		self::assertInstanceOf(IBootstrap::class, $app);
	}
}
