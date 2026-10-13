<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Controller\ConfigController;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\RenderService;
use OCP\IRequest;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ConfigControllerTest extends TestCase {
	private function controller(RenderService $render): ConfigController {
		return new ConfigController('plantuml', $this->createStub(IRequest::class), $render);
	}

	public function testSuccessNamesTheVersion(): void {
		$render = $this->createStub(RenderService::class);
		$render->method('version')->willReturn('1.2026.8');

		$response = $this->controller($render)->testConnection();

		self::assertSame(200, $response->getStatus());
		self::assertSame(['success' => true, 'message' => 'PlantUML 1.2026.8'], $response->getData());
	}

	/** @return array<string, array{string, string}> */
	public static function problems(): array {
		return [
			'not set' => [RenderException::PROBLEM_NOT_SET, 'Server URL is not set'],
			'unreachable' => [RenderException::PROBLEM_UNREACHABLE, 'Server is unreachable'],
			'not plantuml' => [RenderException::PROBLEM_NOT_PLANTUML, 'Server is not a PlantUML server'],
		];
	}

	#[DataProvider('problems')]
	public function testEachProblemIsItsAdminLine(string $problem, string $line): void {
		$render = $this->createStub(RenderService::class);
		$render->method('version')->willThrowException(new RenderException($problem));

		$response = $this->controller($render)->testConnection();

		// 200 either way: the request worked, the answer is the verdict.
		self::assertSame(200, $response->getStatus());
		self::assertSame(['success' => false, 'message' => $line], $response->getData());
	}
}
