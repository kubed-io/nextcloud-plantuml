<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Command;

use OCA\PlantUml\Service\ServerConfig;
use OCA\PlantUml\Service\TemplateLibrary;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/** `occ plantuml:show-config`: what the app is set to. Exit 1 when unset. */
final class ShowConfig extends Command {
	public function __construct(
		private ServerConfig $server,
		private TemplateLibrary $templates,
	) {
		parent::__construct();
	}

	#[\Override]
	protected function configure(): void {
		$this
			->setName('plantuml:show-config')
			->setDescription('Show the PlantUML Diagrams configuration.');
	}

	#[\Override]
	protected function execute(InputInterface $input, OutputInterface $output): int {
		$set = $this->server->isSet();
		$output->writeln(ServerConfig::KEY_URL . ': ' . ($set ? $this->server->getUrl() : '(not set)'));
		$output->writeln(TemplateLibrary::KEY_FOLDER . ': ' . $this->templates->folder());
		$output->writeln(TemplateLibrary::KEY_ACTOR . ': ' . ($this->templates->actor() ?? '(none)'));
		return $set ? 0 : 1;
	}
}
