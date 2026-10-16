<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Service;

use OCP\Files\ConnectionLostException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\ForbiddenException;
use OCP\Files\GenericFileException;
use OCP\Files\InvalidPathException;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Files\StorageInvalidException;
use OCP\Files\StorageNotAvailableException;
use OCP\Lock\LockedException;

/**
 * Reads the files a diagram names beside it into its source, as PlantUML
 * would, because the PlantUML server cannot see the user's files.
 *
 * Every path is worked out here, from the user's root, before any file is
 * asked for, so a path that climbs above the root is never asked for at all.
 * `<…>` (the stdlib) and `scheme://` paths go to the server as written. Past a
 * limit, on a cycle, or for a file that cannot be found or read, the line is
 * sent as written and becomes a mistake on the diagram's own line. A storage
 * that refuses (offline, forbidden, locked) makes a file unreadable, never an
 * error of the route.
 *
 * @psalm-type Context = array{dir: list<string>|null, zip: int|null, zipDir: list<string>}
 * @psalm-type At = array{text: string, inner: int, top: int, display: string|null}
 * @psalm-type Found = array{id: string, display: string, context: Context, file: File|null, zip: int|null, entry: int}
 */
final class IncludeResolver {
	private const MAX_DEPTH = 8;
	private const MAX_FILES = 64;
	private const MAX_BYTES = 1048576;
	/** A library zip on disk, and all of them together; their entries still count toward MAX_BYTES. */
	private const MAX_LIBRARY_BYTES = 8388608;
	private const MAX_LIBRARIES_BYTES = 16777216;
	/** Far below the 4000 bytes past which Nextcloud throws InvalidPathException. */
	private const MAX_PATH = 1024;
	private const MAX_SHOWN = 100;

	private const DIRECTIVE = '/^\s*!(include|include_many|include_once|includesub|import)\s+(\S.*?)\s*$/';
	private const STYLE = '/^\s*<style\s+[\w-]+\s*=\s*(?:"([^"]*)"|([^\s">]+))\s*>\s*$/i';

	private ?Folder $root = null;
	/** @var list<string>|null the diagram's folder from the user's root; null when it is outside it */
	private ?array $baseDir = null;
	/** @var list<string> */
	private array $sent = [];
	/** @var list<int> */
	private array $lineMap = [];
	/** @var list<array{line: int, path: string, inner: int|null}> */
	private array $origins = [];
	/** @var list<array{line: int, message: string}> */
	private array $mistakes = [];
	/** @var array<string, string> file id => ETag, of every file found, in include order */
	private array $etags = [];
	/** @var list<string> */
	private array $missing = [];
	/** @var array<string, true> file id and block => taken */
	private array $taken = [];
	/** @var list<string> ids of the files being read in, outermost first */
	private array $stack = [];
	/** @var array<string, string> */
	private array $contents = [];
	/** @var list<array{zip: \ZipArchive, tmp: string, id: string, display: string, dir: list<string>|null}> */
	private array $imports = [];
	private int $files = 0;
	private int $bytes = 0;
	private int $libraryBytes = 0;

	/**
	 * @param File|null $self the diagram's own file, so including it is a cycle from the start
	 */
	public function expand(string $source, Folder $base, Folder $root, ?File $self = null): Expanded {
		$run = new self();
		$run->root = $root;
		$rootPath = rtrim($root->getPath(), '/');
		$run->baseDir = self::under($rootPath, $base->getPath());
		$own = $self === null ? null : self::under($rootPath, $self->getPath());
		if ($own !== null && $own !== []) {
			$run->stack[] = 'files:' . implode('/', $own);
		}
		try {
			$run->walk(explode("\n", $source), ['dir' => $run->baseDir, 'zip' => null, 'zipDir' => []], 0, null, null);
		} finally {
			foreach ($run->imports as $import) {
				$import['zip']->close();
				@unlink($import['tmp']);
			}
		}
		return new Expanded(implode("\n", $run->sent), $run->lineMap, $run->origins, $run->mistakes, array_values($run->etags), $run->missing);
	}

