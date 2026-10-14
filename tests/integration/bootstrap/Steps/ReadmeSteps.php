<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

/**
 * A folder README read as the README observer reads it: its text over WebDAV,
 * each plantuml fence drawn through the source route and each image that names
 * a diagram file drawn through the path route.
 */
trait ReadmeSteps {
	/** The fence's diagram, with a participant only it draws. */
	private const FENCE = "@startuml\nReader -> Lighthouse : finds the way\n@enduml";
	private const FENCE_DRAWN = 'Lighthouse';

	private string $readmeFolder = '';
	private string $readmeText = '';

	/** @Given /^the README in "([^"]*)" holds a plantuml code fence$/ */
	public function theReadmeHoldsAPlantumlCodeFence(string $folder): void {
		$this->putFile($folder, 'README.md', "# Diagrams\n\n```plantuml\n" . self::FENCE . "\n```\n");
	}

	/**
	 * The destination is written `<…>`, the form Markdown needs for a file name
	 * with a space in it.
	 *
	 * @Given /^the README in "([^"]*)" embeds the image "([^"]*)"$/
	 */
	public function theReadmeEmbedsTheImage(string $folder, string $name): void {
		$alt = pathinfo($name, PATHINFO_FILENAME);
		$this->putFile($folder, 'README.md', "# Diagrams\n\n![{$alt}](<{$name}>)\n");
	}

	/** @When /^I read the README in "([^"]*)"$/ */
	public function iReadTheReadmeIn(string $folder): void {
		$path = trim($folder, '/') . '/README.md';
		$response = $this->davGet($path);
		if ($response->getStatusCode() !== 200) {
			throw new \RuntimeException("GET {$path} answered HTTP {$response->getStatusCode()}");
		}
		$this->readmeFolder = trim($folder, '/');
		$this->readmeText = (string)$response->getBody();
	}

	/** @Then the fence is drawn as its diagram */
	public function theFenceIsDrawnAsItsDiagram(): void {
		$source = $this->plantumlFence($this->readmeText)
			?? throw new \RuntimeException("no plantuml fence in the README:\n{$this->readmeText}");
		$this->assertSvg($this->renderBySource($source), self::FENCE_DRAWN);
	}

	/** @Then /^the image is drawn as the diagram of "([^"]*)"$/ */
	public function theImageIsDrawnAsTheDiagramOf(string $path): void {
		// src/readme/markdown.js's IMAGE: the destination bare or in <…>, an optional title.
		$image = '/!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)"\']*?))\s*(?:"[^"]*"|\'[^\']*\')?\s*\)/';
		if (preg_match($image, $this->readmeText, $m) !== 1) {
			throw new \RuntimeException("no image in the README:\n{$this->readmeText}");
		}
		$resolved = $this->readmeFolder . '/' . rawurldecode(trim($m[2] !== '' ? $m[2] : ($m[3] ?? '')));
		if ($resolved !== $path) {
			throw new \RuntimeException("the image points at '{$resolved}', not '{$path}'");
		}
		// Customer is a participant of the diagram file's fixture.
		$this->assertSvg($this->renderByPath($resolved), 'Customer');
	}

	/**
	 * The first plantuml fence's source, found by src/readme/markdown.js's rule:
	 * an opening run of three or more backticks or tildes, closed by a run of the
	 * same character at least as long, the opener's indent taken off each line.
	 */
	private function plantumlFence(string $markdown): ?string {
		$lines = preg_split('/\r?\n/', $markdown) ?: [];
		for ($i = 0; $i < count($lines); $i++) {
			if (preg_match('/^( *)(`{3,}|~{3,})(.*)$/', $lines[$i], $open) !== 1
				|| ($open[2][0] === '`' && str_contains($open[3], '`'))) {
				continue;
			}
			$closing = '/^ *' . preg_quote($open[2][0], '/') . '{' . strlen($open[2]) . ',} *$/';
			$body = [];
			for ($i++; $i < count($lines) && preg_match($closing, $lines[$i]) !== 1; $i++) {
				$body[] = preg_replace('/^ {0,' . strlen($open[1]) . '}/', '', $lines[$i]);
			}
			if ((preg_split('/\s+/', trim($open[3]))[0] ?? '') === 'plantuml') {
				return implode("\n", $body);
			}
		}
		return null;
	}
}
