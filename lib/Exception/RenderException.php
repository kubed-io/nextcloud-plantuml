<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Exception;

/**
 * The server could not render. The problem is one of three, and those three
 * words are the whole error vocabulary of the app: each has a different fix,
 * and every surface names it the same way.
 */
final class RenderException extends \RuntimeException {
	public const PROBLEM_NOT_SET = 'not set';
	public const PROBLEM_UNREACHABLE = 'unreachable';
	public const PROBLEM_NOT_PLANTUML = 'not a PlantUML server';

	/** @param self::PROBLEM_* $problem */
	public function __construct(
		private readonly string $problem,
		?\Throwable $previous = null,
	) {
		parent::__construct($problem, 0, $previous);
	}

	public function getProblem(): string {
		return $this->problem;
	}

	/** The line the health check shows, on the admin card and in occ. */
	public function adminMessage(): string {
		return match ($this->problem) {
			self::PROBLEM_NOT_SET => 'Server URL is not set',
			self::PROBLEM_UNREACHABLE => 'Server is unreachable',
			default => 'Server is not a PlantUML server',
		};
	}
}
