<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCP\AppFramework\Http\Response;
use OCP\Constants;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\Storage\ISharedStorage;
use OCP\Files\Storage\IStorage;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Share\IAttributes;
use OCP\Share\IShare;

/**
 * The stored files, folders and shares the tests of the services and routes
 * that read a user's diagrams stand in for. For a TestCase.
 */
trait StoredFiles {
	/**
	 * What the caller's folder answers for any path, or the caller's files by path from their root.
	 *
	 * @param Node|\Throwable|array<string, Node> $resolved
	 */
	private function userFolderOver(Node|\Throwable|array $resolved): Folder {
		$folder = $this->createStub(Folder::class);
		$folder->method('getPath')->willReturn('/drk/files');
		if (is_array($resolved)) {
			$folder->method('get')->willReturnCallback(
				static fn (string $path): Node => $resolved[ltrim($path, '/')] ?? throw new NotFoundException($path),
			);
		} elseif ($resolved instanceof \Throwable) {
			$folder->method('get')->willThrowException($resolved);
		} else {
			$folder->method('get')->willReturn($resolved);
		}
		return $folder;
	}

	/**
	 * Core's root and session with `drk` signed in, whose folder is `$folder`.
	 *
	 * @return array{IRootFolder, IUserSession}
	 */
	private function signedInWith(Folder $folder): array {
		$root = $this->createStub(IRootFolder::class);
		$root->method('getUserFolder')->willReturnCallback(
			static fn (string $uid): Folder => $uid === 'drk' ? $folder : throw new \LogicException("not drk's folder: $uid"),
		);
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn('drk');
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		return [$root, $session];
	}

	/** A file in the caller's `Diagrams` folder; `$storage` puts it on a share. */
	private function diagram(string $mimetype = 'text/x-plantuml', string $content = "@startuml\nCustomer -> Shop : place order\n@enduml\n", string $etag = 'abc123', string $name = 'Order flow.puml', ?IStorage $storage = null): File {
		$parent = $this->createStub(Folder::class);
		$parent->method('getPath')->willReturn('/drk/files/Diagrams');
		$file = $this->createStub(File::class);
		$file->method('getName')->willReturn($name);
		$file->method('getMimetype')->willReturn($mimetype);
		$file->method('getEtag')->willReturn($etag);
		$file->method('fopen')->willReturnCallback(static function () use ($content) {
			$handle = fopen('php://memory', 'r+');
			self::assertIsResource($handle);
			fwrite($handle, $content);
			rewind($handle);
			return $handle;
		});
		$file->method('getSize')->willReturn(strlen($content));
		$file->method('getParent')->willReturn($parent);
		$file->method('getPath')->willReturn("/drk/files/Diagrams/{$name}");
		if ($storage !== null) {
			$file->method('getStorage')->willReturn($storage);
		}
		return $file;
	}

	/** A diagram whose stored size and whose stream may disagree; with `$mayOpen` false, opening it fails the test. */
	private function sizedDiagram(int $storedSize, string $streamed, bool $mayOpen = true): File {
		$file = $mayOpen ? $this->createStub(File::class) : $this->createMock(File::class);
		$file->method('getMimetype')->willReturn('text/x-plantuml');
		$file->method('getEtag')->willReturn('abc123');
		$file->method('getSize')->willReturn($storedSize);
		$file->method('getParent')->willReturn($this->createStub(Folder::class));
		if ($mayOpen) {
			$file->method('fopen')->willReturnCallback(static function () use ($streamed) {
				$handle = fopen('php://memory', 'r+');
				self::assertIsResource($handle);
				fwrite($handle, $streamed);
				rewind($handle);
				return $handle;
			});
		} else {
			$file->expects(self::never())->method('fopen');
		}
		return $file;
	}

	/**
	 * Share `$id` from another user, mounted at `/$id`, its `download`
	 * attribute as given (null: the share sets none). `$broken` names the id
	 * that throws when asked for: `share` or `storage`.
	 */
	private function shareStorage(?bool $download, string $id = 'S', int $permissions = Constants::PERMISSION_READ, string $broken = ''): ISharedStorage {
		$attributes = $this->createStub(IAttributes::class);
		$attributes->method('getAttribute')->willReturnCallback(static fn (string $scope, string $key): ?bool => [$scope, $key] === ['permissions', 'download'] ? $download : null);
		$share = $this->createStub(IShare::class);
		$share->method('getAttributes')->willReturn($attributes);
		$share->method('getPermissions')->willReturn($permissions);
		if ($broken === 'share') {
			$share->method('getId')->willThrowException(new \RuntimeException('no id'));
		} else {
			$share->method('getId')->willReturn($id);
		}
		$storage = $this->createStub(ISharedStorage::class);
		$storage->method('instanceOfStorage')->willReturnCallback(static fn (string $class): bool => $class === 'OCA\Files_Sharing\SharedStorage');
		$storage->method('getShare')->willReturn($share);
		if ($broken === 'storage') {
			$storage->method('getId')->willThrowException(new \RuntimeException('no id'));
		} else {
			$storage->method('getId')->willReturn("shared::/$id");
		}
		return $storage;
	}

	/** getHeaders() asks the server container for the request id; read the set headers directly. */
	private static function header(Response $response, string $name): ?string {
		return \Closure::bind(fn () => $this->headers[$name] ?? null, $response, Response::class)();
	}
}
