<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use GuzzleHttp\Client;

/**
 * A file another user shares with me, made as Nextcloud's own clients make it:
 * the user through the provisioning API as the admin, the file over their
 * WebDAV, the share through the OCS share API.
 */
trait ShareSteps {
	private const COLLEAGUE = 'plantuml-colleague';
	/** One word of the shared file, which no drawing may hold. */
	private const SHARED_WORD = 'Viewonlyfigures7Q4X';
	/** The `!include` is the diagram's third line. */
	private const INCLUDE_LINE = 2;

	/** The colleague's diagram in the shared folder, as stored: the owner's own text. */
	private const SHARED_DIAGRAM = "@startuml\nlegend\n!include Parts.puml\nendlegend\n@enduml\n";

	private string $colleaguePass = '';
	/** Where the share is in my files, as the diagram names it. */
	private string $sharedPath = '';
	/** The shared folder in my files, as the share's target names it. */
	private string $sharedFolder = '';

	/** @Given a colleague shared a text file with me that may be viewed but not downloaded */
	public function aColleagueSharedATextFileWithMeThatMayBeViewedButNotDownloaded(): void {
		$this->makeTheColleague();
		$this->colleaguePut('Figures.txt', 'Q4 ' . self::SHARED_WORD . "\n");
		$this->sharedPath = $this->shareWithMeViewOnly('/Figures.txt');
	}

	/** @Given a colleague shared a folder with me that may be viewed but not downloaded */
	public function aColleagueSharedAFolderWithMeThatMayBeViewedButNotDownloaded(): void {
		$this->makeTheColleague();
		$this->colleagueDav('MKCOL', 'Figures');
		$this->colleaguePut('Figures/About.md', "# Figures\n");
		$this->sharedFolder = $this->shareWithMeViewOnly('/Figures');
	}

	/** @Given the folder holds a text file */
	public function theFolderHoldsATextFile(): void {
		$this->colleaguePut('Figures/Figures.txt', 'Q4 ' . self::SHARED_WORD . "\n");
		// The include names it beside the drawing, so its mistake names it so.
		$this->sharedPath = 'Figures.txt';
	}

	/** @When I draw my own diagram that includes that file, beside a file in that folder */
	public function iDrawMyOwnDiagramThatIncludesThatFileBesideAFileInThatFolder(): void {
		// The include is the third line (INCLUDE_LINE), as the reused Then reads it.
		$this->renderResponse = $this->renderWith("@startuml\nlegend\n!include {$this->sharedPath}\nendlegend\n@enduml\n", "{$this->sharedFolder}/About.md");
	}

	/** @Given the folder holds a diagram, a part it includes and a notes file */
	public function theFolderHoldsADiagramAPartItIncludesAndANotesFile(): void {
		$this->colleaguePut('Figures/Flow.puml', self::SHARED_DIAGRAM);
		$this->colleaguePut('Figures/Parts.puml', "Parts\n");
		$this->colleaguePut('Figures/Notes.txt', 'Q4 ' . self::SHARED_WORD . "\n");
	}

	/** @When the diagram is drawn with new text for that part that includes the notes file */
	public function theDiagramIsDrawnWithNewTextForThatPartThatIncludesTheNotesFile(): void {
		$this->renderResponse = $this->renderWith(self::SHARED_DIAGRAM, "{$this->sharedFolder}/Flow.puml", ['Parts.puml' => "!include Notes.txt\n"]);
	}

	/** @Given I have a diagram that includes that file */
	public function iHaveADiagramThatIncludesThatFile(): void {
		$this->diagramPath = 'Diagrams/Figures.puml';
		$this->putFile('Diagrams', 'Figures.puml', "@startuml\nlegend\n!include \"{$this->sharedPath}\"\nendlegend\n@enduml\n");
	}

	/** @Then the drawing names the include as one it cannot read */
	public function theDrawingNamesTheIncludeAsOneItCannotRead(): void {
		$this->assertMistake("Cannot read {$this->sharedPath}", self::INCLUDE_LINE);
	}

	/** @Then the drawing names the notes file as one it cannot read */
	public function theDrawingNamesTheNotesFileAsOneItCannotRead(): void {
		$this->assertMistake('In Parts.puml, line 1: Cannot read Notes.txt', self::INCLUDE_LINE);
	}

	/**
	 * @Then none of the shared file's text is in it
	 * @Then none of the notes file's text is in it
	 */
	public function noneOfTheSharedFilesTextIsInIt(): void {
		$response = $this->lastRenderResponse();
		$answer = (string)$response->getBody();
		foreach ($response->getHeaders() as $name => $values) {
			$answer .= "\n{$name}: " . rawurldecode(implode(', ', $values));
		}
		if (str_contains($answer, self::SHARED_WORD)) {
			throw new \RuntimeException('the drawing holds the shared file\'s text');
		}
	}