	/**
	 * @param array<int, string> $lines a file's lines, keyed by their line in it
	 * @param Context $context
	 * @param int|null $top the diagram's include line, null for the diagram's own lines
	 * @param string|null $display the file the lines are in, null for the diagram
	 */
	private function walk(array $lines, array $context, int $depth, ?int $top, ?string $display): void {
		foreach ($lines as $i => $line) {
			$at = ['text' => $line, 'inner' => $i, 'top' => $top ?? $i, 'display' => $display];
			if (preg_match(self::DIRECTIVE, $line, $m) === 1) {
				$this->directive($m[1], $m[2], $at, $context, $depth);
			} elseif (preg_match(self::STYLE, $line, $m) === 1) {
				$this->style(($m[2] ?? '') !== '' ? $m[2] : $m[1], $at, $context, $depth);
			} else {
				$this->emit($line, $at['top'], $display, $i);
			}
		}
	}

	/**
	 * @param At $at
	 * @param Context $context
	 */
	private function directive(string $kind, string $argument, array $at, array $context, int $depth): void {
		// The selector follows the closing quote, so a `!` inside the quotes is part of the name.
		$rest = '';
		if (preg_match('/^"([^"]*)"(.*)$/', $argument, $m) === 1) {
			$path = $m[1];
			$rest = trim($m[2]);
			$selector = str_starts_with($rest, '!') && strlen($rest) > 1 ? substr($rest, 1) : null;
		} else {
			$bang = strpos($argument, '!');
			$path = $bang === false ? $argument : substr($argument, 0, $bang);
			$selector = $bang === false || $bang === strlen($argument) - 1 ? null : substr($argument, $bang + 1);
		}
		if (self::leftToServer($path) || ($selector !== null && strpbrk($selector, '$%') !== false)) {
			$this->keep($at, null);
			return;
		}
		// No file is named `a.puml junk`, so nothing is asked for.
		if ($rest !== '' && !str_starts_with($rest, '!')) {
			$this->keep($at, 'Cannot find ' . self::shown("$path $rest"));
			return;
		}
		$shown = self::shown($path);

		if ($kind === 'import') {
			$this->import($path, $at, $context);
			return;
		}
		// Without a `!`, PlantUML reads the whole as a section of this same diagram
		// (`V1.2` included); a path, or a file that is there, is a file missing its
		// section, said plainly.
		if ($kind === 'includesub' && $selector === null) {
			if (!str_contains($path, '/') && !str_contains($path, '.')) {
				$this->keep($at, null);
			} elseif (!str_contains($path, '/') && !is_array($this->find($path, $context, true))) {
				// Missing, so a file of that name made later draws the diagram anew.
				$this->missing[] = $path;
				$this->keep($at, null);
			} else {
				$this->sectionsOf($path, $at, $context, $depth);
			}
			return;
		}
		$found = $this->located($path, $context, true, $at);
		if ($found === null) {
			return;
		}
		$key = $found['id'] . '!' . ($selector ?? '');
		if (in_array($found['id'], $this->stack, true)) {
			$this->keep($at, end($this->stack) === $found['id'] ? "$shown includes itself" : "$shown is included in a cycle");
			return;
		}
		if ($kind === 'include' && isset($this->taken[$key])) {
			return;
		}
		if ($kind === 'include_once' && isset($this->taken[$key])) {
			$this->keep($at, "$shown is already included");
			return;
		}
		$content = $this->read($found, $shown, $at, $depth);
		if ($content === null) {
			return;
		}
		$lines = self::lines($content);
		$named = false;
		$picked = $kind === 'includesub' ? self::sub($lines, $selector) : self::block($lines, $selector, $named);
		if ($picked === null) {
			// PlantUML takes a block by index or id= only; a name it does not take is said so.
			$this->keep($at, $named
				? "$shown has no block with id=" . self::shown((string)$selector) . ': write @startuml(id=' . self::shown((string)$selector) . ') to include it by name'
				: "Cannot find $shown!" . self::shown((string)$selector));
			return;
		}
		$this->take($found);
		$this->taken[$key] = true;
		$this->stack[] = $found['id'];
		$this->walk($picked, $found['context'], $depth + 1, $at['top'], $found['display']);
		array_pop($this->stack);
	}

