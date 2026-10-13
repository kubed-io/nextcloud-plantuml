<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Command;

use OCA\PlantUml\Service\ServerConfig;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/** `occ plantuml:set-url <url>`: the admin card's Server URL field. */
final class SetUrl extends Command {
	public function __construct(
		private ServerConfig $server,
	) {
		parent::__construct();
	}

	#[\Override]
	protected function configure(): void {
		$this
			->setName('plantuml:set-url')
			->setDescription('Set the PlantUML server URL, as the admin card does.')
			->addArgument('url', InputArgument::REQUIRED, 'PlantUML server URL, e.g. https://plantuml.example.com');
	}

	#[\Override]
	protected function execute(InputInterface $input, OutputInterface $output): int {
		try {
			$this->server->setUrl((string)$input->getArgument('url'));
		} catch (\InvalidArgumentException $e) {
			$output->writeln('<error>' . $e->getMessage() . '</error>');
			return 1;
		}
		$output->writeln('<info>Server URL set</info>');
		return 0;
	}
}
