/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Wall's layout memory (VW13): the drawn sizes a file's wall was last packed
 * with, kept in this browser by a hash of the user, the file's path and the WebDAV ETag
 * it was read with, so the next open packs at once. Sizes, not places: the packing is the
 * same for the same sizes at any width. Each wall is the signed-in user's, so a
 * browser shared by two accounts never recalls one's files for the other; no one
 * signed in, nothing is kept. At most LIMIT walls, the least recently packed
 * going first. Storage that throws, or holds what this cannot read, is no memory.
 */
import { getCurrentUser } from '@nextcloud/auth'

export const STORAGE_KEY = 'plantuml.viewer.wall'
export const LIMIT = 50

// cyrb53, a 53-bit string hash: the stored key reveals no file path to another account's devtools.
// A collision costs one re-pack.
function hash(text) {
  let a = 0xdeadbeef
  let b = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 2654435761)
    b = Math.imul(b ^ code, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36)
}

// Null, no memory: no ETag, or no one signed in.
const keyOf = (path, etag) => {
  const uid = getCurrentUser()?.uid
  return etag && uid ? hash(JSON.stringify([uid, path, etag])) : null
}
const isSize = (pair) => Array.isArray(pair) && pair.length === 2 && pair.every((n) => Number.isFinite(n) && n > 0)

/** @return {Array<[string, Array<[number, number]|null>]>} the least recently packed first */
function read() {
  try {
    const walls = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(walls) ? walls.filter((wall) => Array.isArray(wall) && typeof wall[0] === 'string' && Array.isArray(wall[1])) : []
  } catch {
    return []
  }
}

/**
 * @param {string} path
 * @param {string|null} etag none, no memory
 * @return {Array<{ width: number, height: number }|null>|null} per diagram, in file order; null when none is kept
 */
export function recall(path, etag) {
  const key = keyOf(path, etag)
  if (key === null) {
    return null
  }
  const sizes = read().find(([wall]) => wall === key)?.[1]
  return sizes ? sizes.map((pair) => (isSize(pair) ? { width: pair[0], height: pair[1] } : null)) : null
}

/**
 * @param {string} path
 * @param {string|null} etag none, nothing kept
 * @param {Array<{ width: number, height: number }|null>} sizes per diagram, in file order
 */
export function remember(path, etag, sizes) {
  const key = keyOf(path, etag)
  if (key === null) {
    return
  }
  const walls = read().filter(([wall]) => wall !== key)
  walls.push([key, sizes.map((size) => (size ? [size.width, size.height] : null))])
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(walls.slice(-LIMIT)))
  } catch {
    // Not kept: the next open packs as the sizes arrive.
  }
}
