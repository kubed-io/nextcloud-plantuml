<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

/**
 * GET /export, as the Viewer's Export asks for it: one diagram, or every one,
 * in a format; the answer lands in RenderApiSteps' last response, so its
 * refusal step reads it.
 */
trait ExportSteps {
	/** The words a scenario names a format by, and the route's names for them. */
	private const EXPORT_FORMATS = ['SVG' => 'svg', 'PNG' => 'png', 'PDF' => 'pdf', 'EPS' => 'eps', 'ASCII art' => 'txt'];

	/** How each kind of file a download may be starts. */
	private const EXPORT_MAGIC = ['svg' => '<svg', 'png' => "\x89PNG", 'pdf' => '%PDF', 'eps' => '%!PS', 'txt' => '', 'zip' => "PK\x03\x04"];

	/** @When /^I export the diagram "([^"]*)" of "([^"]*)" as (\w+(?: art)?)$/ */
	public function iExportTheDiagramOfAs(string $diagram, string $path, string $format): void {
		$this->export($path, $format, [$diagram]);
	}

	/** @When /^I export "([^"]*)" as (\w+(?: art)?)$/ */
	public function iExportAs(string $path, string $format): void {
		$this->export($path, $format, []);
	}

	/** @Then /^I download "([^"]*)"$/ */
	public function iDownload(string $name): void {
		$response = $this->lastRenderResponse();
		$body = (string)$response->getBody();
		$named = preg_match("/filename\\*=UTF-8''([^;]+)/", $response->getHeaderLine('Content-Disposition'), $m) === 1 ? rawurldecode($m[1]) : '';
		$magic = self::EXPORT_MAGIC[strtolower(pathinfo($name, PATHINFO_EXTENSION))] ?? null;
		if ($response->getStatusCode() !== 200 || $named !== $name || $magic === null || !str_contains(substr($body, 0, 512), $magic)) {
			throw new \RuntimeException(sprintf(
				"expected a 200 download named '%s', got HTTP %d named '%s' (%s), starting: %s",
				$name,
				$response->getStatusCode(),
				$named,
				$response->getHeaderLine('Content-Type'),
				bin2hex(substr($body, 0, 16)),
			));
		}
	}

	/** @Then /^it holds "([^"]*)" and "([^"]*)"$/ */
	public function itHolds(string $first, string $second): void {
		$entries = self::zipEntries((string)$this->lastRenderResponse()->getBody());
		foreach ([$first, $second] as $name) {
			if (!in_array($name, $entries, true)) {
				throw new \RuntimeException("the zip holds no '{$name}'; it holds: " . implode(', ', $entries));
			}
		}
	}

	/** @param list<string> $diagrams none for every diagram */
	private function export(string $path, string $format, array $diagrams): void {
		$this->refusal = isset(self::EXPORT_FORMATS[$format]) ? 404 : 400;
		$query = 'path=' . rawurlencode($path) . '&format=' . rawurlencode(self::EXPORT_FORMATS[$format] ?? strtolower($format))
			. implode('', array_map(static fn (string $d): string => '&diagram%5B%5D=' . rawurlencode($d), $diagrams));
		$this->renderResponse = $this->httpClient()->get($this->baseUrl . '/index.php/apps/plantuml/export?' . $query);
	}

	/** @return list<string> the entry names */
	private static function zipEntries(string $zip): array {
		$path = (string)tempnam(sys_get_temp_dir(), 'export');
		file_put_contents($path, $zip);
		try {
			$archive = new \ZipArchive();
			if ($archive->open($path) !== true) {
				throw new \RuntimeException('the download is not a zip: ' . bin2hex(substr($zip, 0, 16)));
			}
			$entries = [];
			for ($i = 0; $i < $archive->numFiles; $i++) {
				$entries[] = (string)$archive->getNameIndex($i);
			}
			$archive->close();
			return $entries;
		} finally {
			unlink($path);
		}
	}
}
