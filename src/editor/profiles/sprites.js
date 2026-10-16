/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `@startsprites` blocks, a gallery of the sprites defined in them. A line is
 * a `sprite` definition or `listsprites`; any other (a title, a skinparam) is
 * plain. A definition is read as the PlantUML mode reads one in a uml block, by
 * the lexicon's sprite lines and states (`core.lex.spriteLines`, `spriteStates`):
 * its `[WxH/16z]` size, `{` rows `}`, payload and inline `<svg>`.
 */
export default (core) => {
  const { spriteLines, spriteStates, table } = core.lex
  const mode = table({
    start: [...spriteLines, { regex: /.+/, token: null }],
    ...spriteStates,
  }, { nextLine: { spriteHead: 'start' } })
  return { type: 'sprites', mode, completions: [], lints: [], values: [] }
}
