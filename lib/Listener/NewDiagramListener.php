<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Listener;

use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\File;
use OCP\Files\Template\FileCreatedFromTemplateEvent;

/**
 * Gives a new, empty diagram file its starting lines, so a diagram created
 * through Files' create endpoint is the same file whichever client asked: the
 * + New entry, or anything else that posts to it.
 *
 * Files fires {@see FileCreatedFromTemplateEvent} for every file it creates
 * that way, with no template when the file starts blank. A file made from a
 * template, or one that already holds something, is left as it is. Blank
 * means empty or whitespace only: object storage writes a space for an empty file.
 *
 * @implements IEventListener<Event|FileCreatedFromTemplateEvent>
 */
final class NewDiagramListener implements IEventListener {
	public const CONTENT = "@startuml\n\n@enduml\n";

	private const EXTENSIONS = ['puml', 'plantuml'];

	/** Bytes worth reading to tell a blank file from a small one. */
	private const BLANK_LIMIT = 16;

	#[\Override]
	public function handle(Event $event): void {
		if (!$event instanceof FileCreatedFromTemplateEvent || $event->getTemplate() !== null) {
			return;
		}
		$target = $event->getTarget();
		$extension = strtolower(pathinfo($target->getName(), PATHINFO_EXTENSION));
		if (!in_array($extension, self::EXTENSIONS, true) || !self::isBlank($target)) {
			return;
		}
		$target->putContent(self::CONTENT);
	}

	/** Object storage cannot hold an empty object, so its touch() writes one space. */
	private static function isBlank(File $target): bool {
		$size = (int)$target->getSize();
		return $size === 0 || ($size <= self::BLANK_LIMIT && trim($target->getContent()) === '');
	}
}
