/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reading and writing a diagram over WebDAV, with the ETag as the conflict
 * check: a save carries `If-Match` with the ETag the content was read with, so
 * a file someone else changed meanwhile answers 412 and is left as they left it.
 * Paths are in the user's folder, as a Files node's `path` is.
 */
import { getClient, getRootPath } from '@nextcloud/files/dav'

/** The file changed on the server since it was read. */
export class ConflictError extends Error {
  constructor() {
    super('Someone else changed this file')
    this.name = 'ConflictError'
  }
}

/**
 * @param {string} path
 * @return {Promise<{content: string, etag: string}>}
 */
export async function loadFile(path) {
  const res = await getClient().getFileContents(getRootPath() + path, { format: 'text', details: true })
  return { content: res.data, etag: res.headers.etag }
}

/**
 * @param {string} path
 * @param {string} content
 * @param {string} etag the ETag `content` was based on
 * @return {Promise<string>} the file's new ETag
 */
export async function saveFile(path, content, etag) {
  // putFileContents() answers only `true`; the new ETag is in the PUT's headers.
  try {
    const res = await getClient().customRequest(getRootPath() + path, {
      method: 'PUT',
      headers: { 'If-Match': etag },
      data: content,
    })
    return res.headers.get('ETag')
  } catch (e) {
    throw e?.status === 412 ? new ConflictError() : e
  }
}
