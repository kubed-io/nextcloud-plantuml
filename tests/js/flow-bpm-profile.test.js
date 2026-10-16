// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The flow and bpm profiles: what their modes name inside `@startflow` and
// `@startbpm` blocks, read the way CodeMirror reads them.
import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { plantumlLanguage } from '../../src/editor/plantuml-mode.js'
import { core } from './helpers/core.js'
import flowProfile from '../../src/editor/profiles/flow.js'
import bpmProfile from '../../src/editor/profiles/bpm.js'

const flow = flowProfile(core)
const bpm = bpmProfile(core)
const language = plantumlLanguage({ flow: flow.mode, bpm: bpm.mode })

/** [text, token class] for every highlighted span of the lines in a block of `type`. */
function tokens(type, ...lines) {
  const doc = Text.of([`@start${type}`, ...lines, `@end${type}`])
  const out = []
  language.parser.parse(doc.toString()).iterate({
    enter(node) {
      if (!node.type.isTop) out.push([doc.sliceString(node.from, node.to), node.type.name])
    },
  })
  return out.slice(1, -1)
}
const flowTokens = (...lines) => tokens('flow', ...lines)
const bpmTokens = (...lines) => tokens('bpm', ...lines)

describe('the flow profile', () => {
  it('is the flow type with no completions or lints', () => {
    expect(flow).toMatchObject({ type: 'flow', completions: [], lints: [], values: [] })
  })

  it('reads a box: the direction a modifier, the id a classifier, the label a string', () => {
    expect(flowTokens('e work "Do the work"')).toEqual([['e', 'modifier'], ['work', 'typeName'], ['"Do the work"', 'string']])
    expect(flowTokens('foo "flow"')).toEqual([['foo', 'typeName'], ['"flow"', 'string']])
  })

  it('names a box start, never a keyword', () => {
    expect(flowTokens('start "Start"')).toEqual([['start', 'typeName'], ['"Start"', 'string']])
  })

  it('reads a link: the direction a modifier, the id plain', () => {
    expect(flowTokens('w a')).toEqual([['w', 'modifier']])
  })

  it('has no common lines (G4)', () => {
    expect(flowTokens('title X')).toEqual([])
  })
})

describe('the bpm profile', () => {
  it('is the bpm type with no completions or lints', () => {
    expect(bpm).toMatchObject({ type: 'bpm', completions: [], lints: [], values: [] })
  })

  it('reads an event as a box with Creole text', () => {
    expect(bpmTokens(':show new message;')).toEqual([[':', 'bracket'], [';', 'bracket']])
    expect(bpmTokens(':**bold**;')).toEqual([[':', 'bracket'], ['**bold**', 'strong'], [';', 'bracket']])
  })

  it('reads a merge: the id a classifier, the colon a separator, <+> a connector', () => {
    expect(bpmTokens('20:<+>')).toEqual([['20', 'typeName'], [':', 'separator'], ['<+>', 'LinkOperator']])
    expect(bpmTokens('a<+>')).toEqual([['a', 'typeName'], ['<+>', 'LinkOperator']])
  })

  it('reads resume and goto as keywords with a plain reference', () => {
    expect(bpmTokens('resume 20')).toEqual([['resume', 'keyword']])
    expect(bpmTokens('goto a')).toEqual([['goto', 'keyword']])
  })

  it('reads the branch lines as keywords', () => {
    expect(bpmTokens('new branch', 'else', 'end branch')).toEqual([['new branch', 'keyword'], ['else', 'keyword'], ['end branch', 'keyword']])
  })

  it('has no common lines (G4)', () => {
    expect(bpmTokens('title X')).toEqual([])
  })
})
