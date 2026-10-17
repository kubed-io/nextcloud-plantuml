<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCA\PlantUml\AppInfo\Application;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\Template\ITemplateManager;
use OCP\IAppConfig;
use OCP\IGroupManager;
use OCP\IUserManager;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

/**
 * What Add diagram can start from (TP1–TP3): the `.puml` files under the
 * admin's template folder, read as the folder's owner (the actor), so every
 * logged-in user gets them without a share; and those in the caller's own
 * Templates folder. Within caps; a file that cannot be read is left out.
 */
final class TemplateLibrary {
	public const KEY_FOLDER = 'template_folder';
	public const KEY_ACTOR = 'template_actor';
	public const DEFAULT_FOLDER = 'Templates';
	public const MAX_FILES = 64;
	public const MAX_BYTES = 1048576;
	/** A6's types, what a template's block may be; tests/js/add-data.test.js keeps it equal to src/editor/add/types.js. */
	public const TYPES = ['uml', 'bpm', 'board', 'chart', 'chen', 'creole', 'dot', 'ditaa', 'ebnf', 'files', 'flow', 'gantt', 'git', 'hcl', 'json', 'latex', 'math', 'mindmap', 'project', 'regex', 'salt', 'sprites', 'wbs', 'wire', 'yaml', 'nwdiag', 'packetdiag'];
	private const ADMIN_GROUP = 'admin';
	private const REFUSED = "Template folder must be a folder in the actor's files";
	private const UNMADE = "Template folder cannot be made in the actor's files";

	public function __construct(
		private readonly IAppConfig $config,
		private readonly IGroupManager $groups,
		private readonly IUserManager $users,
		private readonly IRootFolder $root,
		private readonly ITemplateManager $templates,
		private readonly IUserSession $session,
		private readonly LoggerInterface $logger,
	) {
	}

	public function folder(): string {
		$stored = $this->config->getValueString(Application::APP_ID, self::KEY_FOLDER, '');
		return $stored === '' ? self::DEFAULT_FOLDER : $stored;
	}

	/**
	 * Made in the actor's files at once (`mkdir -p`), as the siblings' ensureFolder.
	 * An empty path resets to the default and never fails the save, whatever the
	 * make of the default folder does (it is logged).
	 *
	 * @throws \InvalidArgumentException for a path that climbs, runs through a file, or cannot be made
	 */
	public function setFolder(string $path): void {
		$path = trim(trim($path), '/');
		if ($path === '') {
			$this->config->deleteKey(Application::APP_ID, self::KEY_FOLDER);
			$this->ensureFolder();
			return;
		}
		$segments = explode('/', $path);
		if (preg_match('/[\x00-\x1f]/', $path) === 1 || array_intersect($segments, ['', '.', '..']) !== [] || str_contains($path, '\\')) {
			throw new \InvalidArgumentException(self::REFUSED);
		}
		$actor = $this->actor();
		if ($actor !== null) {
			try {
				self::mkdirP($this->root->getUserFolder($actor), $segments);
			} catch (\InvalidArgumentException $e) {
				throw $e;
			} catch (\Throwable $e) {
				// NotPermittedException from a read-only mount, a full quota, an outage.
				$this->logger->warning("Template folder {folder} cannot be made in {actor}'s files", ['folder' => $path, 'actor' => $actor, 'exception' => $e]);
				throw new \InvalidArgumentException(self::UNMADE, 0, $e);
			}
		}
		$this->config->setValueString(Application::APP_ID, self::KEY_FOLDER, $path);
	}

	/** `template_actor` while that user exists, else the first member of `admin`. */
	public function actor(): ?string {
		$configured = $this->config->getValueString(Application::APP_ID, self::KEY_ACTOR, '');
		if ($configured !== '') {
			return $this->users->userExists($configured) ? $configured : null;
		}
		foreach ($this->groups->get(self::ADMIN_GROUP)?->getUsers() ?? [] as $user) {
			return $user->getUID();
		}
		return null;
	}

	public function ensureFolder(): ?Folder {
		$actor = $this->actor();
		if ($actor === null) {
			return null;
		}
		try {
			return self::mkdirP($this->root->getUserFolder($actor), explode('/', $this->folder()));
		} catch (\Throwable $e) {
			$this->logger->warning("Template folder {folder} cannot be made in {actor}'s files", ['folder' => $this->folder(), 'actor' => $actor, 'exception' => $e]);
			return null;
		}
	}

	/** Makes the folder again if it has gone (TP2). @return list<array{source: 'shared'|'yours', path: string, text: string}> */
	public function files(): array {
		$budget = ['files' => 0, 'bytes' => 0, 'seen' => []];
		$shared = $this->collect('shared', $this->sharedSource(true), $budget);
		return [...$shared, ...$this->collect('yours', $this->ownSource(), $budget)];
	}

