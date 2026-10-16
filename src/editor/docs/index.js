/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The docs index (I1): one entry per known element, keyed `<kind>:<name>`, a
 * block type's own entry `<kind>:<name>@<type>`; a property, selector, skin
 * parameter and library name lower-cased, as PlantUML reads them. PlantUML's source describes the
 * `%` functions, the themes and the libraries; our own lines describe the rest;
 * plantuml.com gives each a link. Its data is a chunk of its own, loaded once
 * the editor has opened (a dynamic import: the entry must never import a chunk
 * statically).
 */

/** The label each kind shows on its card. */
const KINDS = {
  diagram: 'diagram',
  keyword: 'keyword',
  directive: 'directive',
  function: 'function',
  selector: 'style selector',
  property: 'style property',
  skinparam: 'skin parameter',
  tag: 'Creole tag',
  connector: 'connector',
  helper: 'command',
  theme: 'theme',
  library: 'library',
}

/**
 * @typedef {object} Entry
 * @property {string} name the element as written
 * @property {string} kind its label, `keyword · sequence`
 * @property {string} look the kind's key, for the card's colour
 * @property {string} [signature]
 * @property {string} [summary]
 * @property {string} [example]
 * @property {string} [icon]
 * @property {{ page: string, anchor?: string, section: string }} [link]
 */

/** The kinds whose words are a block type's own: outside uml only a `@<type>` entry describes one. */
const TYPED = new Set(['keyword', 'connector'])

/** PlantUML's alias of a type, whose words are the type's (`profiles/index.js` loads gantt's for it). */
const ALIASES = { project: 'gantt' }

/** `[key, text]` for each word whose key is lower-cased but whose name is written otherwise. */
const written = (kind, words) => words.map((word) => [`${kind}:${word.toLowerCase()}`, word])

/** What the source says of a word: a function's description and example, a theme's or a library's summary. */
function sourceText({ source, builtins }) {
  const text = new Map()
  for (const { name, description, example } of builtins) {
    text.set(`function:${name}`, { summary: description, example })
  }
  for (const [name, { summary }] of Object.entries(source.themes)) {
    text.set(`theme:${name}`, { summary })
  }
  for (const [key, name] of written('library', Object.keys(source.libraries))) {
    text.set(key, { summary: source.libraries[name].summary })
  }
  return text
}

/** Our generated lines: a selector's and a skin parameter's, from their kind. */
function generated({ language, vocabulary }) {
  const text = new Map()
  for (const [key, name] of written('selector', vocabulary.style.selectors)) {
    text.set(key, { summary: `Styles every ${name} in a <style> block`, example: `<style>\n${name} {\n  BackgroundColor LightBlue\n}\n</style>` })
  }
  for (const [key] of written('skinparam', language.skinparameters)) {
    text.set(key, { summary: 'Skin parameter, replaced by <style>' })
  }
  return text
}

/** The name a key's card shows: the word as written, a diagram as its `@start` line, a tag in its brackets. */
function nameOf(kind, word, names) {
  if (kind === 'diagram') {
    return `@start${word}`
  }
  if (kind === 'tag') {
    return `<${word}>`
  }
  return names.get(`${kind}:${word}`) ?? word
}

/** Drops the fields nothing gave, so a card leaves their parts out. */
const defined = (entry) => Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined && value !== ''))

/**
 * The index from its data, pure: the source's text wins, our own lines fill
 * the rest, and the links add a link.
 *
 * @param {{ own: object, links: { links: object }, source: object, builtins: object[], language: object, vocabulary: object }} data
 * `get` tries the block type's entry, then the plain one, which is uml's: a
 * keyword or connector in another type's block has only its type's entry, unless
 * the plain entry is `anywhere` (it means the same in every type). A
 * `project` block reads as `gantt`.
 *
 * @return {{ get: (key: string, type?: string) => Entry|undefined }}
 */
export function buildDocs(data) {
  const { own, links: { links } } = data
  const source = sourceText(data)
  const ours = generated(data)
  const names = new Map([
    ...written('selector', data.vocabulary.style.selectors),
    ...written('property', data.vocabulary.style.properties),
    ...written('skinparam', data.language.skinparameters),
    ...written('library', Object.keys(data.source.libraries)),
  ])
  const keys = new Set([...source.keys(), ...ours.keys(), ...Object.keys(own), ...Object.keys(links)])
  const entries = new Map()
  const anywhere = new Set(Object.entries(own).filter(([, line]) => line.anywhere).map(([key]) => key))
  for (const key of keys) {
    const [, look, word] = /^(\w+):(.*?)(?:@\w+)?$/.exec(key) ?? []
    if (!KINDS[look]) {
      continue
    }
    const mine = own[key] ?? {}
    const theirs = source.get(key) ?? {}
    const made = ours.get(key) ?? {}
    entries.set(key, defined({
      name: nameOf(look, word, names),
      kind: mine.kind ?? (look === 'keyword' && mine.home && mine.home !== 'any' ? `keyword · ${mine.home}` : KINDS[look]),
      look,
      signature: mine.signature,
      summary: theirs.summary || mine.summary || made.summary,
      example: theirs.example || mine.example || made.example,
      icon: mine.icon,
      link: links[key],
    }))
  }
  return {
    get(key, type = 'uml') {
      const own = ALIASES[type] ?? type
      return entries.get(`${key}@${own}`) ?? (own === 'uml' || !TYPED.has(key.split(':')[0]) || anywhere.has(key) ? entries.get(key) : undefined)
    },
  }
}

let loaded = null

/** The index, loaded once; a failed load is forgotten, so the next call tries again. */
export function loadDocs() {
  loaded ??= Promise.all([
    import('../data/docs/own.json'),
    import('../data/docs/links.json'),
    import('../data/docs/source.json'),
    import('../data/builtins.json'),
    import('../data/language.json'),
    import('../data/vocabulary.json'),
  ])
    .then(([own, links, source, builtins, language, vocabulary]) => buildDocs({
      own: own.default,
      links: links.default,
      source: source.default,
      builtins: builtins.default,
      language: language.default,
      vocabulary: vocabulary.default,
    }))
    .catch((error) => {
      loaded = null
      throw error
    })
  return loaded
}
