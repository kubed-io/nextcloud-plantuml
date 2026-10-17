// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The sprites profile: what its mode names inside `@startsprites`, and what the
// PlantUML mode itself names of a `sprite` definition in a uml block.
import { describe, expect, it } from 'vitest'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import spritesProfile from '../../src/editor/profiles/sprites.js'
import { tokensOf, blockTokens } from './helpers/tokens.js'

const sprites = spritesProfile(core)
const language = plantumlLanguage({ sprites: sprites.mode })

/** [text, token class] for every highlighted span of the lines in a block of `type`. */
const tokens = (type, ...lines) => blockTokens(language, type, lines)
const spriteTokens = (...lines) => tokens('sprites', ...lines)
const umlTokens = (...lines) => tokens('uml', ...lines)

const header = [
  ['sprite', 'keyword'], ['$bar', 'VariableName'], ['[', 'squareBracket'], ['8', 'number'], ['x', 'separator'], ['4', 'number'],
  ['/', 'separator'], ['16', 'number'], [']', 'squareBracket'], ['{', 'brace'],
]

describe('the sprites profile', () => {
  it('is the sprites type with no completions or lints', () => {
    expect(sprites).toMatchObject({ type: 'sprites', completions: [], lints: [], values: [] })
  })

  it('names a multi-line sprite: header, data rows, closing brace', () => {
    expect(spriteTokens('sprite $bar [8x4/16] {', 'FFFFFFFF', '0F0F0F0F', '}')).toEqual([
      ...header, ['FFFFFFFF', 'SpriteData'], ['0F0F0F0F', 'SpriteData'], ['}', 'brace'],
    ])
  })

  it('reads a row beginning with a keyword word as data', () => {
    expect(spriteTokens('sprite $a {', 'sprite', '}').slice(3, 4)).toEqual([['sprite', 'SpriteData']])
  })

  it('ends a body at end sprite too', () => {
    expect(spriteTokens('sprite $a {', 'FF', 'end sprite', 'listsprites').slice(-2)).toEqual([['end sprite', 'keyword'], ['listsprites', 'keyword']])
  })

  it('names a compressed sprite: z a keyword, the payload data', () => {
    expect(spriteTokens('sprite $c [16x16/16z] NOtH3W0W208Hx')).toEqual([
      ['sprite', 'keyword'], ['$c', 'VariableName'], ['[', 'squareBracket'], ['16', 'number'], ['x', 'separator'], ['16', 'number'],
      ['/', 'separator'], ['16', 'number'], ['z', 'keyword'], [']', 'squareBracket'], ['NOtH3W0W208Hx', 'SpriteData'],
    ])
  })

  it('keeps a payload whole, whatever it begins with', () => {
    for (const payload of ['xTLabc', '40abc', '/abc', '12ab34', 'zz']) {
      expect(spriteTokens(`sprite $c [16x16/16z] ${payload}`).slice(-1)).toEqual([[payload, 'SpriteData']])
      expect(umlTokens(`sprite $c [16x16/16z] ${payload}`).slice(-1)).toEqual([[payload, 'SpriteData']])
    }
  })

  it('names a colour sprite: color a keyword', () => {
    expect(spriteTokens('sprite $s [2x1/color] GHab').slice(-3)).toEqual([['color', 'keyword'], [']', 'squareBracket'], ['GHab', 'SpriteData']])
  })

  it('names an inline svg sprite as tag, attributes and strings', () => {
    expect(spriteTokens('sprite dot <svg viewBox="0 0 10 10"><circle r="4"/></svg>')).toEqual([
      ['sprite', 'keyword'], ['dot', 'VariableName'],
      ['<svg', 'tagName'], ['viewBox', 'attributeName'], ['=', 'definitionOperator'], ['"0 0 10 10"', 'string'],
      ['><circle', 'tagName'], ['r', 'attributeName'], ['=', 'definitionOperator'], ['"4"', 'string'], ['/></svg>', 'tagName'],
    ])
  })

  it('reads an unquoted attribute value as a string, as the PlantUML mode does', () => {
    expect(spriteTokens('sprite dot <svg width=10><circle r=4></svg>').slice(-8)).toEqual([
      ['width', 'attributeName'], ['=', 'definitionOperator'], ['10', 'string'],
      ['><circle', 'tagName'], ['r', 'attributeName'], ['=', 'definitionOperator'], ['4', 'string'], ['></svg>', 'tagName'],
    ])
  })

  it('reads a namespaced svg attribute as an attribute', () => {
    expect(spriteTokens('sprite dot <svg xmlns:xlink="http://www.w3.org/1999/xlink"></svg>').slice(3, 6)).toEqual([
      ['xmlns:xlink', 'attributeName'], ['=', 'definitionOperator'], ['"http://www.w3.org/1999/xlink"', 'string'],
    ])
    expect(umlTokens('sprite dot <svg><use xlink:href="#a"/></svg>').slice(3, 5)).toEqual([['xlink:href', 'attributeName'], ['=', 'definitionOperator']])
  })

  it('reads a multi-line svg sprite down to the line holding </svg>', () => {
    expect(spriteTokens('sprite a <svg viewBox="0 0 8 8">', '<path d="M1 0"/>', '</svg>', 'listsprite').slice(-4)).toEqual([
      ['"M1 0"', 'string'], ['/>', 'tagName'], ['</svg>', 'tagName'], ['listsprite', 'keyword'],
    ])
  })

  it('names a base64 sprite: the prefix an attribute, the payload data', () => {
    expect(spriteTokens('sprite px data:image/png;base64,iVBORw0KGgo=').slice(-2)).toEqual([['data:image/png;base64,', 'attributeName'], ['iVBORw0KGgo=', 'SpriteData']])
  })

  it('names listsprites and listsprite keywords and leaves other lines plain', () => {
    expect(spriteTokens('listsprites', 'listsprite', 'title Gallery')).toEqual([['listsprites', 'keyword'], ['listsprite', 'keyword']])
  })

  it('leaves a comment to PlantUML', () => {
    expect(spriteTokens("sprite $a {", "' note", 'FF', '}').slice(3, 5)).toEqual([["' note", 'comment'], ['FF', 'SpriteData']])
  })
})