	/**
	 * A mistake naming the sections `!includesub path` could take, as `path!NAME`.
	 *
	 * @param At $at
	 * @param Context $context
	 */
	private function sectionsOf(string $path, array $at, array $context, int $depth): void {
		$shown = self::shown($path);
		$found = $this->located($path, $context, true, $at);
		$content = $found === null ? null : $this->read($found, $shown, $at, $depth);
		if ($content === null) {
			return;
		}
		$names = [];
		foreach (self::lines($content) as $line) {
			if (preg_match('/^\s*!startsub\s+(\S+)/', $line, $m) === 1) {
				$names[$m[1]] = '!' . $m[1];
			}
		}
		$this->keep($at, $names === []
			? "$shown needs a section name, but it has no !startsub"
			: "$shown needs a section name: add " . implode(' or ', $names));
	}

	/**
	 * @param At $at
	 * @param Context $context
	 */
	private function style(string $path, array $at, array $context, int $depth): void {
		if (self::leftToServer($path)) {
			$this->keep($at, null);
			return;
		}
		$shown = self::shown($path);
		$found = $this->located($path, $context, true, $at);
		if ($found === null) {
			return;
		}
		$content = $this->read($found, $shown, $at, $depth);
		if ($content === null) {
			return;
		}
		$this->take($found);
		$this->emit('<style>', $at['top'], $found['display'], null);
		foreach (self::lines($content) as $i => $line) {
			$this->emit($line, $at['top'], $found['display'], $i);
		}
		$this->emit('</style>', $at['top'], $found['display'], null);
	}

	/**
	 * A library zip whose entries later relative includes find before the folder; its line is not sent.
	 *
	 * @param At $at
	 * @param Context $context
	 */
	private function import(string $path, array $at, array $context): void {
		$shown = self::shown($path);
		$found = $this->located($path, $context, false, $at);
		if ($found === null || $found['file'] === null) {
			return;
		}
		foreach ($this->imports as $import) {
			if ($import['id'] === $found['id']) {
				return;
			}
		}
		if ($this->files >= self::MAX_FILES) {
			$this->keep($at, "$shown is past the limit of " . self::MAX_FILES . ' files');
			return;
		}
		$size = self::fileSize($found['file']);
		if ($size !== null && $size > self::MAX_LIBRARY_BYTES) {
			$this->keep($at, "$shown is past the limit of 8 MB for a library");
			return;
		}
		$remaining = self::MAX_LIBRARIES_BYTES - $this->libraryBytes;
		if ($size !== null && $size > $remaining) {
			$this->keep($at, "$shown is past the limit of 16 MB of libraries in all");
			return;
		}
		$content = $size === null ? null : self::content($found['file'], min(self::MAX_LIBRARY_BYTES, $remaining));
		if ($content !== null && strlen($content) > self::MAX_LIBRARY_BYTES) {
			$this->keep($at, "$shown is past the limit of 8 MB for a library");
			return;
		}
		if ($content !== null && strlen($content) > $remaining) {
			$this->keep($at, "$shown is past the limit of 16 MB of libraries in all");
			return;
		}
		$zip = self::open($content);
		if ($zip === null) {
			$this->keep($at, "Cannot read $shown");
			return;
		}
		$this->libraryBytes += strlen((string)$content);
		$this->imports[] = ['zip' => $zip[0], 'tmp' => $zip[1], 'id' => $found['id'], 'display' => $found['display'], 'dir' => $found['context']['dir']];
		$this->take($found);
	}

	/**
	 * The file's content once the limits allow it, or null with the line kept as a mistake.
	 *
	 * @param Found $found
	 * @param At $at
	 */
	private function read(array $found, string $path, array $at, int $depth): ?string {
		if ($depth + 1 > self::MAX_DEPTH) {
			$this->keep($at, "$path is more than " . self::MAX_DEPTH . ' levels deep');
			return null;
		}
		if ($this->files >= self::MAX_FILES) {
			$this->keep($at, "$path is past the limit of " . self::MAX_FILES . ' files');
			return null;
		}
		$remaining = self::MAX_BYTES - $this->bytes;
		$content = $this->contents[$found['id']] ?? null;
		$size = $content === null ? $this->size($found) : strlen($content);
		if ($size !== null && $size > $remaining) {
			$this->keep($at, "$path is past the limit of 1 MB in all");
			return null;
		}
		$content ??= $size === null ? null : $this->fetch($found, $remaining);
		if ($content === null) {
			$this->keep($at, "Cannot read $path");
			return null;
		}
		if (strlen($content) > $remaining) {
			$this->keep($at, "$path is past the limit of 1 MB in all");
			return null;
		}
		$this->contents[$found['id']] = $content;
		$this->bytes += strlen($content);
		return $content;
	}

