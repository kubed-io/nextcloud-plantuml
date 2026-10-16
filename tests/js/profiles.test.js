// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Which profiles a file needs, loading each once for the page, and what a
// loaded profile adds to the editor: its inner mode, completion and lint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { diagnosticCount } from '@codemirror/lint'
import { scan } from '../../src/editor/blocks.js'
import { translate } from '@nextcloud/l10n'
import { plantumlLint, profileRules } from '../../src/editor/lint/index.js'
import { fileName } from '../../src/editor/lint/state.js'
import { PROFILES, needed, profileExtension, profileLoader } from '../../src/editor/profiles/index.js'
import { valuesFacet } from '../../src/editor/values/index.js'

const neededFor = (text) => needed(scan(text), text)

const STYLE = PROFILES.style

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete PROFILES.archimate
  PROFILES.style = STYLE
})

describe('the profiles a file needs', () => {
  it('are sprites for a @startsprites block, and none for a sprite defined in a uml block (the core reads it)', () => {
    expect(neededFor('@startsprites\nsprite $a [8x4/16] {\nFF\n}\n@endsprites\n')).toEqual(new Set(['sprites']))
    expect(neededFor('@startuml\nsprite $a [8x4/16] {\nFF\n}\nA -> B\n@enduml\n')).toEqual(new Set())
  })

  it('are its block types that have a profile', () => {
    const text = '@startuml flow\nA -> B\n@enduml\n@startyaml config\na: 1\n@endyaml\n'

    expect(neededFor(text)).toEqual(new Set(['yaml']))
    expect(neededFor('@startuml\nA -> B\n@enduml\n')).toEqual(new Set())
    expect(neededFor('A -> B\n')).toEqual(new Set())
  })

  it('are mindmap and wbs only when a block of that type is in the file', () => {
    expect(neededFor('@startmindmap\n* a\n@endmindmap\n')).toEqual(new Set(['mindmap']))
    expect(neededFor('@startwbs\n* a\n@endwbs\n@startmindmap\n* b\n@endmindmap\n')).toEqual(new Set(['wbs', 'mindmap']))
    expect(neededFor('@startuml\n* a\n@enduml\n')).toEqual(new Set())
  })

  it('are regex only when a regex block is in the file', () => {
    expect(neededFor('@startregex\n^a$\n@endregex\n')).toEqual(new Set(['regex']))
    expect(neededFor('@startuml\n^a$\n@enduml\n')).toEqual(new Set())
  })

  it('are ebnf only when an ebnf block is in the file', () => {
    expect(neededFor('@startebnf\na = b ;\n@endebnf\n')).toEqual(new Set(['ebnf']))
    expect(neededFor('@startuml\na = b ;\n@enduml\n')).toEqual(new Set())
  })

  it('are chart only when a chart block is in the file', () => {
    expect(neededFor('@startchart\nbar [1,2]\n@endchart\n')).toEqual(new Set(['chart']))
    expect(neededFor('@startuml\nbar [1,2]\n@enduml\n')).toEqual(new Set())
  })

  it('are json only when a json block is in the file', () => {
    expect(neededFor('@startjson\n{}\n@endjson\n')).toEqual(new Set(['json']))
    expect(neededFor('@startuml\n{}\n@enduml\n')).toEqual(new Set())
  })

  it('are salt only when a salt block is in the file', () => {
    expect(neededFor('@startsalt\n{\n[OK]\n}\n@endsalt\n')).toEqual(new Set(['salt']))
    expect(neededFor('@startuml\n{\n[OK]\n}\n@enduml\n')).toEqual(new Set())
  })

  it('are hcl only when an hcl block is in the file', () => {
    expect(neededFor('@starthcl\na {\n}\n@endhcl\n')).toEqual(new Set(['hcl']))
    expect(neededFor('@startuml\na {\n}\n@enduml\n')).toEqual(new Set())
  })

  it('are packetdiag only when a packetdiag block is in the file', () => {
    expect(neededFor('@startpacketdiag\n0-7: a\n@endpacketdiag\n')).toEqual(new Set(['packetdiag']))
    expect(neededFor('@startuml\n0-7: a\n@enduml\n')).toEqual(new Set())
  })

  it('are nwdiag only when an nwdiag block is in the file', () => {
    expect(neededFor('@startnwdiag\na -- b\n@endnwdiag\n')).toEqual(new Set(['nwdiag']))
    expect(neededFor('@startuml\na -- b\n@enduml\n')).toEqual(new Set())
  })

  it('are chen only when a chen block is in the file', () => {
    expect(neededFor('@startchen\nentity A {\n}\n@endchen\n')).toEqual(new Set(['chen']))
    expect(neededFor('@startuml\nentity A {\n}\n@enduml\n')).toEqual(new Set())
  })

  it('are wire only when a wire block is in the file', () => {
    expect(neededFor('@startwire\n* a\n@endwire\n')).toEqual(new Set(['wire']))
    expect(neededFor('@startuml\n* a\n@enduml\n')).toEqual(new Set())
  })

  it('are flow only when a flow block is in the file', () => {
    expect(neededFor('@startflow\nfoo "flow"\n@endflow\n')).toEqual(new Set(['flow']))
    expect(neededFor('@startuml\nfoo "flow"\n@enduml\n')).toEqual(new Set())
  })

  it('are bpm only when a bpm block is in the file', () => {
    expect(neededFor('@startbpm\n:login;\n@endbpm\n')).toEqual(new Set(['bpm']))
    expect(neededFor('@startuml\n:login;\n@enduml\n')).toEqual(new Set())
  })

  it('are dot only when a dot block is in the file', () => {
    expect(neededFor('@startdot\ndigraph g {\n}\n@enddot\n')).toEqual(new Set(['dot']))
    expect(neededFor('@startuml\ndigraph g {\n@enduml\n')).toEqual(new Set())
  })

  it('include archimate when a uml block includes its library or draws an archimate element', () => {
    PROFILES.archimate = () => Promise.resolve({ default: { type: 'archimate', completions: [], lints: [] } })

    expect(neededFor('@startuml\n!include <archimate/Archimate>\n@enduml\n')).toEqual(new Set(['archimate']))
    expect(neededFor('@startuml\n  archimate #Technology "VPN" as vpn\n@enduml\n')).toEqual(new Set(['archimate']))
    expect(neededFor('!include <archimate/Archimate>\n')).toEqual(new Set(['archimate']))
    expect(neededFor('@startuml\nA -> B : archimate\n@enduml\n')).toEqual(new Set())
    expect(neededFor('@startyaml\narchimate: 1\n@endyaml\n')).toEqual(new Set(['yaml']))
  })

  it('leave out archimate while it has no profile', () => {
    expect(neededFor('@startuml\n!include <archimate/Archimate>\n@enduml\n')).toEqual(new Set())
  })
})

