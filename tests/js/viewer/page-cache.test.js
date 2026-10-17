// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { createPageCache, sheetKey } from '../../../src/viewer/page-cache.js'

const drawing = (svg, serverEtag = null) => ({ svg, size: { width: 40, height: 20 }, serverEtag })
const svgOf = (cache, key) => cache.get(key)?.svg ?? null

describe('the page cache', () => {
  it('gives back a drawing under the path, ETag and place it was kept under', () => {
    const cache = createPageCache()
    cache.set(sheetKey('/D/S.puml', '"e1"', 0), drawing('<svg/>'))

    expect(cache.get(sheetKey('/D/S.puml', '"e1"', 0))).toEqual(drawing('<svg/>'))
  })

  it('finds nothing for another ETag, place or path', () => {
    const cache = createPageCache()
    cache.set(sheetKey('/D/S.puml', '"e1"', 0), drawing('<svg/>'))

    expect(cache.get(sheetKey('/D/S.puml', '"e2"', 0))).toBeNull()
    expect(cache.get(sheetKey('/D/S.puml', '"e1"', 1))).toBeNull()
    expect(cache.get(sheetKey('/D/T.puml', '"e1"', 0))).toBeNull()
  })

  it('keeps apart keys whose parts would run together', () => {
    const cache = createPageCache()
    cache.set(sheetKey('/D/a,b', '"e"', 1), drawing('one'))

    expect(cache.get(sheetKey('/D/a', 'b,"e"', 1))).toBeNull()
  })

  it('lets the least recently used drawing go past its count', () => {
    const cache = createPageCache({ max: 2 })
    cache.set('a', drawing('1'))
    cache.set('b', drawing('2'))
    cache.get('a')
    cache.set('c', drawing('3'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b'), svgOf(cache, 'c')]).toEqual(['1', null, '3'])
  })

  it('lets the least recently used drawing go past its size in characters', () => {
    const cache = createPageCache({ maxChars: 10 })
    cache.set('a', drawing('xxxxxx'))
    cache.set('b', drawing('yyyyyy'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b')]).toEqual([null, 'yyyyyy'])
  })

  it('counts a drawing kept again under its key once', () => {
    const cache = createPageCache({ maxChars: 10 })
    cache.set('a', drawing('xxxxxx'))
    cache.set('a', drawing('yyyyyy'))

    expect(svgOf(cache, 'a')).toBe('yyyyyy')
  })

  it('holds 200 drawings by default', () => {
    const cache = createPageCache()
    for (let i = 0; i <= 200; i++) {
      cache.set(String(i), drawing('<svg/>'))
    }

    expect(cache.size).toBe(200)
    expect(cache.get('0')).toBeNull()
    expect(svgOf(cache, '200')).toBe('<svg/>')
  })

  it('keeps the server ETag the drawing came with, or null', () => {
    const cache = createPageCache()
    cache.set('a', drawing('1', '"srv1"'))
    cache.set('b', drawing('2'))

    expect(cache.get('a').serverEtag).toBe('"srv1"')
    expect(cache.get('b').serverEtag).toBeNull()
  })

  it('replaces a drawing, its size and its ETag under the same key', () => {
    const cache = createPageCache()
    cache.set('a', drawing('old', '"srv1"'))
    cache.set('a', { svg: 'new', size: { width: 5, height: 6 }, serverEtag: '"srv2"' })

    expect(cache.get('a')).toEqual({ svg: 'new', size: { width: 5, height: 6 }, serverEtag: '"srv2"' })
    expect(cache.size).toBe(1)
  })

  it('keeps the size count right when a drawing is replaced by a longer or shorter one', () => {
    const cache = createPageCache({ maxChars: 10 })
    cache.set('a', drawing('xxxxxx'))
    cache.set('a', drawing('yy'))
    cache.set('b', drawing('zzzzzzzz'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b')]).toEqual(['yy', 'zzzzzzzz'])

    cache.set('a', drawing('wwwwwww'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b')]).toEqual(['wwwwwww', null])
  })

  it('makes a replaced drawing the most recently used', () => {
    const cache = createPageCache({ max: 2 })
    cache.set('a', drawing('1'))
    cache.set('b', drawing('2'))
    cache.set('a', drawing('1b', '"srv"'))
    cache.set('c', drawing('3'))

    expect([svgOf(cache, 'a'), svgOf(cache, 'b'), svgOf(cache, 'c')]).toEqual(['1b', null, '3'])
  })

  it('forgets everything on clear', () => {
    const cache = createPageCache({ maxChars: 10 })
    cache.set('a', drawing('xxxxxx'))
    cache.clear()
    cache.set('b', drawing('yyyyyy'))

    expect(cache.size).toBe(1)
    expect(svgOf(cache, 'b')).toBe('yyyyyy')
  })
})
