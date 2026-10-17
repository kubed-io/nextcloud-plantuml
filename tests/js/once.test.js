// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// once(): one load per key, shared by every caller, forgotten when it fails.
import { describe, expect, it, vi } from 'vitest'
import { once } from '../../src/editor/once.js'

describe('once', () => {
  it('shares one promise between two calls for a key', async () => {
    const cache = new Map()
    const load = vi.fn(() => Promise.resolve('x'))
    const first = once(cache, 'a', load)
    const second = once(cache, 'a', load)
    expect(second).toBe(first)
    expect(await first).toBe('x')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads each key on its own', async () => {
    const cache = new Map()
    const load = vi.fn((key) => Promise.resolve(key))
    expect(await once(cache, 'a', () => load('a'))).toBe('a')
    expect(await once(cache, 'b', () => load('b'))).toBe('b')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('forgets a failure, so the next call loads again, and then keeps the answer', async () => {
    const cache = new Map()
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('up')
    await expect(once(cache, 'a', load)).rejects.toThrow('down')
    expect(await once(cache, 'a', load)).toBe('up')
    expect(await once(cache, 'a', load)).toBe('up')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
