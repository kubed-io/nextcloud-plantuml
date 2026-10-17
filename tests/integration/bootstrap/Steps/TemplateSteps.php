<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

use GuzzleHttp\Client;

/**
 * Where Add diagram's templates come from (app spec TP1–TP4): the admin's
 * template folder, offered to every user, and each user's own Templates
 * folder, offered to them alone. Users are made through the provisioning API
 * as ShareSteps makes its colleague, and go after the scenario with all they own.
 */
trait TemplateSteps {
	/** The user whose view-only share lands in the admin's template folder. */
	private const SHARER = 'plantuml-sharer';
	/** One closed block: one template. */
	private const TEMPLATE_TEXT = "@startuml\nA -> B\n@enduml\n";

	/** @var array<string, string> uid => password, the users this scenario made */
	private array $templateUsers = [];
	/** @var list<string> paths in the admin's files this scenario made */
	private array $templatePaths = [];
	private string $offeredTo = '';
	/** @var list<array{source: string, path: string, text: string}> */
	private array $offered = [];

	/** @Given /^the admin's template folder holds a diagram file "([^"]*)"$/ */
	public function theAdminsTemplateFolderHoldsADiagramFile(string $name): void {
		$this->useTheDefaultTemplateFolder();
		$path = "Templates/{$name}";
		$status = $this->davPut($path, self::TEMPLATE_TEXT)->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT {$path} answered HTTP {$status}");
		}
		$this->templatePaths[] = $path;
	}

	/** @Given /^"([^"]*)" keeps a diagram file "([^"]*)" in their Templates folder$/ */
	public function keepsADiagramFileInTheirTemplatesFolder(string $user, string $name): void {
		$dav = $this->davAs($user);
		// Made already when the server copied its skeleton on the user's first visit; 405 then.
		$dav->request('MKCOL', 'Templates');
		$status = $dav->put('Templates/' . rawurlencode($name), ['body' => self::TEMPLATE_TEXT])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT Templates/{$name} as {$user} answered HTTP {$status}");
		}
		// What Files' "Templates folder" setting writes, and ITemplateManager::getTemplatePath() reads.
		$set = $this->occ(sprintf('user:setting %s core templateDirectory %s', escapeshellarg($user), escapeshellarg('/Templates')));
		if ($set['exit'] !== 0) {
			throw new \RuntimeException("user:setting failed (exit {$set['exit']}):\n{$set['output']}");
		}
	}

	/** @Given /^someone shares "([^"]*)" view-only into the admin's template folder$/ */
	public function someoneSharesViewOnlyIntoTheAdminsTemplateFolder(string $name): void {
		$this->useTheDefaultTemplateFolder();
		$password = $this->templateUser(self::SHARER);
		$status = $this->davAs(self::SHARER)->put(rawurlencode($name), ['body' => "@startuml\nsecret\n@enduml\n"])->getStatusCode();
		if ($status >= 300) {
			throw new \RuntimeException("PUT {$name} as " . self::SHARER . " answered HTTP {$status}");
		}
		// A view-only share cannot be moved (WebDAV MOVE asks the right to delete it), so it is
		// accepted into Templates: Files' "folder for accepted shares", set for this share alone.
		$user = escapeshellarg($this->adminUser);
		$set = $this->occ("user:setting {$user} files_sharing share_folder " . escapeshellarg('/Templates'));
		if ($set['exit'] !== 0) {
			throw new \RuntimeException("user:setting failed (exit {$set['exit']}):\n{$set['output']}");
		}
		try {
			$target = $this->shareViewOnlyWithMe(self::SHARER, $password, "/{$name}");
		} finally {
			$this->occ("user:setting {$user} files_sharing share_folder --delete");
		}
		if (!$this->davExists("Templates/{$name}")) {
			throw new \RuntimeException("the share landed at {$target}, not in Templates");
		}
	}

	/** @Given /^the admin's files hold no folder "([^"]*)"$/ */
	public function theAdminsFilesHoldNoFolder(string $path): void {
		$this->davDelete($path);
		if ($this->davExists($path)) {
			throw new \RuntimeException("{$path} is still in the admin's files");
		}
		// The first segment is what the scenario leaves behind, so it is what goes.
		$this->templatePaths[] = explode('/', trim($path, '/'))[0];
	}

	/** @When /^"([^"]*)" asks for the templates to start from$/ */
	public function asksForTheTemplatesToStartFrom(string $user): void {
		$password = $this->templateUser($user);
		$response = (new Client(['auth' => [$user, $password], 'http_errors' => false]))
			->get($this->baseUrl . '/index.php/apps/plantuml/templates', ['headers' => ['Accept' => 'application/json']]);
		$files = json_decode((string)$response->getBody(), true)['files'] ?? null;
		if ($response->getStatusCode() !== 200 || !is_array($files)) {
			throw new \RuntimeException("GET /templates as {$user} answered HTTP {$response->getStatusCode()}:\n" . substr((string)$response->getBody(), 0, 500));
		}
		$this->offeredTo = $user;
		$this->offered = $files;
	}

	/**
	 * As the admin card saves it: core's declarative settings API, which hands
	 * the value to TemplateSettings::setValue. It answers `data: null`, so its
	 * status is checked here rather than through ocsAs().
	 *
	 * @When /^the admin sets the template folder to "([^"]*)"$/
	 */
	public function theAdminSetsTheTemplateFolderTo(string $path): void {
		$response = (new Client(['auth' => [$this->adminUser, $this->adminPass], 'http_errors' => false]))
			->post($this->baseUrl . '/ocs/v2.php/settings/api/declarative/value', [
				'form_params' => ['app' => self::APP_ID, 'formId' => 'templates', 'fieldId' => 'template_folder', 'value' => $path],
				'headers' => ['OCS-APIRequest' => 'true', 'Accept' => 'application/json'],
			]);
		if ($response->getStatusCode() !== 200) {
			throw new \RuntimeException("saving the template folder answered HTTP {$response->getStatusCode()}:\n" . substr((string)$response->getBody(), 0, 500));
		}
	}

	/** @Then /^"([^"]*)" is offered "([^"]*)" as a shared template$/ */
	public function isOfferedAsASharedTemplate(string $user, string $name): void {
		foreach ($this->offeredBy($user) as $file) {
			if ($file['source'] === 'shared' && basename($file['path']) === $name && $file['text'] === self::TEMPLATE_TEXT) {
				return;
			}
		}
		throw new \RuntimeException("{$user} was not offered {$name} as a shared template; offered: " . json_encode(array_column($this->offered, 'path')));
	}

	/** @Then /^"([^"]*)" is not offered "([^"]*)"$/ */
	public function isNotOffered(string $user, string $name): void {
		foreach ($this->offeredBy($user) as $file) {
			if (basename($file['path']) === $name) {
				throw new \RuntimeException("{$user} was offered {$name} ({$file['source']} {$file['path']})");
			}
		}
	}

	/** @Then /^the admin's files hold a folder "([^"]*)"$/ */
	public function theAdminsFilesHoldAFolder(string $path): void {
		if (!$this->davExists($path)) {
			throw new \RuntimeException("{$path} is not in the admin's files");
		}
	}

	/** @AfterScenario */
	public function removeWhatTheTemplateStepsMade(): void {
		foreach (array_keys($this->templateUsers) as $user) {
			$this->removeUser($user);
		}
		foreach (array_reverse($this->templatePaths) as $path) {
			$this->davDelete($path);
		}
		if ($this->templateUsers !== [] || $this->templatePaths !== []) {
			$this->appConfigDelete('template_folder');
		}
		$this->templateUsers = [];
		$this->templatePaths = [];
		$this->offeredTo = '';
		$this->offered = [];
	}

	/** The template folder at its default, in the admin's files (the CI admin is the `admin` group's one member). */
	private function useTheDefaultTemplateFolder(): void {
		$this->appConfigDelete('template_folder');
		$this->appConfigDelete('template_actor');
		$this->davEnsureFolder('Templates');
	}

	/** @return list<array{source: string, path: string, text: string}> */
	private function offeredBy(string $user): array {
		if ($this->offeredTo !== $user) {
			throw new \RuntimeException("{$user} has not asked for the templates in this scenario");
		}
		return $this->offered;
	}

	/** A user of this scenario, made the first time it is named; its password. */
	private function templateUser(string $user): string {
		if (!isset($this->templateUsers[$user])) {
			// Left behind by a run that died before its cleanup.
			$this->removeUser($user);
			$password = 'Pu-' . bin2hex(random_bytes(12));
			$this->ocsAs($this->adminUser, $this->adminPass, 'POST', 'cloud/users', ['userid' => $user, 'password' => $password]);
			$this->templateUsers[$user] = $password;
		}
		return $this->templateUsers[$user];
	}

	private function davAs(string $user): Client {
		return new Client([
			'base_uri' => $this->baseUrl . '/remote.php/dav/files/' . rawurlencode($user) . '/',
			'auth' => [$user, $this->templateUser($user)],
			'http_errors' => false,
		]);
	}
}
