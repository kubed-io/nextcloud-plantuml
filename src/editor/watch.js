/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * When to look whether the file changed elsewhere: every `intervalMs` while the
 * page is visible, at once when it is shown or focused again, and on every
 * `notify_file` push when the notify_push app is there, which then leaves the
 * clock as a once-a-minute safety net. What a check does is `check`'s business.
 */
import { listen } from '@nextcloud/notify_push'
import { APP_ID } from '../files-helpers.js'

const watchers = new Set()
let pushed = null

// listen() has no way to stop listening, so it is asked once per page and
// fans out to whoever is watching. notify_file carries no file id: any change
// to the user's files is a reason to look.
function pushAvailable() {
  pushed ??= listen('notify_file', () => watchers.forEach((run) => run()))
  return pushed
}

/**
 * @param {{check: () => Promise<void>, intervalMs?: number, pushIntervalMs?: number}} options
 * @return {{stop: () => void}}
 */
export function watchFile({ check, intervalMs = 10000, pushIntervalMs = 60000 }) {
  let checking = false
  let again = false
  let stopped = false

  async function run() {
    if (stopped || document.visibilityState !== 'visible') {
      return
    }
    if (checking) {
      again = true
      return
    }
    checking = true
    try {
      await check()
    } catch (e) {
      console.debug(`[${APP_ID}] could not check the file`, e)
    } finally {
      checking = false
    }
    if (again) {
      again = false
      run()
    }
  }

  const push = pushAvailable()
  if (push) {
    watchers.add(run)
  }
  const timer = setInterval(run, push ? pushIntervalMs : intervalMs)
  document.addEventListener('visibilitychange', run)
  window.addEventListener('focus', run)

  return {
    stop() {
      stopped = true
      clearInterval(timer)
      watchers.delete(run)
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
    },
  }
}
