<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration;

use Behat\Behat\Context\Context;
use OCA\PlantUml\Tests\Integration\Steps\AppLifecycleSteps;
use OCA\PlantUml\Tests\Integration\Steps\ConnectionSteps;
use OCA\PlantUml\Tests\Integration\Steps\CreateSteps;
use OCA\PlantUml\Tests\Integration\Steps\DiagramFileSteps;
use OCA\PlantUml\Tests\Integration\Steps\EditSteps;
use OCA\PlantUml\Tests\Integration\Steps\ExportSteps;
use OCA\PlantUml\Tests\Integration\Steps\LinkedFileSteps;
use OCA\PlantUml\Tests\Integration\Steps\ReadmeSteps;
use OCA\PlantUml\Tests\Integration\Steps\RenderApiSteps;
use OCA\PlantUml\Tests\Integration\Steps\ServerKnowledgeSteps;
use OCA\PlantUml\Tests\Integration\Steps\ShareSteps;
use OCA\PlantUml\Tests\Integration\Support\OccTrait;
use OCA\PlantUml\Tests\Integration\Support\WebDavTrait;

/**
 * The one context every suite runs. It is composed of traits: the two
 * transports (occ, WebDAV) and one `Steps\*Steps` trait per concern, added
 * here as its feature file goes live. A new `*Steps.php` nobody `use`s here is
 * silently dead — bin/check-step-definitions.sh says so.
 */
final class FeatureContext implements Context {
	use AppLifecycleSteps;
	use ConnectionSteps;
	use CreateSteps;
	use DiagramFileSteps;
	use EditSteps;
	use ExportSteps;
	use LinkedFileSteps;
	use OccTrait;
	use ReadmeSteps;
	use RenderApiSteps;
	use ServerKnowledgeSteps;
	use ShareSteps;
	use WebDavTrait;

	public const APP_ID = 'plantuml';

	protected string $occ;
	protected string $baseUrl;
	protected string $adminUser;
	protected string $adminPass;
	protected string $plantumlUrl;

	protected int $lastExit = 0;
	protected string $lastOutput = '';

	public function __construct() {
		$this->occ = getenv('OCC') ?: 'php occ';
		$this->baseUrl = rtrim(getenv('NC_BASE_URL') ?: 'http://localhost:8080', '/');
		$this->adminUser = getenv('NC_ADMIN_USER') ?: 'admin';
		$this->adminPass = getenv('NC_ADMIN_PASS') ?: 'admin';
		$this->plantumlUrl = rtrim(getenv('PLANTUML_URL') ?: 'http://localhost:8081', '/');
	}
}
