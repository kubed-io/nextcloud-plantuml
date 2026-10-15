// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each completion source against a real EditorState: `|` in a document marks
// the cursor, and what is asserted is what the popup would offer from where.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext, autocompletion, nextSnippetField, completionStatus, currentCompletions, insertCompletionText, pickedCompletion, startCompletion } from '@codemirror/autocomplete'
import { plantumlLanguage, plantumlMode } from '../../src/editor/plantuml-mode.js'
import { plantumlCompletion, sources } from '../../src/editor/completion/index.js'
import { directives } from '../../src/editor/completion/directives.js'
import { keywords } from '../../src/editor/completion/keywords.js'
import { names } from '../../src/editor/completion/names.js'
import { snippets } from '../../src/editor/completion/snippets.js'
import { values } from '../../src/editor/completion/values.js'
import { connectors } from '../../src/editor/completion/connectors.js'
import { styleTag } from '../../src/editor/completion/style-tag.js'
import { filesNote } from '../../src/editor/completion/files-note.js'
import { stdlib } from '../../src/editor/completion/stdlib.js'
import { creole } from '../../src/editor/completion/creole.js'
import { tagAttributes } from '../../src/editor/completion/tag-attributes.js'
import { icons } from '../../src/editor/completion/icons.js'
import { emoji } from '../../src/editor/completion/emoji.js'
import { builtins } from '../../src/editor/completion/builtins.js'
import { localFiles } from '../../src/editor/completion/local-files.js'
import { colors } from '../../src/editor/completion/colors.js'
import { styleCompletion } from '../../src/editor/completion/style.js'
import { scan } from '../../src/editor/blocks.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import styleProfile from '../../src/editor/profiles/style.js'
import vocabulary from '../../src/editor/data/vocabulary.json'
import preprocessor from '../../src/editor/data/directives.json'
import { filePath } from '../../src/editor/lint/state.js'
import { listFolder, loadFile } from '../../src/editor/save.js'

vi.mock('../../src/editor/save.js', () => ({ listFolder: vi.fn(), loadFile: vi.fn() }))

function stateAt(marked) {
  const pos = marked.indexOf('|')
  return { pos, state: EditorState.create({ doc: marked.replace('|', ''), extensions: [plantumlMode, plantumlCompletion] }) }
}

function complete(source, marked, explicit = false) {
  const { state, pos } = stateAt(marked)
  return source(new CompletionContext(state, pos, explicit))
}

const labels = (result) => result.options.map((option) => option.label)

describe('the completion sources', () => {
  it('are each registered through the PlantUML language data, in order', () => {
    const { state, pos } = stateAt('|')
    expect(state.languageDataAt('autocomplete', pos)).toEqual(sources)
    expect(sources).toEqual([directives, keywords, names, snippets, values, connectors, styleTag, filesNote, stdlib, creole, tagAttributes, icons, emoji, colors, builtins, localFiles])
  })

  it('stay registered when the language is swapped for one with an inner mode', () => {
    const language = new Compartment()
    const before = EditorState.create({ doc: '@st', extensions: [language.of(plantumlMode), plantumlCompletion] })
    const yaml = { token: (stream) => { stream.skipToEnd(); return 'atom' } }
    const { state } = before.update({ effects: language.reconfigure(plantumlLanguage({ yaml })) })

    expect(state.languageDataAt('autocomplete', 3)).toEqual(sources)
    expect(labels(directives(new CompletionContext(state, 3, false)))).toContain('@startuml')
  })
})

/** Applies `option` from `result` in a real view, as picking it in the popup does. */
function pick(marked, source, label) {
  const { state, pos } = stateAt(marked)
  const view = new EditorView({ state, parent: document.body })
  const result = source(new CompletionContext(view.state, pos, false))
  const option = result.options.find((candidate) => candidate.label === label)
  if (typeof option.apply === 'function') {
    option.apply(view, option, result.from, pos)
  } else {
    view.dispatch(insertCompletionText(view.state, option.apply ?? option.label, result.from, pos))
  }
  return view
}

describe('directives', () => {
  it('offers the @start and @end lines after an @ at the start of a line', () => {
    const result = complete(directives, '  @st|')

    expect(result.from).toBe(2)
    expect(labels(result)).toEqual(expect.arrayContaining(['@startuml', '@enduml', '@startmindmap', '@endgantt', '@startjson', '@endyaml', '@startwbs']))
    expect(result.options.every((option) => option.type === 'keyword')).toBe(true)
  })

  it('offers nothing after an @ anywhere else on the line', () => {
    expect(complete(directives, 'A -> B : mail @|')).toBeNull()
  })

  it('offers the preprocessor lines after a ! at the start of a line, and only those', () => {
    const result = complete(directives, '  !th|')

    expect(result.from).toBe(2)
    expect(labels(result)).toEqual(expect.arrayContaining(['!theme', '!include', '!define', '!pragma']))
    expect(labels(complete(directives, '@|'))).not.toContain('!theme')
    expect(complete(directives, 'A -> B : wow !|')).toBeNull()
  })

  it('leaves the cursor after a space when a preprocessor line is picked, ready for its argument', () => {
    const view = pick('!th|', directives, '!theme')

    expect(view.state.doc.toString()).toBe('!theme ')
    expect(view.state.selection.main.head).toBe('!theme '.length)
    view.destroy()
  })
})

describe('every ! directive', () => {
  const doc = (marked, label) => pick(marked, directives, label)

  it('offers each word of the generated list, and the assignment', () => {
    expect(labels(complete(directives, '!|')).sort()).toEqual([...preprocessor.directives, '!$'].sort())
    expect(labels(complete(directives, '!$|'))).toContain('!$')
  })

  // The stops in the spec's field order (X3): each field selected in turn, the body last, `!$` ending on its value.
  it.each([
    ['!if', '!if condition\n\n!endif', ['!if condition', '!if condition\n']],
    ['!while', '!while condition\n\n!endwhile', ['!while condition', '!while condition\n']],
    ['!foreach', '!foreach $item in list\n\n!endfor', ['!foreach $item', '!foreach $item in list', '!foreach $item in list\n']],
    ['!procedure', '!procedure $name()\n\n!endprocedure', ['!procedure $name', '!procedure $name(', '!procedure $name()\n']],
    ['!function', '!function $name()\n!return \n!endfunction', ['!function $name', '!function $name(', '!function $name()\n!return ']],
    ['!startsub', '!startsub NAME\n\n!endsub', ['!startsub NAME', '!startsub NAME\n']],
    ['!$', '!$name = value', ['!$name', '!$name = value']],
  ])('inserts %s as a block and visits its fields in order, ending on the body or value', (label, text, stops) => {
    const view = doc(`${label.slice(0, 2)}|`, label)

    expect(view.state.doc.toString()).toBe(text)
    const heads = [view.state.selection.main.head]
    for (let i = 1; i < stops.length; i++) {
      nextSnippetField(view)
      heads.push(view.state.selection.main.head)
    }
    expect(heads).toEqual(stops.map((stop) => stop.length))
    view.destroy()
  })

  it('still inserts a plain word and a space', () => {
    for (const label of ['!theme', '!include', '!pragma', '!undef']) {
      const view = doc(`${label.slice(0, 3)}|`, label)

      expect(view.state.doc.toString()).toBe(`${label} `)
      view.destroy()
    }
  })

  it('offers the way out of an open conditional first', () => {
    expect(labels(complete(directives, '!if $a\n!if $b\n!endif\n!|')).slice(0, 3)).toEqual(['!else', '!elseif', '!endif'])
    expect(complete(directives, '!if $a\n!if $b\n!endif\n!|').options.filter((o) => o.boost === 2)).toHaveLength(3)
    expect(complete(directives, '!if $a\n!endif\n!|').options.some((o) => o.boost)).toBe(false)
    expect(complete(directives, "/'\n!if $a\n'/\n!|").options.some((o) => o.boost)).toBe(false)
    expect(labels(complete(directives, '!ifdef A\n!|')).slice(0, 3)).toEqual(['!else', '!elseif', '!endif'])
  })
})

describe('whole-block directives', () => {
  it('offers salt, regex and ebnf, which the unnamed-start warning then covers', () => {
    expect(labels(complete(directives, '@|'))).toEqual(expect.arrayContaining(['@startsalt', '@endsalt', '@startregex', '@endregex', '@startebnf', '@endebnf']))
  })

  it('inserts a salt block with the name selected first', () => {
    const view = pick('@startsa|', directives, '@startsalt')

    expect(view.state.doc.toString()).toBe('@startsalt name\n{\n  \n}\n@endsalt')
    const { from, to } = view.state.selection.main
    expect(view.state.sliceDoc(from, to)).toBe('name')
    view.destroy()
  })

  it('inserts an empty line for a body that is not braces', () => {
    const view = pick('@startum|', directives, '@startuml')

    expect(view.state.doc.toString()).toBe('@startuml name\n\n@enduml')
    view.destroy()
  })

  it('offers only the open block\'s end inside a block with no end yet', () => {
    const ends = (marked) => labels(complete(directives, marked)).filter((label) => label.startsWith('@end'))

    expect(ends('@startjson a\n{}\n@end|')).toEqual(['@endjson'])
    expect(ends('@startjson a\n{}\n@|')).toEqual(['@endjson'])
    expect(ends('@startjson a\n{}\n@endjson\n@end|')).toContain('@enduml')
    expect(ends('@end|')).toContain('@enduml')
    expect(ends('@startjson a\n{}\n@end|\n@endjson\n')).toContain('@enduml')
  })
})

