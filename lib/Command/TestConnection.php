<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Command;

use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\RenderService;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * `occ plantuml:test-connection`: the Test connection button, same call, same
 * line. Exit 1 on any problem, so a script can gate on it.
 */
final class TestConnection extends Command {
	public function __construct(
		private RenderService $render,
	) {
		parent::__construct();
	}

	#[\Override]
	protected function configure(): void {
		$this
			->setName('plantuml:test-connection')
			->setDescription('Check the PlantUML server, as the admin Test connection button does.');
	}

	#[\Override]
	protected function execute(InputInterface $input, OutputInterface $output): int {
		try {
			$output->writeln('<info>PlantUML ' . $this->render->version() . '</info>');
			return 0;
		} catch (RenderException $e) {
			$output->writeln('<error>' . $e->adminMessage() . '</error>');
			return 1;
		}
	}
}
