<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\Exception\RenderException;
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
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * The two render routes and the server's themes, all for logged-in users only
 * (no #[PublicPage]).
 *
 * GET takes a path, resolved in the caller's own folder: you can have drawn
 * exactly what you can read. POST takes text for the README fences and the
 * editor's preview; it grants nothing GET does not, since anyone who can send
 * text can upload it as a .puml, and it keeps the CSRF check. Both pass on
 * PlantUML's error headers, which the editor turns into an underlined line.
 */
final class RenderController extends Controller {
	public const MIMETYPE = 'text/x-plantuml';

	public function __construct(
		string $appName,
		IRequest $request,
		private RenderService $render,
		private IRootFolder $rootFolder,
		private IUserSession $userSession,
	) {
		parent::__construct($appName, $request);
	}

	/** No CSRF token on an `<img src>`; the path rule is what keeps this safe. */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function byPath(string $path = ''): Response {
		$user = $this->userSession->getUser();
		if ($user === null) {
			return new Response(Http::STATUS_NOT_FOUND);
		}
		try {
			$node = $this->rootFolder->getUserFolder($user->getUID())->get($path);
		} catch (NotFoundException|NotPermittedException) {
			// NotPermitted is how core refuses a path that climbs out with `..`.
			return new Response(Http::STATUS_NOT_FOUND);
		}
		// A text file would render as PlantUML's error image, and a 200 for it
		// would tell the caller nothing.
		if (!$node instanceof File || $node->getMimetype() !== self::MIMETYPE) {
			return new Response(Http::STATUS_NOT_FOUND);
		}

		$etag = $node->getEtag();
		if (trim(str_replace('W/', '', $this->request->getHeader('If-None-Match')), '"') === $etag) {
			return $this->revalidated(new Response(Http::STATUS_NOT_MODIFIED), $etag);
		}
		try {
			return $this->revalidated($this->image($this->render->render($node->getContent())), $etag);
		} catch (RenderException $e) {
			return $this->problem($e);
		}
	}

	#[NoAdminRequired]
	public function bySource(string $source = ''): Response {
		// Nothing to draw is the caller's mistake, not a server problem.
		if (trim($source) === '') {
			return new Response(Http::STATUS_BAD_REQUEST);
		}
		try {
			return $this->image($this->render->render($source));
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

	private function image(Rendered $rendered): DataDisplayResponse {
		$headers = ['Content-Type' => $rendered->contentType];
		if ($rendered->error !== '') {
			$headers['X-PlantUML-Diagram-Error'] = $rendered->error;
			if ($rendered->errorLine !== null) {
				$headers['X-PlantUML-Diagram-Error-Line'] = (string)$rendered->errorLine;
			}
		}
		return new DataDisplayResponse($rendered->body, Http::STATUS_OK, $headers);
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
