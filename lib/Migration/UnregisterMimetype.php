<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Migration;

use OC\Core\Command\Maintenance\Mimetype\GenerateMimetypeFileBuilder;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IMimeTypeLoader;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

/**
 * Reverses {@see RegisterMimetype} on app removal (the `<uninstall>` repair
 * step), leaving the Nextcloud core tree as it found it:
 *   1. Drop our extension and alias keys from the live config files.
 *   2. Delete the icon copied to `core/img/filetypes/plantuml.svg`.
 *   3. Re-stamp every `.puml` / `.plantuml` filecache row to `text/plain`,
 *      which is what they were before: a diagram is plain text.
 *   4. Regenerate `core/js/mimetypelist.js` without our alias.
 *
 * Touches only the system registration, never a user's files. Idempotent and
 * fail-soft: a half-present registration reverts cleanly.
 */
final class UnregisterMimetype implements IRepairStep {
	private const APP_MIMETYPE = 'text/x-plantuml';
	private const APP_ICON_NAME = 'plantuml';
	private const FILE_EXTENSIONS = ['puml', 'plantuml'];

	/** What a diagram file is to anyone who is not this app. */
	private const FALLBACK_MIMETYPE = 'text/plain';

	public function __construct(
		private IMimeTypeDetector $detector,
		private IMimeTypeLoader $loader,
		private LoggerInterface $logger,
	) {
	}

	#[\Override]
	public function getName(): string {
		return 'Remove the plantuml mimetype + icon';
	}

	#[\Override]
	public function run(IOutput $output): void {
		$serverRoot = \OC::$SERVERROOT;
		$configDir = \OC::$configDir;

		try {
			foreach (self::FILE_EXTENSIONS as $extension) {
				$this->removeJsonKey($configDir . 'mimetypemapping.json', $extension);
			}
			$this->removeJsonKey($configDir . 'mimetypealiases.json', self::APP_MIMETYPE);
		} catch (\Throwable $e) {
			$this->logger->error('plantuml: failed to revert mimetype config', ['exception' => $e]);
			$output->warning('plantuml: could not clean config/mimetype*.json (' . $e->getMessage() . ')');
		}

		// Delete the icon we copied into core/img/filetypes/.
		$dst = $serverRoot . '/core/img/filetypes/' . self::APP_ICON_NAME . '.svg';
		if (is_file($dst) && !@unlink($dst)) {
			$output->warning('plantuml: could not remove ' . $dst);
		}

		// Re-stamp the filecache rows so nothing dangles on the now-removed
		// mimetype id. The detector cache is primed because we just edited the
		// on-disk config files.
		$this->detector->getAllMappings(); // primes lazy load (no public reset)
		$fallbackId = $this->loader->getId(self::FALLBACK_MIMETYPE);
		$touched = 0;
		foreach (self::FILE_EXTENSIONS as $extension) {
			$touched += $this->loader->updateFilecache($extension, $fallbackId);
		}
		$output->info(sprintf(
			'plantuml: %d filecache row(s) reverted to %s',
			$touched,
			self::FALLBACK_MIMETYPE,
		));

		// Regenerate core/js/mimetypelist.js without our alias.
		try {
			$gen = new GenerateMimetypeFileBuilder();
			$js = $gen->generateFile(
				$this->detector->getAllAliases(),
				$this->detector->getAllNamings(),
			);
			@file_put_contents($serverRoot . '/core/js/mimetypelist.js', $js);
		} catch (\Throwable $e) {
			$this->logger->error('plantuml: failed to regenerate mimetypelist.js', ['exception' => $e]);
		}
	}

	/**
	 * Remove a single key from a JSON object file, atomically (tempfile + rename).
	 * No-op when the file or key is absent. Leaves every other entry untouched.
	 */
	private function removeJsonKey(string $path, string $key): void {
		if (!is_file($path)) {
			return;
		}
		$raw = file_get_contents($path);
		if ($raw === false || trim($raw) === '') {
			return;
		}
		$decoded = json_decode($raw, true);
		if (!is_array($decoded) || !array_key_exists($key, $decoded)) {
			return;
		}
		unset($decoded[$key]);
		$encoded = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
		if ($encoded === false) {
			throw new \RuntimeException('json_encode failed for ' . $path);
		}
		$tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
		if (file_put_contents($tmp, $encoded) === false) {
			throw new \RuntimeException('write failed: ' . $tmp);
		}
		if (!@rename($tmp, $path)) {
			@unlink($tmp);
			throw new \RuntimeException('rename failed: ' . $path);
		}
	}
}
