<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\PlantUml\Listener\LoadFilesScriptListener;
use OCA\PlantUml\Settings\InstanceSettings;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

/**
 * App bootstrap: the declarative admin card and the Files script listener.
 */
final class Application extends App implements IBootstrap {
	public const APP_ID = 'plantuml';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	#[\Override]
	public function register(IRegistrationContext $context): void {
		$context->registerDeclarativeSettings(InstanceSettings::class);
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScriptListener::class);
	}

	#[\Override]
	public function boot(IBootContext $context): void {
	}
}
