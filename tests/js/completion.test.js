// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each completion source against a real EditorState: `|` in a document marks
// the cursor, and what is asserted is what the popup would offer from where.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext, autocompletion, completionStatus, currentCompletions, insertCompletionText, startCompletion } from '@codemirror/autocomplete'
import { plantumlLanguage, plantumlMode } from '../../src/editor/plantuml-mode.js'
import { plantumlCompletion, sources } from '../../src/editor/completion/index.js'
import { directives } from '../../src/editor/completion/directives.js'
import { keywords } from '../../src/editor/completion/keywords.js'
import { names } from '../../src/editor/completion/names.js'
import { snippets } from '../../src/editor/completion/snippets.js'
import { values } from '../../src/editor/completion/values.js'
import { connectors } from '../../src/editor/completion/connectors.js'
import { styleTag } from '../../src/editor/completion/style-tag.js'
import { creole } from '../../src/editor/completion/creole.js'
import { icons } from '../../src/editor/completion/icons.js'
import { emoji } from '../../src/editor/completion/emoji.js'
import { colors } from '../../src/editor/completion/colors.js'
import { styleCompletion } from '../../src/editor/completion/style.js'
import { scan } from '../../src/editor/blocks.js'
import { profileExtension } from '../../src/editor/profiles/index.js'
import styleProfile from '../../src/editor/profiles/style.js'
import vocabulary from '../../src/editor/data/vocabulary.json'

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
    expect(sources).toEqual([directives, keywords, names, snippets, values, connectors, styleTag, creole, icons, emoji, colors])
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
    expect(labels(result)).toEqual(['!theme', '!include', '!define', '!pragma'])
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
    '<style>note { FontSize 2; LineColor #|',
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
  ])('offers none in `%s`', async (marked) => {
    expect(await complete(colorsSource, marked)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
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
      '<b>', '<i>', '<u>', '<s>', '<w>', '<plain>', '<size:12>', '<color:#>', '<back:#>', '<font:name>', '<sub>', '<sup>', '<img:url>',
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

    expect(shown[0]).toBe('mindmapDiagram')
    expect(new Set(shown)).toEqual(new Set(selectors))
    expect(shown.indexOf('node')).toBeLessThan(shown.indexOf('wbsDiagram'))
    expect(shown.indexOf('root')).toBeLessThan(shown.indexOf('sequenceDiagram'))
    expect(shown.slice(-3).every((label) => /Diagram$|^(?:regex|ebnf)$/.test(label))).toBe(true)
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
