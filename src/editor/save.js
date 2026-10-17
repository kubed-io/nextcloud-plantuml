/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reading and writing a diagram over WebDAV, with the ETag as the conflict
 * check: a save carries `If-Match` with the ETag the content was read with, so
 * a file someone else changed meanwhile answers 412 and is left as they left it.
 * Paths are in the user's folder, as a Files node's `path` is.
 */
import { getClient, getDefaultPropfind, getRootPath, resultToNode } from '@nextcloud/files/dav'
import { plainEtag } from './etag.js'
import { once } from './once.js'

const COPY_ATTEMPTS = 9

const listings = new Map()

/** The file changed on the server since it was read. */
export class ConflictError extends Error {
  constructor() {
    super('Someone else changed this file')
    this.name = 'ConflictError'
  }
}

/**
 * @param {string} path
 * @return {Promise<{content: string, etag: string}>} the ETag as Sabre has it (`plainEtag`)
 */
export async function loadFile(path) {
  // Nextcloud sends no Cache-Control with a file, so the browser may answer from
  // its cache for a tenth of the file's age: a changed file read back stale.
  const res = await getClient().getFileContents(getRootPath() + path, {
    format: 'text',
    details: true,
    headers: { 'Cache-Control': 'no-cache' },
  })
  return { content: res.data, etag: plainEtag(res.headers.etag) }
}

const ETAG_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>`

/**
 * The cheap look at whether the file changed: its ETag alone.
 *
 * @param {string} path
 * @return {Promise<string>} the ETag, quoted as loadFile and saveFile have it
 */
export async function currentEtag(path) {
  const stat = await getClient().stat(getRootPath() + path, { data: ETAG_PROPFIND })
  // webdav strips the quotes Sabre sends; the GET and PUT headers keep them.
  if (!stat.etag) {
    throw new Error('The server named no ETag')
  }
  return `"${stat.etag}"`
}

const ACCESS_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:resourcetype/><oc:permissions/><nc:share-attributes/></d:prop></d:propfind>`

/**
 * Whether a share's attributes (`nc:share-attributes`, JSON text as Sabre sends
 * it, or already parsed) forbid download. Unreadable ones forbid nothing: the
 * server stays the authority (FileReader::downloadForbidden).
 *
 * @param {string|Array|undefined} attributes
 * @return {boolean}
 */
export function downloadForbidden(attributes) {
  let list = attributes
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return false
    }
  }
  return Array.isArray(list)
    && list.some((a) => a?.scope === 'permissions' && a?.key === 'download' && a?.value === false)
}

/**
 * Whether the file may be downloaded: false when it is on a share whose owner
 * forbids it. A failed look rejects; the caller decides.
 *
 * @param {string} path
 * @return {Promise<boolean>}
 */
export async function canDownload(path) {
  const { data } = await getClient().stat(getRootPath() + path, { details: true, data: ACCESS_PROPFIND })
  return !downloadForbidden(data?.props?.['share-attributes'])
}

/**
 * Whether a file is there to open beside the diagram, and whether the caller
 * may write it.
 *
 * @param {string} path
 * @return {Promise<{writable: boolean}|null>} null when it is missing, a folder, refused (403, 404), or on a share that forbids download
 */
export async function fileAccess(path) {
  let stat
  try {
    stat = await getClient().stat(getRootPath() + path, { details: true, data: ACCESS_PROPFIND })
  } catch (e) {
    if (e?.status === 403 || e?.status === 404) {
      return null
    }
    throw e
  }
  const { type, props = {} } = stat.data ?? {}
  if (type === 'directory' || downloadForbidden(props['share-attributes'])) {
    return null
  }
  return { writable: String(props.permissions ?? '').includes('W') }
}

/**
 * @param {string} path
 * @param {string} content
 * @param {string} etag the ETag `content` was based on
 * @return {Promise<string>} the file's new ETag
 */
export async function saveFile(path, content, etag) {
  // putFileContents() answers only `true`; the new ETag is in the PUT's headers.
  let res
  try {
    res = await getClient().customRequest(getRootPath() + path, {
      method: 'PUT',
      headers: { 'If-Match': etag },
      data: content,
    })
  } catch (e) {
    throw e?.status === 412 ? new ConflictError() : e
  }
  return etagOf(res)
}

/**
 * Writes `content` to a new file beside `path`: `<name> (copy).<ext>`, else
 * `(copy 2)` up to `(copy 9)`. `If-None-Match: *` makes a taken name answer
 * 412 instead of being overwritten. If the stat after the PUT fails, the copy
 * exists but this rejects.
 *
 * @param {string} path
 * @param {string} content
 * @return {Promise<{node: import('@nextcloud/files').Node, etag: string}>} the copy, as Files lists it
 */
export async function saveCopy(path, content) {
  for (let n = 1; n <= COPY_ATTEMPTS; n++) {
    const davPath = getRootPath() + copyPath(path, n)
    let res
    try {
      res = await getClient().customRequest(davPath, {
        method: 'PUT',
        headers: { 'If-None-Match': '*' },
        data: content,
      })
    } catch (e) {
      if (e?.status === 412) {
        continue
      }
      throw e
    }
    const etag = etagOf(res)
    const stat = await getClient().stat(davPath, { details: true, data: getDefaultPropfind() })
    return { node: resultToNode(stat.data), etag }
  }
  throw new Error('Could not save a copy')
}

/**
 * A folder's entries, for path completion: one Depth-1 PROPFIND per folder,
 * kept for the page. A failed listing is not kept, so the next try asks again.
 *
 * @param {string} path the folder, in the user's folder; `/` is the root
 * @return {Promise<Array<{name: string, folder: boolean}>>}
 */
export function listFolder(path) {
  return once(listings, path, () => {
    const davPath = getRootPath() + path
    return getClient().getDirectoryContents(davPath).then((entries) => entries
      .filter((entry) => entry.filename.replace(/\/+$/, '') !== davPath.replace(/\/+$/, ''))
      .map((entry) => ({ name: entry.basename, folder: entry.type === 'directory' })))
  })
}

function copyPath(path, n) {
  const dot = path.lastIndexOf('.')
  const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, '']
  return `${stem} (copy${n > 1 ? ` ${n}` : ''})${ext}`
}

function etagOf(res) {
  const etag = plainEtag(res.headers.get('ETag') ?? res.headers.get('OC-ETag'))
  // Without it the next save would send `If-Match: null` and refuse itself forever.
  if (!etag) {
    throw new Error('The server answered the save without an ETag')
  }
  return etag
}
