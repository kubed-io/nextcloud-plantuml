<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit\Listener;

use OCA\PlantUml\Listener\NewDiagramListener;
use OCP\EventDispatcher\Event;
use OCP\Files\File;
use OCP\Files\Template\FileCreatedFromTemplateEvent;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class NewDiagramListenerTest extends TestCase {
	/** @return array<string, array{string}> */
	public static function diagramNames(): array {
		return ['.puml' => ['New diagram.puml'], '.PlantUML' => ['Checkout.PlantUML']];
	}

	#[DataProvider('diagramNames')]
	public function testWritesTheEmptyDiagramIntoANewEmptyDiagramFile(string $name): void {
		$target = $this->target($name, 0);
		$target->expects(self::once())->method('putContent')->with("@startuml\n\n@enduml\n");

		(new NewDiagramListener())->handle(new FileCreatedFromTemplateEvent(null, $target, []));
	}

	public function testLeavesAFileThatIsNotADiagram(): void {
		$target = $this->target('notes.txt', 0);
		$target->expects(self::never())->method('putContent');

		(new NewDiagramListener())->handle(new FileCreatedFromTemplateEvent(null, $target, []));
	}

	public function testLeavesADiagramFileThatAlreadyHasContent(): void {
		$target = $this->target('Order flow.puml', 42);
		$target->expects(self::never())->method('putContent');

		(new NewDiagramListener())->handle(new FileCreatedFromTemplateEvent(null, $target, []));
	}

	public function testLeavesADiagramFileCreatedFromATemplate(): void {
		$target = $this->target('Order flow.puml', 0);
		$target->expects(self::never())->method('putContent');

		(new NewDiagramListener())->handle(new FileCreatedFromTemplateEvent($this->createStub(File::class), $target, []));
	}

	public function testIgnoresAnyOtherEvent(): void {
		$this->expectNotToPerformAssertions();

		(new NewDiagramListener())->handle(new Event());
	}

	private function target(string $name, int $size): File&\PHPUnit\Framework\MockObject\MockObject {
		$target = $this->createMock(File::class);
		$target->method('getName')->willReturn($name);
		$target->method('getSize')->willReturn($size);
		return $target;
	}
}
