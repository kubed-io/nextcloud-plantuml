<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Settings;

use OCA\PlantUml\AppInfo\Application;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\IDelegatedSettings;
use OCP\Util;

/**
 * The Test connection button and its result line, directly under the
 * {@see InstanceSettings} card. A classic template because a declarative form
 * cannot hold a button. Also the auth target of the endpoint the button calls.
 */
final class AdminTest implements IDelegatedSettings {
	#[\Override]
	public function getForm(): TemplateResponse {
		// Through Util so they carry the CSP nonce; inline script is blocked.
		Util::addScript(Application::APP_ID, 'admin-test');
		Util::addStyle(Application::APP_ID, 'admin-test');
		return new TemplateResponse(Application::APP_ID, 'admin_test', [], TemplateResponse::RENDER_AS_BLANK);
	}

	#[\Override]
	public function getSection(): string {
		return Application::APP_ID;
	}

	/** Just after the card (5), so the button follows the URL it tests. */
	#[\Override]
	public function getPriority(): int {
		return 10;
	}

	#[\Override]
	public function getName(): ?string {
		return null;
	}

	#[\Override]
	public function getAuthorizedAppConfig(): array {
		return [];
	}
}