	/** @param Found $found */
	private function take(array $found): void {
		$this->files++;
	}

	/**
	 * What `find()` gives, its ETag noted; a path that leads nowhere is kept
	 * as a mistake, listed as missing, and gives null.
	 *
	 * @param Context $context
	 * @param At $at
	 * @return Found|null
	 */
	private function located(string $path, array $context, bool $zips, array $at): ?array {
		$found = $this->find($path, $context, $zips);
		if (is_array($found)) {
			$this->note($found);
			return $found;
		}
		$this->missing[] = $path;
		$this->keep($at, ($found === false ? 'Cannot read ' : 'Cannot find ') . self::shown($path));
		return null;
	}

	/**
	 * Every file found counts toward the ETag, read or not: one past a limit
	 * or without the block asked for can change into one that is read.
	 *
	 * @param Found $found
	 */
	private function note(array $found): void {
		if ($found['file'] === null || isset($this->etags[$found['id']])) {
			return;
		}
		try {
			$this->etags[$found['id']] = $found['file']->getEtag();
		} catch (InvalidPathException|NotFoundException|StorageNotAvailableException|StorageInvalidException|ForbiddenException) {
			$this->etags[$found['id']] = '';
		}
	}

	/**
	 * Where a path leads: inside the zip the line is in, then each imported
	 * zip, then the user's files. False when the storage refuses to say.
	 *
	 * @param Context $context
	 * @return Found|null|false
	 */
	private function find(string $path, array $context, bool $zips): array|null|false {
		// Nextcloud reads `\` as `/`, so it is worked out here too, before any file is asked for.
		$path = str_replace('\\', '/', $path);
		if (preg_match('/[\x00-\x1f]/', $path) === 1) {
			return null;
		}
		$relative = !str_starts_with($path, '/');
		if ($zips && $relative) {
			if ($context['zip'] !== null) {
				$found = $this->inZip($context['zip'], $context['zipDir'], $path);
				if ($found !== null) {
					return $found;
				}
			}
			foreach (array_keys($this->imports) as $n) {
				$found = $this->inZip($n, [], $path);
				if ($found !== null) {
					return $found;
				}
			}
		}
		if ($this->root === null || ($relative && $context['dir'] === null)) {
			return null;
		}
		$segments = self::resolve($relative ? $context['dir'] : [], $path);
		if ($segments === null || $segments === [] || strlen(implode('/', $segments)) > self::MAX_PATH) {
			return null;
		}
		try {
			$node = $this->root->get(implode('/', $segments));
		} catch (NotFoundException|NotPermittedException|InvalidPathException) {
			return null;
		} catch (StorageNotAvailableException|StorageInvalidException|ForbiddenException|LockedException) {
			return false;
		}
		if (!$node instanceof File) {
			return null;
		}
		return [
			'id' => 'files:' . implode('/', $segments),
			'display' => $this->display($segments),
			'context' => ['dir' => array_slice($segments, 0, -1), 'zip' => null, 'zipDir' => []],
			'file' => $node,
			'zip' => null,
			'entry' => 0,
		];
	}

	/**
	 * @param list<string> $dir
	 * @return Found|null
	 */
	private function inZip(int $n, array $dir, string $path): ?array {
		$segments = self::resolve($dir, $path);
		if ($segments === null || $segments === []) {
			return null;
		}
		$name = implode('/', $segments);
		$entry = $this->imports[$n]['zip']->locateName($name);
		if ($entry === false) {
			return null;
		}
		return [
			'id' => $this->imports[$n]['id'] . '!' . $name,
			'display' => $this->imports[$n]['display'] . '/' . $name,
			'context' => ['dir' => $this->imports[$n]['dir'], 'zip' => $n, 'zipDir' => array_slice($segments, 0, -1)],
			'file' => null,
			'zip' => $n,
			'entry' => $entry,
		];
	}

	/** @param Found $found */
	private function size(array $found): ?int {
		if ($found['file'] !== null) {
			return self::fileSize($found['file']);
		}
		$stat = $this->imports[(int)$found['zip']]['zip']->statIndex($found['entry']);
		return $stat === false ? null : (int)$stat['size'];
	}

