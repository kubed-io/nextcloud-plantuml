<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\RenderService;
use OCA\PlantUml\Settings\AdminTest;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\AuthorizedAdminSetting;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/**
 * The Test connection button's endpoint. Always a 200: the request worked, and
 * `success` plus the line to show is the verdict. CSRF stays on, so no other
 * page can make this server probe the configured URL on an admin's behalf.
 */
final class ConfigController extends Controller {
	public function __construct(
		string $appName,
		IRequest $request,
		private RenderService $render,
	) {
		parent::__construct($appName, $request);
	}

	#[AuthorizedAdminSetting(settings: AdminTest::class)]
	public function testConnection(): JSONResponse {
		try {
			return new JSONResponse(['success' => true, 'message' => 'PlantUML ' . $this->render->version()]);
		} catch (RenderException $e) {
			return new JSONResponse(['success' => false, 'message' => $e->adminMessage()]);
		}
	}
}
