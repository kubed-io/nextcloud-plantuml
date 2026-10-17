// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMIT, STORAGE_KEY, recall, remember } from '../../../src/viewer/wall-memory.js'

const SIZES = [{ width: 600, height: 300 }, null, { width: 40, height: 20 }]

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the Wall\'s layout memory (VW13)', () => {
  it('recalls the sizes a wall was packed with, by path and ETag', () => {
    remember('/D/S.puml', '"e"', SIZES)

    expect(recall('/D/S.puml', '"e"')).toEqual(SIZES)
  })

  it('recalls nothing for another ETag or another file', () => {
    remember('/D/S.puml', '"e"', SIZES)

    expect(recall('/D/S.puml', '"f"')).toBeNull()
    expect(recall('/D/T.puml', '"e"')).toBeNull()
  })

  it('keeps nothing for a file read without an ETag', () => {
    remember('/D/S.puml', null, SIZES)

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(recall('/D/S.puml', null)).toBeNull()
  })

  it('keeps the last packing of a wall in place of the one before', () => {
    remember('/D/S.puml', '"e"', [null, null, null])
    remember('/D/S.puml', '"e"', SIZES)

    expect(recall('/D/S.puml', '"e"')).toEqual(SIZES)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toHaveLength(1)
  })

  it(`keeps at most ${LIMIT} walls, the least recently packed going first`, () => {
    for (let n = 0; n <= LIMIT; n++) {
      remember(`/D/${n}.puml`, '"e"', SIZES)
    }
    // The first one packed again is the most recent: the second goes when the next comes.
    remember('/D/1.puml', '"e"', SIZES)
    remember('/D/new.puml', '"e"', SIZES)

    expect(recall('/D/0.puml', '"e"')).toBeNull()
    expect(recall('/D/2.puml', '"e"')).toBeNull()
    expect(recall('/D/1.puml', '"e"')).toEqual(SIZES)
    expect(recall('/D/new.puml', '"e"')).toEqual(SIZES)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toHaveLength(LIMIT)
  })

  it('is no memory when the storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })

    expect(() => remember('/D/S.puml', '"e"', SIZES)).not.toThrow()
    expect(recall('/D/S.puml', '"e"')).toBeNull()
  })

  it('reads what it cannot understand as no memory, and a bad size as one not known', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(recall('/D/S.puml', '"e"')).toBeNull()

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([['x', 'y'], [JSON.stringify(['/D/S.puml', '"e"']), [[600, 300], [0, 1], 'z', null]]]))
    expect(recall('/D/S.puml', '"e"')).toEqual([{ width: 600, height: 300 }, null, null, null])
  })
})
