/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The known element under a position (I6), as a docs key: the syntax tree's
 * token there, with its text, names it, so the grammars decide and nothing
 * parses twice. The few words no grammar marks, a theme, a skin parameter and
 * a helper command, are read from their line's form, on a line at a uml
 * diagram's top level. Every other token, a string, a label, a name or a
 * value, is none.
 */
import { ensureSyntaxTree } from '@codemirror/language'
import { diagramAt, diagramsOf } from '../blocks.js'
import { atTopLevel, inStyleBody } from '../plantuml-mode.js'
import { CONNECTORS } from '../completion/connectors.js'
import { HELPERS } from '../completion/keywords.js'

const DIAGRAM = /^@(?:start|end)([^(\s]+)/
const TAG = /^<\/?(\w+)(?:[:>]|$)/
const DIRECTIVE = /^!\w+$/
const LIBRARY = /^[ \t]*!include\w*[ \t]*<$/
const THEME = /^([ \t]*!theme[ \t]+)(\S+)/
const SKINPARAM = /^([ \t]*skinparam[ \t]+)(\w+)/
const connectors = new Set(CONNECTORS)

/** Whether the character on `side` of `pos` lies in `from`…`to`. */
const within = (pos, side, from, to) => (side < 0 ? from < pos && pos <= to : from <= pos && pos < to)

/** The key a token names, from its node's name and text; null for one that names none. */
function keyOf(state, node, pos, side) {
  const text = state.sliceDoc(node.from, node.to)
  const diagram = DIAGRAM.exec(text)
  if (diagram && (node.name === 'keyword' || node.name === 'FunctionName')) {
    return { key: `diagram:${diagram[1]}` }
  }
  switch (node.name) {
    case 'keyword':
      // PlantUML reads its commands in any case; a phrase (`end note`) is its words, one space apart.
      return { key: `keyword:${text.trim().split(/\s+/).join(' ').toLowerCase()}` }
    case 'meta': {
      // `!end function` is `!endfunction`'s; a bare `!` (`!$x = 1`) names none, nor does a
      // profile's own line (yaml's `#highlight`).
      const word = text.replace(/\s+/g, '')
      return DIRECTIVE.test(word) ? { key: `directive:${word}` } : null
    }
    case 'FunctionName':
      return text.startsWith('%') ? { key: `function:${text}` } : null
    case 'tagName': {
      const tag = TAG.exec(text)
      return tag && { key: `tag:${tag[1]}` }
    }
    case 'LinkOperator':
      return connectors.has(text) ? { key: `connector:${text}` } : null
    case 'url': {
      // The library is the path's first folder, `C4` of `<C4/C4_Container>`, lower-cased as the server names it.
      const line = state.doc.lineAt(node.from)
      const folder = text.split('/')[0]
      const end = node.from + folder.length
      return LIBRARY.test(state.sliceDoc(line.from, node.from)) && within(pos, side, node.from, end) ? { key: `library:${folder.toLowerCase()}`, to: end } : null
    }
    case 'typeName':
      return inStyleBody(state, pos) ? { key: `selector:${text.toLowerCase()}` } : null
    case 'propertyName':
      return inStyleBody(state, pos) ? { key: `property:${text.toLowerCase()}` } : null
    default:
      return null
  }
}

/** The key a line's form names where no token is: a theme, a skin parameter, a helper on its own. */
function lineKey(state, pos, side) {
  const line = state.doc.lineAt(pos)
  for (const [form, kind, lower] of [[THEME, 'theme', false], [SKINPARAM, 'skinparam', true]]) {
    const match = form.exec(line.text)
    const from = line.from + (match?.[1].length ?? 0)
    if (match && within(pos, side, from, from + match[2].length)) {
      return { key: `${kind}:${lower ? match[2].toLowerCase() : match[2]}`, from, to: from + match[2].length }
    }
  }
  const helper = line.text.trim()
  const from = line.from + line.text.indexOf(helper)
  if (HELPERS.includes(helper) && within(pos, side, from, from + helper.length)) {
    return { key: `helper:${helper}`, from, to: from + helper.length }
  }
  return null
}

/**
 * The known element at `pos`, on the `side` CodeMirror's hover gives: its key,
 * the type of the block it sits in (`uml` outside any), and its range.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} pos
 * @param {-1|1} side
 * @returns {{ key: string, type: string, from: number, to: number }|null}
 */
export function elementAt(state, pos, side) {
  const node = ensureSyntaxTree(state, pos, 50)?.resolveInner(pos, side)
  if (!node) {
    return null
  }
  // The block is read only for a key, or for untokenised text, where it decides whether a line form counts.
  const found = !node.type.isTop && keyOf(state, node, pos, side)
  if (!found && !node.type.isTop) {
    return null
  }
  const diagram = diagramAt(diagramsOf(state.doc), state.doc.lineAt(pos).number)
  const type = diagram?.type ?? 'uml'
  const element = found || (type === 'uml' && atTopLevel(state, pos, diagram?.start ?? 1) && lineKey(state, pos, side))
  if (!element) {
    return null
  }
  return { key: element.key, type, from: element.from ?? node.from, to: element.to ?? node.to }
}
