<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\PlantUml\Listener\LoadFilesScriptListener;
use OCA\PlantUml\Service\ServerConfig;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\Util;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class LoadFilesScriptListenerTest extends TestCase {
	#[\Override]
	protected function setUp(): void {
		Util::resetScripts();
	}

	/** @return array<string, array{bool}> */
	public static function configured(): array {
		return ['set' => [true], 'not set' => [false]];
	}

	#[DataProvider('configured')]
	public function testProvidesWhetherTheServerIsConfigured(bool $isSet): void {
		$serverConfig = $this->createStub(ServerConfig::class);
		$serverConfig->method('isSet')->willReturn($isSet);
		$initialState = $this->createMock(IInitialState::class);
		$initialState->expects(self::once())
			->method('provideInitialState')
			->with('server_configured', $isSet);

		(new LoadFilesScriptListener($serverConfig, $initialState))->handle(new LoadAdditionalScriptsEvent());
	}

	public function testAddsTheFilesBundleThenTheReadmeBundle(): void {
		$listener = new LoadFilesScriptListener(
			$this->createStub(ServerConfig::class),
			$this->createStub(IInitialState::class),
		);

		$listener->handle(new LoadAdditionalScriptsEvent());

		self::assertSame(
			['plantuml/js/../dist/plantuml-files', 'plantuml/js/../dist/plantuml-readme'],
			Util::getScripts(),
		);
	}

	public function testIgnoresAnyOtherEvent(): void {
		$initialState = $this->createMock(IInitialState::class);
		$initialState->expects(self::never())->method('provideInitialState');

		(new LoadFilesScriptListener($this->createStub(ServerConfig::class), $initialState))->handle(new Event());

		self::assertSame([], Util::getScripts());
	}
}
