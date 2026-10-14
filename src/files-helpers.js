/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure helpers for the Files bundle: no DOM, so they run under vitest in a
 * plain node environment. The Nextcloud globals, OC and the app web roots, are
 * read at call time and lent by the test.
 */
import { generateFilePath } from '@nextcloud/router'

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
 * "Open with text editor": one node, a diagram, in the user's files. The trash
 * and other non-files roots are left out, as the Viewer's own "View" does.
 */
export function canOpenAsText(nodes) {
  const node = nodes?.length === 1 ? nodes[0] : null
  return Boolean(node?.isDavResource && node.root?.startsWith('/files') && isDiagram(node))
}

/** "Edit diagram": as above, and a server to draw the right pane. */
export function canEditDiagram(nodes, serverConfigured) {
  return serverConfigured === true && canOpenAsText(nodes)
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

/**
 * The editor bundle, which files.js adds to the page the first time it is needed.
 * `query` is the `?v=…` Nextcloud put on the Files bundle: without it the server
 * caches the file for months and an upgrade never reaches the browser.
 *
 * @param {string} [query]
 * @return {string}
 */
export function editorBundleUrl(query = '') {
  return generateFilePath(APP_ID, 'dist', `${APP_ID}-editor.js`) + query
}
