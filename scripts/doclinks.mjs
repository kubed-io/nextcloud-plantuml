// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates src/editor/data/docs/links.json: for each word the editor documents, the plantuml.com page,
// anchor and section title that cover it. Only links and section titles are kept; plantuml.com's prose is
// copyrighted and never ships (I1, I7). Needs network; the tests never do.
// Run: node scripts/doclinks.mjs
import { readFile } from 'node:fs/promises'
import { fetchText, isMain, readData, writeData } from './lib.mjs'

const SITE = 'https://plantuml.com'

// Pages in the sitemap that are not language documentation.
const SKIP = new Set(['download', 'faq', 'guide', 'index', 'news', 'running', 'sitemap', 'sitemap-language-specification', 'starting'])
const EXTRA = ['preprocessing', 'creole', 'style', 'theme', 'stdlib', 'skinparam']
const SPEC = 'sitemap-language-specification'
// The uml diagram pages, in the order a word is looked for: the commonest first, the rest as the sitemap lists them.
const FIRST = ['sequence-diagram', 'use-case-diagram', 'class-diagram', 'activity-diagram-beta', 'component-diagram', 'state-diagram', 'object-diagram', 'deployment-diagram', 'timing-diagram']

/** Each `@start` type's page; a type with no page of its own links the language specification. */
export const DIAGRAM_PAGES = {
  uml: SPEC,
  board: SPEC,
  bpm: SPEC,
  chart: 'chart-diagram',
  chen: 'er-diagram',
  chronology: 'chronology-diagram',
  creole: 'creole',
  def: 'preprocessing',
  ditaa: 'ascii-art',
  dot: SPEC,
  ebnf: 'ebnf',
  files: 'files-diagram',
  flow: SPEC,
  gantt: 'gantt-diagram',
  git: SPEC,
  hcl: SPEC,
  jcckit: SPEC,
  json: 'json',
  latex: 'latex',
  math: 'ascii-math',
  mindmap: 'mindmap-diagram',
  nwdiag: 'nwdiag',
  packetdiag: 'nwdiag',
  project: 'gantt-diagram',
  regex: 'regex',
  salt: 'salt',
  sprites: 'sprite',
  wbs: 'wbs-diagram',
  wire: SPEC,
  yaml: 'yaml',
}

/** The pages given over to one non-uml diagram type; a word found on one is keyed `@<type>`. */
export const PAGE_TYPES = {
  'chart-diagram': 'chart',
  'er-diagram': 'chen',
  'chronology-diagram': 'chronology',
  ebnf: 'ebnf',
  'files-diagram': 'files',
  'gantt-diagram': 'gantt',
  json: 'json',
  'mindmap-diagram': 'mindmap',
  nwdiag: 'nwdiag',
  regex: 'regex',
  salt: 'salt',
  'wbs-diagram': 'wbs',
  yaml: 'yaml',
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (text) => text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (all, dec, hex, name) => {
  if (dec) return String.fromCodePoint(Number(dec))
  if (hex) return String.fromCodePoint(parseInt(hex, 16))
  return ENTITIES[name] ?? all
})
const plain = (markup) => decode(markup.replace(/<[^>]+>/g, ''))

const HEADING = /<a [^>]*name="([0-9a-f]{16})"><\/a>\s*<!--heading-->\s*(?:<\/p>\s*)?<h([1-4])[^>]*>([\s\S]*?)<\/h\2>/g

/** The sections of a plantuml.com page: `{ anchor, title, level, codes }`, the code and pre text of each. */
export function sectionsOf(html) {
  const start = html.indexOf('<main')
  const end = html.indexOf('</main>')
  const main = html.slice(start === -1 ? 0 : start, end === -1 ? undefined : end)
  const found = [...main.matchAll(HEADING)]
  return found.map((match, i) => {
    const body = main.slice(match.index + match[0].length, found[i + 1]?.index)
    const title = plain(match[3].replace(/<div class="dropdown">[\s\S]*?<\/div><\/div>/, '')).trim()
    const codes = [...body.matchAll(/<(code|pre)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => plain(m[2])).filter(Boolean)
    return { anchor: match[1], title, level: Number(match[2]), codes }
  })
}

/** The page title, the text of its `<h1>`. */
export function pageTitle(html) {
  return sectionsOf(html).find((section) => section.level === 1)?.title
}

/** The words a heading names in its brackets: `Conditions [!if, !else]`. */
export function headingWords(title) {
  const list = title.match(/\[([^\]]*)\]\s*$/)?.[1]
  return list ? list.split(',').map((word) => word.trim()).filter(Boolean) : []
}

