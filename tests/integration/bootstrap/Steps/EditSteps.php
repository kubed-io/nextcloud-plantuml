<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use Psr\Http\Message\ResponseInterface;

/**
 * Editing a diagram as the editor does it: read the file over WebDAV with its
 * ETag, preview a change through the source route, write it back with
 * `If-Match`, or to a copy beside it with `If-None-Match: *`.
 */
trait EditSteps {
	/** The line every change adds: a participant the fixture does not have. */
	private const CHANGE = "Shop -> Warehouse : reserve stock\n";
	private const CHANGE_DRAWN = 'Warehouse';

	private ?string $openedPath = null;
	private string $openedSource = '';
	private string $openedEtag = '';
	private string $changedSource = '';
	private string $theirVersion = '';
	private ?ResponseInterface $previewResponse = null;
	private int $saveStatus = 0;

	/** @When /^I change the source of "([^"]*)" without saving$/ */
	public function iChangeTheSourceWithoutSaving(string $path): void {
		$this->openForEditing($path);
		$this->previewResponse = $this->renderBySource($this->changedSource);
	}

	/** @Then the diagram shows the change */
	public function theDiagramShowsTheChange(): void {
		$this->assertSvg(
			$this->previewResponse ?? throw new \LogicException('no change was previewed'),
			self::CHANGE_DRAWN,
		);
	}

	/** @Then /^"([^"]*)" still holds its old source$/ */
	public function stillHoldsItsOldSource(string $path): void {
		$this->assertFileHolds($path, $this->openedSource);
	}

	/**
	 * The file is opened here unless a Given already opened it, so a save
	 * after someone else's change carries the ETag from before that change.
	 *
	 * @When /^I change the source of "([^"]*)" and save$/
	 */
	public function iChangeTheSourceAndSave(string $path): void {
		if ($this->openedPath !== $path) {
			$this->openForEditing($path);
		}
		$this->saveStatus = $this->davClient()->put($this->davPath($path), [
			'body' => $this->changedSource,
			'headers' => ['If-Match' => $this->openedEtag],
		])->getStatusCode();
	}

	/** @Given /^someone else has changed "([^"]*)" since I opened it$/ */
	public function someoneElseHasChangedItSinceIOpenedIt(string $path): void {
		$this->openForEditing($path);
		$this->theirVersion = "@startuml\nCustomer -> Shop : cancel order\n@enduml\n";
		$status = $this->davPut($path, $this->theirVersion)->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("their PUT of {$path} answered HTTP {$status}");
		}
	}

	/** @Then the save is refused */
	public function theSaveIsRefused(): void {
		if ($this->saveStatus !== 412) {
			throw new \RuntimeException("expected the save to answer HTTP 412, got {$this->saveStatus}");
		}
	}

	/**
	 * @Then /^"([^"]*)" holds the changed source$/
	 * @Then /^"([^"]*)" holds my change$/
	 */
	public function holdsTheChangedSource(string $path): void {
		$this->assertFileHolds($path, $this->changedSource);
	}

	/** @Then /^"([^"]*)" holds their version$/ */
	public function holdsTheirVersion(string $path): void {
		$this->assertFileHolds($path, $this->theirVersion);
	}

	/** @When I save my change as a copy */
	public function iSaveMyChangeAsACopy(): void {
		$path = $this->openedPath ?? throw new \LogicException('no file was opened');
		$copy = preg_replace('/(\.[^.\/]+)$/', ' (copy)$1', $path, 1);
		$this->putFiles[] = $copy;
		$this->saveStatus = $this->davClient()->put($this->davPath($copy), [
			'body' => $this->changedSource,
			'headers' => ['If-None-Match' => '*'],
		])->getStatusCode();
		if ($this->saveStatus >= 300) {
			throw new \RuntimeException("saving the copy {$copy} answered HTTP {$this->saveStatus}");
		}
	}

	/** Read the file and its ETag, and make the change the scenario is about. */
	private function openForEditing(string $path): void {
		$response = $this->davGet($path);
		if ($response->getStatusCode() !== 200 || $response->getHeaderLine('ETag') === '') {
			throw new \RuntimeException("GET {$path} answered HTTP {$response->getStatusCode()} with no ETag");
		}
		$this->openedPath = $path;
		$this->openedSource = (string)$response->getBody();
		$this->openedEtag = $response->getHeaderLine('ETag');
		$this->changedSource = str_replace('@enduml', self::CHANGE . '@enduml', $this->openedSource);
	}

	private function assertFileHolds(string $path, string $expected): void {
		$response = $this->davGet($path);
		$body = (string)$response->getBody();
		if ($response->getStatusCode() !== 200 || $body !== $expected) {
			throw new \RuntimeException(sprintf(
				"expected %s to hold:\n%s\ngot HTTP %d:\n%s",
				$path,
				$expected,
				$response->getStatusCode(),
				$body,
			));
		}
	}
}
