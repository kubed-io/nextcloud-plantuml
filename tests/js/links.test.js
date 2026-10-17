// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { linkOn } from '../../src/editor/linked/links.js'
import { resolveLinked } from '../../src/editor/paths.js'

describe('linkOn', () => {
  it.each([
    ['<style file=./UML_Fun.css>', { kind: 'style', written: './UML_Fun.css', from: 12, to: 25, section: null, block: null }],
    ['!include ./UML_Fun_parts.puml', { kind: 'include', written: './UML_Fun_parts.puml', from: 9, to: 29, section: null, block: null }],
    ['  !include_once parts.puml', { kind: 'include', written: 'parts.puml', from: 16, to: 26, section: null, block: null }],
    ['!includesub ./UML_Fun_parts.puml!NAME', { kind: 'include', written: './UML_Fun_parts.puml', from: 12, to: 32, section: 'NAME', block: null }],
    ['!include "./a b.puml"!2', { kind: 'include', written: './a b.puml', from: 10, to: 20, section: null, block: '2' }],
    ['!include_many ../shared/x.puml!login', { kind: 'include', written: '../shared/x.puml', from: 14, to: 30, section: null, block: 'login' }],
  ])('reads %s', (line, link) => {
    expect(linkOn(line)).toEqual(link)
  })

  it.each([
    '!include /x.puml', '!include <C4/C4_Container>', '!include https://example.com/x.puml',
    '!include $DIR/x.puml', '!include %dirpath()%/x.puml', '!import ./lib.zip', '!includesub ./parts.puml',
    '<style file=/abs.css>', "' !include ./x.puml", 'participant Shop',
  ])('opens nothing for %s', (line) => {
    expect(linkOn(line)).toBeNull()
  })
})

describe('resolveLinked', () => {
  it('resolves against the file\'s folder', () => {
    expect(resolveLinked('/Diagrams/a.puml', './x.css')).toBe('/Diagrams/x.css')
    expect(resolveLinked('/Diagrams/a.puml', '../x.css')).toBe('/x.css')
    expect(resolveLinked('/Diagrams/a.puml', 'sub/y.puml')).toBe('/Diagrams/sub/y.puml')
  })

  it('refuses a path above the root', () => {
    expect(resolveLinked('/a.puml', '../x.css')).toBeNull()
  })
})
