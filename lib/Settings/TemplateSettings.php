<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Settings;

use OCA\PlantUml\AppInfo\Application;
use OCA\PlantUml\Service\TemplateLibrary;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Settings\DeclarativeSettingsTypes;
use OCP\Settings\IDeclarativeSettingsFormWithHandlers;
use Psr\Log\LoggerInterface;

/**
 * The admin card's Templates section (TP4): a form of its own under the server
 * URL's and its Test connection button, since a form has one title. EXTERNAL,
 * as InstanceSettings says why.
 *
 * Core builds every form's schema on every settings page, admin and personal,
 * for every user, and again on each value read or save: the status line reads
 * the folder, so it is worked out for an admin only, and once.
 */
final class TemplateSettings implements IDeclarativeSettingsFormWithHandlers {
	private bool $looked = false;
	private ?string $status = null;

	public function __construct(
		private readonly TemplateLibrary $library,
		private readonly IUserSession $session,
		private readonly IGroupManager $groups,
		private readonly LoggerInterface $logger,
	) {
	}

	#[\Override]
	public function getSchema(): array {
		$field = [
			'id' => TemplateLibrary::KEY_FOLDER,
			'title' => 'Template folder',
			'type' => DeclarativeSettingsTypes::TEXT,
			'default' => TemplateLibrary::DEFAULT_FOLDER,
		];
		$status = $this->status();
		if ($status !== null) {
			$field['description'] = $status;
		}
		return [
			'id' => 'templates',
			// Below AdminTest's Test connection button (10), which belongs to the URL card.
			'priority' => 20,
			'section_type' => DeclarativeSettingsTypes::SECTION_TYPE_ADMIN,
			'section_id' => Application::APP_ID,
			'storage_type' => DeclarativeSettingsTypes::STORAGE_TYPE_EXTERNAL,
			'title' => 'Templates',
			'description' => 'Diagrams everyone can start from, in Add diagram',
			'fields' => [$field],
		];
	}

	#[\Override]
	public function getValue(string $fieldId, IUser $user): mixed {
		return $fieldId === TemplateLibrary::KEY_FOLDER ? $this->library->folder() : null;
	}

	#[\Override]
	public function setValue(string $fieldId, mixed $value, IUser $user): void {
		if ($fieldId !== TemplateLibrary::KEY_FOLDER) {
			return;
		}
		try {
			$this->library->setFolder(is_string($value) ? $value : '');
		} catch (\InvalidArgumentException $e) {
			// Core shows only a generic "failed to save"; the reason goes to the log.
			$this->logger->info('Template folder refused: {reason}', ['reason' => $e->getMessage()]);
			throw $e;
		}
	}

	/** "In <actor>'s files · N templates in M files", for an admin; null for anyone else, or with no actor. */
	private function status(): ?string {
		if ($this->looked) {
			return $this->status;
		}
		$this->looked = true;
		$uid = $this->session->getUser()?->getUID();
		if ($uid === null || !$this->groups->isAdmin($uid)) {
			return null;
		}
		$summary = $this->library->summary();
		if ($summary['actor'] === null) {
			return null;
		}
		$n = $summary['templates'];
		$m = $summary['files'];
		return $this->status = sprintf("In %s's files · %d %s in %d %s", $summary['actor'], $n, $n === 1 ? 'template' : 'templates', $m, $m === 1 ? 'file' : 'files');
	}
}
