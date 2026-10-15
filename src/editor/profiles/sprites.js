/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startsprites` blocks, a gallery of the sprites defined in them. A line is
 * a `sprite` definition or `listsprites`; any other (a title, a skinparam) is
 * plain. A definition's `[WxH/16z]` size, `{` rows `}`, payload and inline
 * `<svg>` are read as the PlantUML mode reads them in a uml block: a profile
 * imports no core module, so the rules are written out again here.
 */
const ATTRIBUTE = /[\w:-]+(?=\s*=)/

const mode = {
  // top: between definitions; name: after `sprite`; head: the rest of its line;
  // rows: the pixel rows of a `{` body; svg: down to the line ending `</svg>`.
  startState: () => ({ phase: 'top' }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (stream.sol() && state.phase === 'head') {
      state.phase = 'top'
    }
    if (stream.eatSpace()) {
      return null
    }
    switch (state.phase) {
    case 'top':
      if (stream.match(/sprite\b/)) {
        state.phase = 'name'
        return 'keyword'
      }
      if (stream.match(/listsprites?\b/)) {
        return 'keyword'
      }
      stream.skipToEnd()
      return null
    case 'name':
      stream.match(/\$?[-.%\w]+/)
      state.phase = 'head'
      return 'VariableName'
    case 'head':
      return head(stream, state)
    case 'rows':
      if (stream.match(/\}/)) {
        state.phase = 'top'
        return 'punctuation'
      }
      if (stream.match(/end[ \t]*sprite\b/)) {
        state.phase = 'top'
        return 'keyword'
      }
      stream.match(/\S+/)
      return 'SpriteData'
    default:
      return svg(stream, state)
    }
  },
}

/** The rest of a header: size, `{`, `<svg`, `data:…,` and a payload. */
function head(stream, state) {
  if (stream.match(/\[(?=\d+x\d+\/(?:\d+z?|color)\])/)) {
    return 'punctuation'
  }
  if (stream.match(/\d+/)) {
    return 'number'
  }
  if (stream.match(/[x/\]]/)) {
    return 'punctuation'
  }
  if (stream.match(/(?:z|color)(?=\])/)) {
    return 'keyword'
  }
  if (stream.match(/\{(?=\s*$)/)) {
    state.phase = 'rows'
    return 'punctuation'
  }
  if (stream.match(/<svg(?=[\s>])/)) {
    state.phase = 'svg'
    return 'tagName'
  }
  if (stream.match(/data:[^,\s]*,/)) {
    return 'attributeName'
  }
  stream.match(/\S+/)
  return 'SpriteData'
}

/** A tag's parts: its name and `>` tags, an attribute's name an attribute, a value a string. */
function svg(stream, state) {
  if (stream.match('</svg>')) {
    state.phase = 'top'
    return 'tagName'
  }
  if (stream.match(/<\/?[\w:-]+|\/?>/)) {
    return 'tagName'
  }
  if (stream.match(ATTRIBUTE)) {
    return 'attributeName'
  }
  if (stream.match(/"[^"]*"|'[^']*'/)) {
    return 'string'
  }
  if (stream.match('=')) {
    return 'punctuation'
  }
  stream.next()
  return null
}

export default () => ({ type: 'sprites', mode, completions: [], lints: [], values: [] })
