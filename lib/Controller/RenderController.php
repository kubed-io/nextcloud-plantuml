<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Exception\FileRefusal;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\DiagramFiles;
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
use OCP\IRequest;

/**
 * The two render routes and the server's lists for the editor's completion,
 * all for logged-in users only (no #[PublicPage]).
 *
 * GET takes a path, resolved in the caller's own folder: you can have drawn
 * exactly what you can read. POST takes text for the README fences and the
 * editor's preview; it grants nothing GET does not, since anyone who can send
 * text can upload it as a .puml, and it keeps the CSRF check. The one thing a
 * stored file has that sent text lacks, its owner's word, is checked: only the
 * base's own text reads a view-only share it is on. Both read the
 * files a diagram includes from the caller's own folder (POST only when given
 * the file's path), and pass on PlantUML's error headers, moved to the
 * diagram's own line, which the editor turns into an underlined line. The
 * message goes percent-encoded past ASCII (and its `%`), as a header must be.
 */
final class RenderController extends Controller {
	public const MAX_SOURCE = DiagramFiles::MAX_SOURCE;

	public function __construct(
		string $appName,
		IRequest $request,
		private RenderService $render,
		private IncludeResolver $resolver,
		private DiagramFiles $files,
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
		try {
			$file = $this->files->open($path);
		} catch (FileRefusal $e) {
			return $e->response;
		}
		if (trim(str_replace('W/', '', $this->request->getHeader('If-None-Match')), '"') === $file->etag) {
			return $this->revalidated(new Response(Http::STATUS_NOT_MODIFIED), $file->etag);
		}
		try {
			return $this->revalidated($this->image($this->render->render($file->expanded?->source ?? $file->text), $file->expanded), $file->etag);
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
		if (strlen($source) > DiagramFiles::MAX_SOURCE) {
			return DiagramFiles::tooLarge();
		}
		$expanded = null;
		if ($path !== '') {
			// A README is a valid base too, so the file's type is not asked.
			$userFolder = $this->files->userFolder();
			$node = $userFolder === null ? null : DiagramFiles::readable($userFolder, $path);
			if ($userFolder === null || $node === null) {
				return new Response(Http::STATUS_NOT_FOUND);
			}
			if (DiagramFiles::namesAFile($source)) {
				$expanded = $this->resolver->expand($source, $node->getParent(), $userFolder, $node, self::ownersText($node, $source));
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
	 * Whether the text sent is the base's own, as stored (the editor sends a
	 * CRLF file's lines joined by `\n`), or for a README whole lines of it (a
	 * fence): only text the share's owner wrote may read the rest of a
	 * view-only share. The reader writes the rest.
	 */
	private static function ownersText(File $base, string $source): bool {
		if (DiagramFiles::storedSize($base) > DiagramFiles::MAX_SOURCE) {
			return false;
		}
		try {
			$content = DiagramFiles::content($base);
		} catch (\Throwable) {
			return false;
		}
		if ($content === null) {
			return false;
		}
		$lines = str_replace("\r\n", "\n", $content);
		return $source === $content || $source === $lines
			|| ($base->getMimetype() === 'text/markdown' && str_contains("\n$lines\n", "\n$source\n"));
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
