<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Command\ShowConfig;
use OCA\PlantUml\Service\ServerConfig;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\IAppConfig;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;

final class ShowConfigTest extends TestCase {
	private function tester(string $stored, ?string $actor = 'admin'): CommandTester {
		$config = $this->createStub(IAppConfig::class);
		$config->method('getValueString')->willReturn($stored);
		$library = $this->createStub(TemplateLibrary::class);
		$library->method('folder')->willReturn('Templates');
		$library->method('actor')->willReturn($actor);
		return new CommandTester(new ShowConfig(new ServerConfig($config), $library));
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

	public function testPrintsTheTemplateFolderAndActor(): void {
		$tester = $this->tester('https://p.example.com');
		$tester->execute([]);
		self::assertStringContainsString("template_folder: Templates\ntemplate_actor: admin", $tester->getDisplay());
	}

	public function testPrintsNoActor(): void {
		$tester = $this->tester('https://p.example.com', null);
		$tester->execute([]);
		self::assertStringContainsString('template_actor: (none)', $tester->getDisplay());
	}

	public function testTheTemplateLinesShowWhenTheUrlIsUnset(): void {
		$tester = $this->tester('');
		self::assertSame(1, $tester->execute([]));
		self::assertStringContainsString('template_folder: Templates', $tester->getDisplay());
	}
}
