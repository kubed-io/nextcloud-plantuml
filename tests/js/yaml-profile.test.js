// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The YAML profile: what its mode names inside a `@startyaml` block, read the
// way CodeMirror reads it.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import profile from '../../src/editor/profiles/yaml.js'
import { yamlLint } from '../../src/editor/lint/yaml.js'

/** [text, token class] for every highlighted span of the lines in a yaml block. */
function tokens(...lines) {
  const doc = Text.of(['@startyaml', ...lines, '@endyaml'])
  const out = []
  plantumlLanguage({ yaml: profile.mode }).parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}

describe('the yaml profile', () => {
  it('is the yaml type with its lint and no completions', () => {
    expect(profile).toMatchObject({ type: 'yaml', completions: [], lints: [yamlLint] })
  })

  it('names a key and leaves a plain value plain', () => {
    expect(tokens('key: value')).toEqual([['key', 'atom'], [': ', 'meta']])
  })

  it('names the list marker', () => {
    expect(tokens('- item')).toEqual([['- ', 'meta']])
  })

  it('names a #highlight line, indented or not, as meta, where yaml sees a comment', () => {
    expect(tokens('#highlight "a" / "b"')).toEqual([['#highlight "a" / "b"', 'meta']])
    expect(tokens('  #highlight "a"')).toEqual([['  #highlight "a"', 'meta']])
    expect(tokens('# a comment')).toEqual([['# a comment', 'comment']])
  })

  it('carries on with yaml after a #highlight line', () => {
    expect(tokens('#highlight "a"', 'key: value')).toEqual([['#highlight "a"', 'meta'], ['key', 'atom'], [': ', 'meta']])
  })
})
