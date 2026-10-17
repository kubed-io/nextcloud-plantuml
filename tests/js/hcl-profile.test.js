// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The hcl profile: what its mode names inside `@starthcl` blocks, read the way
// CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import hclProfile from '../../src/editor/profiles/hcl.js'
import { blockTokens } from './helpers/tokens.js'

const hcl = hclProfile(core)
const language = plantumlLanguage({ hcl: hcl.mode })

/** [text, token class] for every highlighted span of `lines`, in a block of `type`. */
const tokens = (type, ...lines) => blockTokens(language, type, lines)
const hclTokens = (...lines) => tokens('hcl', ...lines)

describe('the hcl profile', () => {
  it('is the hcl type with no completions or lints', () => {
    expect(hcl).toMatchObject({ type: 'hcl', completions: [], lints: [], values: [] })
  })

  it('reads a block header: words a classifier, labels strings, a brace', () => {
    expect(hclTokens('service "http" "web_proxy" {')).toEqual([
      ['service', 'typeName'], ['"http"', 'string'], ['"web_proxy"', 'string'], ['{', 'brace'],
    ])
  })

  it('reads keys, both assignment operators and values', () => {
    expect(hclTokens('service x {', '  listen_addr = "127.0.0.1:8080"')).toContainEqual(['listen_addr', 'propertyName'])
    const lines = hclTokens('a {', '  listen_addr = "127.0.0.1:8080"', '  port : 3', '  ok = true', '  no = false')
    expect(lines).toContainEqual(['=', 'definitionOperator'])
    expect(lines).toContainEqual(['"127.0.0.1:8080"', 'string'])
    expect(lines).toContainEqual([':', 'definitionOperator'])
    expect(lines).toContainEqual(['3', 'number'])
    expect(lines).toContainEqual(['true', 'atom'])
    expect(lines).toContainEqual(['false', 'atom'])
    expect(hclTokens('a {', '  "quoted key" = 1')).toContainEqual(['"quoted key"', 'propertyName'])
  })

  it('reads a function call and its arguments', () => {
    expect(hclTokens('a {', '  data = file("init.sh")')).toEqual([
      ['a', 'typeName'], ['{', 'brace'], ['data', 'propertyName'], ['=', 'definitionOperator'],
      ['file', 'FunctionName'], ['(', 'paren'], ['"init.sh"', 'string'], [')', 'paren'],
    ])
  })

  it('reads an array and its separators', () => {
    const found = hclTokens('a {', '  list = ["a", "b"]')
    expect(found).toContainEqual(['[', 'squareBracket'])
    expect(found).toContainEqual([',', 'separator'])
    expect(found).toContainEqual([']', 'squareBracket'])
  })

  it('reads the escapes of a string', () => {
    expect(hclTokens('a {', '  x = "a\\"b"')).toContainEqual(['\\"', 'escape'])
  })

  it('reads a comment only at a line start', () => {
    expect(hclTokens('# a comment')).toEqual([['# a comment', 'comment']])
    expect(hclTokens('a {', '  # #fff')).toContainEqual(['# #fff', 'comment'])
    const after = hclTokens('a {', '  x = 3 # #fff')
    expect(after.map(([, token]) => token)).not.toContain('comment')
    expect(after.map(([, token]) => token)).not.toContain('ColorLiteral')
    expect(hclTokens('a {', '  x = 1 // c').map(([, token]) => token)).not.toContain('comment')
  })

  it('keeps reading keys inside a nested object across lines', () => {
    const found = hclTokens('r "x" {', '  tags = {', '    Name = "H"', '    map = { a = "x" }', '  }', '  after = 1', '}')
    expect(found).toContainEqual(['Name', 'propertyName'])
    expect(found).toContainEqual(['map', 'propertyName'])
    expect(found).toContainEqual(['a', 'propertyName'])
    expect(found).toContainEqual(['after', 'propertyName'])
  })

  it.each(['{', '[', '(', '"'])('ends an unclosed %s at the block end', (open) => {
    const doc = ['@starthcl', 'a {', `  x = ${open}`, '@endhcl', '@startuml', 'A -> B', '@enduml'].join('\n')
    const found = []
    language.parser.parse(doc).iterate({
      enter(node) { if (!node.type.isTop) found.push([doc.slice(node.from, node.to), node.type.name]) },
    })
    expect(found).toContainEqual(['@endhcl', 'keyword'])
    expect(found).toContainEqual(['@startuml', 'keyword'])
    expect(found).toContainEqual(['->', 'LinkOperator'])
  })

  it('reads a line-start comment inside an array and a call', () => {
    expect(hclTokens('a {', '  list = [', '    # c', '    "a"', '  ]')).toContainEqual(['# c', 'comment'])
    expect(hclTokens('a {', '  f = g(', '    # c', '  )')).toContainEqual(['# c', 'comment'])
  })

  it('reads a uml keyword as a key, never a keyword', () => {
    expect(hclTokens('a {', '  map = { a = "x" }')).toContainEqual(['map', 'propertyName'])
    expect(hclTokens('a {', '  file = "x"')).toContainEqual(['file', 'propertyName'])
    expect(hclTokens('a {', '  file = "x"').map(([, t]) => t)).not.toContain('keyword')
  })

  it('has title and no other common line', () => {
    expect(hclTokens('title x')).toContainEqual(['title', 'keyword'])
    expect(hclTokens('skinparam x').map(([, t]) => t)).not.toContain('keyword')
  })
})
