<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Command;

use OCA\PlantUml\Service\ServerConfig;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/** `occ plantuml:show-config`: what the app is set to. Exit 1 when unset. */
final class ShowConfig extends Command {
	public function __construct(
		private ServerConfig $server,
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
		if (!$this->server->isSet()) {
			$output->writeln(ServerConfig::KEY_URL . ': (not set)');
			return 1;
		}
		$output->writeln(ServerConfig::KEY_URL . ': ' . $this->server->getUrl());
		return 0;
	}
}