// Themes come through the value registry (W3), as every value with a list does.
describe('themes', () => {
  const THEMES = ['_none_', 'cerulean', 'cerulean-outline', 'vibrant']
  let fetch
  let themesSource

  // The list is fetched once per page, so each test loads a fresh module.
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = vi.fn(async () => new Response(JSON.stringify({ themes: THEMES }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    themesSource = (await import('../../src/editor/completion/values.js')).values
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers the server\'s themes after !theme and a space', async () => {
    const result = await complete(themesSource, '!theme |')

    expect(result).toMatchObject({ from: '!theme '.length, to: '!theme '.length })
    expect(labels(result)).toEqual(THEMES)
    expect(result.options.every((option) => option.type === 'constant')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/themes', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('keeps offering them over a half-typed name, after any indentation', async () => {
    const result = await complete(themesSource, '  !theme cerulean-o|')

    expect(result).toMatchObject({ from: '  !theme '.length, to: '  !theme cerulean-o'.length })
    expect(result.validFor.test('cerulean-out')).toBe(true)
  })

  it('replaces the whole name from anywhere in it', async () => {
    const result = await complete(themesSource, '!theme ceru|lean')

    expect(result).toMatchObject({ from: '!theme '.length, to: '!theme cerulean'.length })
  })

  it('offers the whole list on Ctrl-Space inside a name, the current one first', async () => {
    const result = await complete(themesSource, '!theme ceru|lean', true)

    expect(result).toMatchObject({ from: '!theme '.length, to: '!theme cerulean'.length, filter: false })
    expect(labels(result)).toEqual(['cerulean', '_none_', 'cerulean-outline', 'vibrant'])
  })

  it('filters again by what is typed after Ctrl-Space', async () => {
    const pos = '!theme ceru'.length
    const view = new EditorView({
      state: EditorState.create({ doc: '!theme cerulean', selection: { anchor: pos }, extensions: [plantumlMode, EditorState.languageData.of(() => [{ autocomplete: themesSource }]), autocompletion()] }),
      parent: document.body,
    })
    startCompletion(view)
    await vi.waitFor(() => expect(currentCompletions(view.state)).toHaveLength(THEMES.length))

    view.dispatch({ changes: { from: '!theme '.length, to: '!theme cerulean'.length, insert: 'v' }, selection: { anchor: '!theme v'.length }, userEvent: 'input.type' })
    await vi.waitFor(() => expect(currentCompletions(view.state).map((option) => option.label)).toEqual(['vibrant']))
    view.destroy()
  })

  it('offers nothing once the name is done, or anywhere but a !theme line', async () => {
    expect(await complete(themesSource, '!theme cerulean |')).toBeNull()
    expect(await complete(themesSource, 'A -> B : !theme |')).toBeNull()
    expect(await complete(themesSource, '!themes |')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks the server once, however often it is asked', async () => {
    await complete(themesSource, '!theme |')
    await complete(themesSource, '!theme c|')
    await complete(themesSource, '!theme ce|')

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('offers nothing when the server cannot answer, and does not ask again on every key', async () => {
    fetch.mockImplementation(async () => new Response('{"problem":"unreachable"}', { status: 503 }))

    expect(labels(await complete(themesSource, '!theme |'))).toEqual([])
    expect(labels(await complete(themesSource, '!theme c|'))).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('offers nothing when the request itself fails', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(labels(await complete(themesSource, '!theme |'))).toEqual([])
  })
})

/** A server list route answering `body`, as `GET /apps/plantuml/<name>` does. */
function answering(body) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('a tag\'s values', () => {
  it('offers valign\'s three on Ctrl-Space, the current one first', async () => {
    expect(labels(await complete(values, '<img valign=|>', true))).toEqual(['top', 'middle', 'bottom'])
    expect(labels(await complete(values, '<img valign=mid|dle>', true))).toEqual(['middle', 'top', 'bottom'])
  })
})

describe('icons', () => {
  const ICONS = ['account-login', 'clock', 'cloud-download', 'zoom-out']
  let fetch
  let iconsSource

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = answering({ icons: ICONS })
    vi.stubGlobal('fetch', fetch)
    iconsSource = (await import('../../src/editor/completion/icons.js')).icons
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers the server\'s icons after <& anywhere in a line', async () => {
    const marked = 'A -> B : <&cl|'
    const result = await complete(iconsSource, marked)

    expect(result.from).toBe('A -> B : <&'.length)
    expect(labels(result)).toEqual(ICONS)
    expect(result.options.every((option) => option.type === 'constant')).toBe(true)
    expect(result.validFor.test('cloud-d')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/icons', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('closes the tag when one is picked', async () => {
    const { state, pos } = stateAt('title <&cl|')
    const view = new EditorView({ state, parent: document.body })
    const result = await iconsSource(new CompletionContext(view.state, pos, false))
    const clock = result.options.find((option) => option.label === 'clock')

    view.dispatch(insertCompletionText(view.state, clock.apply, result.from, pos))

    expect(view.state.doc.toString()).toBe('title <&clock>')
    view.destroy()
  })

  it('offers nothing without the <&, and asks the server only once', async () => {
    expect(await complete(iconsSource, 'A -> B : & cl|')).toBeNull()
    expect(await complete(iconsSource, 'A <- B|')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()

    await complete(iconsSource, '<&|')
    await complete(iconsSource, 'x <&c|')

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('offers nothing on a ! line, and does not ask', async () => {
    expect(await complete(iconsSource, '!define X <&|')).toBeNull()
    expect(await complete(iconsSource, '  !$icon = "<&cl|')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('offers nothing when the server cannot answer', async () => {
    fetch.mockImplementation(async () => new Response('{"problem":"unreachable"}', { status: 503 }))

    expect(labels(await complete(iconsSource, '<&|'))).toEqual([])
    expect(labels(await complete(iconsSource, '<&c|'))).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('emoji', () => {
  const EMOJI = ['+1', '1st_place_medal', 'smile', 'sunny']
  let fetch
  let emojiSource

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = answering({ emoji: EMOJI })
    vi.stubGlobal('fetch', fetch)
    emojiSource = (await import('../../src/editor/completion/emoji.js')).emoji
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers the server\'s emoji after <: anywhere in a line', async () => {
    const result = await complete(emojiSource, 'note left: well done <:su|')

    expect(result.from).toBe('note left: well done <:'.length)
    expect(labels(result)).toEqual(EMOJI)
    expect(result.validFor.test('1st_pl')).toBe(true)
    expect(result.validFor.test('+1')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/emoji', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('closes the tag when one is picked', async () => {
    const { state, pos } = stateAt('<:su|')
    const view = new EditorView({ state, parent: document.body })
    const result = await emojiSource(new CompletionContext(view.state, pos, false))
    const sunny = result.options.find((option) => option.label === 'sunny')

    view.dispatch(insertCompletionText(view.state, sunny.apply, result.from, pos))

    expect(view.state.doc.toString()).toBe('<:sunny:>')
    view.destroy()
  })

  it('offers nothing on a ! line, and does not ask', async () => {
    expect(await complete(emojiSource, '!define X <:|')).toBeNull()
    expect(await complete(emojiSource, '  !$e = "<:su|')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('offers nothing without the <:, and nothing when the request fails', async () => {
    expect(await complete(emojiSource, ':Customer: |')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(labels(await complete(emojiSource, '<:|'))).toEqual([])
  })
})

describe('named colours', () => {
  const COLORS = { APPLICATION: '#C2F0FF', AliceBlue: '#F0F8FF', Red: '#FF0000', Odd: null }
  let fetch
  let colorsSource

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = answering({ colors: COLORS })
    vi.stubGlobal('fetch', fetch)
    colorsSource = (await import('../../src/editor/completion/colors.js')).colors
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    'actor Bob #|',
    'node x #Al|',
    'rectangle "My #1" as R <<s>> #|',
    'archimate #|',
    'A -[#|',
    'A -[bold,#|',
    'A -> B : <color:#|',
    'title <back:#Al|',
    'skinparam ArrowColor #|',
    'skinparam class {\n  BackgroundColor #|',
    '<style>\nnode {\n  BackGroundColor #|',
    '<style>note { FontSize 2; LineColor #|}</style>',
  ])('offers the server\'s colours, each with its swatch, after the # in `%s`', async (marked) => {
    const result = await complete(colorsSource, marked)

    expect(result.from).toBe(marked.lastIndexOf('#') + 1)
    expect(labels(result)).toEqual(Object.keys(COLORS))
    expect(result.options.map((option) => option.swatch)).toEqual(Object.values(COLORS))
    expect(result.validFor.test('AliceB')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/colors', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it.each([
    '#|',
    '  #high|',
    'node x #line.|',
    'node x #Red;line:|',
    "' actor Bob #|",
    'note left: see #|',
    'A -> B : issue #|',
    'actor "Bob #|',
    'Bob -> Alice #|',
    'A -> B : font color #|',
    'A -> B : LineColor #|',
    'note right\n  font color #|\nend note',
    'note right\n  LineColor #|\nend note',
    'title BackgroundColor #|',
    '<style>\nnote #|\n</style>',
    '<style>note { FontSize 2; LineColor #|',
  ])('offers none in `%s`', async (marked) => {
    expect(await complete(colorsSource, marked)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  // W4: a Creole tag's colour, with or without a `#`.
  it.each([
    '<font color=|',
    '<font size=12 color=re|',
    'A -> B : <u:|',
    'A -> B : <w:Al|',
    'A -> B : <s:|',
    'A -> B : <color:|',
    'A -> B : <back:Re|',
    '<&star{color=|',
    '<&star{scale=2,color=Al|',
    '<&star{color:|',
    'A -> B : <:sunny:{color=|',
    'A -> B : <$box>{color=|',
  ])('offers the server\'s colours, each with its swatch, in the tag `%s`', async (marked) => {
    const result = await complete(colorsSource, marked)
    const typed = /\w*(?=\|)/.exec(marked)[0]

    expect(result.from).toBe(marked.indexOf('|') - typed.length)
    expect(labels(result)).toEqual(Object.keys(COLORS))
    expect(result.options.map((option) => option.swatch)).toEqual(Object.values(COLORS))
  })

  it('offers the names inside an open quoted font colour, and inserts inside the quotes', async () => {
    const result = await complete(colorsSource, '<font color="re|')

    expect(result.from).toBe('<font color="'.length)
    expect(labels(result)).toEqual(Object.keys(COLORS))
    expect(result.options.map((option) => option.swatch)).toEqual(Object.values(COLORS))
    expect(await complete(colorsSource, 'A -> B : "<font color=re|')).toBeNull()
  })

  it.each(['<font size=|', 'A -> B : <b>color=|', '<&star{scale=|', 'A -> B : {color=|', 'A -> B : <img:x.png{color=|'])('offers none in `%s`', async (marked) => {
    expect(await complete(colorsSource, marked)).toBeNull()
  })

  // X9: plantuml.com writes `BackgroundColor lightGreen`.
  it.each([
    '<style>\nnode {\n  BackgroundColor |\n}\n</style>',
    '<style>\nnode {\n  LineColor li|',
    '<style>node { FontSize 2; FontColor |}</style>',
  ])('offers the names without a # after a style colour property and a space in `%s`', async (marked) => {
    const result = await complete(colorsSource, marked)
    const typed = /\w*(?=\|)/.exec(marked)[0]

    expect(result.from).toBe(marked.indexOf('|') - typed.length)
    expect(labels(result)).toEqual(Object.keys(COLORS))
    expect(result.options.map((option) => option.swatch)).toEqual(Object.values(COLORS))
  })

  // X13: `colors <colour>` draws the shades around one.
  it.each(['@startuml\ncolors |\n@enduml', '@startuml\n  colors Al|\n@enduml'])('offers the names after colors on a line of its own in a uml block (%j)', async (marked) => {
    const result = await complete(colorsSource, marked)
    const typed = /\w*(?=\|)/.exec(marked)[0]

    expect(result.from).toBe(marked.indexOf('|') - typed.length)
    expect(labels(result)).toEqual(Object.keys(COLORS))
  })

  it.each([
    'skinparam ArrowColor |',
    'node {\n  LineColor |\n}',
    '<style>\nnode {\n  FontSize |\n}\n</style>',
    '@startuml\ncolors | x\n@enduml',
    '@startmindmap\ncolors |\n@endmindmap',
    'colors |',
    '@startuml\nA -> B : colors |\n@enduml',
  ])('offers no names without a # in `%s`', async (marked) => {
    expect(await complete(colorsSource, marked)).toBeNull()
  })

  it('asks the server once, and offers none when it cannot answer', async () => {
    fetch.mockImplementation(async () => new Response('{"problem":"unreachable"}', { status: 503 }))

    expect(labels(await complete(colorsSource, 'actor Bob #|'))).toEqual([])
    expect(labels(await complete(colorsSource, 'actor Bob #A|'))).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps only names with a hex or none', async () => {
    fetch.mockImplementation(answering({ colors: { Good: '#00FF00', Bad: 'red', Worse: 7, None: null } }))

    const result = await complete(colorsSource, 'actor Bob #|')

    expect(labels(result)).toEqual(['Good', 'None'])
  })
})

describe('creole', () => {
  it('offers the text tags after a < in text', () => {
    const marked = 'A -> B : <|'
    const result = complete(creole, marked)

    expect(result.from).toBe(marked.indexOf('<'))
    expect(labels(result)).toEqual(expect.arrayContaining([
      '<b>', '<i>', '<u>', '<s>', '<w>', '<plain>', '<size:12>', '<color:#>', '<back:#>', '<font:name>', '<sub>', '<sup>', '<img:url>', '<r>',
    ]))
    expect(result.options.every((option) => option.type === 'text' && option.detail)).toBe(true)
    expect(result.validFor.test('<si')).toBe(true)
    expect(result.validFor.test('<size:')).toBe(false)
  })

  it.each([
    ['at the start of a line of text', '<|', 0],
    ['over a half-typed tag', 'title Big <si|', 'title Big '.length],
    ['after a keyword', 'title <|', 'title '.length],
    ['inside a note', 'note right: a <|', 'note right: a '.length],
  ])('offers them %s', (_where, marked, from) => {
    expect(complete(creole, marked).from).toBe(from)
  })

  it.each([
    ['in a stereotype', 'class Order <<|'],
    ['on a <style> line', '<style> <|'],
    ['on a line that starts with <<', '<<Entity>> <|'],
    ['in a comment', "' a <|"],
    ['where a connector is due', 'Customer <|'],
    ['over an icon', 'title <&|'],
    ['over an emoji', 'title <:|'],
    ['on a !define line', '!define X <|'],
    ['over a tag on a !define line', '  !define X <b|'],
    ['for a closer on a ! line', '!$label = "<b>x</|'],
  ])('offers nothing %s', (_where, marked) => {
    expect(complete(creole, marked)).toBeNull()
  })

  it('wraps the text in the tag, with the cursor between', () => {
    const view = pick('title <b|', creole, '<b>')

    expect(view.state.doc.toString()).toBe('title <b></b>')
    expect(view.state.selection.main.head).toBe('title <b>'.length)
    view.destroy()
  })

  it('selects a tag\'s value for typing over', () => {
    const view = pick('title <si|', creole, '<size:12>')
    const { from, to } = view.state.selection.main

    expect(view.state.doc.toString()).toBe('title <size:12>')
    expect(view.state.sliceDoc(from, to)).toBe('12')
    view.destroy()
  })

  it('offers <code> with an empty line between its tags, the cursor on it, and <r>', () => {
    const view = pick('note left\n<co|', creole, '<code>')

    expect(view.state.doc.toString()).toBe('note left\n<code>\n\n</code>')
    expect(view.state.selection.main.head).toBe('note left\n<code>\n'.length)
    expect(labels(complete(creole, 'title <|'))).toContain('<r>')
    view.destroy()
  })

  // A `<code>` block opens on a line of its own.
  it.each(['A -> B : <|', 'title <|', 'note right: x <|'])('offers no <code> in the one-line label of `%s`, and the inline tags still', (marked) => {
    const shown = labels(complete(creole, marked))

    expect(shown).not.toContain('<code>')
    expect(shown).toEqual(expect.arrayContaining(['<b>', '<size:12>', '<r>']))
  })

  it('offers the closers of the tags still open on the line after </, innermost first', () => {
    const marked = 'A -> B : <b>big <size:20><i>and</i> <color:red>loud</|'
    const result = complete(creole, marked)

    expect(result.from).toBe(marked.indexOf('</|'))
    expect(labels(result)).toEqual(['</color>', '</size>', '</b>'])
    expect(result.options[0].boost).toBeGreaterThan(result.options[2].boost)
  })

  it('offers no closer when nothing is open on the line', () => {
    expect(complete(creole, '<b>bold</b>\nnext </|')).toBeNull()
    expect(complete(creole, '<img:x.png> </|')).toBeNull()
  })
})

describe('style tags', () => {
  const TAGS = ['<b>', '<i>', '<u>', '<s>', '<w>', '<plain>', '<size:12>', '<color:#>', '<back:#>', '<font:name>', '<sub>', '<sup>', '<img:url>']

  /** The labels the popup shows at the cursor, in its order. */
  async function popup(marked) {
    const { state, pos } = stateAt(marked)
    const view = new EditorView({ state, parent: document.body })
    view.dispatch({ selection: { anchor: pos } })
    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    const shown = currentCompletions(view.state).map((option) => option.label)
    view.destroy()
    return shown
  }

  it.each(['<|', '  <|', '  <sty|'])('offers <style> and <style file= first at the start of a line, then the Creole tags (%s)', async (marked) => {
    const shown = await popup(marked)

    expect(shown.slice(0, 2)).toEqual(['<style>', '<style file='])
    if (!marked.includes('sty')) {
      expect(shown.slice(2)).toEqual(expect.arrayContaining(TAGS))
    }
  })

  it('offers only the Creole tags after a < mid-line', async () => {
    const shown = await popup('title <|')

    expect(shown).toEqual(expect.arrayContaining(TAGS))
    expect(shown).not.toContain('<style>')
    expect(complete(styleTag, 'title <|')).toBeNull()
    expect(complete(styleTag, 'A -> B : x <|')).toBeNull()
  })

  it('inserts a style block with the cursor on its empty, indented line', () => {
    const view = pick('<|', styleTag, '<style>')

    expect(view.state.doc.toString()).toBe('<style>\n  \n</style>')
    expect(view.state.selection.main.head).toBe('<style>\n  '.length)
    view.destroy()
  })

  it('inserts a style sheet import with the cursor at its path', () => {
    const view = pick('  <st|', styleTag, '<style file=')

    expect(view.state.doc.toString()).toBe('  <style file=>')
    expect(view.state.selection.main.head).toBe('  <style file='.length)
    view.destroy()
  })
})

describe('files diagrams', () => {
  it('offers @startfiles and inserts the whole block', () => {
    expect(labels(complete(directives, '@st|'))).toContain('@startfiles')
    expect(labels(complete(directives, '@|'))).toContain('@endfiles')
    const view = pick('@startfi|', directives, '@startfiles')

    expect(view.state.doc.toString()).toBe('@startfiles name\n/\n@endfiles')
    view.destroy()
  })

  it('offers <note> first on an empty line inside a files block, and not outside one', async () => {
    const inside = complete(filesNote, '@startfiles x\n/a\n<|\n@endfiles')
    expect(labels(inside)).toEqual(['<note>'])
    expect(labels(complete(filesNote, '@startfiles x\n  <no|'))).toEqual(['<note>'])
    expect(complete(filesNote, '@startuml x\n<|\n@enduml')).toBeNull()
    expect(complete(filesNote, '@startfiles x\n/a\n@endfiles\n<|')).toBeNull()
    expect(complete(filesNote, '<|')).toBeNull()
    expect(complete(filesNote, '@startfiles x\nfoo <|')).toBeNull()
  })

  it('inserts <note>, an empty line and </note>', () => {
    const view = pick('@startfiles x\n<|', filesNote, '<note>')

    expect(view.state.doc.toString()).toBe('@startfiles x\n<note>\n\n</note>')
    view.destroy()
  })
})

describe('connectors', () => {
  it.each([
    ['an identifier', 'node1 |'],
    ['a quoted name', '"Order flow" |'],
    ['a bracketed component', '  [Shop] |'],
    ['a use case', '(Check out) |'],
    ['an actor', ':Customer: |'],
  ])('are offered after %s and a space', (_what, marked) => {
    const result = complete(connectors, marked)

    expect(result.from).toBe(marked.indexOf('|'))
    expect(labels(result)).toEqual(expect.arrayContaining(['-->', '->', '--', '..', '~~', '==', '<-', '<->', '--|>', '..|>', '*--', 'o--', '-up->', '-[hidden]-']))
    expect(result.options.every((option) => option.type === 'operator' && option.detail)).toBe(true)
  })

  it('put the commonest first', () => {
    const { options } = complete(connectors, 'node1 |')
    const byBoost = [...options].sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0))

    expect(byBoost.slice(0, 4).map((option) => option.label)).toEqual(['-->', '->', '--', '..'])
  })

  it('keep offering over a half-typed connector', () => {
    const result = complete(connectors, 'node1 -|')

    expect(result.from).toBe('node1 '.length)
    expect(result.validFor.test('-u')).toBe(true)
    expect(complete(connectors, 'node1 <|').from).toBe('node1 '.length)
  })

  it.each([
    ['a declaring keyword', 'node |'],
    ['another declaring keyword', 'actor |'],
    ['a block keyword', 'loop |'],
    ['a directive', '@startuml |'],
    ['an arrow message', 'A -> B : hello |'],
    ['a finished arrow', 'node1 -> B |'],
    ['the reference still being typed', 'nod|e1 '],
    ['the reference before its space', 'node1|'],
    ['a comment', "' node1 |"],
    ['a helper command', '@startuml\ncolors |\n@enduml'],
    ['a two-word helper command', '@startuml\nhelp |\n@enduml'],
  ])('are not offered after %s', (_what, marked) => {
    expect(complete(connectors, marked)).toBeNull()
  })

  // The chooser asks at the start of the value it selects.
  it.each([
    ['a style property\'s value', '<style>\nnode {\n  FontStyle |bold\n}\n</style>'],
    ['a style property\'s empty value', '<style>\nnode {\n  FontStyle |\n}\n</style>'],
  ])('are not offered where %s sits', (_what, marked) => {
    const pos = marked.indexOf('|')
    const state = EditorState.create({ doc: marked.replace('|', ''), extensions: [profileExtension([styleProfile({ scan, t: (app, text) => text })])] })
    expect(connectors(new CompletionContext(state, pos, true))).toBeNull()
  })

  it('insert the connector and a space, then offer the names to connect to', () => {
    const view = pick('Customer -> Shop\nnode1 -|', connectors, '-->')

    expect(view.state.doc.toString()).toBe('Customer -> Shop\nnode1 --> ')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
    expect(completionStatus(view.state)).not.toBeNull()
    view.destroy()
  })
})

describe('keywords', () => {
  it('offers the keywords at the start of a line, after any indentation', async () => {
    const result = await complete(keywords, '  part|')

    expect(result.from).toBe(2)
    expect(result.options).toContainEqual(expect.objectContaining({ label: 'participant', type: 'keyword' }))
    expect(labels(result)).toEqual(expect.arrayContaining(['database', 'class', 'alt', 'autonumber', 'skinparam', 'endwhile', 'end fork']))
  })

  it('offers nothing past the first word of a line', async () => {
    expect(await complete(keywords, 'A -> part|')).toBeNull()
    expect(await complete(keywords, 'participant Al|')).toBeNull()
  })

  it('keeps offering a two-word keyword after its space', async () => {
    const result = await complete(keywords, '  end f|')

    expect(result.from).toBe(2)
    expect(labels(result)).toContain('end fork')
    expect(result.validFor.test('end fo')).toBe(true)
  })

  it('waits for a letter on an empty line unless asked', async () => {
    expect(await complete(keywords, '|')).toBeNull()
    expect(labels(await complete(keywords, '|', true))).toContain('participant')
  })
})

describe('the server\'s keywords', () => {
  // The hand-kept list as it was before the server's words joined it, in order.
  const HAND = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue', 'class', 'interface', 'abstract', 'enum', 'package', 'namespace', 'component', 'node', 'cloud', 'frame', 'folder', 'rectangle', 'usecase', 'state', 'object', 'alt', 'else', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'end', 'note', 'ref', 'activate', 'deactivate', 'destroy', 'return', 'autonumber', 'title', 'header', 'footer', 'legend', 'skinparam', 'hide', 'show', 'left', 'right', 'top', 'bottom', 'start', 'stop', 'if', 'then', 'elseif', 'endif', 'while', 'endwhile', 'repeat', 'fork', 'end fork']
  const ANSWER = { types: ['hexagon', 'actor'], keywords: ['hnote', 'left to right direction', 'alt', 'as'] }
  let module

  // The words are asked once per page, so each test loads a fresh module.
  async function serving(fetch) {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.stubGlobal('fetch', fetch)
    module = await import('../../src/editor/completion/keywords.js')
    return fetch
  }
  const ask = (marked, explicit = false) => complete(module.keywords, marked, explicit)
  afterEach(() => vi.unstubAllGlobals())

  it('offers the server\'s element types and keywords', async () => {
    const fetch = await serving(answering(ANSWER))

    expect(labels(await ask('hex|'))).toContain('hexagon')
    expect(labels(await ask('hn|'))).toContain('hnote')
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/keywords', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('offers a multi-word keyword whole, while its words are typed', async () => {
    await serving(answering(ANSWER))

    for (const typed of ['left|', 'left |', 'left to|', 'left to |', 'left to ri|']) {
      const result = await ask(typed)
      expect(result.from).toBe(0)
      expect(labels(result)).toContain('left to right direction')
    }
    expect(await ask('left to right direction x|')).toBeNull()
    expect(await ask('note over A|')).toBeNull()

    const { state, pos } = stateAt('left|')
    const view = new EditorView({ state, parent: document.body })
    const result = await module.keywords(new CompletionContext(view.state, pos, false))
    const option = result.options.find((candidate) => candidate.label === 'left to right direction')
    view.dispatch(insertCompletionText(view.state, option.apply ?? option.label, result.from, pos))
    expect(view.state.doc.toString()).toBe('left to right direction')
    view.destroy()
  })

  it('offers a word both lists have once, with the hand-kept detail', async () => {
    await serving(answering(ANSWER))
    const result = await ask('al|')

    expect(labels(result).filter((label) => label === 'alt')).toHaveLength(1)
    expect(labels(result).filter((label) => label === 'actor')).toHaveLength(1)
    expect(result.options.find((option) => option.label === 'alt')).toMatchObject({ detail: 'alternatives', type: 'keyword' })
  })

  it('ranks the hand-kept words above the server-only ones', async () => {
    await serving(answering(ANSWER))
    const result = await ask('|', true)
    const boost = (label) => result.options.find((option) => option.label === label).boost

    expect(boost('participant')).toBe(1)
    expect(boost('end fork')).toBe(1)
    for (const label of ['hexagon', 'hnote', 'as', 'left to right direction']) {
      expect(boost(label) ?? 0).toBeLessThan(boost('alt'))
    }
  })

  it.each([
    ['the request fails', () => vi.fn(async () => { throw new TypeError('offline') })],
    ['the server answers 503', () => vi.fn(async () => new Response('{}', { status: 503 }))],
    ['keywords is not a list', () => answering({ keywords: 'x' })],
  ])('offers the hand-kept words alone when %s', async (_when, make) => {
    await serving(make())

    expect(labels(await ask('|', true))).toEqual(HAND)
  })

  it('keeps only the strings of each list', async () => {
    await serving(answering({ types: [1, null], keywords: [{}, 'ok'] }))

    expect(labels(await ask('|', true))).toEqual([...HAND, 'ok'])
  })

  it('keeps the exported lists as they were', async () => {
    await serving(answering(ANSWER))

    expect(module.KEYWORDS).toEqual(HAND.filter((label) => !label.includes(' ')))
    expect(module.PARTICIPANTS).toEqual(HAND.slice(0, 8))
    expect(module.STRUCTURES).toEqual(HAND.slice(8, 23))
    expect(module.HELPER_HEADS).toEqual(['colors', 'help'])
  })
})

describe('helper commands', () => {
  it('are offered on a line of their own in a uml block', async () => {
    expect(labels(await complete(keywords, '@startuml\ncol|\n@enduml'))).toContain('colors')
    const help = await complete(keywords, '@startuml\nhelp t|\n@enduml')
    expect(labels(help)).toEqual(expect.arrayContaining(['help themes', 'help types']))
    expect(help.from).toBe('@startuml\n'.length)
  })

  it('are not offered with anything else on the line', async () => {
    expect(labels(await complete(keywords, '@startuml\ncol| x\n@enduml'))).not.toContain('colors')
  })

  it('are not offered in other block types or outside a block', async () => {
    expect(labels(await complete(keywords, '@startmindmap\ncol|\n@endmindmap'))).not.toContain('colors')
    expect(labels(await complete(keywords, 'col|'))).not.toContain('colors')
  })
})

describe('built-in functions', () => {
  it('lists the functions after %, with the description as the detail', async () => {
    const result = await complete(builtins, '!x = %str|')

    expect(result.from).toBe(5)
    expect(result.options).toContainEqual(expect.objectContaining({ label: '%strlen', type: 'function', detail: 'Calculate the length of a String' }))
    expect(labels(result)).toEqual(expect.arrayContaining(['%date', '%lighten', '%get_all_stdlib', '%get_current_theme']))
  })

  it('inserts name() with the cursor between the parentheses', async () => {
    const { state, pos } = stateAt('A: %str|')
    const view = new EditorView({ state })
    const result = await builtins(new CompletionContext(state, pos, false))
    const option = result.options.find((o) => o.label === '%strlen')
    option.apply(view, option, result.from, pos)

    expect(view.state.doc.toString()).toBe('A: %strlen()')
    expect(view.state.selection.main.head).toBe('A: %strlen('.length)
    view.destroy()
  })

  it('asks again after the list failed to load, rather than keeping the failure', async () => {
    vi.resetModules()
    vi.doMock('../../src/editor/data/builtins.json', () => {
      throw new Error('offline')
    })
    const { builtins: fresh } = await import('../../src/editor/completion/builtins.js')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await complete(fresh, '%str|')).toBeNull()
    vi.doUnmock('../../src/editor/data/builtins.json')
    expect(labels(await complete(fresh, '%str|'))).toContain('%strlen')
    vi.mocked(console.error).mockRestore()
  })

  it('stays silent without a % and inside a comment', async () => {
    expect(await complete(builtins, 'A -> B|')).toBeNull()
    expect(await complete(builtins, "' %str|")).toBeNull()
  })
})

describe('names', () => {
  const diagram = [
    'participant Customer',
    'actor "Big Shop" as Shop',
    'abstract class Order',
    'Customer -> Warehouse : ship',
    'Warehouse -right-> Courier',
    '',
  ].join('\n')

  it('offers the participants, classes and arrow ends the diagram already names', () => {
    const result = complete(names, diagram + 'Cus|')

    expect(result.from).toBe(diagram.length)
    expect(labels(result)).toEqual(expect.arrayContaining(['Customer', 'Shop', 'Order', 'Warehouse', 'Courier']))
    expect(labels(result)).not.toContain('Big')
    expect(result.options.every((option) => option.type === 'variable')).toBe(true)
  })

  it('does not offer the word being typed back as a name', () => {
    expect(labels(complete(names, diagram + 'Wanderer -> Cus|'))).not.toContain('Cus')
    expect(labels(complete(names, 'Cus| -> Shop'))).not.toContain('Cus')
  })

  it('still reads the arrow on the line being typed', () => {
    expect(labels(complete(names, 'Cus| -> Shop'))).toContain('Shop')
    expect(labels(complete(names, 'Shop -> Cus|'))).toContain('Shop')
  })

  // C2: no element name inside an open Creole tag, wherever its value is typed.
  it.each([
    'Hello <font color=a|',
    'Hello <font size=12 color=a|',
    '<&a|',
    '<color:a|',
    '<img src=a|',
  ])('offers no name inside the open tag in `%s`', (marked) => {
    expect(complete(names, 'participant api\n' + marked)).toBeNull()
  })

  it('still offers names after an arrow, after a closed tag and after a left arrow', () => {
    for (const marked of ['api -> b|', '<b>x</b> api -> b|', 'api <-- b|', 'A <|-- b|', 'A <.. b|', 'A <- b|', 'class A <<x>> -- b|']) {
      // The cursor is the last character, as `A <|-- ` holds a `|` of its own.
      const doc = 'participant api\nparticipant bee\n' + marked.slice(0, -1)
      const state = EditorState.create({ doc, extensions: [plantumlMode, plantumlCompletion] })
      const result = names(new CompletionContext(state, doc.length, false))
      expect([marked, result && labels(result)]).toEqual([marked, expect.arrayContaining(['bee'])])
    }
  })

  it('offers nothing after an @ directive, inside a string, or in an arrow message', () => {
    expect(complete(names, diagram + '@start|')).toBeNull()
    expect(complete(names, diagram + 'participant "Cus|')).toBeNull()
    expect(complete(names, diagram + 'Customer -> Shop : order Cus|')).toBeNull()
  })

  it('offers nothing inside a Creole tag, an icon or an emoji', () => {
    for (const marked of ['A -> B : <b|', 'A -> B : <b>x</b|', 'title <&cl|', 'title <:sm|']) {
      expect(complete(names, diagram + marked)).toBeNull()
    }
    expect(labels(complete(names, diagram + 'Shop <-Ware|'))).toContain('Warehouse')
  })

  it('offers nothing after a #, where a colour goes', () => {
    expect(complete(names, diagram + 'actor Bob #Cus|')).toBeNull()
    expect(complete(names, diagram + 'actor Bob #|', true)).toBeNull()
  })

  it('offers anywhere on a line, and nothing in a comment or a preprocessor line', () => {
    expect(labels(complete(names, diagram + 'Shop -> Ware|'))).toContain('Warehouse')
    expect(complete(names, diagram + "' Ware|")).toBeNull()
    expect(complete(names, diagram + '!theme Ware|')).toBeNull()
  })
})

describe('snippets', () => {
  it('offers blocks to fill in at the start of a line', () => {
    const result = complete(snippets, 'al|')

    expect(result.options).toContainEqual(expect.objectContaining({ label: 'alt', type: 'text' }))
    expect(labels(result)).toEqual(expect.arrayContaining(['note', 'alt', 'loop', 'class', 'if']))
    expect(complete(snippets, 'A -> al|')).toBeNull()
  })

  it('inserts the block with its first field selected', () => {
    const { state, pos } = stateAt('al|')
    const view = new EditorView({ state, parent: document.body })
    const result = snippets(new CompletionContext(view.state, pos, false))
    const alt = result.options.find((option) => option.label === 'alt')

    alt.apply(view, alt, result.from, pos)

    expect(view.state.doc.toString()).toBe('alt condition\n  \nelse otherwise\n  \nend')
    const { from, to } = view.state.selection.main
    expect(view.state.sliceDoc(from, to)).toBe('condition')
    view.destroy()
  })
})

describe('style', () => {
  const style = styleCompletion({ scan })
  const profile = styleProfile({ scan, t: (app, text) => text })

  /** The registry's list source over a state with the style profile's values. */
  function styleValues(marked, explicit = false) {
    const pos = marked.indexOf('|')
    const state = EditorState.create({ doc: marked.replace('|', ''), extensions: [profileExtension([profile])] })
    return values(new CompletionContext(state, pos, explicit))
  }
  const { selectors, properties, fontStyles } = vocabulary.style

  /** The labels the popup shows at the cursor, in its order, with the style source alone. */
  async function popup(marked) {
    const pos = marked.indexOf('|')
    const view = new EditorView({
      state: EditorState.create({
        doc: marked.replace('|', ''),
        extensions: [plantumlMode, EditorState.languageData.of(() => [{ autocomplete: style }]), autocompletion()],
      }),
      parent: document.body,
    })
    view.dispatch({ selection: { anchor: pos } })
    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    const shown = currentCompletions(view.state).map((option) => option.label)
    view.destroy()
    return shown
  }

  it('offers the enclosing diagram\'s selector first, then the elements, then the other diagrams', async () => {
    const shown = await popup('@startmindmap\n<style>\n|\n</style>\n* a\n@endmindmap\n')

    expect(shown.slice(0, 7)).toEqual(['node', 'rootNode', 'leafNode', 'boxless', 'arrow', ':depth(', 'mindmapDiagram'])
    expect(new Set(shown)).toEqual(new Set([...selectors, ':depth(']))
    expect(shown.indexOf('node')).toBeLessThan(shown.indexOf('wbsDiagram'))
    expect(shown.indexOf('root')).toBeLessThan(shown.indexOf('sequenceDiagram'))
    expect(shown.slice(-3).every((label) => /Diagram$|^(?:regex|ebnf)$/.test(label))).toBe(true)
  })

  it.each(['mindmap', 'wbs'])('starts a %s diagram\'s selectors with its nodes, arrow and a depth, as plantuml.com/mindmap-diagram styles them', async (type) => {
    const shown = await popup(`@start${type}\n<style>\n|\n</style>\n* a\n@end${type}\n`)

    expect(shown.slice(0, 7)).toEqual(['node', 'rootNode', 'leafNode', 'boxless', 'arrow', ':depth(', `${type}Diagram`])
    expect(shown.filter((label) => label === 'node')).toHaveLength(1)
  })

  it('inserts :depth(1) with the level selected', () => {
    const view = pick('@startmindmap\n<style>\nd|\n</style>\n@endmindmap', style, ':depth(')
    expect(view.state.doc.toString()).toContain('\n:depth(1)\n')
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('1')
    view.destroy()
  })

  it.each([
    ['@startwbs\n<style>\n  w|', 'wbsDiagram'],
    ['@startgantt\n<style>\n|', 'ganttDiagram'],
    ['@startchen\n<style>\n|', 'chenEerDiagram'],
    ['@startregex\n<style>\n|', 'regex'],
  ])('puts the diagram\'s own selector first (%j)', async (marked, first) => {
    expect((await popup(marked))[0]).toBe(first)
  })

  it('puts root, element and document first in a uml diagram, or with no diagram around', async () => {
    for (const marked of ['@startuml\n<style>\n|\n</style>\n@enduml', '<style>\n|']) {
      const shown = await popup(marked)
      expect(new Set(shown.slice(0, 3))).toEqual(new Set(['root', 'element', 'document']))
    }
  })

  it('offers no selector at the start of a line until a word is typed, unless asked', () => {
    expect(complete(style, '<style>\n|')).toBeNull()
    expect(labels(complete(style, '<style>\n|', true))).toContain('mindmapDiagram')
    expect(complete(style, '<style>\nmind|')).toMatchObject({ from: '<style>\n'.length })
    expect(labels(complete(style, '<style>mind|</style>'))).toContain('mindmapDiagram')
  })

  it('offers the properties first after a { and indentation, in their own case', async () => {
    const result = complete(style, '<style>\nnode {\n  |\n}\n</style>')

    expect(labels(result)).toEqual(expect.arrayContaining(properties))
    expect(labels(result)).toContain('BackGroundColor')
    const shown = await popup('<style>\nnode {\n  |\n}\n</style>')
    expect(shown.slice(0, properties.length).sort()).toEqual([...properties].sort())
  })

  it('replaces the word being typed with a property', () => {
    const marked = '<style>\nnode {\n  Fo|\n}\n</style>'
    expect(complete(style, marked)).toMatchObject({ from: marked.indexOf('Fo') })
    expect(labels(complete(style, '<style>\nnode { Line|}</style>'))).toContain('LineColor')
  })

  it.each([
    ['FontStyle', fontStyles],
    ['fontstyle', fontStyles],
    ['HorizontalAlignment', ['left', 'center', 'right']],
    ['ShowStereotype', ['true', 'false']],
  ])('offers the values of %s after it and a space, through the value registry', async (property, list) => {
    expect(complete(style, `<style>\nnode {\n  ${property} |\n}\n</style>`)).toBeNull()
    expect(labels(await styleValues(`<style>\nnode {\n  ${property} |\n}\n</style>`))).toEqual(list)
    const marked = `<style>\nnode {\n  ${property} b|x\n}\n</style>`
    expect(await styleValues(marked)).toMatchObject({ from: marked.indexOf(' b') + 1, to: marked.indexOf('x') })
  })

  it('offers no values for a property without a list, nor after a class or a depth', async () => {
    expect(complete(style, '<style>\nnode {\n  FontSize |\n}\n</style>')).toBeNull()
    expect(await styleValues('<style>\nnode {\n  FontSize |\n}\n</style>')).toBeNull()
    expect(await styleValues('<style>\nnode {\n  FontStyle|\n}\n</style>')).toBeNull()
    expect(complete(style, '<style>\n.ser|')).toBeNull()
    expect(complete(style, '<style>\nnode:de|', true)).toBeNull()
  })

  it('offers nothing outside a style block, on its tag lines, or on a comment line in it', () => {
    expect(complete(style, 'node {\n  Fo|\n}', true)).toBeNull()
    expect(complete(style, '<style>\n</style>\nno|', true)).toBeNull()
    expect(complete(style, '<sty|le>\n</style>', true)).toBeNull()
    expect(complete(style, "<style>\nnode {\n  ' Fo|\n}\n</style>", true)).toBeNull()
    expect(complete(style, '@startuml\n<style>\n@enduml\nno|', true)).toBeNull()
  })
})

describe('inside a style block', () => {
  const COLORS = { AliceBlue: '#F0F8FF', Red: '#FF0000' }
  const profile = styleProfile({ scan, t: (app, text) => text })
  const { selectors, fontStyles } = vocabulary.style
  let extensions

  // The colours are asked once per page, so each test loads fresh modules, the profile's facets with them.
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    vi.stubGlobal('fetch', answering({ colors: COLORS }))
    const { plantumlCompletion: completion } = await import('../../src/editor/completion/index.js')
    const { profileExtension: profiles } = await import('../../src/editor/profiles/index.js')
    extensions = [profiles([profile]), completion]
  })
  afterEach(() => vi.unstubAllGlobals())

  /** What the popup shows on Ctrl-Space at the cursor, or over a selection `[…]` as the chooser makes it, with every source. */
  async function asked(marked) {
    const anchor = marked.replace(/[[\]]/g, '').indexOf('|')
    const plain = marked.replace('|', '')
    const selection = plain.includes('[') ? { anchor: plain.indexOf('['), head: plain.indexOf(']') - 1 } : { anchor }
    const view = new EditorView({
      state: EditorState.create({ doc: plain.replace(/[[\]]/g, ''), extensions }),
      parent: document.body,
    })
    view.dispatch({ selection })
    startCompletion(view)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    const shown = currentCompletions(view.state).map((option) => option.label)
    view.destroy()
    return shown
  }

  const DIAGRAM = 'actor Alice\nAlice -> Bob\n'

  it('offers only the selectors at the start of a body line: no keyword twice, no snippets, no names', async () => {
    const shown = await asked(`@startuml\n${DIAGRAM}<style>\n|\n</style>\n@enduml`)

    expect(shown).toHaveLength(selectors.length)
    expect(new Set(shown)).toEqual(new Set(selectors))
    expect((await asked(`${DIAGRAM}<style>\nac|\n</style>`)).filter((label) => label === 'actor')).toHaveLength(1)
  })

  it.each([
    ['a body line', '<style>\nac|\n</style>'],
    ['the middle of a one-line block', '<style>node { Line| }</style>'],
    ['a body with no </style> yet', '<style>\nnode {\n  Al|'],
  ])('leaves %s to the style sources', async (_where, marked) => {
    for (const source of [keywords, snippets, names, connectors]) {
      expect(await complete(source, DIAGRAM + marked, true)).toBeNull()
    }
  })

  it('offers no connectors or names after a colour property, only the named colours', async () => {
    expect(await asked(`${DIAGRAM}<style>\nnode {\n  LineColor |\n}\n</style>`)).toEqual(Object.keys(COLORS))
  })

  it('offers only the font styles after FontStyle, on Ctrl-Space and from the chooser', async () => {
    expect(await asked(`${DIAGRAM}<style>\nnode {\n  FontStyle |\n}\n</style>`)).toEqual(fontStyles)
    const chosen = await asked(`${DIAGRAM}<style>\nnode {\n  FontStyle [bold]|\n}\n</style>`)
    expect(new Set(chosen)).toEqual(new Set(fontStyles))
    expect(chosen[0]).toBe('bold')
  })

  it('offers neither <style> nor Creole tags after a < on a body line', () => {
    expect(complete(styleTag, '<style>\n<|\n</style>')).toBeNull()
    expect(complete(creole, '<style>\nnode { <|\n</style>')).toBeNull()
    expect(complete(filesNote, '@startfiles\n<style>\n<|\n</style>\n@endfiles')).toBeNull()
  })

  it('offers them all again after the block', async () => {
    expect(labels(await complete(keywords, '<style>\n</style>\nac|'))).toContain('actor')
    expect(complete(styleTag, '<style>\n</style>\n<|')).not.toBeNull()
    expect(complete(connectors, '@startuml\n<style>\n@enduml\nnode1 |')).not.toBeNull()
  })
})

describe('local paths', () => {
  const FOLDERS = {
    '/Diagrams': [
      { name: 'shared.puml', folder: false },
      { name: 'Order flow.puml', folder: false },
      { name: 'theme.css', folder: false },
      { name: 'notes.txt', folder: false },
      { name: 'photo.png', folder: false },
      { name: 'sub', folder: true },
    ],
    '/Diagrams/sub': [{ name: 'deep.iuml', folder: false }, { name: 'skin.css', folder: false }],
    '/': [{ name: 'top.pu', folder: false }, { name: 'Diagrams', folder: true }],
  }

  beforeEach(() => {
    vi.mocked(listFolder).mockReset()
    vi.mocked(listFolder).mockImplementation(async (path) => FOLDERS[path] ?? [])
  })

  function completeAt(marked, path = '/Diagrams/Order flow.puml') {
    const pos = marked.indexOf('|')
    const state = EditorState.create({ doc: marked.replace('|', ''), extensions: [plantumlMode, plantumlCompletion, filePath.of(path)] })
    return localFiles(new CompletionContext(state, pos, false))
  }

  it('offers < and https:// first, then the folder\'s diagrams and folders, after a bare !include', async () => {
    for (const directive of ['!include', '!include_many', '!include_once', '!includesub']) {
      const result = await completeAt(`${directive} |`)
      expect(labels(result).slice(0, 2)).toEqual(['<', 'https://'])
      expect(labels(result).slice(2).sort()).toEqual(['../', 'Order flow.puml', 'notes.txt', 'shared.puml', 'sub/'].sort())
    }
    expect(listFolder).toHaveBeenLastCalledWith('/Diagrams')
  })

  it('lists the folder named by ./sub/, relative to the file', async () => {
    const result = await completeAt('!include ./sub/|')

    expect(listFolder).toHaveBeenCalledWith('/Diagrams/sub')
    expect(labels(result).sort()).toEqual(['../', 'deep.iuml'])
  })

  it('goes up with ../, and from the root with /', async () => {
    const up = await completeAt('!include ../|')
    expect(listFolder).toHaveBeenLastCalledWith('/')
    expect(labels(up).sort()).toEqual(['Diagrams/', 'top.pu'])

    const root = await completeAt('!include /|')
    expect(listFolder).toHaveBeenLastCalledWith('/')
    expect(labels(root).sort()).toEqual(['Diagrams/', 'top.pu'])

    await completeAt('!include /Diagrams/sub/|')
    expect(listFolder).toHaveBeenLastCalledWith('/Diagrams/sub')
  })

  it('offers no ../ at the root, and nothing above it', async () => {
    const result = await completeAt('!include |', '/top.pu')
    expect(listFolder).toHaveBeenLastCalledWith('/')
    expect(labels(result)).not.toContain('../')

    expect(await completeAt('!include ../|', '/top.pu')).toBeNull()
    expect(await completeAt('!include ./../|', '/Diagrams/x.puml')
      .then((r) => labels(r).sort())).toEqual(['Diagrams/', 'top.pu'])
  })

  it('completes the style sheets after <style file=', async () => {
    const result = await completeAt('<style file=|')

    expect(labels(result).sort()).toEqual(['../', 'notes.txt', 'sub/', 'theme.css'])
    expect(result.options.some((option) => option.label === '<')).toBe(false)
  })

  it('offers nothing in the stdlib, after a URL or elsewhere', async () => {
    expect(await completeAt('!include <|')).toBeNull()
    expect(await completeAt('!include <cloudogu/|')).toBeNull()
    expect(await completeAt('!include https://x.org/|')).toBeNull()
    expect(await completeAt('!include http:|')).toBeNull()
    expect(await completeAt('Alice -> Bob|')).toBeNull()
    expect(await completeAt('!define x|')).toBeNull()
    expect(listFolder).not.toHaveBeenCalled()
  })

  it('lists a folder whose name starts with http', async () => {
    await completeAt('!include httpdocs/|')

    expect(listFolder).toHaveBeenCalledWith('/Diagrams/httpdocs')
  })

  it('opens the next level as a completion pick, so the popup reads it as one', async () => {
    const picks = []
    const view = new EditorView({
      state: EditorState.create({
        doc: '!include ',
        selection: { anchor: 9 },
        extensions: [plantumlMode, plantumlCompletion, filePath.of('/Diagrams/Order flow.puml'), EditorView.updateListener.of((update) => picks.push(...update.transactions))],
      }),
      parent: document.body,
    })
    const result = await localFiles(new CompletionContext(view.state, 9, false))
    const sub = result.options.find((option) => option.label === 'sub/')

    sub.apply(view, sub, result.from, 9)

    const [pick] = picks.filter((tr) => tr.docChanged)
    expect(pick.isUserEvent('input.complete')).toBe(true)
    expect(pick.annotation(pickedCompletion)).toBe(sub)
    view.destroy()
  })

  it('offers nothing when the listing fails, or the file\'s path is not known', async () => {
    vi.mocked(listFolder).mockRejectedValue(new Error('offline'))
    expect(await completeAt('!include |')).toBeNull()
    expect(await completeAt('!include |', '')).toBeNull()
  })

  it('inserts a folder with its slash and opens the next level', async () => {
    const view = new EditorView({ state: EditorState.create({ doc: '!include ', selection: { anchor: 9 }, extensions: [plantumlMode, plantumlCompletion, filePath.of('/Diagrams/Order flow.puml')] }), parent: document.body })
    const result = await localFiles(new CompletionContext(view.state, 9, false))
    const sub = result.options.find((option) => option.label === 'sub/')

    sub.apply(view, sub, result.from, 9)

    expect(view.state.doc.toString()).toBe('!include sub/')
    vi.mocked(listFolder).mockClear()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(listFolder).toHaveBeenCalledWith('/Diagrams/sub')
    view.destroy()
  })
})

describe('sections and blocks of an included file', () => {
  // The per-page cache is module-level, so each test reads its own file.
  const DIAGRAM = '/apps/UML_Fun.puml'

  beforeEach(() => {
    vi.mocked(listFolder).mockReset()
    vi.mocked(listFolder).mockResolvedValue([{ name: 'parts.puml', folder: false }])
    vi.mocked(loadFile).mockReset()
  })

  function completeAt(marked, path = DIAGRAM) {
    const pos = marked.indexOf('|')
    const state = EditorState.create({ doc: marked.replace('|', ''), extensions: [plantumlMode, plantumlCompletion, filePath.of(path)] })
    return localFiles(new CompletionContext(state, pos, false))
  }

  function pickAfter(directive) {
    const doc = `${directive} `
    const view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [plantumlMode, plantumlCompletion, filePath.of(DIAGRAM)] }), parent: document.body })
    return localFiles(new CompletionContext(view.state, doc.length, false)).then((result) => {
      const option = result.options.find((candidate) => candidate.label === 'parts.puml')
      if (typeof option.apply === 'function') {
        option.apply(view, option, result.from, doc.length)
      } else {
        view.dispatch({ changes: { from: result.from, to: doc.length, insert: option.apply ?? option.label } })
      }
      return view
    })
  }

  it('offers the !startsub names of the file after !includesub path!, once each, in order', async () => {
    vi.mocked(loadFile).mockResolvedValue({ content: '!startsub ACTORS\nA -> B\n!endsub\n!startsub ACTORS\n!endsub\n!startsub LEGEND\n', etag: 'e' })

    const result = await completeAt('!includesub ./parts.puml!|')

    expect(loadFile).toHaveBeenCalledWith('/apps/parts.puml')
    expect(labels(result)).toEqual(['ACTORS', 'LEGEND'])
    expect(result.options.every((option) => option.type === 'constant')).toBe(true)
    expect(result.from).toBe('!includesub ./parts.puml!'.length)
  })

  it('offers the named blocks after !include path!, and not the unnamed ones', async () => {
    vi.mocked(loadFile).mockResolvedValue({ content: '@startuml parts\nA -> B\n@enduml\n@startuml(id=legend)\n@enduml\n@startmindmap\n* x\n', etag: 'e' })

    const result = await completeAt('!include ./blocks.puml!|')

    expect(loadFile).toHaveBeenCalledWith('/apps/blocks.puml')
    expect(labels(result)).toEqual(['parts', 'legend'])
  })

  it('offers a block name as the resolver reads it: a dotted token, or an id with spaces', async () => {
    vi.mocked(loadFile).mockResolvedValue({ content: '@startuml parts.v2\n@enduml\n@startuml(id = legend)\n@enduml\n', etag: 'e' })

    const result = await completeAt('!include ./resolver-names.puml!|')

    expect(labels(result)).toEqual(['parts.v2', 'legend'])
  })

  it('keeps offering while a dotted name is typed after the !', async () => {
    vi.mocked(loadFile).mockResolvedValue({ content: '@startuml parts.v2\n@enduml\n', etag: 'e' })

    const result = await completeAt('!include ./typed-dots.puml!parts.|')

    expect(labels(result)).toEqual(['parts.v2'])
    expect(result.validFor.test('parts.v')).toBe(true)
  })

  it('offers the open document\'s own sections first after a bare !includesub', async () => {
    const result = await completeAt('!includesub |\n!startsub ACTORS\n!endsub')

    expect(labels(result).slice(0, 1)).toEqual(['ACTORS'])
    expect(result.options[0].type).toBe('constant')
    expect(labels(result)).toContain('parts.puml')
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('adds the ! after a file picked for !includesub and opens the names, but not for !include', async () => {
    const sub = await pickAfter('!includesub')
    expect(sub.state.doc.toString()).toBe('!includesub parts.puml!')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(completionStatus(sub.state)).toBe('active')
    sub.destroy()

    const plain = await pickAfter('!include')
    expect(plain.state.doc.toString()).toBe('!include parts.puml')
    plain.destroy()
  })

  it('offers nothing when the read fails', async () => {
    vi.mocked(loadFile).mockRejectedValue(new Error('gone'))

    expect(await completeAt('!includesub ./missing.puml!|')).toBeNull()
  })

  it('does not read a $ or % path, a <library> or a URL', async () => {
    expect(await completeAt('!includesub $dir/x.puml!|')).toBeNull()
    expect(await completeAt('!includesub %dir()/x.puml!|')).toBeNull()
    expect(await completeAt('!includesub <C4/C4>!|')).toBeNull()
    expect(await completeAt('!includesub https://x.org/a.puml!|')).toBeNull()
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('takes a quoted path with spaces, after !include and !includesub', async () => {
    vi.mocked(loadFile).mockResolvedValue({ content: '@startuml spaced\n!startsub PART\n', etag: 'e' })

    expect(labels(await completeAt('!includesub "a b.puml"!|'))).toEqual(['PART'])
    expect(loadFile).toHaveBeenCalledWith('/apps/a b.puml')
    expect(labels(await completeAt('!include "a b.puml"!|'))).toEqual(['spaced'])
  })

  it('still offers the diagram\'s own sections when the listing fails', async () => {
    vi.mocked(listFolder).mockRejectedValue(new Error('offline'))

    const result = await completeAt('!includesub |\n!startsub ACTORS')

    expect(labels(result)).toEqual(['ACTORS'])
    expect(await completeAt('!includesub |')).toBeNull()
  })

  it('reads again after a failed read, and after the page regains focus', async () => {
    vi.mocked(loadFile).mockRejectedValueOnce(new Error('blip')).mockResolvedValue({ content: '!startsub RETRY\n', etag: 'e' })

    expect(await completeAt('!includesub ./retry.puml!|')).toBeNull()
    expect(labels(await completeAt('!includesub ./retry.puml!|'))).toEqual(['RETRY'])
    expect(loadFile).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    await completeAt('!includesub ./retry.puml!|')
    expect(loadFile).toHaveBeenCalledTimes(3)
  })

  it('reads a file once per page', async () => {
    vi.mocked(loadFile).mockResolvedValue({ content: '!startsub ONCE\n', etag: 'e' })

    await completeAt('!includesub ./once.puml!|')
    const again = await completeAt('!includesub ./once.puml!O|')

    expect(loadFile).toHaveBeenCalledTimes(1)
    expect(labels(again)).toEqual(['ONCE'])
  })
})

describe('tag attributes', () => {
  it.each([
    ['note: <font |', ['size=', 'color=']],
    ['<img |', ['src=', 'vspace=', 'valign=']],
    ['<style |', ['file=']],
    ['  <style |', ['file=']],
    ['<&star{|', ['scale=', 'color=']],
    ['<:sunny:{|', ['scale=', 'color=']],
    ['<$foo{|', ['scale=', 'color=']],
    ['<img:x.png{|', ['scale=']],
    ['<qrcode:hi{|', ['scale=']],
    ['<&star{scale=2,|', ['color=']],
    ['<font size=12 |', ['color=']],
    ['<font size=12 col|', ['color=']],
    ['<img src="a b.png" |', ['vspace=', 'valign=']],
    ['A -> B : <font |', ['size=', 'color=']],
    ['A <font |', ['size=', 'color=']],
    ['Hello <font |', ['size=', 'color=']],
    ['Hello <&star{|', ['scale=', 'color=']],
  ])('offers the attributes not yet written (%s)', (marked, expected) => {
    const result = complete(tagAttributes, marked)

    expect(labels(result)).toEqual(expected)
    expect(result.options.every((option) => option.type === 'property')).toBe(true)
  })

  it('replaces the part of the name already typed', () => {
    const result = complete(tagAttributes, '<font col|')

    expect(result.from).toBe('<font '.length)
  })

  it.each([
    '<img src="a |',
    '<img src= |',
    '<text |',
    '<b |',
    'A <|',
    'A <- B |',
    'class A <<|',
    "' <font |",
    '!include <font |',
    '  !define X <img |',
    '<style>\nroot { <font |\n}\n</style>',
    '<font size=12|',
    '<&star{scale=2|',
    'x <style |',
  ])('offers nothing here (%s)', (marked) => {
    expect(complete(tagAttributes, marked)).toBeNull()
  })

  it('inserts the name and opens its values, valign= listing top, middle and bottom', async () => {
    const view = pick('<img |', tagAttributes, 'valign=')

    expect(view.state.doc.toString()).toBe('<img valign=')
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    expect(currentCompletions(view.state).map((option) => option.label)).toEqual(['top', 'middle', 'bottom'])
    view.destroy()
  })
})

describe('stdlib', () => {
  const STDLIB = [
    { name: 'c4', version: '2.13.0', source: 'https://github.com/plantuml-stdlib/C4-PlantUML' },
    { name: 'material7', version: '7.4.47', source: 'https://github.com/Templarian/MaterialDesign-SVG/' },
    { name: 'nope', version: '1.0', source: 'https://x.example/nope' },
  ]
  let fetch
  let stdlibSource
  let fresh

  // The list is asked once per page, so each test loads fresh modules.
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('OC', { generateUrl: (url) => `/index.php${url}` })
    fetch = answering({ stdlib: STDLIB })
    vi.stubGlobal('fetch', fetch)
    stdlibSource = (await import('../../src/editor/completion/stdlib.js')).stdlib
    fresh = await import('../../src/editor/completion/index.js')
  })
  afterEach(() => vi.unstubAllGlobals())

  function freshState(marked, extensions = []) {
    const pos = marked.indexOf('|')
    return { pos, state: EditorState.create({ doc: marked.replace('|', ''), extensions: [plantumlMode, fresh.plantumlCompletion, ...extensions] }) }
  }

  function at(marked) {
    const { state, pos } = freshState(marked)
    return stdlibSource(new CompletionContext(state, pos, false))
  }

  /** Picks `label` in a real view whose completion is the fresh sources', as the popup does. */
  async function pickAt(marked, label) {
    const { state, pos } = freshState(marked)
    const view = new EditorView({ state, parent: document.body })
    const result = await stdlibSource(new CompletionContext(view.state, pos, false))
    const option = result.options.find((candidate) => candidate.label === label)
    if (typeof option.apply === 'function') {
      option.apply(view, option, result.from, pos)
    } else {
      view.dispatch(insertCompletionText(view.state, option.apply ?? option.label, result.from, pos))
    }
    return view
  }

  const shown = (view) => currentCompletions(view.state).map((option) => option.label)

  it('offers the server\'s libraries after !include <, each with its version and source', async () => {
    const result = await at('!include <|')

    expect(result.from).toBe('!include <'.length)
    expect(labels(result)).toEqual(['c4', 'material7', 'nope'])
    expect(result.options.map((option) => option.detail)).toEqual([
      '2.13.0 · https://github.com/plantuml-stdlib/C4-PlantUML',
      '7.4.47 · https://github.com/Templarian/MaterialDesign-SVG/',
      '1.0 · https://x.example/nope',
    ])
    expect(result.validFor.test('mat')).toBe(true)
    expect(result.validFor.test('c4/')).toBe(false)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/stdlib', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it.each(['!include <|', '!include <c|', '  !include_once <|'])('offers no Creole tag from any source at `%s`', async (marked) => {
    const { state, pos } = freshState(marked)
    const results = await Promise.all(state.languageDataAt('autocomplete', pos).map((source) => source(new CompletionContext(state, pos, false))))
    const offered = results.filter(Boolean).flatMap(labels)

    expect(offered).toContain('c4')
    expect(offered).not.toContain('<b>')
    expect(offered.filter((label) => label.startsWith('<'))).toEqual([])
  })

  it('offers a library\'s files and folders, a folder with its slash, a file without .puml', async () => {
    const result = await at('!include <c4/|')

    expect(result.from).toBe('!include <c4/'.length)
    expect(labels(result)).toEqual(expect.arrayContaining(['C4_Container', 'C4_Context', '_examples_/', 'themes/']))
    expect(labels(result).filter((label) => label.includes('.puml') || label.includes('puml-theme'))).toEqual([])
    expect(result.options.find((option) => option.label === 'themes/').type).toBe('namespace')
    expect(result.options.find((option) => option.label === 'C4_Container').type).toBe('file')
    expect(result.validFor.test('C4_Co')).toBe(true)
    expect(result.validFor.test('themes/')).toBe(false)
  })

  it('goes on down a folder, and finds the library whatever case it is typed in', async () => {
    const result = await at('!include <C4/themes/puml-theme-C4_u|')

    expect(result.from).toBe('!include <C4/themes/'.length)
    expect(labels(result)).toContain('puml-theme-C4_united')
    expect(labels(result)).not.toContain('C4_Container')
  })

  it('reads an alias\'s folder as its name and version (material7 is material7.4.47)', async () => {
    const result = await at('!include <material7/|')

    expect(labels(result)).toContain('AccountUser/')
    expect(labels((await at('!include <material7/AccountUser/|')))).toContain('AccountAlert')
  })

  it('reads a library whose folder links to another as that one', async () => {
    fetch.mockImplementation(answering({ stdlib: [
      { name: 'awslib', version: '14.0', source: 'https://github.com/awslabs/aws-icons-for-plantuml' },
      { name: 'bootstrap', version: '1.13.1', source: 'https://github.com/twbs/icons' },
      { name: 'material', version: '2.1.19', source: 'https://github.com/Templarian/MaterialDesign-SVG/' },
    ] }))

    expect(labels(await at('!include <awslib/|'))).toEqual(expect.arrayContaining(['AWSCommon', 'Compute/']))
    expect(labels(await at('!include <awslib/Compute/|'))).toContain('EC2')
    expect(labels(await at('!include <bootstrap/|'))).toEqual(['_examples_/', 'bootstrap'])
    expect(labels(await at('!include <material/|'))).toEqual(expect.arrayContaining(['_examples_/', 'account_alert']))
  })

  it('offers nothing below a library with no index, and offers its name alone', async () => {
    expect(await at('!include <nope/|')).toBeNull()
    expect(await at('!include <unknown/|')).toBeNull()

    const view = await pickAt('!include <|', 'nope')
    expect(view.state.doc.toString()).toBe('!include <nope')
    view.destroy()
  })

  it.each(['!include', '!include_many', '!include_once', '!includesub'])('%s: picking a library adds / and opens its folder', async (directive) => {
    const view = await pickAt(`${directive} <|`, 'c4')

    expect(view.state.doc.toString()).toBe(`${directive} <c4/`)
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    expect(shown(view)).toContain('C4_Container')
    view.destroy()
  })

  it('picking a folder adds / and opens the next level', async () => {
    const view = await pickAt('!include <c4/|', 'themes/')

    expect(view.state.doc.toString()).toBe('!include <c4/themes/')
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    expect(shown(view)).toContain('puml-theme-C4_united')
    view.destroy()
  })

  it.each(['!include', '!include_many', '!include_once', '!includesub'])('%s: picking a file inserts its path and the closing >', async (directive) => {
    const view = await pickAt(`${directive} <c4/C4_Con|`, 'C4_Container')

    expect(view.state.doc.toString()).toBe(`${directive} <c4/C4_Container>`)
    view.destroy()
  })

  it('opens the libraries when < is picked from the local paths', async () => {
    const save = await import('../../src/editor/save.js')
    vi.mocked(save.listFolder).mockResolvedValue([])
    const local = (await import('../../src/editor/completion/local-files.js')).localFiles
    const { filePath: freshPath } = await import('../../src/editor/lint/state.js')
    const { state, pos } = freshState('!include |', [freshPath.of('/Diagrams/x.puml')])
    const view = new EditorView({ state, parent: document.body })
    const result = await local(new CompletionContext(view.state, pos, false))
    const lt = result.options.find((option) => option.label === '<')

    lt.apply(view, lt, result.from, pos)

    expect(view.state.doc.toString()).toBe('!include <')
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe('active'))
    expect(shown(view)).toEqual(['c4', 'material7', 'nope'])
    view.destroy()
  })

  it('offers nothing when the server cannot answer, and does not ask again on every key', async () => {
    fetch.mockImplementation(async () => new Response('{"problem":"unreachable"}', { status: 503 }))

    expect(await at('!include <|')).toBeNull()
    expect(await at('!include <c|')).toBeNull()
    expect(await at('!include <c4/|')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('offers nothing when the request itself fails', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await at('!include <|')).toBeNull()
  })

  it('keeps only well-formed libraries from the answer', async () => {
    fetch.mockImplementation(answering({ stdlib: [STDLIB[0], { name: 'bad', version: 1 }, 'c4', null, { name: 'x', version: '1', source: 'https://x' }] }))

    expect(labels(await at('!include <|'))).toEqual(['c4', 'x'])
  })

  it('offers nothing outside an include\'s <, and does not ask', async () => {
    for (const marked of ['!include |', '!include c4/|', '!theme <|', 'A -> B : <|', '!include <c4/C4_Container>|', '!include <c4 |']) {
      expect(await at(marked)).toBeNull()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
