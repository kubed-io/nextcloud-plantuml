<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Controller;

use OCA\PlantUml\Exception\FileRefusal;
use OCA\PlantUml\Exception\RenderException;
use OCA\PlantUml\Service\DiagramFiles;
use OCA\PlantUml\Service\Diagrams;
use OCA\PlantUml\Service\IncludeResolver;
use OCA\PlantUml\Service\Rendered;
use OCA\PlantUml\Service\RenderService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\EmptyContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;
use OCP\ITempManager;

/**
 * GET /export (VW6): the diagrams of a stored `.puml` in one format, one as its
 * file, several as a zip. Read as GET /render reads the file, so it refuses
 * what that refuses, and a file whose share forbids download as well: an
 * export is a download.
 *
 * @psalm-import-type Diagram from Diagrams
 */
final class ExportController extends Controller {
	public const MAX_DIAGRAMS = 100;
	public const MAX_BYTES = 52428800;
	/** Characters of a diagram's label kept in a name: headers stay small, and zip entries short. */
	public const MAX_LABEL = 150;
	/** Bytes of a name before its extension: of the 255 a file system allows, room for ` (n)` and `.svg`. */
	public const MAX_STEM = 200;

	public function __construct(
		string $appName,
		IRequest $request,
		private RenderService $render,
		private DiagramFiles $files,
		private ITempManager $temp,
	) {
		parent::__construct($appName, $request);
	}

