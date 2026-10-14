// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The autosave clock on fake timers: when save is called, never what it does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosave } from '../../src/editor/autosave.js'

describe('createAutosave', () => {
  let save
  let autosave

  beforeEach(() => {
    vi.useFakeTimers()
    save = vi.fn(() => Promise.resolve())
    autosave = createAutosave({ idleMs: 2000, maxWaitMs: 30000, save })
  })

  afterEach(() => vi.useRealTimers())

  it('saves once, after the idle time with no change', () => {
    autosave.schedule()

    vi.advanceTimersByTime(1999)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('pushes the save back while changes keep coming', () => {
    autosave.schedule()
    vi.advanceTimersByTime(1500)
    autosave.schedule()
    vi.advanceTimersByTime(1500)

    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('saves at the max wait during a run of changes that never pauses', () => {
    autosave.schedule()
    for (let ms = 1000; ms < 30000; ms += 1000) {
      vi.advanceTimersByTime(1000)
      autosave.schedule()
    }
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('starts a new max wait after a save', () => {
    autosave.schedule()
    vi.advanceTimersByTime(2000)
    autosave.schedule()
    for (let ms = 1000; ms < 30000; ms += 1000) {
      vi.advanceTimersByTime(1000)
      autosave.schedule()
    }

    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flush saves now, returns the save, and nothing fires later', async () => {
    autosave.schedule()

    await expect(autosave.flush()).resolves.toBeUndefined()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancel drops a pending save', () => {
    autosave.schedule()
    autosave.cancel()

    vi.advanceTimersByTime(60000)
    expect(save).not.toHaveBeenCalled()
  })
})
