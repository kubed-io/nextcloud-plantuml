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
		// JSON {source, index?, path?, overrides?: {path as written: text}}
		['name' => 'render#bySource', 'url' => '/render', 'verb' => 'POST'],
		// ?path=<path>&format=<svg|png|pdf|eps|txt>[&index[]=<0-based>…][&diagram[]=<n or name>…], a download
		['name' => 'export#export', 'url' => '/export', 'verb' => 'GET'],
		// {"themes": [...]}, for the editor's `!theme` completion
		['name' => 'render#themes', 'url' => '/themes', 'verb' => 'GET'],
		// {"icons": [...]} and {"emoji": [...]}, for `<&icon>` and `<:emoji:>`
		['name' => 'render#icons', 'url' => '/icons', 'verb' => 'GET'],
		['name' => 'render#emoji', 'url' => '/emoji', 'verb' => 'GET'],
		// {"colors": {"AliceBlue": "#F0F8FF", ...}}, for named colours' completion and swatches
		['name' => 'render#colors', 'url' => '/colors', 'verb' => 'GET'],
		// {"diagrams", "types", "keywords"}, for the editor's line-start completion
		['name' => 'render#keywords', 'url' => '/keywords', 'verb' => 'GET'],
		// {"fonts": [...]}, for <font:…> and font= completion
		['name' => 'render#fonts', 'url' => '/fonts', 'verb' => 'GET'],
		// {"stdlib": [{name, version, source}]}, for !include <…> completion
		['name' => 'render#stdlib', 'url' => '/stdlib', 'verb' => 'GET'],
	],
];
