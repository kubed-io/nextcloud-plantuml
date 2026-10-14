<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Migration\UnregisterMimetype;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IMimeTypeLoader;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class UnregisterMimetypeTest extends TestCase {
	private string $dir;

	protected function setUp(): void {
		$this->dir = sys_get_temp_dir() . '/plantuml-unmimetype-' . bin2hex(random_bytes(4));
		mkdir($this->dir);
	}

	protected function tearDown(): void {
		array_map('unlink', glob($this->dir . '/*') ?: []);
		rmdir($this->dir);
	}

	public function testBothExtensionsLeaveWithoutDisturbingNeighbours(): void {
		$path = $this->dir . '/mimetypemapping.json';
		file_put_contents($path, json_encode([
			'md' => ['text/markdown'],
			'puml' => ['text/x-plantuml'],
			'plantuml' => ['text/x-plantuml'],
		]));

		$this->removeKey($path, 'puml', ['text/x-plantuml']);
		$this->removeKey($path, 'plantuml', ['text/x-plantuml']);

		self::assertSame(
			['md' => ['text/markdown']],
			json_decode((string)file_get_contents($path), true),
		);
	}

	public function testTheAliasLeavesWithoutDisturbingNeighbours(): void {
		$path = $this->dir . '/mimetypealiases.json';
		file_put_contents($path, json_encode([
			'text/markdown' => 'text',
			'text/x-plantuml' => 'plantuml',
		]));

		$this->removeKey($path, 'text/x-plantuml');

		self::assertSame(
			['text/markdown' => 'text'],
			json_decode((string)file_get_contents($path), true),
		);
	}

	public function testAnAbsentKeyLeavesTheFileByteForByte(): void {
		$path = $this->dir . '/mimetypemapping.json';
		file_put_contents($path, "{\n  \"md\": [\"text/markdown\"]\n}");
		$before = file_get_contents($path);
		$mtime = filemtime($path);
		clearstatcache();

		$this->removeKey($path, 'puml', ['text/x-plantuml']);

		self::assertSame($before, file_get_contents($path));
		self::assertSame($mtime, filemtime($path));
	}

	public function testAMissingFileIsNotCreated(): void {
		$path = $this->dir . '/mimetypemapping.json';

		$this->removeKey($path, 'puml', ['text/x-plantuml']);

		self::assertFileDoesNotExist($path);
	}

	public function testRunningTwiceChangesNothing(): void {
		$path = $this->dir . '/mimetypemapping.json';
		file_put_contents($path, json_encode(['md' => ['text/markdown'], 'puml' => ['text/x-plantuml']]));

		$this->removeKey($path, 'puml', ['text/x-plantuml']);
		$first = file_get_contents($path);
		$this->removeKey($path, 'puml', ['text/x-plantuml']);

		self::assertSame($first, file_get_contents($path));
	}

	public function testAnAdminsOwnOverrideSurvives(): void {
		$path = $this->dir . '/mimetypemapping.json';
		$json = json_encode(['puml' => ['text/vnd.mine']]);
		file_put_contents($path, $json);

		$this->removeKey($path, 'puml', ['text/x-plantuml']);

		self::assertSame($json, file_get_contents($path));
	}

	public function testRunSparesAnOverriddenExtensionAndItsFilecacheRows(): void {
		file_put_contents($this->dir . '/mimetypemapping.json', json_encode([
			'puml' => ['text/x-plantuml'],
			'plantuml' => ['text/vnd.mine'],
		]));
		file_put_contents($this->dir . '/mimetypealiases.json', json_encode(['text/x-plantuml' => 'plantuml']));
		\OC::$SERVERROOT = $this->dir . '/root';
		\OC::$configDir = $this->dir . '/';

		$loader = $this->createMock(IMimeTypeLoader::class);
		$loader->method('getId')->willReturn(7);
		$loader->expects(self::once())->method('updateFilecache')->with('puml', 7)->willReturn(3);

		(new UnregisterMimetype(
			$this->createStub(IMimeTypeDetector::class),
			$loader,
			$this->createStub(LoggerInterface::class),
		))->run($this->createStub(IOutput::class));

		self::assertSame(
			['plantuml' => ['text/vnd.mine']],
			json_decode((string)file_get_contents($this->dir . '/mimetypemapping.json'), true),
		);
		self::assertSame([], json_decode((string)file_get_contents($this->dir . '/mimetypealiases.json'), true));
	}

	private function removeKey(string $path, string $key, mixed $ours = null): void {
		$step = new UnregisterMimetype(
			$this->createStub(IMimeTypeDetector::class),
			$this->createStub(IMimeTypeLoader::class),
			$this->createStub(LoggerInterface::class),
		);
		(new \ReflectionMethod($step, 'removeJsonKey'))->invoke($step, $path, $key, $ours);
	}
}
