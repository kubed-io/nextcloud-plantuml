<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Listener;

use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Template\FileCreatedFromTemplateEvent;

/**
 * Gives a new, empty diagram file its starting lines, so a diagram created
 * through Files' create endpoint is the same file whichever client asked: the
 * + New entry, or anything else that posts to it.
 *
 * Files fires {@see FileCreatedFromTemplateEvent} for every file it creates
 * that way, with no template when the file starts blank. A file made from a
 * template, or one that already holds something, is left as it is.
 *
 * @implements IEventListener<Event|FileCreatedFromTemplateEvent>
 */
final class NewDiagramListener implements IEventListener {
	public const CONTENT = "@startuml\n\n@enduml\n";

	private const EXTENSIONS = ['puml', 'plantuml'];

	#[\Override]
	public function handle(Event $event): void {
		if (!$event instanceof FileCreatedFromTemplateEvent || $event->getTemplate() !== null) {
			return;
		}
		$target = $event->getTarget();
		$extension = strtolower(pathinfo($target->getName(), PATHINFO_EXTENSION));
		if (!in_array($extension, self::EXTENSIONS, true) || (int)$target->getSize() !== 0) {
			return;
		}
		$target->putContent(self::CONTENT);
	}
}
