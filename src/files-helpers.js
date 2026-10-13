/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure helpers for the Files bundle: no DOM, no Nextcloud globals, so they run
 * under vitest in a plain node environment.
 */
export const APP_ID = 'plantuml'

/** The mimetype the app registers for .puml and .plantuml files. */
export const MIMETYPE = 'text/x-plantuml'

/** True when a Files node is a diagram file. */
export function isDiagram(node) {
  return node?.mime === MIMETYPE
}
