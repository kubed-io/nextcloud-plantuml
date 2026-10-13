<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Migration\RegisterMimetype;
use OCP\App\IAppManager;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IMimeTypeLoader;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class RegisterMimetypeTest extends TestCase {
	private string $dir;

	protected function setUp(): void {
		$this->dir = sys_get_temp_dir() . '/plantuml-mimetype-' . bin2hex(random_bytes(4));
		mkdir($this->dir);
	}

	protected function tearDown(): void {
		array_map('unlink', glob($this->dir . '/*') ?: []);
		rmdir($this->dir);
	}

	public function testExtensionsMapToOneMimetypeWithoutDisturbingExistingKeys(): void {
		$path = $this->dir . '/mimetypemapping.json';
		file_put_contents($path, json_encode(['md' => ['text/markdown']]));

		$this->mergeJson($path, [
			'puml' => ['text/x-plantuml'],
			'plantuml' => ['text/x-plantuml'],
		]);

		self::assertSame([
			'md' => ['text/markdown'],
			'puml' => ['text/x-plantuml'],
			'plantuml' => ['text/x-plantuml'],
		], json_decode((string)file_get_contents($path), true));
	}

	public function testAliasPointsTheMimetypeAtTheIcon(): void {
		$path = $this->dir . '/mimetypealiases.json';

		$this->mergeJson($path, ['text/x-plantuml' => 'plantuml']);

		self::assertSame(
			['text/x-plantuml' => 'plantuml'],
			json_decode((string)file_get_contents($path), true),
		);
	}

	public function testRunningTwiceChangesNothing(): void {
		$path = $this->dir . '/mimetypemapping.json';
		$additions = ['puml' => ['text/x-plantuml'], 'plantuml' => ['text/x-plantuml']];

		$this->mergeJson($path, $additions);
		$first = file_get_contents($path);
		$mtime = filemtime($path);
		clearstatcache();
		$this->mergeJson($path, $additions);

		self::assertSame($first, file_get_contents($path));
		self::assertSame($mtime, filemtime($path));
	}

	/** @param array<string,mixed> $additions */
	private function mergeJson(string $path, array $additions): void {
		$step = new RegisterMimetype(
			$this->createStub(IAppManager::class),
			$this->createStub(IMimeTypeDetector::class),
			$this->createStub(IMimeTypeLoader::class),
			$this->createStub(LoggerInterface::class),
		);
		(new \ReflectionMethod($step, 'mergeJson'))->invoke($step, $path, $additions);
	}
}
