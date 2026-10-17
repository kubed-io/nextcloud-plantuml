/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * When to look whether the file changed elsewhere: every `intervalMs` while the
 * page is visible, at once when it is shown or focused again, and on every
 * `notify_file` push when the notify_push app is there, which then leaves the
 * clock as a once-a-minute safety net. What a check does is `check`'s business.
 */
import { getCapabilities } from '@nextcloud/capabilities'
import { APP_ID } from '../files-helpers.js'
import { loadPush } from './push.js'

const watchers = new Set()
let pushed = null

// The push bundle (notify_push and the axios it brings) is only fetched when the server
// advertises the app. listen() has no way to stop listening, so it is asked
// once per page and fans out to whoever is watching. notify_file carries no
// file id: any change to the user's files is a reason to look.
function pushAvailable() {
  pushed ??= (async () => {
    if (!getCapabilities()?.notify_push) {
      return false
    }
    const { listen } = await loadPush()
    return listen('notify_file', () => watchers.forEach((run) => run()))
  })()
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

  // Poll at once; the slower clock waits for push to be known to work. A push
  // that cannot load leaves the faster one.
  let timer = setInterval(run, intervalMs)
  pushAvailable().then((push) => {
    if (push && !stopped) {
      watchers.add(run)
      clearInterval(timer)
      timer = setInterval(run, pushIntervalMs)
    }
  }, (e) => console.debug(`[${APP_ID}] notify_push is not available`, e))
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