/** A heading without its bracketed word list: the card names the section, not the words. */
const bare = (title) => title.replace(/\s*\[[^\]]*\]\s*$/, '')

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern for `word` standing on its own: a word edge may not run on into a word, a symbol edge into a symbol. */
function standing(word, flags) {
  const edge = (ch) => (/\w/.test(ch) ? '\\w' : '[-.~=<>|*]')
  const left = /\w/.test(word[0]) ? `(?<!${edge(word[0])})` : /[-.~=<>|*]/.test(word[0]) ? `(?<!${edge(word[0])})` : ''
  const last = word[word.length - 1]
  const right = /\w/.test(last) || /[-.~=<>|*]/.test(last) ? `(?!${edge(last)})` : ''
  return new RegExp(left + escape(word) + right, flags)
}

/**
 * The section of `sections` that covers `word`: a heading naming it (`titled` also accepts a title that
 * holds it as a whole word), else the first section whose code holds it, of those `coded` accepts; null
 * when none does.
 */
export function findLink(word, page, sections, { titled = false, caseless = false, coded = () => true } = {}) {
  const flags = caseless ? 'i' : ''
  const same = (other) => (caseless ? other.toLowerCase() === word.toLowerCase() : other === word)
  const pattern = standing(word, flags)
  const hit = sections.find((s) => headingWords(s.title).some(same) || same(s.title) || (titled && pattern.test(s.title)))
    ?? sections.find((s) => coded(s) && s.codes.some((code) => pattern.test(code)))
  return hit ? { page, anchor: hit.anchor, section: bare(hit.title) } : null
}

/** `findLink`, or the page itself under its title. */
export function linkFor(word, page, sections, options) {
  return findLink(word, page, sections, options) ?? { page, section: sections.find((s) => s.level === 1)?.title ?? page }
}

