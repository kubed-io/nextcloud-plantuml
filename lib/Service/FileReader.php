<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\Files_Sharing\SharedStorage;
use OCP\Files\ConnectionLostException;
use OCP\Files\File;
use OCP\Files\ForbiddenException;
use OCP\Files\GenericFileException;
use OCP\Files\InvalidPathException;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Files\StorageInvalidException;
use OCP\Files\StorageNotAvailableException;
use OCP\Lock\LockedException;

/** Reading a user's file as the resolver, the exports and the template library all do. */
final class FileReader {
	/**
	 * At most `$limit` + 1 bytes, read through a stream: a stored size can be
	 * wrong. Null when there is no stream, rather than a read of any size.
	 */
	public static function read(File $file, int $limit): ?string {
		try {
			$handle = $file->fopen('r');
			if (!is_resource($handle)) {
				return null;
			}
			try {
				$content = stream_get_contents($handle, $limit + 1);
			} finally {
				fclose($handle);
			}
			return $content === false ? null : $content;
		} catch (NotPermittedException|GenericFileException|LockedException|NotFoundException|InvalidPathException|StorageNotAvailableException|StorageInvalidException|ForbiddenException|ConnectionLostException) {
			return null;
		}
	}

	public static function size(File $file): ?int {
		try {
			return (int)$file->getSize();
		} catch (InvalidPathException|NotFoundException|StorageNotAvailableException|StorageInvalidException|ForbiddenException) {
			return null;
		}
	}

	/**
	 * A file on a share whose owner forbids download, decided as files_sharing's
	 * ViewOnly decides it; a storage that cannot be asked is a refusal too. The
	 * export refuses such a file outright, since an export is a download.
	 */
	public static function downloadForbidden(File $file): bool {
		try {
			$storage = $file->getStorage();
			return $storage->instanceOfStorage(SharedStorage::class)
				&& $storage->getShare()->getAttributes()?->getAttribute('permissions', 'download') === false;
		} catch (\Throwable) {
			// Core throws a bare Exception for a node without storage; unreadable, as a refusal is.
			return true;
		}
	}
}
