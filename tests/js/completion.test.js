// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Each completion source against a real EditorState: `|` in a document marks
// the cursor, and what is asserted is what the popup would offer from where.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext, completionStatus, insertCompletionText } from '@codemirror/autocomplete'
import { plantumlLanguage, plantumlMode } from '../../src/editor/plantuml-mode.js'
import { plantumlCompletion, sources } from '../../src/editor/completion/index.js'
import { directives } from '../../src/editor/completion/directives.js'
import { keywords } from '../../src/editor/completion/keywords.js'
import { names } from '../../src/editor/completion/names.js'
import { snippets } from '../../src/editor/completion/snippets.js'
import { themes } from '../../src/editor/completion/themes.js'
import { connectors } from '../../src/editor/completion/connectors.js'
import { creole } from '../../src/editor/completion/creole.js'
import { icons } from '../../src/editor/completion/icons.js'
import { emoji } from '../../src/editor/completion/emoji.js'

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
    expect(sources).toEqual([directives, keywords, names, snippets, themes, connectors, creole, icons, emoji])
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
    themesSource = (await import('../../src/editor/completion/themes.js')).themes
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers the server\'s themes after !theme and a space', async () => {
    const result = await complete(themesSource, '!theme |')

    expect(result.from).toBe('!theme '.length)
    expect(labels(result)).toEqual(THEMES)
    expect(result.options.every((option) => option.type === 'constant')).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/index.php/apps/plantuml/themes', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('keeps offering them over a half-typed name, after any indentation', async () => {
    const result = await complete(themesSource, '  !theme cerulean-o|')

    expect(result.from).toBe('  !theme '.length)
    expect(result.validFor.test('cerulean-out')).toBe(true)
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