	/**
	 * At most one byte past `$limit`, whatever size the file claims, so a
	 * longer one shows as past the limit without being read whole.
	 *
	 * @param Found $found
	 */
	private function fetch(array $found, int $limit): ?string {
		if ($found['file'] !== null) {
			return self::content($found['file'], $limit);
		}
		$content = $this->imports[(int)$found['zip']]['zip']->getFromIndex($found['entry'], $limit + 1);
		return $content === false ? null : $content;
	}

	/**
	 * The path from the diagram's folder, so a mistake names the file as the diagram would.
	 *
	 * @param list<string> $segments
	 */
	private function display(array $segments): string {
		if ($this->baseDir === null) {
			return '/' . implode('/', $segments);
		}
		$common = 0;
		while ($common < count($this->baseDir) && $common < count($segments) - 1 && $this->baseDir[$common] === $segments[$common]) {
			$common++;
		}
		return str_repeat('../', count($this->baseDir) - $common) . implode('/', array_slice($segments, $common));
	}

	private function emit(string $text, int $top, ?string $display, ?int $inner): void {
		if ($display !== null) {
			$this->origins[] = ['line' => count($this->sent), 'path' => $display, 'inner' => $inner];
		}
		$this->sent[] = $text;
		$this->lineMap[] = $top;
	}

	/**
	 * Sends the line as written and, with a message, makes it a mistake.
	 *
	 * @param At $at
	 */
	private function keep(array $at, ?string $message): void {
		$this->emit($at['text'], $at['top'], $at['display'], $at['inner']);
		if ($message !== null) {
			$this->mistakes[] = [
				'line' => $at['top'],
				'message' => $at['display'] === null ? $message : sprintf('In %s, line %d: %s', $at['display'], $at['inner'] + 1, $message),
			];
		}
	}

	/**
	 * The folder below the user's root, as segments.
	 *
	 * @return list<string>|null
	 */
	private static function under(string $root, string $path): ?array {
		$path = rtrim($path, '/');
		if ($path === $root) {
			return [];
		}
		if (!str_starts_with($path, $root . '/')) {
			return null;
		}
		return array_values(array_filter(explode('/', substr($path, strlen($root) + 1)), static fn (string $s): bool => $s !== ''));
	}

	/**
	 * `.` and `..` collapsed against a folder; null for a path that climbs above the top.
	 *
	 * @param list<string> $dir
	 * @return list<string>|null
	 */
	private static function resolve(array $dir, string $path): ?array {
		$segments = $dir;
		foreach (explode('/', $path) as $segment) {
			if ($segment === '' || $segment === '.') {
				continue;
			}
			if ($segment === '..') {
				if ($segments === []) {
					return null;
				}
				array_pop($segments);
				continue;
			}
			$segments[] = $segment;
		}
		return $segments;
	}

	/** The stdlib, a URL, or an expression (`$var`, `%function()%`) only PlantUML can work out. */
	private static function leftToServer(string $path): bool {
		return $path === '' || strpbrk($path, '$%') !== false || str_starts_with($path, '<') || preg_match('~^[a-z][a-z0-9+.-]*://~i', $path) === 1;
	}

	/** A path as a mistake shows it: no control characters, and cut short when long. */
	private static function shown(string $path): string {
		$path = (string)preg_replace('/[\x00-\x1f]/', '?', $path);
		return mb_strlen($path) > self::MAX_SHOWN ? mb_substr($path, 0, self::MAX_SHOWN) . '…' : $path;
	}

	/** @return array<int, string> */
	private static function lines(string $content): array {
		if (str_starts_with($content, "\u{FEFF}")) {
			$content = substr($content, 3);
		}
		if ($content === '') {
			return [];
		}
		$lines = explode("\n", $content);
		if (end($lines) === '') {
			array_pop($lines);
		}
		return array_map(static fn (string $line): string => rtrim($line, "\r"), $lines);
	}

