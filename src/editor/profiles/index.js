/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Profiles: the grammar, completion and lint for one diagram type, each a
 * module beside this one, built as a chunk of its own and imported only when
 * an open file holds a block of that type. A new profile is a file here and a
 * line in `PROFILES`.
 *
 * A profile module's default export is a factory given `Core`: a profile that
 * imported core modules itself would make them a chunk the editor imports
 * statically, which one failed download would then break whole. A profile
 * imports only libraries the editor does not, as a shared one becomes such a
 * chunk too; what it needs of the editor's comes in `Core`.
 *
 * @typedef {object} Core
 * @property {typeof scan} scan
 * @property {typeof translate} t @nextcloud/l10n's translate, called with the
 *   app id written out so Nextcloud's string extractor finds the strings
 * @property {typeof lex} lex the lexicon: the rules the core grammar shares,
 *   and the helpers that build a stream mode from them
 *
 * @typedef {object} Profile
 * @property {string} type the word after `@start`
 * @property {object} [mode] a stream mode for the block's lines
 * @property {Function[]} completions completion sources
 * @property {Function[]} lints lint rules
 * @property {object[]} values where its values sit, for choosers and steppers
 */
import { EditorState } from '@codemirror/state'
import { translate } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { scan } from '../blocks.js'
import { lex } from '../lexicon/index.js'
import { plantumlLanguage } from '../plantuml-mode.js'
import { profileRules } from '../lint/index.js'
import { valuesFacet } from '../values/index.js'

/** @type {Record<string, () => Promise<{ default: (core: Core) => Profile }>>} */
export const PROFILES = {
  yaml: () => import('./yaml.js'),
  style: () => import('./style.js'),
  board: () => import('./board.js'),
  git: () => import('./git.js'),
  sprites: () => import('./sprites.js'),
  gantt: () => import('./gantt.js'),
  math: () => import('./math.js'),
  latex: () => import('./latex.js'),
  // PlantUML's alias of gantt: the same chunk, its profile under the type `project`.
  project: () => import('./gantt.js').then((module) => ({ default: module.project })),
  regex: () => import('./regex.js'),
  mindmap: () => import('./tree.js'),
  // The same chunk: wbs reads what mindmap does differently.
  wbs: () => import('./tree.js').then((module) => ({ default: module.wbs })),
}

const ARCHIMATE = /^\s*(?:!include\s+<archimate\/|archimate\b)/
const STYLE = /^[ \t]*<style/m
const MATH = /<math>/
const LATEX = /<latex>/

/**
 * The profiles a file needs: its block types, archimate when a uml block
 * includes the library or draws an element, style when a line starts
 * `<style`, and math or latex when a line holds an inline `<math>` or a `<latex>`. Only those with a
 * profile, so the loader never asks for another.
 *
 * @param {import('../blocks.js').Diagram[]} diagrams
 * @param {string} text
 * @return {Set<string>}
 */
export function needed(diagrams, text) {
  const types = new Set(diagrams.map((d) => d.type))
  const lines = text.split('\n')
  if (diagrams.some((d) => d.type === 'uml' && lines.slice(d.from - 1, d.to).some((line) => ARCHIMATE.test(line)))) {
    types.add('archimate')
  }
  if (STYLE.test(text)) {
    types.add('style')
  }
  if (MATH.test(text)) {
    types.add('math')
  }
  if (LATEX.test(text)) {
    types.add('latex')
  }
  return new Set([...types].filter((type) => Object.hasOwn(PROFILES, type)))
}

/** @type {Core} what every profile's factory is given */
export const core = { scan, t: translate, lex }
const loading = new Map() // type → Promise<Profile|null>, for the page
const failed = new Set()

/**
 * The profile for `type`, imported once for the page. One that will not load
 * is logged and gives null, until `resetProfiles` lets it be tried again.
 *
 * @param {string} type
 * @return {Promise<Profile|null>}
 */
export function loadProfile(type) {
  if (!loading.has(type)) {
    loading.set(type, Promise.resolve()
      .then(() => PROFILES[type]())
      .then((module) => module.default(core))
      .catch((e) => {
        console.error(`[${APP_ID}] could not load the ${type} profile`, e)
        failed.add(type)
        return null
      }))
  }
  return loading.get(type)
}

/** Forgets the profiles that failed, for the next open to try again. */
export function resetProfiles() {
  for (const type of failed) {
    loading.delete(type)
  }
  failed.clear()
}

/**
 * What the loaded profiles add to the editor, for its profiles Compartment: a
 * PlantUML language that reads their blocks, their completion, their lint and
 * their values.
 *
 * @param {Profile[]} profiles
 */
export function profileExtension(profiles) {
  const inner = Object.fromEntries(profiles.filter((p) => p.mode).map((p) => [p.type, p.mode]))
  return [
    plantumlLanguage(inner),
    ...profiles.flatMap((p) => p.completions).map((source) => EditorState.languageData.of(() => [{ autocomplete: source }])),
    profileRules.of(profiles.flatMap((p) => p.lints)),
    valuesFacet.of(profiles.flatMap((p) => p.values ?? [])),
  ]
}

/**
 * Loads what each scan of the open file needs, once per editor, and hands
 * `apply` the Compartment's new content as each profile arrives. A profile
 * that fails is not asked for again until the next open.
 *
 * @param {(extension: Array) => void} apply
 * @return {(diagrams: import('../blocks.js').Diagram[], text: string) => void}
 */
export function profileLoader(apply) {
  const asked = new Set()
  const loaded = new Map()
  return (diagrams, text) => {
    for (const type of needed(diagrams, text)) {
      if (asked.has(type)) {
        continue
      }
      asked.add(type)
      loadProfile(type).then((profile) => {
        if (profile) {
          loaded.set(type, profile)
          apply(profileExtension([...loaded.values()]))
        }
      })
    }
  }
}
