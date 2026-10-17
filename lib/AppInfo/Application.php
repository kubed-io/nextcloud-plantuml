<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\PlantUml\Listener\LoadFilesScriptListener;
use OCA\PlantUml\Listener\NewDiagramListener;
use OCA\PlantUml\Settings\InstanceSettings;
use OCA\PlantUml\Settings\TemplateSettings;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Files\Template\FileCreatedFromTemplateEvent;

/**
 * App bootstrap: the declarative admin card, the Files script listener and
 * the listener that writes a new diagram's starting lines.
 */
final class Application extends App implements IBootstrap {
	public const APP_ID = 'plantuml';
	public const MIMETYPE = 'text/x-plantuml';
	/** The longest error line sent on: as the server's own line is cut, so is ours. */
	public const ERROR_MAX = 200;

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	#[\Override]
	public function register(IRegistrationContext $context): void {
		$context->registerDeclarativeSettings(InstanceSettings::class);
		$context->registerDeclarativeSettings(TemplateSettings::class);
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScriptListener::class);
		$context->registerEventListener(FileCreatedFromTemplateEvent::class, NewDiagramListener::class);
	}

	#[\Override]
	public function boot(IBootContext $context): void {
	}
}