	/** What the shared folder holds, for the admin card; never makes the folder. @return array{actor: ?string, templates: int, files: int} */
	public function summary(): array {
		$budget = ['files' => 0, 'bytes' => 0, 'seen' => []];
		$shared = $this->collect('shared', $this->sharedSource(false), $budget);
		return [
			'actor' => $this->actor(),
			'templates' => array_sum(array_map(static fn (array $file): int => self::blocks($file['text']), $shared)),
			'files' => count($shared),
		];
	}

	/**
	 * The templates the editor cuts from a text (A9), read as B1 reads blocks: a
	 * `@start` line opens one (dropping an unclosed one before it), an `@end`
	 * line closes it, and only a closed block of an A6 type is a template.
	 *
	 * This is its own reader, not Diagrams': it differs from B1 (Diagrams' INDENT
	 * and W, its rejection of a name that keeps a quote, a lone \r as a line break)
	 * at the edges, so the card's N can differ from the modal's count on such files.
	 */
	public static function blocks(string $text): int {
		$count = 0;
		$open = null;
		foreach (preg_split('/\r?\n/', $text) ?: [] as $line) {
			if (preg_match('/^\s*@start(\w+)/', $line, $start) === 1) {
				$open = $start[1];
			} elseif ($open !== null && preg_match('/^\s*@end\w*\s*$/', $line) === 1) {
				$count += in_array($open, self::TYPES, true) ? 1 : 0;
				$open = null;
			}
		}
		return $count;
	}

	/** @return array{0: Folder, 1: Folder}|null the folder to search, and the files its paths are relative to */
	private function sharedSource(bool $make): ?array {
		$actor = $this->actor();
		if ($actor === null) {
			return null;
		}
		$folder = $make ? $this->ensureFolder() : $this->existingFolder($actor);
		return $folder === null ? null : [$folder, $this->root->getUserFolder($actor)];
	}

	private function existingFolder(string $actor): ?Folder {
		try {
			$folder = $this->root->getUserFolder($actor)->get($this->folder());
			return $folder instanceof Folder ? $folder : null;
		} catch (NotFoundException) {
			return null;
		} catch (\Throwable $e) {
			$this->logger->warning("Template folder {folder} cannot be read in {actor}'s files", ['folder' => $this->folder(), 'actor' => $actor, 'exception' => $e]);
			return null;
		}
	}

	/** @return array{0: Folder, 1: Folder}|null */
	private function ownSource(): ?array {
		try {
			$user = $this->session->getUser();
			$path = $this->templates->getTemplatePath();
			if ($user === null || $path === '') {
				return null;
			}
			$home = $this->root->getUserFolder($user->getUID());
			$folder = $home->get(ltrim($path, '/'));
			return $folder instanceof Folder ? [$folder, $home] : null;
		} catch (NotFoundException) {
			return null;
		} catch (\Throwable $e) {
			$this->logger->warning('Your Templates folder cannot be read', ['exception' => $e]);
			return null;
		}
	}

	/**
	 * @param array{0: Folder, 1: Folder}|null $from
	 * @param array{files: int, bytes: int, seen: array<int, true>} $budget across both sources
	 * @return list<array{source: 'shared'|'yours', path: string, text: string}>
	 */
	private function collect(string $source, ?array $from, array &$budget): array {
		if ($from === null) {
			return [];
		}
		[$folder, $home] = $from;
		try {
			$byPath = [];
			foreach ($folder->searchByMime(Application::MIMETYPE) as $node) {
				if ($node instanceof File) {
					$byPath[ltrim((string)$home->getRelativePath($node->getPath()), '/')] = $node;
				}
			}
		} catch (\Throwable $e) {
			$this->logger->warning('Templates in {folder} cannot be listed', ['folder' => $folder->getPath(), 'exception' => $e]);
			return [];
		}
		ksort($byPath, SORT_STRING);
		$list = [];
		foreach ($byPath as $path => $file) {
			if ($budget['files'] >= self::MAX_FILES) {
				break;
			}
			// Every file looked at counts, kept or skipped: the cap bounds the work of a GET.
			$budget['files']++;
			$id = $file->getId();
			if (isset($budget['seen'][$id]) || FileReader::downloadForbidden($file)) {
				continue;
			}
			$room = self::MAX_BYTES - $budget['bytes'];
			$text = FileReader::read($file, $room);
			if ($text === null || strlen($text) > $room || !mb_check_encoding($text, 'UTF-8')) {
				continue;
			}
			$budget['seen'][$id] = true;
			$budget['bytes'] += strlen($text);
			$list[] = ['source' => $source, 'path' => (string)$path, 'text' => $text];
		}
		return $list;
	}

	/** @param list<string> $segments */
	private static function mkdirP(Folder $base, array $segments): Folder {
		$current = $base;
		foreach ($segments as $segment) {
			if (!$current->nodeExists($segment)) {
				$current = $current->newFolder($segment);
				continue;
			}
			$child = $current->get($segment);
			if (!$child instanceof Folder) {
				throw new \InvalidArgumentException(self::REFUSED);
			}
			$current = $child;
		}
		return $current;
	}
}