describe('a sprite in a uml block', () => {
  it('reads the pixel rows as data and the lines after as uml', () => {
    expect(umlTokens('sprite $bar [8x4/16] {', 'FFFFFFFF', '0F0F0F0F', '}', 'A -> B')).toEqual([
      ...header, ['FFFFFFFF', 'SpriteData'], ['0F0F0F0F', 'SpriteData'], ['}', 'brace'], ['->', 'LinkOperator'],
    ])
  })

  it('reads a headerless body, indented, down to end sprite', () => {
    expect(umlTokens('  sprite $foo {', '  FFFFF', '  end sprite', 'A -> B').slice(-3)).toEqual([['FFFFF', 'SpriteData'], ['end sprite', 'keyword'], ['->', 'LinkOperator']])
  })

  it('reads a compressed one-line sprite, a colour sprite and an svg sprite', () => {
    expect(umlTokens('sprite $c [15x15/8z] NOtH3W', 'A -> B').slice(-2)).toEqual([['NOtH3W', 'SpriteData'], ['->', 'LinkOperator']])
    expect(umlTokens('sprite $s [2x1/color] GHab').slice(-3)).toEqual([['color', 'keyword'], [']', 'squareBracket'], ['GHab', 'SpriteData']])
    expect(umlTokens('sprite foo <svg viewBox="0 0 8 8"><circle r="3"/></svg>', 'A -> B').slice(0, 5)).toEqual([
      ['sprite', 'keyword'], ['foo', 'VariableName'], ['<svg', 'tagName'], ['viewBox', 'attributeName'], ['=', 'definitionOperator'],
    ])
  })

  it('reads a multi-line svg sprite down to </svg>, then uml again', () => {
    expect(umlTokens('sprite foo <svg viewBox="0 0 8 8">', '<path d="M1 0l-1 1"/>', '</svg>', 'A -> B').slice(-3)).toEqual([['/>', 'tagName'], ['</svg>', 'tagName'], ['->', 'LinkOperator']])
  })

  it('greys the rows of an unclosed sprite to the end of the block and reads the next block as ever', () => {
    const out = tokensOf(plantumlLanguage({}), ['@startuml', 'sprite $a {', 'FF', '@enduml', '@startuml', 'A -> B', '@enduml'])
    expect(out.slice(4, 6)).toEqual([['FF', 'SpriteData'], ['@enduml', 'keyword']])
    expect(out.slice(-3)).toEqual([['@startuml', 'keyword'], ['->', 'LinkOperator'], ['@enduml', 'keyword']])
  })

  it('leaves a package brace alone', () => {
    expect(umlTokens('package X {', 'A -> B', '}')).toEqual([['package', 'keyword'], ['X', 'typeName'], ['->', 'LinkOperator']])
  })

  it('names listsprites a keyword', () => {
    expect(umlTokens('listsprites')).toEqual([['listsprites', 'keyword']])
  })
})
