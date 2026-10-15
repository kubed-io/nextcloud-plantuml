/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Style blocks, `<style>` … `</style>`, in any diagram: their grammar,
 * completion from PlantUML's own selectors and properties, the check on
 * property names, and where their values sit for the value registry (W3).
 * The PlantUML mode hands a block's lines to `mode`.
 */
import vocabulary from '../data/vocabulary.json'
import { readStyle, styleBlocks, styleMode } from './style-grammar.js'
import { styleCompletion } from '../completion/style.js'
import { styleLint } from '../lint/style.js'

/** The properties whose values are a list (X9), by their name in lower case. */
const LISTS = {
  fontstyle: vocabulary.style.fontStyles,
  horizontalalignment: ['left', 'center', 'right'],
  showstereotype: ['true', 'false'],
}

/** The numeric properties that cannot be negative (W2). */
const NON_NEGATIVE = new Set(['fontsize', 'linethickness', 'padding', 'margin', 'roundcorner', 'maximumwidth', 'minimumwidth', 'width', 'markersize', 'barwidth', 'shadowing'])

const VALUE_TOKENS = new Set(['number', 'atom', 'ColorLiteral', 'string'])

/**
 * A declaration's value when it is one number or one word from a list; a
 * listed property with no value yet has an empty place after its space, for
 * completion to open on.
 */
function declared({ property, end, tokens }, lineText, lineFrom) {
  const key = property.toLowerCase()
  const list = Object.hasOwn(LISTS, key) ? LISTS[key] : null
  if (tokens.length === 1) {
    const [{ token, from, to }] = tokens
    if (token === 'number') {
      return { from: lineFrom + from, to: lineFrom + to, kind: 'number', ...(NON_NEGATIVE.has(key) ? { min: 0 } : {}) }
    }
    return token === 'atom' && list ? { from: lineFrom + from, to: lineFrom + to, kind: 'list', options: () => list } : null
  }
  const gap = !tokens.length && list && /^[ \t]+(?=$|[;}])/.exec(lineText.slice(end))
  return gap ? { from: lineFrom + end + gap[0].length, to: lineFrom + end + gap[0].length, kind: 'list', options: () => list } : null
}

/** @type {import('../values/index.js').ValueEntry} */
const styleValue = {
  match(lineText, state, lineFrom) {
    const number = state.doc.lineAt(lineFrom).number
    const block = styleBlocks(state.doc.toString().split('\n')).find((candidate) => candidate.body.some((line) => line.line === number))
    if (!block) {
      return []
    }
    const found = []
    let declaration = null
    const close = () => {
      const value = declaration && declared(declaration, lineText, lineFrom)
      if (value) found.push(value)
      declaration = null
    }
    const body = block.body.slice(0, block.body.findIndex((line) => line.line === number) + 1)
    readStyle(body, (token, line, from, to, text) => {
      if (line.line !== number) return
      if (token === 'propertyName') {
        close()
        declaration = { property: text, end: to, tokens: [] }
      } else if (declaration && VALUE_TOKENS.has(token)) {
        declaration.tokens.push({ token, from, to })
      } else {
        close()
      }
    })
    close()
    return found
  },
}

/** @param {import('./index.js').Core} core */
export default (core) => ({ type: 'style', mode: styleMode, completions: [styleCompletion(core)], lints: [styleLint(core)], values: [styleValue] })