	/** @AfterScenario */
	public function deleteTheColleagueThisScenarioMade(): void {
		if ($this->colleaguePass !== '') {
			$this->removeTheColleague();
			$this->colleaguePass = '';
		}
	}

	private function makeTheColleague(): void {
		// Left behind by a run that died before its cleanup.
		$this->removeTheColleague();
		$this->colleaguePass = 'Pu-' . bin2hex(random_bytes(12));
		$this->ocsAs($this->adminUser, $this->adminPass, 'POST', 'cloud/users', ['userid' => self::COLLEAGUE, 'password' => $this->colleaguePass]);
	}

	/** A WebDAV request as the colleague, in their files, that must succeed. */
	private function colleagueDav(string $method, string $path, string $body = ''): void {
		$status = (new Client([
			'base_uri' => $this->baseUrl . '/remote.php/dav/files/' . self::COLLEAGUE . '/',
			'auth' => [self::COLLEAGUE, $this->colleaguePass],
			'http_errors' => false,
		]))->request($method, $path, $body === '' ? [] : ['body' => $body])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("{$method} {$path} as the colleague answered HTTP {$status}");
		}
	}

	private function colleaguePut(string $path, string $body): void {
		$this->colleagueDav('PUT', $path, $body);
	}

	/** Shares the colleague's `$path` with me, read only and no download; where it is in my files. */
	private function shareWithMeViewOnly(string $path): string {
		return $this->shareViewOnlyWithMe(self::COLLEAGUE, $this->colleaguePass, $path);
	}

	/** Shares `$owner`'s `$path` with me, read only and no download; where it is in my files, accepted first when the server holds it as pending. */
	private function shareViewOnlyWithMe(string $owner, string $password, string $path): string {
		$share = $this->ocsAs($owner, $password, 'POST', 'apps/files_sharing/api/v1/shares', [
			'path' => $path,
			'shareType' => 0,
			'shareWith' => $this->adminUser,
			'permissions' => 1,
			'attributes' => '[{"scope":"permissions","key":"download","value":false}]',
		]);
		$id = (string)($share['id'] ?? '');
		// A server set not to accept shares by itself lists it as pending.
		foreach ($this->ocsAs($this->adminUser, $this->adminPass, 'GET', 'apps/files_sharing/api/v1/shares/pending') as $pending) {
			if ((string)($pending['id'] ?? '') === $id) {
				$this->ocsAs($this->adminUser, $this->adminPass, 'POST', "apps/files_sharing/api/v1/shares/pending/{$id}");
			}
		}
		foreach ($this->ocsAs($this->adminUser, $this->adminPass, 'GET', 'apps/files_sharing/api/v1/shares', ['shared_with_me' => 'true']) as $received) {
			if ((string)($received['id'] ?? '') === $id) {
				return (string)$received['file_target'];
			}
		}
		throw new \RuntimeException("share {$id} is not among the shares I received");
	}

	/** Their shares and files go with them. */
	private function removeTheColleague(): void {
		$this->removeUser(self::COLLEAGUE);
	}

	/** Their shares and files go with them. */
	private function removeUser(string $uid): void {
		(new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]))
			->delete($this->baseUrl . '/ocs/v2.php/cloud/users/' . rawurlencode($uid), ['headers' => ['OCS-APIRequest' => 'true']]);
	}

	/**
	 * An OCS call that must succeed, its `data` given back.
	 *
	 * @param array<string, string|int> $params
	 * @return array<array-key, mixed>
	 */
	private function ocsAs(string $user, string $password, string $method, string $route, array $params = []): array {
		$response = (new Client(['auth' => [$user, $password], 'http_errors' => false]))->request($method, $this->baseUrl . '/ocs/v2.php/' . $route, [
			$method === 'GET' ? 'query' : 'form_params' => $params,
			'headers' => ['OCS-APIRequest' => 'true', 'Accept' => 'application/json'],
		]);
		$data = json_decode((string)$response->getBody(), true)['ocs']['data'] ?? null;
		if ($response->getStatusCode() !== 200 || !is_array($data)) {
			throw new \RuntimeException(sprintf(
				"%s %s as %s answered HTTP %d:\n%s",
				$method,
				$route,
				$user,
				$response->getStatusCode(),
				substr((string)$response->getBody(), 0, 500),
			));
		}
		return $data;
	}
}
