<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

return [
	'routes' => [
		['name' => 'config#testConnection', 'url' => '/test-connection', 'verb' => 'POST'],
		// ?path=<path in the caller's folder>
		['name' => 'render#byPath', 'url' => '/render', 'verb' => 'GET'],
		// JSON {source}
		['name' => 'render#bySource', 'url' => '/render', 'verb' => 'POST'],
		// {"themes": [...]}, for the editor's `!theme` completion
		['name' => 'render#themes', 'url' => '/themes', 'verb' => 'GET'],
	],
];
