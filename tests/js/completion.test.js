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
import { creole } from '../../src/editor/completion/creole.js'
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
import { listFolder } from '../../src/editor/save.js'

vi.mock('../../src/editor/save.js', () => ({ listFolder: vi.fn() }))

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
    expect(sources).toEqual([directives, keywords, names, snippets, values, connectors, styleTag, filesNote, creole, icons, emoji, colors, builtins, localFiles])
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
  it('offers the keywords at the start of a line, after any indentation', () => {
    const result = complete(keywords, '  part|')

    expect(result.from).toBe(2)
    expect(result.options).toContainEqual(expect.objectContaining({ label: 'participant', type: 'keyword' }))
    expect(labels(result)).toEqual(expect.arrayContaining(['database', 'class', 'alt', 'autonumber', 'skinparam', 'endwhile', 'end fork']))
  })

  it('offers nothing past the first word of a line', () => {
    expect(complete(keywords, 'A -> part|')).toBeNull()
    expect(complete(keywords, 'participant Al|')).toBeNull()
  })

  it('keeps offering a two-word keyword after its space', () => {
    const result = complete(keywords, '  end f|')

    expect(result.from).toBe(2)
    expect(labels(result)).toContain('end fork')
    expect(result.validFor.test('end fo')).toBe(true)
  })

  it('waits for a letter on an empty line unless asked', () => {
    expect(complete(keywords, '|')).toBeNull()
    expect(labels(complete(keywords, '|', true))).toContain('participant')
  })
})

describe('helper commands', () => {
  it('are offered on a line of their own in a uml block', () => {
    expect(labels(complete(keywords, '@startuml\ncol|\n@enduml'))).toContain('colors')
    const help = complete(keywords, '@startuml\nhelp t|\n@enduml')
    expect(labels(help)).toEqual(expect.arrayContaining(['help themes', 'help types']))
    expect(help.from).toBe('@startuml\n'.length)
  })

  it('are not offered with anything else on the line', () => {
    expect(labels(complete(keywords, '@startuml\ncol| x\n@enduml'))).not.toContain('colors')
  })

  it('are not offered in other block types or outside a block', () => {
    expect(labels(complete(keywords, '@startmindmap\ncol|\n@endmindmap'))).not.toContain('colors')
    expect(labels(complete(keywords, 'col|'))).not.toContain('colors')
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
  ])('leaves %s to the style sources', (_where, marked) => {
    for (const source of [keywords, snippets, names, connectors]) {
      expect(complete(source, DIAGRAM + marked, true)).toBeNull()
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

  it('offers them all again after the block', () => {
    expect(labels(complete(keywords, '<style>\n</style>\nac|'))).toContain('actor')
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
