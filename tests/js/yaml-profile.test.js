// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The YAML profile: what its mode names inside a `@startyaml` block, read the
// way CodeMirror reads it.
import { describe, expect, it } from 'vitest'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import yamlProfile from '../../src/editor/profiles/yaml.js'
import { blockTokens } from './helpers/tokens.js'

const profile = yamlProfile(core)

/** [text, token class] for every highlighted span of the lines in a yaml block. */
const tokens = (...lines) => blockTokens(plantumlLanguage({ yaml: profile.mode }), 'yaml', lines)

describe('the yaml profile', () => {
  it('is made from the core it is given: the yaml type with its lint and no completions', () => {
    expect(profile).toMatchObject({ type: 'yaml', completions: [], lints: [expect.any(Function)] })
    expect(profile.lints[0]).not.toBe(yamlProfile(core).lints[0])
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

  it("reads a /' … '/ comment as PlantUML's, down to its closer", () => {
    expect(tokens("/' a", 'key: value', "'/", 'key: value')).toEqual([
      ["/' a", 'comment'], ['key: value', 'comment'], ["'/", 'comment'], ['key', 'atom'], [': ', 'meta'],
    ])
  })

  it('carries on with yaml after a #highlight line', () => {
    expect(tokens('#highlight "a"', 'key: value')).toEqual([['#highlight "a"', 'meta'], ['key', 'atom'], [': ', 'meta']])
  })
})
