<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Exception\FileRefusal;
use OCA\PlantUml\Service\DiagramFiles;
use OCA\PlantUml\Service\IncludeResolver;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\ForbiddenException;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IUserSession;
use OCP\Lock\LockedException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/stream-get-contents.php';

final class DiagramFilesTest extends TestCase {
	use StoredFiles;

	private const SOURCE = "@startuml\nCustomer -> Shop : place order\n@enduml\n";

	protected function tearDown(): void {
		Streams::$unreadable = false;
	}

	/** @param Node|\Throwable|array<string, Node> $resolved what the caller's folder answers, see userFolderOver() */
	private function files(Node|\Throwable|array $resolved): DiagramFiles {
		[$root, $session] = $this->signedInWith($this->userFolderOver($resolved));
		return new DiagramFiles(new IncludeResolver(), $root, $session);
	}

	/** A diagram whose open throws `$e`, as core does for a locked or forbidden file. */
	private function failingDiagram(\Throwable $e): File {
		$file = $this->createStub(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getEtag')->willReturn('abc123');
		$file->method('getSize')->willReturn(10);
		$file->method('getParent')->willReturn($this->createStub(Folder::class));
		$file->method('fopen')->willThrowException($e);
		return $file;
	}

	public function testOpensAPlainDiagramAsStored(): void {
		$opened = $this->files($this->diagram())->open('Diagrams/Order flow.puml');
		self::assertSame(self::SOURCE, $opened->text);
		self::assertNull($opened->expanded);
		self::assertSame('abc123', $opened->etag);
	}

	public function testExpandsWhatItIncludes(): void {
		$base = $this->diagram(content: "@startuml\n!include parts.puml\n@enduml\n");
		$opened = $this->files(['Diagrams/Order flow.puml' => $base, 'Diagrams/parts.puml' => $this->diagram(content: "A -> B\n", etag: 'p1')])->open('Diagrams/Order flow.puml');
		self::assertStringContainsString('A -> B', $opened->expanded?->source ?? '');
		self::assertSame(md5('abc123,p1,'), $opened->etag);
	}

	#[DataProvider('refusals')]
	public function testRefuses(\Closure $files, string $path, int $status): void {
		try {
			$files($this)->open($path);
			self::fail('opened');
		} catch (FileRefusal $e) {
			self::assertSame($status, $e->response->getStatus());
		}
	}

	/** @return array<string, array{\Closure, string, int}> */
	public static function refusals(): array {
		return [
			'missing' => [fn (self $t) => $t->files(new NotFoundException()), 'Diagrams/nope.puml', 404],
			'climbing out' => [fn (self $t) => $t->files(new NotPermittedException()), '../x.puml', 404],
			'a folder' => [fn (self $t) => $t->files($t->createStub(Folder::class)), 'Diagrams', 404],
			'plain text' => [fn (self $t) => $t->files($t->diagram('text/plain')), 'notes.txt', 404],
			'too large on disk' => [fn (self $t) => $t->files($t->sizedDiagram(DiagramFiles::MAX_SOURCE + 1, '', false)), 'big.puml', 413],
			'too large in its stream' => [fn (self $t) => $t->files($t->sizedDiagram(10, str_repeat('a', DiagramFiles::MAX_SOURCE + 1))), 'big.puml', 413],
			'locked' => [fn (self $t) => $t->files($t->failingDiagram(new LockedException('x'))), 'l.puml', 423],
			'forbidden' => [fn (self $t) => $t->files($t->failingDiagram(new ForbiddenException('x', false))), 'f.puml', 404],
			'a stream that cannot be read' => [static function (self $t): DiagramFiles {
				Streams::$unreadable = true;
				return $t->files($t->diagram());
			}, 'Diagrams/Order flow.puml', 404],
		];
	}

	public function testTheTooLargeAnswerSaysSo(): void {
		try {
			$this->files($this->sizedDiagram(DiagramFiles::MAX_SOURCE + 1, '', false))->open('big.puml');
			self::fail('opened');
		} catch (FileRefusal $e) {
			self::assertInstanceOf(JSONResponse::class, $e->response);
			self::assertSame(['problem' => 'The diagram is too large to draw'], $e->response->getData());
		}
	}

	public function testNobodySignedInIsRefused(): void {
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn(null);
		try {
			(new DiagramFiles(new IncludeResolver(), $this->createStub(IRootFolder::class), $session))->open('Diagrams/Order flow.puml');
			self::fail('opened');
		} catch (FileRefusal $e) {
			self::assertSame(404, $e->response->getStatus());
		}
	}
}
