<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Exception\FileRefusal;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\ForbiddenException;
use OCP\Files\GenericFileException;
use OCP\Files\InvalidPathException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IUserSession;
use OCP\Lock\LockedException;

/**
 * Reading a stored diagram for a route: the caller's own readable `.puml`,
 * capped, its includes expanded, the ETag covering them; or the refusal the
 * route answers.
 */
final class DiagramFiles {
	/** A megabyte of source is far past any diagram; more is refused before it is read or sent on. */
	public const MAX_SOURCE = 1048576;
	/** A line the resolver would act on; without one the file goes as it is. */
	private const NAMES_A_FILE = '/^[ \t]*(?:!(?:include|import)|<style\s+[\w-]+\s*=)/mi';

	public function __construct(
		private IncludeResolver $resolver,
		private IRootFolder $rootFolder,
		private IUserSession $userSession,
	) {
	}

	/**
	 * The files the diagram includes are read here, since the ETag covers them;
	 * a diagram that names none keeps its file's ETag.
	 *
	 * @throws FileRefusal
	 */
	public function open(string $path): DiagramFile {
		$userFolder = $this->userFolder();
		$node = $userFolder === null ? null : self::readable($userFolder, $path);
		// A text file would render as PlantUML's error image, and a 200 for it
		// would tell the caller nothing.
		if ($userFolder === null || $node === null || $node->getMimetype() !== Application::MIMETYPE) {
			throw new FileRefusal(new Response(Http::STATUS_NOT_FOUND));
		}
		if (self::storedSize($node) > self::MAX_SOURCE) {
			throw new FileRefusal(self::tooLarge());
		}
		try {
			$text = self::content($node);
		} catch (LockedException) {
			throw new FileRefusal(new Response(Http::STATUS_LOCKED));
		} catch (NotPermittedException|NotFoundException|InvalidPathException|GenericFileException|ForbiddenException) {
			// Forbidden is an access rule's refusal (files_accesscontrol).
			throw new FileRefusal(new Response(Http::STATUS_NOT_FOUND));
		}
		if ($text === null) {
			throw new FileRefusal(self::tooLarge());
		}
		$expanded = self::namesAFile($text) ? $this->resolver->expand($text, $node->getParent(), $userFolder, $node, true) : null;
		return new DiagramFile($node, $text, $expanded, $expanded === null ? $node->getEtag() : self::etag($node->getEtag(), $expanded));
	}

	public function userFolder(): ?Folder {
		$user = $this->userSession->getUser();
		return $user === null ? null : $this->rootFolder->getUserFolder($user->getUID());
	}

	/** Whether the text has a line the resolver would act on. */
	public static function namesAFile(string $text): bool {
		return preg_match(self::NAMES_A_FILE, $text) === 1;
	}

	/** The file at `path` in the caller's own folder, or null when they cannot read one there. */
	public static function readable(Folder $userFolder, string $path): ?File {
		try {
			$node = $userFolder->get($path);
		} catch (NotFoundException|NotPermittedException|InvalidPathException) {
			// NotPermitted is how core refuses a path that climbs out with `..`,
			// InvalidPath one too long or with characters it does not allow.
			return null;
		}
		return $node instanceof File ? $node : null;
	}

	/** The size core has stored; it can be wrong, so the stream is capped as well. */
	public static function storedSize(File $file): int {
		try {
			return (int)$file->getSize();
		} catch (\Throwable) {
			return 0;
		}
	}

	/**
	 * At most MAX_SOURCE + 1 bytes, read through a stream; null when that
	 * many came, which is more than may be drawn.
	 */
	public static function content(File $file): ?string {
		$handle = $file->fopen('r');
		if (!is_resource($handle)) {
			throw new NotFoundException();
		}
		try {
			$content = stream_get_contents($handle, self::MAX_SOURCE + 1);
		} finally {
			fclose($handle);
		}
		if ($content === false) {
			throw new GenericFileException('The stream could not be read');
		}
		return strlen($content) > self::MAX_SOURCE ? null : $content;
	}

	public static function tooLarge(): JSONResponse {
		return new JSONResponse(['problem' => 'The diagram is too large to draw'], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
	}

	/**
	 * The file's own ETag when it names no file; else one that also changes
	 * when a file found changes or a missing one appears.
	 */
	private static function etag(string $fileEtag, Expanded $expanded): string {
		if ($expanded->etags === [] && $expanded->missing === []) {
			return $fileEtag;
		}
		return md5($fileEtag . ',' . implode(',', $expanded->etags) . ',' . implode(',', $expanded->missing));
	}
}
