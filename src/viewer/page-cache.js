/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's drawings, kept for the life of the Files page (VW11): reopening a
 * file or arrowing back to it draws from memory at once, then checks the drawing
 * with the server (sheets.js). Kept by the file's path, the file's ETag the Viewer
 * read it with and the diagram's 0-based place, so a changed file, with its new
 * ETag, never meets an old drawing. Only drawings are kept, never a failure. Past
 * `max` drawings or `maxChars` characters of SVG, the least recently used go first;
 * one longer than `maxChars` alone is not kept.
 *
 * What is kept is the server's SVG text, not an element: each sheet makes its
 * own through toInlineSvg, with its own view's id prefix.
 */

/**
 * `serverEtag` is the ETag of the server's own answer (it covers included files), kept so a
 * hit can be revalidated in the background; a `set` under the same key replaces the entry.
 * @typedef {{ svg: string, size: { width: number, height: number }|null, serverEtag: string|null }} Drawing
 */

/**
 * @param {string} path
 * @param {string} etag
 * @param {number} index 0-based
 * @return {string}
 */
export function sheetKey(path, etag, index) {
  return JSON.stringify([path, etag, index])
}

/**
 * @param {{ max?: number, maxChars?: number }} [limits]
 * @return {{ get: (key: string) => Drawing|null, set: (key: string, drawing: Drawing) => void, clear: () => void, readonly size: number }}
 */
export function createPageCache({ max = 200, maxChars = 32 * 1024 * 1024 } = {}) {
  // A Map keeps insertion order: the first key is the least recently used.
  const drawings = new Map()
  let chars = 0
  const drop = (key) => {
    chars -= drawings.get(key).svg.length
    drawings.delete(key)
  }
  return {
    get(key) {
      const drawing = drawings.get(key)
      if (!drawing) {
        return null
      }
      drawings.delete(key)
      drawings.set(key, drawing)
      return drawing
    },
    set(key, drawing) {
      if (drawings.has(key)) {
        drop(key)
      }
      if (typeof drawing.svg !== 'string' || drawing.svg.length > maxChars) {
        return
      }
      drawings.set(key, drawing)
      chars += drawing.svg.length
      while (drawings.size > max || chars > maxChars) {
        drop(drawings.keys().next().value)
      }
    },
    clear() {
      drawings.clear()
      chars = 0
    },
    get size() {
      return drawings.size
    },
  }
}

/** The one the Viewer's sheets share. */
export const pageCache = createPageCache()
