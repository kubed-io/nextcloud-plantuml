<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\Expanded;
use OCA\PlantUml\Service\IncludeResolver;
use OCA\PlantUml\Service\Rendered;
use OCA\PlantUml\Service\RenderService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\GenericFileException;
use OCP\Files\Folder;
use OCP\Files\InvalidPathException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Lock\LockedException;

/**
 * The two render routes and the server's lists for the editor's completion,
 * all for logged-in users only (no #[PublicPage]).
 *
 * GET takes a path, resolved in the caller's own folder: you can have drawn
 * exactly what you can read. POST takes text for the README fences and the
 * editor's preview; it grants nothing GET does not, since anyone who can send
 * text can upload it as a .puml, and it keeps the CSRF check. Both read the
 * files a diagram includes from the caller's own folder (POST only when given
 * the file's path), and pass on PlantUML's error headers, moved to the
 * diagram's own line, which the editor turns into an underlined line. The
 * message goes percent-encoded past ASCII (and its `%`), as a header must be.
 */
final class RenderController extends Controller {
	/** A megabyte of source is far past any diagram; more is refused before it is read or sent on. */
	public const MAX_SOURCE = 1048576;
	/** A line the resolver would act on; without one the file goes as it is. */
	private const NAMES_A_FILE = '/^[ \t]*(?:!(?:include|import)|<style\s+[\w-]+\s*=)/mi';

