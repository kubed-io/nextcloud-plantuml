/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * When to save without being asked: once the document has been still for
 * `idleMs`, and at least every `maxWaitMs` while it never is, so a long run of
 * typing is never all at risk. Whether there is anything to save, and whether
 * saving is allowed, is `save`'s business.
 */

/**
 * @param {{idleMs: number, maxWaitMs: number, save: () => Promise<void>}} options
 */
export function createAutosave({ idleMs, maxWaitMs, save }) {
  let idle = null
  let maxWait = null

  function cancel() {
    clearTimeout(idle)
    clearTimeout(maxWait)
    idle = maxWait = null
  }

  function flush() {
    cancel()
    return save()
  }

  return {
    /** A change happened. */
    schedule() {
      clearTimeout(idle)
      idle = setTimeout(flush, idleMs)
      maxWait ??= setTimeout(flush, maxWaitMs)
    },
    flush,
    cancel,
  }
}
