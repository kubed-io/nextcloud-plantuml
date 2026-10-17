/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * An ETag as the server's own code made it, from a response header: the web
 * server's compression adds `-gzip` or `-br` inside the quotes (Apache's
 * mod_deflate and mod_brotli), which If-Match then never matches (412), the
 * PROPFIND's `getetag` never equals and the render route's If-None-Match never
 * meets; a weak `W/` goes too. Pure, for the editor and the Viewer alike.
 */

/**
 * @param {string|null|undefined} etag
 * @return {string|null|undefined} the same when there is none
 */
export function plainEtag(etag) {
  return typeof etag === 'string' ? etag.replace(/^W\//, '').replace(/-(?:gzip|br)"$/, '"') : etag
}
