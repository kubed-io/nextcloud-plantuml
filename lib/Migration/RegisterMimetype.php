<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Migration;

use OC\Core\Command\Maintenance\Mimetype\GenerateMimetypeFileBuilder;
use OCA\PlantUml\AppInfo\Application;
use OCP\App\AppPathNotFoundException;
use OCP\App\IAppManager;
use OCP\Files\IMimeTypeDetector;
use OCP\Files\IMimeTypeLoader;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

/**
 * Registers the `text/x-plantuml` mimetype and its icon so a `.puml` or
 * `.plantuml` file is its own file type in the Files row, not generic text.
 * Runs on every install and upgrade; every step is idempotent:
 *   1. Merge the extension and alias mappings into the live config files
 *      (`config/mimetypemapping.json`, `config/mimetypealiases.json`).
 *   2. Copy the SVG to `core/img/filetypes/plantuml.svg`, where
 *      GenerateMimetypeFileBuilder enumerates icon basenames from.
 *   3. Insert the mimetype into `oc_mimetypes` and rewrite every filecache row
 *      with one of our extensions to that id.
 *   4. Regenerate `core/js/mimetypelist.js` so the frontend map carries the alias.
 *
 * Equivalent to `occ maintenance:mimetype:update-db` + `update-js`, with no
 * human step. The app directory comes from {@see IAppManager}, never a hard-coded
 * `/custom_apps/`: the app lives wherever it was installed or checked out.
 */
final class RegisterMimetype implements IRepairStep {
	private const APP_MIMETYPE = 'text/x-plantuml';
	private const APP_ICON_NAME = 'plantuml';
	private const FILE_EXTENSIONS = ['puml', 'plantuml'];

	public function __construct(
		private IAppManager $appManager,
		private IMimeTypeDetector $detector,
		private IMimeTypeLoader $loader,
		private LoggerInterface $logger,
	) {
	}

	#[\Override]
	public function getName(): string {
		return 'Register the plantuml mimetype + icon';
	}

	#[\Override]
	public function run(IOutput $output): void {
		$serverRoot = \OC::$SERVERROOT;
		// The config dir may be mounted away from the server root; ask OC.
		$configDir = \OC::$configDir;

		try {
			$this->mergeJson(
				$configDir . 'mimetypemapping.json',
				array_fill_keys(self::FILE_EXTENSIONS, [self::APP_MIMETYPE]),
			);
			$this->mergeJson(
				$configDir . 'mimetypealiases.json',
				[self::APP_MIMETYPE => self::APP_ICON_NAME],
			);
		} catch (\Throwable $e) {
			$this->logger->error('plantuml: failed to merge mimetype config', ['exception' => $e]);
			$output->warning('plantuml: could not update config/mimetype*.json (' . $e->getMessage() . ')');
		}

		// Copy the SVG into core/img/filetypes/. GenerateMimetypeFileBuilder scans
		// that directory verbatim, so the icon basename MUST match the alias value
		// written above ("plantuml.svg" for alias "plantuml").
		$this->installIcon($serverRoot, $output);

		// update-db: insert the mimetype row, then rewrite the filecache rows whose
		// extension matches. getAllMappings() forces the detector's lazy load now,
		// after the config write; there is no public reset.
		$this->detector->getAllMappings();
		$id = $this->loader->getId(self::APP_MIMETYPE);
		$touched = 0;
		foreach (self::FILE_EXTENSIONS as $extension) {
			$touched += $this->loader->updateFilecache($extension, $id);
		}
		$output->info(sprintf(
			'plantuml: mimetype id=%d, %d filecache row(s) updated',
			$id,
			$touched,
		));

		// update-js: regenerate core/js/mimetypelist.js so the frontend map
		// includes our alias. Same code path as `occ maintenance:mimetype:update-js`.
		try {
			$gen = new GenerateMimetypeFileBuilder();
			$js = $gen->generateFile(
				$this->detector->getAllAliases(),
				$this->detector->getAllNamings(),
			);
			$target = $serverRoot . '/core/js/mimetypelist.js';
			if (@file_put_contents($target, $js) === false) {
				$output->warning('plantuml: could not write ' . $target);
			}
		} catch (\Throwable $e) {
			$this->logger->error('plantuml: failed to regenerate mimetypelist.js', ['exception' => $e]);
		}
	}

	/**
	 * Copy `img/plantuml.svg` into `core/img/filetypes/`, writing only when the
	 * bytes actually differ so an upgrade does not churn the core tree.
	 *
	 * Fail-soft on every branch: a missing icon costs the glyph, not the
	 * mimetype, and a repair step that threw here would abort an app upgrade over
	 * a decoration.
	 */
	private function installIcon(string $serverRoot, IOutput $output): void {
		try {
			$appRoot = $this->appManager->getAppPath(Application::APP_ID);
		} catch (AppPathNotFoundException $e) {
			$this->logger->error('plantuml: could not resolve the app path for the icon', ['exception' => $e]);
			$output->warning('plantuml: could not resolve the app directory; the filetype icon was not installed');

			return;
		}

		$src = $appRoot . '/img/' . self::APP_ICON_NAME . '.svg';
		if (!file_exists($src)) {
			$output->warning('plantuml: icon source missing at ' . $src);

			return;
		}

		$dst = $serverRoot . '/core/img/filetypes/' . self::APP_ICON_NAME . '.svg';
		$existing = is_file($dst) ? @file_get_contents($dst) : null;
		$incoming = @file_get_contents($src);
		if ($incoming === false || $existing === $incoming) {
			return;
		}
		if (@file_put_contents($dst, $incoming) === false) {
			$output->warning('plantuml: could not write ' . $dst);
		}
	}

	/**
	 * Read a JSON file (creating it if missing), merge `$additions` on top, and
	 * write it back. Atomic via tempfile + rename.
	 *
	 * @param array<string,mixed> $additions
	 */
	private function mergeJson(string $path, array $additions): void {
		$existing = [];
		if (is_file($path)) {
			$raw = file_get_contents($path);
			if ($raw !== false && trim($raw) !== '') {
				$decoded = json_decode($raw, true);
				if (is_array($decoded)) {
					$existing = $decoded;
				}
			}
		}
		$changed = false;
		foreach ($additions as $key => $value) {
			if (!array_key_exists($key, $existing) || $existing[$key] !== $value) {
				$existing[$key] = $value;
				$changed = true;
			}
		}
		if (!$changed && is_file($path)) {
			return;
		}
		$encoded = json_encode($existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
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
