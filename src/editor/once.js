/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Every cache `once` has been given, for `resetOnce`.
const caches = new Set()

/**
 * `key`'s load, started once and shared by every caller; a failed load is
 * forgotten, so the next call tries again.
 *
 * @param {Map<unknown, Promise<unknown>>} cache
 * @param {unknown} key
 * @param {() => Promise<unknown>} load
 * @return {Promise<unknown>}
 */
export function once(cache, key, load) {
  caches.add(cache)
  if (!cache.has(key)) {
    const promise = load()
    promise.catch(() => cache.delete(key))
    cache.set(key, promise)
  }
  return cache.get(key)
}

/** Empties every cache `once` fills, so the next call loads again: for tests, which share the module. */
export function resetOnce() {
  for (const cache of caches) {
    cache.clear()
  }
}