/** The first string of each `['…', …]` row of a list in a source file. */
export function quotedHeads(source) {
  return [...source.matchAll(/^\s*\[\s*'([^']+)'\s*,/gm)].map((m) => m[1])
}

/** The connectors connectors.js lists, one quoted name a line in `CONNECTORS = [ … ]`. */
export function connectorWords(source) {
  const list = source.match(/CONNECTORS = \[\n([\s\S]*?)^\]/m)?.[1] ?? ''
  return [...list.matchAll(/^\s*'([^']+)',?$/gm)].map((m) => m[1])
}

/** The bare word of each `<tag…>` row: `<size:12>` is `size`. */
export function tagWords(source) {
  return quotedHeads(source).map((head) => head.match(/^<([a-z]+)/)?.[1]).filter(Boolean)
}

/**
 * Every key to its link. `pages` maps a page name to its sections, in the order a word is looked for;
 * `source` holds the word lists. A word on a page of a non-uml type is keyed `@<type>`; elsewhere the
 * first page to cover it wins. A word nothing covers has no key, unless its kind has one page to link.
 */
export function buildLinks(pages, source) {
  const out = {}
  const names = Object.keys(pages)
  const on = (page, word, options) => (pages[page] ? findLink(word, page, pages[page], options) : null)
  const whole = (page, word, options) => (pages[page] ? linkFor(word, page, pages[page], options) : null)
  const set = (key, link) => { if (link && !(key in out)) out[key] = link }

  // A word looked for over all pages: `@<type>` on a typed page, the first hit elsewhere.
  const everywhere = (kind, word) => {
    for (const page of names) {
      const link = on(page, word)
      if (!link) continue
      set(PAGE_TYPES[page] ? `${kind}:${word}@${PAGE_TYPES[page]}` : `${kind}:${word}`, link)
    }
  }

  for (const [type, page] of Object.entries(DIAGRAM_PAGES)) {
    // A diagram links its page under the page's title, not a section.
    const title = pages[page]?.find((s) => s.level === 1)?.title
    if (title && source.language.keywords.includes(`@start${type}`)) set(`diagram:${type}`, { page, section: title })
  }
  for (const word of source.directives.directives) {
    const page = ['preprocessing', 'theme', 'stdlib', 'style'].find((name) => on(name, word)) ?? 'preprocessing'
    set(`directive:${word}`, whole(page, word))
  }
  // A function no heading names links a section about a function whose code shows it, else the builtin
  // functions, else the page alone: never the first code that happens to use it.
  const builtins = pages.preprocessing?.find((s) => /^built-?in functions$/i.test(bare(s.title)))
  const listed = builtins && { page: 'preprocessing', anchor: builtins.anchor, section: bare(builtins.title) }
  const about = (s) => /function/i.test(s.title)
  for (const { name } of source.builtins) {
    set(`function:${name}`, on('preprocessing', name, { titled: true, coded: about }) ?? listed ?? whole('preprocessing', name, { coded: () => false }))
  }
  for (const word of [...source.language.keywords, ...source.language.types]) {
    if (!word.startsWith('@')) everywhere('keyword', word)
  }
  for (const word of source.connectors) everywhere('connector', word)
  for (const word of source.tags) set(`tag:${word}`, whole('creole', `<${word}`))
  const caseless = { caseless: true }
  for (const word of source.language.skinparameters) set(`skinparam:${word.toLowerCase()}`, whole('skinparam', word, caseless))
  for (const word of source.vocabulary.style.selectors) set(`selector:${word.toLowerCase()}`, whole('style', word, caseless))
  for (const word of source.vocabulary.style.properties) set(`property:${word.toLowerCase()}`, whole('style', word, caseless))
  for (const word of Object.keys(source.source.themes)) set(`theme:${word}`, whole('theme', word, caseless))
  for (const word of Object.keys(source.source.libraries)) set(`library:${word.toLowerCase()}`, whole('stdlib', word, { ...caseless, titled: true }))
  return out
}

const page = (name) => fetchText(`${SITE}/${name}`)

async function main() {
  const spec = await page(SPEC)
  const listed = [...spec.matchAll(/href="([a-z0-9-]+)"/g)].map((m) => m[1]).filter((name) => !SKIP.has(name))
  const wanted = [...new Set([...FIRST, ...listed, ...EXTRA, ...Object.values(DIAGRAM_PAGES)])]
  const pages = {}
  for (const name of wanted) {
    try {
      pages[name] = sectionsOf(name === SPEC ? spec : await page(name))
      // The sitemap page has no section markup: it is one page under its heading.
      if (name === SPEC) pages[name] = [{ title: plain(spec.match(/<h[12][^>]*>\s*([^<]+)/)?.[1] ?? 'Language specification').trim(), level: 1, codes: [] }]
      if (!pages[name].length) delete pages[name]
    } catch (error) {
      console.warn(`skipped ${error.message}`)
    }
    if (pages[name]) console.info(`${name}: ${pages[name].length} sections`)
  }
  const source = {
    language: await readData('data/language.json'),
    directives: await readData('data/directives.json'),
    builtins: await readData('data/builtins.json'),
    vocabulary: await readData('data/vocabulary.json'),
    source: await readData('data/docs/source.json'),
    connectors: connectorWords(await readFile(new URL('../src/editor/completion/connectors.js', import.meta.url), 'utf8')),
    tags: tagWords(await readFile(new URL('../src/editor/completion/creole.js', import.meta.url), 'utf8')),
  }
  const links = buildLinks(pages, source)
  await writeData('data/docs/links.json', { read: new Date().toISOString().slice(0, 10), links })
  const kinds = {}
  for (const key of Object.keys(links)) kinds[key.split(':')[0]] = (kinds[key.split(':')[0]] ?? 0) + 1
  console.info(kinds)
}

if (isMain(import.meta.url)) await main()
