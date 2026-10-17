<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/** `GET /templates` (TP3): asked each time Add diagram's modal opens. Logged-in users only. */
final class TemplatesController extends Controller {
	public function __construct(
		IRequest $request,
		private readonly TemplateLibrary $library,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	// A read, fetched as /themes is.
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): JSONResponse {
		return new JSONResponse(['files' => $this->library->files()]);
	}
}
