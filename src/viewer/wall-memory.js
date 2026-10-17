/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Wall's layout memory (VW13): the drawn sizes a file's wall was last packed
 * with, kept in this browser by the file's path and the WebDAV ETag it was read
 * with, so the next open packs at once. Sizes, not places: the packing is the
 * same for the same sizes at any width. At most LIMIT walls, the least recently
 * packed going first. Storage that throws, or holds what this cannot read, is no memory.
 */
export const STORAGE_KEY = 'plantuml.viewer.wall'
export const LIMIT = 50

const keyOf = (path, etag) => JSON.stringify([path, etag])
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
  if (!etag) {
    return null
  }
  const key = keyOf(path, etag)
  const sizes = read().find(([wall]) => wall === key)?.[1]
  return sizes ? sizes.map((pair) => (isSize(pair) ? { width: pair[0], height: pair[1] } : null)) : null
}

/**
 * @param {string} path
 * @param {string|null} etag none, nothing kept
 * @param {Array<{ width: number, height: number }|null>} sizes per diagram, in file order
 */
export function remember(path, etag, sizes) {
  if (!etag) {
    return
  }
  const key = keyOf(path, etag)
  const walls = read().filter(([wall]) => wall !== key)
  walls.push([key, sizes.map((size) => (size ? [size.width, size.height] : null))])
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(walls.slice(-LIMIT)))
  } catch {
    // Not kept: the next open packs as the sizes arrive.
  }
}
