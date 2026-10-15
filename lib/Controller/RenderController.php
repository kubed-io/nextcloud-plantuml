<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

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
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\InvalidPathException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IRequest;
use OCP\IUserSession;

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
	public const MIMETYPE = 'text/x-plantuml';
	/** As RenderService cuts the server's line: an included path makes ours longer. */
	private const ERROR_MAX = 200;
	/** A line the resolver would act on; without one the file goes as it is. */
	private const NAMES_A_FILE = '/^\s*(?:!(?:include|import)|<style\s+[\w-]+\s*=)/mi';

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
		if ($userFolder === null || $node === null || $node->getMimetype() !== self::MIMETYPE) {
			return new Response(Http::STATUS_NOT_FOUND);
		}

		$content = $node->getContent();
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
		$expanded = null;
		if ($path !== '') {
			// A README is a valid base too, so the file's type is not asked.
			$userFolder = $this->userFolder();
			$node = $userFolder === null ? null : self::readable($userFolder, $path);
			if ($userFolder === null || $node === null) {
				return new Response(Http::STATUS_NOT_FOUND);
			}
			$expanded = $this->resolver->expand($source, $node->getParent(), $userFolder, $node);
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
		try {
			return new JSONResponse(['themes' => $this->render->themes()]);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	/** The editor's line-start completion (X11): diagram kinds, element types, keywords. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function keywords(): JSONResponse {
		try {
			return new JSONResponse($this->render->keywords());
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	/** The editor's named colours (X14): each name with its hex. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function colors(): JSONResponse {
		try {
			return new JSONResponse(['colors' => $this->render->colors()]);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	/** The editor's `<&icon>` completion. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function icons(): JSONResponse {
		try {
			return new JSONResponse(['icons' => $this->render->icons()]);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	/** The editor's `<:emoji:>` completion. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function emoji(): JSONResponse {
		try {
			return new JSONResponse(['emoji' => $this->render->emoji()]);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	private function image(Rendered $rendered, ?Expanded $expanded = null): DataDisplayResponse {
		$headers = ['Content-Type' => $rendered->contentType];
		[$error, $line] = self::mistake($rendered, $expanded);
		if ($error !== '') {
			$headers['X-PlantUML-Diagram-Error'] = self::encoded(mb_substr($error, 0, self::ERROR_MAX));
			if ($line !== null) {
				$headers['X-PlantUML-Diagram-Error-Line'] = (string)$line;
			}
		}
		return new DataDisplayResponse($rendered->body, Http::STATUS_OK, $headers);
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