describe('the style profile', () => {
  it('is needed when a line starts with <style, in any block', () => {
    expect(neededFor('@startuml\n  <style>\nnote { }\n</style>\n@enduml\n')).toEqual(new Set(['style']))
    expect(neededFor('<style file=my.css>\nA -> B\n')).toEqual(new Set(['style']))
    expect(neededFor('@startyaml\n<style>\n</style>\n@endyaml\n')).toEqual(new Set(['yaml', 'style']))
    expect(neededFor('A -> B : <style>\n')).toEqual(new Set())
  })

  it('is left out while it has no profile, so the loader never asks for it', async () => {
    delete PROFILES.style
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const apply = vi.fn()
    const text = '<style>\nnote { }\n</style>\n'

    expect(neededFor(text)).toEqual(new Set())
    profileLoader(apply)(scan(text), text)
    // A type with no profile would fail to load in a microtask, and log.
    await new Promise((resolve) => setTimeout(resolve))
    expect(console.error).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('loads when a file needs it, adding its completion and its lint', async () => {
    const apply = vi.fn()
    const text = '<style>\nnote { }\n</style>\n'

    profileLoader(apply)(scan(text), text)

    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
    const state = EditorState.create({ doc: text, extensions: apply.mock.calls[0][0] })
    expect(state.languageDataAt('autocomplete', 0)).toHaveLength(1)
    expect(state.facet(profileRules)).toHaveLength(1)
  })
})

describe('loadProfile', () => {
  // What is loaded stays loaded for the page, so each test gets a new page.
  let profiles
  beforeEach(async () => {
    vi.resetModules()
    profiles = await import('../../src/editor/profiles/index.js')
  })
  const loadProfile = (type) => profiles.loadProfile(type)
  const resetProfiles = () => profiles.resetProfiles()

  it('loads the sprites profile', async () => {
    expect(await loadProfile('sprites')).toMatchObject({ type: 'sprites', completions: [], lints: [], values: [] })
  })

  it('imports a profile once for two callers', async () => {
    const yaml = vi.spyOn(profiles.PROFILES, 'yaml')

    const [first, second] = await Promise.all([loadProfile('yaml'), loadProfile('yaml')])

    expect(yaml).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(first).toMatchObject({ type: 'yaml', completions: [], lints: [expect.any(Function)] })
    expect(typeof first.mode.token).toBe('function')
  })

  it('makes the profile from its module\'s factory, handing it the core it needs: the scan, the translator and the lexicon', async () => {
    const made = { type: 'yaml', completions: [], lints: [] }
    const factory = vi.fn(() => made)
    vi.spyOn(profiles.PROFILES, 'yaml').mockResolvedValue({ default: factory })

    expect(await loadProfile('yaml')).toBe(made)
    expect(factory).toHaveBeenCalledTimes(1)
    const [[core]] = factory.mock.calls
    expect(Object.keys(core)).toEqual(['scan', 't', 'lex'])
    expect(core.t).toBe(translate)
    expect(core.scan('@startyaml\na: 1\n@endyaml')[0]).toMatchObject({ type: 'yaml', start: 1, end: 3 })
  })

  it('logs a profile that will not load once, gives null, and tries again only after a reset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const yaml = vi.spyOn(profiles.PROFILES, 'yaml').mockRejectedValue(new Error('404'))

    expect(await loadProfile('yaml')).toBeNull()
    expect(await loadProfile('yaml')).toBeNull()
    expect(yaml).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)

    resetProfiles()
    yaml.mockRestore()
    expect(await loadProfile('yaml')).toMatchObject({ type: 'yaml' })
  })

  it('keeps a loaded profile across a reset', async () => {
    const yaml = vi.spyOn(profiles.PROFILES, 'yaml')
    const profile = await loadProfile('yaml')

    resetProfiles()

    expect(await loadProfile('yaml')).toBe(profile)
    expect(yaml).toHaveBeenCalledTimes(1)
  })
})

