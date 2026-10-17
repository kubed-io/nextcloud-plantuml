/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Every template Add diagram offers (editor spec A5, A8, A9), by type and in
 * order: the built-ins, then the admin's shared files, then the user's own.
 * Pure: the menu and the modal render what this gives. In the add chunk, so
 * what it needs of the editor's comes in `core` (index.js).
 */
import templates from '../data/templates.json'
import { TYPES } from './types.js'

/**
 * @typedef {object} Template
 * @property {string} type the word after `@start`
 * @property {string} title what the row shows
 * @property {string} name what goes on the `@start` line when it is added (A4)
 * @property {string} description the row's second line
 * @property {string} text the block it adds, `@start` line to `@end` line
 * @property {string} icon an ICONS key
 * @property {'builtin'|'shared'|'yours'} source
 */

const BY_TYPE = new Map(TYPES.map((t) => [t.type, t]))
const FROM = { builtin: 0, shared: 1, yours: 2 }

/**
 * Empty (A8): the two lines and a blank one, braces for salt and json as B8 inserts them.
 *
 * @param {string} type
 * @param {Pick<import('./index.js').Core, 'BRACED'>} core
 */
export function emptyText(type, { BRACED }) {
  return `@start${type}\n${BRACED.includes(type) ? '{\n\t\n}' : ''}\n@end${type}`
}

/**
 * @param {Record<string, { summary?: string, example?: string }>} own own.json
 * @param {Pick<import('./index.js').Core, 'BRACED'>} core
 * @returns {Template[]}
 */
export function builtins(own, core) {
  return TYPES.flatMap(({ type, icon, description }) => {
    const list = [{ type, title: 'Empty', name: type, description: 'Just the start and end lines', text: emptyText(type, core), icon, source: 'builtin' }]
    const example = own[`diagram:${type}`]?.example
    if (example?.startsWith(`@start${type}`)) {
      list.push({ type, title: 'Example', name: type, description, text: example, icon, source: 'builtin' })
    }
    for (const t of templates[type] ?? []) {
      list.push({ type, title: t.title, name: t.name, description: t.description, text: t.text, icon: t.icon, source: 'builtin' })
    }
    return list
  })
}

/**
 * A9: each closed block of each file, of a type A6 lists.
 *
 * @param {{ source: 'shared'|'yours', path: string, text: string }[]} files
 * @param {Pick<import('./index.js').Core, 'blocksOf'|'scan'>} core
 * @returns {Template[]}
 */
export function fromFiles(files, { blocksOf, scan }) {
  return files.flatMap(({ source, path, text: raw }) => {
    const text = raw.replace(/\r\n?/g, '\n')
    const lines = text.split('\n')
    const base = path.split('/').pop().replace(/\.[^.]+$/, '')
    let unnamed = 0
    return blocksOf(scan(text))
      .filter((b) => b.end !== null && BY_TYPE.has(b.type))
      .map((b) => {
        const block = lines.slice(b.start - 1, b.end)
        const title = b.name || (++unnamed === 1 ? base : `${base} ${unnamed}`)
        const comment = block.slice(1, -1).find((line) => line.trim().startsWith("'"))
        const note = (comment && comment.trim().replace(/^'+\s*/, '')) || path
        return { type: b.type, title, name: title, description: `${source === 'shared' ? 'Shared' : 'Yours'} · ${note}`, text: block.join('\n'), icon: BY_TYPE.get(b.type).icon, source }
      })
  })
}

/**
 * @param {Template[]} builtIn
 * @param {Template[]} files
 * @returns {Map<string, Template[]>} every type of A6, in its order
 */
export function arrange(builtIn, files) {
  const byType = new Map(TYPES.map(({ type }) => [type, []]))
  for (const t of builtIn) byType.get(t.type)?.push(t)
  const sorted = [...files].sort((a, b) => FROM[a.source] - FROM[b.source] || a.title.localeCompare(b.title))
  for (const t of sorted) byType.get(t.type)?.push(t)
  return byType
}

/** The types whose name, word, `@start` word or any template title holds `query`, any case. */
export function matching(arranged, query) {
  const q = query.trim().toLowerCase()
  return TYPES
    .filter(({ type, name }) => !q || [name, type, `@start${type}`, ...arranged.get(type).map((t) => t.title)].some((s) => s.toLowerCase().includes(q)))
    .map(({ type }) => type)
}
