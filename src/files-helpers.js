/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure helpers for the Files bundle: no imports and no DOM, so they run under
 * vitest in a plain node environment. The one Nextcloud global, OC, is read at
 * call time by renderUrl() and lent to it by the test.
 */
export const APP_ID = 'plantuml'

/** The mimetype the app registers for .puml and .plantuml files. */
export const MIMETYPE = 'text/x-plantuml'

/** What + New → Diagram writes: an empty diagram, ready to write in. */
export const NEW_DIAGRAM_CONTENT = '@startuml\n\n@enduml\n'

/** True when a Files node is a diagram file. */
export function isDiagram(node) {
  return node?.mime === MIMETYPE
}

/**
 * The render route for a diagram file, by its path in the user's folder.
 *
 * @param {string} path
 * @return {string}
 */
export function renderUrl(path) {
  return OC.generateUrl(`/apps/${APP_ID}/render`) + '?path=' + encodeURIComponent(path)
}