describe('profileExtension', () => {
  const profiles = new Compartment()
  const word = (stream) => { stream.skipToEnd(); return 'atom' }

  it('adds each profile\'s values to the value registry', () => {
    const entry = { match: () => [] }
    const state = EditorState.create({ extensions: profileExtension([{ type: 'style', completions: [], lints: [], values: [entry] }]) })

    expect(state.facet(valuesFacet)).toEqual([entry])
    expect(state.facet(profileRules)).toEqual([])
  })

  it('registers each profile\'s completion sources as language data', () => {
    const source = () => null
    const state = EditorState.create({
      extensions: profileExtension([{ type: 'yaml', mode: { token: word }, completions: [source], lints: [] }]),
    })

    expect(state.languageDataAt('autocomplete', 0)).toEqual([source])
  })

  it('runs each profile\'s lint rules beside the core ones, from the moment it arrives', async () => {
    vi.useFakeTimers()
    const rule = vi.fn((state) => [{ from: 0, to: state.doc.length, severity: 'error', message: 'yaml' }])
    const view = new EditorView({
      state: EditorState.create({
        doc: '@startyaml config\na: 1\n@endyaml\n',
        extensions: [profiles.of(profileExtension([])), plantumlLint, fileName.of('Config.puml')],
      }),
      parent: document.body,
    })
    await vi.advanceTimersByTimeAsync(2000)
    expect(diagnosticCount(view.state)).toBe(0)

    view.dispatch({ effects: profiles.reconfigure(profileExtension([{ type: 'yaml', completions: [], lints: [rule] }])) })
    await vi.advanceTimersByTimeAsync(2000)

    expect(view.state.facet(profileRules)).toEqual([rule])
    expect(rule).toHaveBeenCalled()
    expect(diagnosticCount(view.state)).toBe(1)
    view.destroy()
  })
})
