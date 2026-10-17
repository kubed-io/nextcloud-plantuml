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

	private string $colleaguePass = '';
	/** Where the share is in my files, as the diagram names it. */
	private string $sharedPath = '';

	/** @Given a colleague shared a text file with me that may be viewed but not downloaded */
	public function aColleagueSharedATextFileWithMeThatMayBeViewedButNotDownloaded(): void {
		// Left behind by a run that died before its cleanup.
		$this->removeTheColleague();
		$this->colleaguePass = 'Pu-' . bin2hex(random_bytes(12));
		$this->ocsAs($this->adminUser, $this->adminPass, 'POST', 'cloud/users', ['userid' => self::COLLEAGUE, 'password' => $this->colleaguePass]);

		$dav = new Client([
			'base_uri' => $this->baseUrl . '/remote.php/dav/files/' . self::COLLEAGUE . '/',
			'auth' => [self::COLLEAGUE, $this->colleaguePass],
			'http_errors' => false,
		]);
		$status = $dav->put('Figures.txt', ['body' => 'Q4 ' . self::SHARED_WORD . "\n"])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT Figures.txt as the colleague answered HTTP {$status}");
		}

		$share = $this->ocsAs(self::COLLEAGUE, $this->colleaguePass, 'POST', 'apps/files_sharing/api/v1/shares', [
			'path' => '/Figures.txt',
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
				$this->sharedPath = (string)$received['file_target'];
			}
		}
		if ($this->sharedPath === '') {
			throw new \RuntimeException("share {$id} is not among the shares I received");
		}
	}

	/** @Given I have a diagram that includes that file */
	public function iHaveADiagramThatIncludesThatFile(): void {
		$this->diagramPath = 'Diagrams/Figures.puml';
		$this->putFile('Diagrams', 'Figures.puml', "@startuml\nlegend\n!include \"{$this->sharedPath}\"\nendlegend\n@enduml\n");
	}

	/** @Then the drawing names the include as one it cannot read */
	public function theDrawingNamesTheIncludeAsOneItCannotRead(): void {
		$response = $this->lastRenderResponse();
		$error = rawurldecode($response->getHeaderLine('X-PlantUML-Diagram-Error'));
		$line = $response->getHeaderLine('X-PlantUML-Diagram-Error-Line');
		if ($error !== "Cannot read {$this->sharedPath}" || $line !== (string)self::INCLUDE_LINE) {
			throw new \RuntimeException("expected 'Cannot read {$this->sharedPath}' on line " . self::INCLUDE_LINE . ", got HTTP {$response->getStatusCode()}, error '{$error}', line '{$line}'");
		}
	}

	/** @Then none of the shared file's text is in it */
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

	/** Their shares and files go with them. */
	private function removeTheColleague(): void {
		(new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]))
			->delete($this->baseUrl . '/ocs/v2.php/cloud/users/' . self::COLLEAGUE, ['headers' => ['OCS-APIRequest' => 'true']]);
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
