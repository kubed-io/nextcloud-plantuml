<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use PHPUnit\Framework\Assert;

/**
 * App lifecycle steps (enable / disable / file type). Steps read in
 * plain English (medium-agnostic); occ is an implementation detail of the step
 * definitions, not the feature. Composed into
 * {@see \OCA\PlantUml\Tests\Integration\FeatureContext}.
 */
trait AppLifecycleSteps {
	/**
	 * Behat matches a pattern whatever its keyword, so this one step serves the
	 * Given precondition and the Then assertion alike: it enables the app if need
	 * be, then asserts it is listed. The admin's own enable is asserted by exit
	 * code in the When, so a failed enable is not hidden here.
	 *
	 * @Given the app is enabled
	 */
	public function theAppIsEnabled(): void {
		$this->occ('app:enable --force ' . self::APP_ID);
		$res = $this->occ('app:list');
		Assert::assertMatchesRegularExpression(
			'/^\s+- ' . preg_quote(self::APP_ID, '/') . ':/m',
			$this->enabledBlock($res['output']),
			'the app is not in the Enabled list',
		);
	}

	/** @When the admin enables the app */
	public function theAdminEnablesTheApp(): void {
		$res = $this->occ('app:enable --force ' . self::APP_ID);
		Assert::assertSame(0, $res['exit'], "enabling the app failed:\n{$res['output']}");
	}

	/** @When the admin disables the app */
	public function theAdminDisablesTheApp(): void {
		$res = $this->occ('app:disable ' . self::APP_ID);
		Assert::assertSame(0, $res['exit'], "disabling the app failed:\n{$res['output']}");
	}

	/** @Then the app is not enabled */
	public function theAppIsNotEnabled(): void {
		$res = $this->occ('app:list');
		Assert::assertDoesNotMatchRegularExpression(
			'/^\s+- ' . preg_quote(self::APP_ID, '/') . ':/m',
			$this->enabledBlock($res['output']),
			'the app is still enabled',
		);
	}

	/**
	 * PROVEN BY UPLOADING A PLAIN FILE, not by reading the app's own metadata: a
	 * file this app never touched, with only its extension going for it, comes
	 * back typed as the app's mimetype. That is what registration means and the
	 * only part of it a client can observe.
	 *
	 * @Then :extension files are registered as their own file type
	 */
	public function filesAreRegisteredAsTheirOwnFileType(string $extension): void {
		$ext = ltrim(trim($extension), '.');
		$path = 'probe.' . $ext;
		$this->davPut($path, "@startuml\n\n@enduml\n");

		try {
			// The parameters are dropped first: a server may append `; charset=...`,
			// which is not part of what was registered.
			$type = $this->davContentType($path);
			Assert::assertSame(
				'text/x-plantuml',
				trim(explode(';', $type, 2)[0]),
				"a plain .$ext file came back as '$type' — the mimetype is not registered",
			);
		} finally {
			$this->davDelete($path);
		}
	}

	/** Slice the "Enabled:" block out of `occ app:list` output (stop at "Disabled:"). */
	private function enabledBlock(string $appList): string {
		$lines = explode("\n", $appList);
		$out = [];
		$in = false;
		foreach ($lines as $line) {
			if (str_starts_with($line, 'Enabled:')) {
				$in = true;
				continue;
			}
			if (str_starts_with($line, 'Disabled:')) {
				break;
			}
			if ($in) {
				$out[] = $line;
			}
		}
		return implode("\n", $out);
	}
}
