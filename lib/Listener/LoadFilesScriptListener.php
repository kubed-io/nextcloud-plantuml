<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Service\ServerConfig;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Loads the Files-page bundles — `plantuml-files` (Viewer handler, file actions,
 * + New), `plantuml-editor` (the diagram editor, with its stylesheet) and
 * `plantuml-readme` (the README observer) — and tells them whether a server is
 * set, so the bundle can hide what would only answer "not set".
 *
 * Wired to {@see LoadAdditionalScriptsEvent}, which the Files app fires once per
 * page render right before its `<script>` tags are emitted.
 *
 * @implements IEventListener<LoadAdditionalScriptsEvent>
 */
final class LoadFilesScriptListener implements IEventListener {
	public function __construct(
		private ServerConfig $serverConfig,
		private IInitialState $initialState,
	) {
	}

	#[\Override]
	public function handle(Event $event): void {
		if (!$event instanceof LoadAdditionalScriptsEvent) {
			return;
		}

		$this->initialState->provideInitialState('server_configured', $this->serverConfig->isSet());

		// Util::addScript appends `js/<file>.js` to the app root; `../dist/` walks
		// back out of js/ into the vite output (see vite.config.js).
		Util::addScript(Application::APP_ID, '../dist/' . Application::APP_ID . '-files');
		Util::addScript(Application::APP_ID, '../dist/' . Application::APP_ID . '-editor');
		Util::addStyle(Application::APP_ID, 'editor');
		Util::addScript(Application::APP_ID, '../dist/' . Application::APP_ID . '-readme');
	}
}