	/**
	 * A download link changes nothing, so no CSRF token; the path rule keeps it
	 * safe, as for GET /render.
	 *
	 * The diagrams are asked for by `index[]` (0-based places, what the Viewer
	 * sends), which decides when it comes, or by `diagram[]` (a name, else a
	 * number counted from 1); none asked is every diagram PlantUML draws an
	 * image for. Each is drawn once, in file order, and named by its diagram
	 * whichever way it was asked for. One asked for that has no image (a block
	 * left open after the last closed one) is a 404 naming it: the server's 400
	 * for it would read as no PlantUML server.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function export(string $path = '', string $format = '', mixed $diagram = null, mixed $index = null): Response {
		$asked = match (true) {
			$diagram === null, $diagram === '' => [],
			is_string($diagram) => [$diagram],
			is_array($diagram) && array_is_list($diagram) && array_filter($diagram, 'is_string') === $diagram => $diagram,
			default => null,
		};
		$places = self::places($index);
		if (!isset(RenderService::FORMATS[$format]) || $asked === null || $places === null) {
			return new Response(Http::STATUS_BAD_REQUEST);
		}
		try {
			$file = $this->files->open($path);
		} catch (FileRefusal $e) {
			return $e->response;
		}
		if (IncludeResolver::forbidsDownload($file->file)) {
			return new Response(Http::STATUS_NOT_FOUND);
		}
		$all = Diagrams::scan($file->text);
		/** @var array<int, Diagram> $picked */
		$picked = [];
		if ($places !== []) {
			foreach ($places as $place) {
				if (!isset($all[$place])) {
					return new JSONResponse(['problem' => Diagrams::missing((string)($place + 1))], Http::STATUS_NOT_FOUND);
				}
				$picked[$place] = $all[$place];
			}
		} elseif ($asked !== []) {
			foreach ($asked as $one) {
				$found = Diagrams::find($all, $one);
				if ($found === null) {
					return new JSONResponse(['problem' => Diagrams::missing($one)], Http::STATUS_NOT_FOUND);
				}
				$picked[$found['index']] = $found;
			}
		} else {
			$picked = array_filter($all, static fn (array $d): bool => $d['drawn']);
			if ($picked === []) {
				return new JSONResponse(['problem' => 'no diagram has an image'], Http::STATUS_NOT_FOUND);
			}
		}
		foreach ($picked as $d) {
			if (!$d['drawn']) {
				return new JSONResponse(['problem' => Diagrams::noImage($d)], Http::STATUS_NOT_FOUND);
			}
		}
		ksort($picked);
		if (count($picked) > self::MAX_DIAGRAMS) {
			return self::tooLarge();
		}
		$source = $file->expanded?->source ?? $file->text;
		$drawn = [];
		$bytes = 0;
		try {
			foreach ($picked as $d) {
				// A mistake in the diagram comes drawn in, in the format asked: that is the file.
				$rendered = $this->render->render($source, $d['render'], $format);
				$bytes += strlen($rendered->body);
				if ($bytes > self::MAX_BYTES) {
					return self::tooLarge();
				}
				$drawn[] = [$d, $rendered];
			}
		} catch (RenderException $e) {
			return new JSONResponse(['problem' => $e->getProblem()], Http::STATUS_SERVICE_UNAVAILABLE);
		}
		$base = (string)preg_replace('/\.(?:puml|plantuml)$/i', '', $file->file->getName());
		if (count($drawn) === 1) {
			[$d, $rendered] = $drawn[0];
			$name = count($all) === 1 ? self::stem($base) . ".{$format}" : self::entry($base, $d, $format);
			return self::download($rendered->body, $name, RenderService::FORMATS[$format]);
		}
		return $this->zip($drawn, $base, $format);
	}

	/**
	 * The places asked for, each an integer 0–999 as POST /render takes it;
	 * none when none came, null when one is not a place.
	 *
	 * @return list<int>|null
	 */
	private static function places(mixed $index): ?array {
		if ($index === null) {
			return [];
		}
		$given = is_array($index) ? $index : [$index];
		if (!array_is_list($given)) {
			return null;
		}
		$places = [];
		foreach ($given as $one) {
			if (is_string($one) && preg_match('/^\d{1,3}$/', $one) === 1) {
				$one = (int)$one;
			}
			if (!is_int($one) || $one < 0 || $one > 999) {
				return null;
			}
			$places[] = $one;
		}
		return $places;
	}

	/** @param list<array{Diagram, Rendered}> $drawn */
	private function zip(array $drawn, string $base, string $format): Response {
		// Not core's ZipResponse: its streamer sends macOS a tar, and the export promises a zip.
		$path = $this->temp->getTemporaryFile('.zip');
		$zip = new \ZipArchive();
		if ($path === false || $zip->open($path, \ZipArchive::OVERWRITE) !== true) {
			return new Response(Http::STATUS_INTERNAL_SERVER_ERROR);
		}
		$used = [];
		foreach ($drawn as [$d, $rendered]) {
			$zip->addFromString(self::unique(self::entry($base, $d, $format), $used), $rendered->body);
		}
		if (!$zip->close()) {
			return new Response(Http::STATUS_INTERNAL_SERVER_ERROR);
		}
		// ITempManager removes the file at the end of the request.
		return self::download((string)file_get_contents($path), self::stem($base) . '.zip', 'application/zip');
	}

	/** @param Diagram $diagram */
	private static function entry(string $base, array $diagram, string $format): string {
		return self::stem($base . ' - ' . mb_substr(Diagrams::label($diagram), 0, self::MAX_LABEL)) . ".{$format}";
	}

	/** `safe()`, cut at MAX_STEM bytes on a character's edge, and trimmed again after the cut. */
	private static function stem(string $name): string {
		$cut = rtrim(mb_strcut(self::safe($name), 0, self::MAX_STEM, 'UTF-8'), ' -');
		return $cut !== '' ? $cut : 'diagram';
	}

	/**
	 * Each run of unsafe characters, with the spaces around it, becomes ` - `: `Login / Sign-up` is
	 * `Login - Sign-up`. Unsafe: what a file system or a header refuses, and the invisible ones (C0
	 * and C1 controls, and `\p{Cf}` such as a bidi override, which shows a name backwards). The joiners U+200C and U+200D stay: Persian and Indic words and emoji sequences are written with them.
	 */
	private static function safe(string $name): string {
		$name = trim((string)preg_replace(['/\s*(?:[\/\\\\:*?"<>|\p{Cc}]|[^\P{Cf}\x{200C}\x{200D}])+\s*/u', '/ {2,}/'], [' - ', ' '], $name), ' -');
		return $name !== '' ? $name : 'diagram';
	}

	/**
	 * A name the zip already holds gets ` (2)`, ` (3)` before its extension.
	 *
	 * @param array<string, true> $used
	 */
	private static function unique(string $name, array &$used): string {
		$dot = (int)strrpos($name, '.');
		$stem = substr($name, 0, $dot);
		$extension = substr($name, $dot);
		$candidate = $name;
		for ($n = 2; isset($used[$candidate]); $n++) {
			$candidate = "{$stem} ({$n}){$extension}";
		}
		$used[$candidate] = true;
		return $candidate;
	}

	private static function download(string $body, string $name, string $type): Response {
		$response = new DataDisplayResponse($body, Http::STATUS_OK, ['Content-Type' => $type, 'X-Content-Type-Options' => 'nosniff']);
		// One `_` per character past ASCII: `Größe` falls back to `Gr__e`.
		$fallback = (string)preg_replace('/[^\x20-\x7E]/u', '_', $name);
		$response->addHeader('Content-Disposition', "attachment; filename=\"{$fallback}\"; filename*=UTF-8''" . rawurlencode($name));
		// Core's default, set outright, as GET /render sets it: an SVG opened on its own runs no script.
		$response->setContentSecurityPolicy(new EmptyContentSecurityPolicy());
		return $response;
	}

	private static function tooLarge(): JSONResponse {
		return new JSONResponse(['problem' => 'The export is too large'], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
	}
}
