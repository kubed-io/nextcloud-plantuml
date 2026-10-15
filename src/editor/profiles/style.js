/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Style blocks, `<style>` … `</style>`, in any diagram: their grammar,
 * completion from PlantUML's own selectors and properties, and the check on
 * property names. The PlantUML mode hands a block's lines to `mode`.
 */
import { styleMode } from './style-grammar.js'
import { styleCompletion } from '../completion/style.js'
import { styleLint } from '../lint/style.js'

/** @param {import('./index.js').Core} core */
export default (core) => ({ type: 'style', mode: styleMode, completions: [styleCompletion(core)], lints: [styleLint(core)], values: [] })
