<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Controller\TemplatesController;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

final class TemplatesControllerTest extends TestCase {
	/** @param list<array{source: 'shared'|'yours', path: string, text: string}> $files */
	private function controller(array $files): TemplatesController {
		$library = $this->createStub(TemplateLibrary::class);
		$library->method('files')->willReturn($files);
		return new TemplatesController($this->createStub(IRequest::class), $library);
	}

	public function testAnswersTheLibrarysFiles(): void {
		$files = [['source' => 'shared', 'path' => 'Templates/a.puml', 'text' => "@startuml\n@enduml"]];
		$response = $this->controller($files)->index();
		self::assertSame(200, $response->getStatus());
		self::assertSame(['files' => $files], $response->getData());
	}

	public function testNoTemplatesIsAnEmptyList(): void {
		self::assertSame(['files' => []], $this->controller([])->index()->getData());
	}

	public function testTheRouteIsForLoggedInUsers(): void {
		$method = new \ReflectionMethod(TemplatesController::class, 'index');
		$names = array_map(static fn (\ReflectionAttribute $a): string => $a->getName(), $method->getAttributes());
		self::assertContains(NoAdminRequired::class, $names);
		self::assertContains(NoCSRFRequired::class, $names);
		self::assertNotContains(PublicPage::class, $names);
	}
}