	public function __construct(
		string $appName,
		IRequest $request,
		private RenderService $render,
		private IncludeResolver $resolver,
		private IRootFolder $rootFolder,
		private IUserSession $userSession,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * No CSRF token on an `<img src>`; the path rule is what keeps this safe.
	 * The files the diagram includes are read before the ETag is compared, since
	 * the ETag covers them; a diagram that names none keeps its file's ETag.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function byPath(string $path = ''): Response {
		$userFolder = $this->userFolder();
		$node = $userFolder === null ? null : self::readable($userFolder, $path);
		// A text file would render as PlantUML's error image, and a 200 for it
		// would tell the caller nothing.
		if ($userFolder === null || $node === null || $node->getMimetype() !== Application::MIMETYPE) {
			return new Response(Http::STATUS_NOT_FOUND);
		}

		if (self::storedSize($node) > self::MAX_SOURCE) {
			return $this->tooLarge();
		}
		try {
			$content = self::content($node);
		} catch (LockedException) {
			return new Response(Http::STATUS_LOCKED);
		} catch (NotPermittedException|NotFoundException|InvalidPathException|GenericFileException) {
			return new Response(Http::STATUS_NOT_FOUND);
		}
		if ($content === null) {
			return $this->tooLarge();
		}
		$expanded = preg_match(self::NAMES_A_FILE, $content) === 1 ? $this->resolver->expand($content, $node->getParent(), $userFolder, $node) : null;
		$etag = $expanded === null ? $node->getEtag() : self::etag($node->getEtag(), $expanded);
		if (trim(str_replace('W/', '', $this->request->getHeader('If-None-Match')), '"') === $etag) {
			return $this->revalidated(new Response(Http::STATUS_NOT_MODIFIED), $etag);
		}
		try {
			return $this->revalidated($this->image($this->render->render($expanded?->source ?? $content), $expanded), $etag);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	/**
	 * With a `path` (the edited file, or the README of a fence), relative
	 * includes resolve against its folder; without one the source goes as written.
	 */
	#[NoAdminRequired]
	public function bySource(string $source = '', mixed $index = 0, string $path = ''): Response {
		if (is_string($index) && preg_match('/^\d{1,3}$/', $index) === 1) {
			$index = (int)$index;
		}
		// Nothing to draw, or no such diagram, is the caller's mistake, not a server problem.
		if (trim($source) === '' || !is_int($index) || $index < 0 || $index > 999) {
			return new Response(Http::STATUS_BAD_REQUEST);
		}
		if (strlen($source) > self::MAX_SOURCE) {
			return $this->tooLarge();
		}
		$expanded = null;
		if ($path !== '') {
			// A README is a valid base too, so the file's type is not asked.
			$userFolder = $this->userFolder();
			$node = $userFolder === null ? null : self::readable($userFolder, $path);
			if ($userFolder === null || $node === null) {
				return new Response(Http::STATUS_NOT_FOUND);
			}
			if (preg_match(self::NAMES_A_FILE, $source) === 1) {
				$expanded = $this->resolver->expand($source, $node->getParent(), $userFolder, $node);
			}
		}
		try {
			return $this->image($this->render->render($expanded?->source ?? $source, $index), $expanded);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	/** The editor's `!theme` completion. A GET that changes nothing, so no CSRF token. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function themes(): JSONResponse {
		return $this->listed(fn (): array => $this->render->themes(), 'themes');
	}

	/** The editor's line-start completion (X11): diagram kinds, element types, keywords. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function keywords(): JSONResponse {
		return $this->listed(fn (): array => $this->render->keywords(), null);
	}

	/** The editor's font completion: the families the server can draw. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function fonts(): JSONResponse {
		return $this->listed(fn (): array => $this->render->fonts(), 'fonts');
	}

	/** The editor's `!include <…>` completion: each standard library with its version and source. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function stdlib(): JSONResponse {
		return $this->listed(fn (): array => $this->render->stdlib(), 'stdlib');
	}

	/** The editor's named colours (X14): each name with its hex. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function colors(): JSONResponse {
		return $this->listed(fn (): array => $this->render->colors(), 'colors');
	}

	/** The editor's `<&icon>` completion. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function icons(): JSONResponse {
		return $this->listed(fn (): array => $this->render->icons(), 'icons');
	}

	/** The editor's `<:emoji:>` completion. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function emoji(): JSONResponse {
		return $this->listed(fn (): array => $this->render->emoji(), 'emoji');
	}

	/** A list route: the server's list under `$key`, or as it is without one. */
	private function listed(callable $read, ?string $key): JSONResponse {
		try {
			$list = $read();
			return new JSONResponse($key === null ? $list : [$key => $list]);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	private function image(Rendered $rendered, ?Expanded $expanded = null): DataDisplayResponse {
		$headers = ['Content-Type' => $rendered->contentType];
		[$error, $line] = self::mistake($rendered, $expanded);
		if ($error !== '') {
			$headers['X-PlantUML-Diagram-Error'] = self::encoded(mb_substr($error, 0, Application::ERROR_MAX));
			if ($line !== null) {
				$headers['X-PlantUML-Diagram-Error-Line'] = (string)$line;
			}
		}
		$headers['X-Content-Type-Options'] = 'nosniff';
		$response = new DataDisplayResponse($rendered->body, Http::STATUS_OK, $headers);
		// The response sets an empty filename of its own; this one replaces it.
		$response->addHeader('Content-Disposition', 'inline; filename="diagram.' . ($rendered->contentType === 'image/png' ? 'png' : 'svg') . '"');
		// Core's default, set outright: an SVG opened on its own runs no script.
		$response->setContentSecurityPolicy(new EmptyContentSecurityPolicy());
		return $response;
	}

	/**
	 * The mistake to name, on the diagram's own line: the server's, moved off
	 * the included lines, unless the resolver has one on that line, which is
	 * the reason behind it. A clean render names the resolver's first.
	 *
	 * @return array{0: string, 1: int|null}
	 */
	private static function mistake(Rendered $rendered, ?Expanded $expanded): array {
		if ($expanded === null) {
			return [$rendered->error, $rendered->errorLine];
		}
		if ($rendered->error === '') {
			$first = $expanded->mistakes[0] ?? null;
			return $first === null ? ['', null] : [$first['message'], $first['line']];
		}
		if ($rendered->errorLine === null) {
			return [$rendered->error, null];
		}
		$mapped = $expanded->mapError($rendered->errorLine, $rendered->error);
		foreach ($expanded->mistakes as $mistake) {
			if ($mistake['line'] === $mapped['line']) {
				return [$mistake['message'], $mistake['line']];
			}
		}
		return [$mapped['message'], $mapped['line']];
	}

	/** `%` and every byte past ASCII as `%XX`, so `decodeURIComponent` gives the text back. */
	private static function encoded(string $text): string {
		return (string)preg_replace_callback('/[%\x80-\xff]/', static fn (array $m): string => sprintf('%%%02X', ord($m[0])), $text);
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

	/** The size core has stored; it can be wrong, so the stream is capped as well. */
	private static function storedSize(File $file): int {
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
	private static function content(File $file): ?string {
		$handle = $file->fopen('r');
		if (!is_resource($handle)) {
			throw new NotFoundException();
		}
		try {
			$content = stream_get_contents($handle, self::MAX_SOURCE + 1);
		} finally {
			fclose($handle);
		}
		return $content === false || strlen($content) > self::MAX_SOURCE ? null : $content;
	}

	private function tooLarge(): JSONResponse {
		return new JSONResponse(['problem' => 'The diagram is too large to draw'], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
	}

	private function userFolder(): ?Folder {
		$user = $this->userSession->getUser();
		return $user === null ? null : $this->rootFolder->getUserFolder($user->getUID());
	}

	/** The file at `path` in the caller's own folder, or null when they cannot read one there. */
	private static function readable(Folder $userFolder, string $path): ?File {
		try {
			$node = $userFolder->get($path);
		} catch (NotFoundException|NotPermittedException|InvalidPathException) {
			// NotPermitted is how core refuses a path that climbs out with `..`,
			// InvalidPath one too long or with characters it does not allow.
			return null;
		}
		return $node instanceof File ? $node : null;
	}

	/**
	 * Core's default Cache-Control is no-store, which would keep the browser
	 * from ever sending the ETag back.
	 */
	private function revalidated(Response $response, string $etag): Response {
		$response->setETag($etag);
		$response->addHeader('Cache-Control', 'private, no-cache');
		return $response;
	}

	private function problem(RenderException $e): JSONResponse {
		return new JSONResponse(['problem' => $e->getProblem()], Http::STATUS_SERVICE_UNAVAILABLE);
	}
}
