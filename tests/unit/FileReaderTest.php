<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\FileReader;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\Files\Storage\IStorage;
use OCP\Lock\LockedException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FileReaderTest extends TestCase {
	use StoredFiles;

	private function file(mixed $stream): File {
		$file = $this->createStub(File::class);
		$file->method('fopen')->willReturn($stream);
		return $file;
	}

	public function testReadStopsOneByteAfterTheLimit(): void {
		self::assertSame('01234', FileReader::read($this->file(MemoryStream::of('0123456789')), 4));
	}

	public function testReadIsNullWithoutAStream(): void {
		self::assertNull(FileReader::read($this->file(false), 4));
	}

	public function testReadIsNullWhenTheStorageRefuses(): void {
		$file = $this->createStub(File::class);
		$file->method('fopen')->willThrowException(new LockedException('locked'));
		self::assertNull(FileReader::read($file, 4));
	}

	public function testSizeIsTheStoredSize(): void {
		$file = $this->createStub(File::class);
		$file->method('getSize')->willReturn(42);
		self::assertSame(42, FileReader::size($file));
	}

	public function testSizeIsNullWhenTheFileIsGone(): void {
		$file = $this->createStub(File::class);
		$file->method('getSize')->willThrowException(new NotFoundException());
		self::assertNull(FileReader::size($file));
	}

	/** @return array<string, array{\Closure, bool}> */
	public static function downloadRules(): array {
		return [
			'not on a share' => [fn (self $t): IStorage => $t->createStub(IStorage::class), false],
			'a share that forbids download' => [fn (self $t): IStorage => $t->shareStorage(false), true],
			'a share that allows it' => [fn (self $t): IStorage => $t->shareStorage(true), false],
			'a share that says nothing' => [fn (self $t): IStorage => $t->shareStorage(null), false],
		];
	}

	#[DataProvider('downloadRules')]
	public function testDownloadForbiddenAsItsShareSays(\Closure $storage, bool $forbidden): void {
		$file = $this->createStub(File::class);
		$file->method('getStorage')->willReturn($storage($this));
		self::assertSame($forbidden, FileReader::downloadForbidden($file));
	}

	public function testDownloadForbiddenWhenTheStorageCannotBeAsked(): void {
		$file = $this->createStub(File::class);
		$file->method('getStorage')->willThrowException(new \Exception('no storage'));
		self::assertTrue(FileReader::downloadForbidden($file));
	}
}
