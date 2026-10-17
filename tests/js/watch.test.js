// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The watch clock on fake timers, with notify_push's listen() stubbed: when
// check is called, never what it does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.hoisted(() => ({ listen: vi.fn(), handlers: [], imported: 0, loadFails: false, capabilities: {} }))
vi.mock('../../src/editor/push.js', () => ({
  loadPush: async () => {
    push.imported++
    if (push.loadFails) {
      throw new Error('bundle failed')
    }
    return { listen: push.listen }
  },
}))
vi.mock('@nextcloud/capabilities', () => ({ getCapabilities: () => push.capabilities }))

let visibility = 'visible'
let watchFile
let watcher

/** A promise the test settles itself, for a check still in flight. */
function deferred() {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

/** Lets the dynamic import of notify_push, and what follows it, finish. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await vi.dynamicImportSettled()
  await vi.advanceTimersByTimeAsync(0)
}

function show(state) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  visibility = 'visible'
  push.handlers = []
  push.imported = 0
  push.loadFails = false
  push.capabilities = { notify_push: { endpoints: {} } }
  push.listen.mockReset().mockImplementation((_name, handler) => { push.handlers.push(handler); return false })
  // listen() is asked once per page, so each test gets a fresh module.
  vi.resetModules()
  ;({ watchFile } = await import('../../src/editor/watch.js'))
})

afterEach(() => {
  watcher?.stop()
  watcher = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('watchFile', () => {
  it('checks every interval while the page is visible', async () => {
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })

    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(9999)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20000)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('checks every ten seconds unless told otherwise', async () => {
    const check = vi.fn(async () => {})
    watcher = watchFile({ check })

    await vi.advanceTimersByTimeAsync(10000)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('checks nothing while the page is hidden, and at once when it is shown again', async () => {
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })

    show('hidden')
    await vi.advanceTimersByTimeAsync(60000)
    expect(check).not.toHaveBeenCalled()

    show('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('checks at once when the window gets the focus back', async () => {
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('never runs two checks at once, and runs one more after when asked meanwhile', async () => {
    const first = deferred()
    const check = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    watcher = watchFile({ check, intervalMs: 10000 })

    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(check).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('carries on after a check that failed, saying so only to the debug console', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const check = vi.fn().mockRejectedValueOnce(new Error('503')).mockResolvedValue(undefined)
    watcher = watchFile({ check, intervalMs: 10000 })

    await vi.advanceTimersByTimeAsync(10000)
    expect(debug).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('polls every interval when notify_push is not there', async () => {
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })
    await settle()

    expect(push.listen).toHaveBeenCalledWith('notify_file', expect.any(Function))
    await vi.advanceTimersByTimeAsync(30000)
    expect(check).toHaveBeenCalledTimes(3)
  })

  it('checks on a notify_file push when notify_push is there, polling only once a minute', async () => {
    push.listen.mockImplementation((_name, handler) => { push.handlers.push(handler); return true })
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })
    await settle()

    await vi.advanceTimersByTimeAsync(59999)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)

    push.handlers.forEach((handler) => handler('notify_file', null))
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('asks notify_push once per page, however many files are watched', async () => {
    push.listen.mockImplementation((_name, handler) => { push.handlers.push(handler); return true })
    const one = vi.fn(async () => {})
    const two = vi.fn(async () => {})
    watchFile({ check: one }).stop()
    watcher = watchFile({ check: two })
    await settle()

    expect(push.listen).toHaveBeenCalledTimes(1)
    push.handlers.forEach((handler) => handler('notify_file', null))
    await vi.advanceTimersByTimeAsync(0)
    expect(one).not.toHaveBeenCalled()
    expect(two).toHaveBeenCalledTimes(1)
  })

  it('checks nothing once stopped: no timer, no visibility, no focus, no push', async () => {
    push.listen.mockImplementation((_name, handler) => { push.handlers.push(handler); return true })
    const check = vi.fn(async () => {})
    watchFile({ check, intervalMs: 10000 }).stop()

    show('hidden')
    show('visible')
    window.dispatchEvent(new Event('focus'))
    push.handlers.forEach((handler) => handler('notify_file', null))
    await vi.advanceTimersByTimeAsync(120000)
    expect(check).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never imports notify_push, and polls every interval, when the server has no notify_push', async () => {
    push.capabilities = {}
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })
    await settle()

    expect(push.imported).toBe(0)
    expect(push.listen).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10000)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('polls every interval until notify_push has loaded, then once a minute', async () => {
    push.listen.mockImplementation((_name, handler) => { push.handlers.push(handler); return true })
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })

    await vi.advanceTimersByTimeAsync(0)
    expect(check).not.toHaveBeenCalled()
    await settle()
    await vi.advanceTimersByTimeAsync(59999)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('leaves no timer behind when stopped before notify_push has loaded', async () => {
    push.listen.mockImplementation((_name, handler) => { push.handlers.push(handler); return true })
    const check = vi.fn(async () => {})
    watchFile({ check, intervalMs: 10000 }).stop()
    await settle()

    expect(vi.getTimerCount()).toBe(0)
    push.handlers.forEach((handler) => handler('notify_file', null))
    await vi.advanceTimersByTimeAsync(120000)
    expect(check).not.toHaveBeenCalled()
  })

  it('keeps polling every interval, unhandled-rejection free, when the push bundle fails to load', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    push.loadFails = true
    const check = vi.fn(async () => {})
    watcher = watchFile({ check, intervalMs: 10000 })
    await settle()
    await vi.advanceTimersByTimeAsync(30000)
    process.off('unhandledRejection', unhandled)

    expect(check).toHaveBeenCalledTimes(3)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
