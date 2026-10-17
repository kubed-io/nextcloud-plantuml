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
 * `diagram` is a name or a number counted from 1; `index` is the 0-based place
 * among the file's diagrams, and wins when both are given.
 *
 * @param {string} path
 * @param {{diagram?: number|string, index?: number}} [which]
 * @return {string}
 */
export function renderUrl(path, { diagram, index } = {}) {
  let url = OC.generateUrl(`/apps/${APP_ID}/render`) + '?path=' + encodeURIComponent(path)
  if (diagram !== undefined) url += `&diagram=${encodeURIComponent(diagram)}`
  if (index !== undefined) url += `&index=${index}`
  return url
}

/**
 * The editor bundle, which files.js adds to the page the first time it is needed.
 * `query` is the `?v=…` Nextcloud put on the Files bundle: without it the server
 * caches the file for months and an upgrade never reaches the browser. `hash` is
 * the editor build's own, since `v` changes only with the app version. `retry`
 * counts the failed loads before this one: the bundle is a module, and the
 * browser never fetches or runs a module URL a second time in one page.
 *
 * @param {string} [query]
 * @param {string} [hash]
 * @param {number} [retry]
 * @return {string}
 */
export function editorBundleUrl(query = '', hash = '', retry = 0) {
  let url = generateFilePath(APP_ID, 'dist', `${APP_ID}-editor.js`) + query
  const add = (param) => { url += `${url.includes('?') ? '&' : '?'}${param}` }
  if (hash) {
    add(`h=${hash}`)
  }
  if (retry) {
    add(`r=${retry}`)
  }
  return url
}