	/**
	 * The lines inside the first `@start…` block, or the one picked by index
	 * (from 0) or by the id of `@start…(id=NAME)`; every line when the file has
	 * no block. A `@start…` inside a block left open ends it and starts the next,
	 * as the editor's tabs count them. A name written after `@start…` is no
	 * selector, the way PlantUML takes it: `$named` says that a block carries the
	 * selector as its name.
	 *
	 * @param array<int, string> $lines
	 * @return array<int, string>|null
	 */
	private static function block(array $lines, ?string $selector, bool &$named = false): ?array {
		/** @var list<array{id: string, name: string, lines: array<int, string>}> $blocks */
		$blocks = [];
		$current = null;
		$id = '';
		$name = '';
		foreach ($lines as $i => $line) {
			if (preg_match('/^\s*@start\w+(.*)$/', $line, $m) === 1) {
				if ($current !== null) {
					$blocks[] = ['id' => $id, 'name' => $name, 'lines' => $current];
				}
				$current = [];
				$rest = $m[1];
				$id = '';
				if (preg_match('/^\(([^)]*)\)/', $rest, $call) === 1) {
					$id = preg_match('/^\s*id\s*=\s*(.*?)\s*$/', $call[1], $argument) === 1 ? $argument[1] : '';
					$rest = substr($rest, strlen($call[0]));
				}
				// The name as the editor reads it: what is left of spaces, quotes and braces around it.
				$name = preg_match('/^[\s{][\s"“”]*([^"“”]*?)[\s}"“”]*$/u', $rest, $text) === 1 && $text[1] !== '' ? $text[1] : $id;
				continue;
			}
			if ($current === null) {
				continue;
			}
			if (preg_match('/^\s*@end\w*/', $line) === 1) {
				$blocks[] = ['id' => $id, 'name' => $name, 'lines' => $current];
				$current = null;
				continue;
			}
			$current[$i] = $line;
		}
		if ($current !== null) {
			$blocks[] = ['id' => $id, 'name' => $name, 'lines' => $current];
		}
		if ($blocks === []) {
			return $selector === null ? $lines : null;
		}
		if ($selector === null) {
			return $blocks[0]['lines'];
		}
		if (ctype_digit($selector)) {
			return $blocks[(int)$selector]['lines'] ?? null;
		}
		foreach ($blocks as $block) {
			if ($block['id'] !== '' && $block['id'] === $selector) {
				return $block['lines'];
			}
		}
		foreach ($blocks as $block) {
			$named = $named || $block['name'] === $selector;
		}
		return null;
	}

	/**
	 * The lines of every `!startsub NAME` … `!endsub` section.
	 *
	 * @param array<int, string> $lines
	 * @return array<int, string>|null
	 */
	private static function sub(array $lines, string $name): ?array {
		$picked = [];
		$open = [];
		$found = false;
		foreach ($lines as $i => $line) {
			if (preg_match('/^\s*!startsub\s+(\S+)/', $line, $m) === 1) {
				$open[] = $m[1];
				$found = $found || $m[1] === $name;
			} elseif (preg_match('/^\s*!endsub\b/', $line) === 1) {
				array_pop($open);
			} elseif (in_array($name, $open, true)) {
				$picked[$i] = $line;
			}
		}
		return $found ? $picked : null;
	}

	private static function fileSize(File $file): ?int {
		try {
			return (int)$file->getSize();
		} catch (InvalidPathException|NotFoundException|StorageNotAvailableException|StorageInvalidException|ForbiddenException) {
			return null;
		}
	}

	/**
	 * At most `$limit` + 1 bytes, read through a stream: a stored size can be
	 * wrong. Null when there is no stream, rather than a read of any size.
	 */
	private static function content(File $file, int $limit): ?string {
		try {
			$handle = $file->fopen('r');
			if (!is_resource($handle)) {
				return null;
			}
			try {
				$content = stream_get_contents($handle, $limit + 1);
			} finally {
				fclose($handle);
			}
			return $content === false ? null : $content;
		} catch (NotPermittedException|GenericFileException|LockedException|NotFoundException|InvalidPathException|StorageNotAvailableException|StorageInvalidException|ForbiddenException|ConnectionLostException) {
			return null;
		}
	}

	/**
	 * ZipArchive reads only from a path, so the zip goes to a temporary file
	 * that is removed when the expansion ends.
	 *
	 * @return array{0: \ZipArchive, 1: string}|null
	 */
	private static function open(?string $content): ?array {
		if ($content === null || $content === '') {
			return null;
		}
		$tmp = tempnam(sys_get_temp_dir(), 'plantuml-');
		if ($tmp === false) {
			return null;
		}
		$zip = new \ZipArchive();
		if (file_put_contents($tmp, $content) === false || $zip->open($tmp, \ZipArchive::RDONLY) !== true) {
			@unlink($tmp);
			return null;
		}
		return [$zip, $tmp];
	}
}
