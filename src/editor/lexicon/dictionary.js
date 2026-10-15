/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The styling dictionary (spec, "Styling dictionary") as code: every category
 * a grammar may name a token with, the token string it writes, and the look
 * the theme gives it. A grammar emits only these (G1); the dictionary test
 * holds each one to it.
 */

/** @type {{ id: string, tokens: string[], look: string }[]} */
export const DICTIONARY = [
  { id: 'Y1', tokens: ['keyword'], look: 'keyword' },
  { id: 'Y2', tokens: ['meta'], look: 'directive' },
  { id: 'Y3', tokens: ['modifier'], look: 'keyword' },
  { id: 'Y4', tokens: ['typeName'], look: 'moss' },
  { id: 'Y5', tokens: [], look: 'text' },
  { id: 'Y6', tokens: ['VariableName'], look: 'slate' },
  { id: 'Y7', tokens: ['propertyName'], look: 'slate' },
  { id: 'Y8', tokens: ['attributeName'], look: 'orange' },
  { id: 'Y9', tokens: ['annotation'], look: 'orange plain' },
  { id: 'Y10', tokens: ['FunctionName'], look: 'ochre' },
  { id: 'Y11', tokens: ['tagName'], look: 'maroon' },
  { id: 'Y12', tokens: ['labelName'], look: 'violet italic' },
  { id: 'Y13', tokens: ['DiagramName'], look: 'underline' },
  { id: 'Y14', tokens: ['heading'], look: 'grey bold' },
  { id: 'Y15', tokens: ['string'], look: 'green' },
  { id: 'Y16', tokens: ['number'], look: 'info' },
  { id: 'Y17', tokens: ['Date'], look: 'info' },
  { id: 'Y18', tokens: ['ColorLiteral'], look: 'green' },
  { id: 'Y19', tokens: ['atom'], look: 'green' },
  { id: 'Y20', tokens: ['escape'], look: 'ochre' },
  { id: 'Y21', tokens: ['link'], look: 'link underline' },
  { id: 'Y22', tokens: ['LinkOperator'], look: 'amber' },
  { id: 'Y23', tokens: ['arithmeticOperator'], look: 'amber' },
  { id: 'Y24', tokens: ['compareOperator'], look: 'amber' },
  { id: 'Y25', tokens: ['logicOperator'], look: 'amber bold' },
  { id: 'Y26', tokens: ['definitionOperator'], look: 'grey' },
  { id: 'Y27', tokens: ['Quantifier'], look: 'amber' },
  { id: 'Y28', tokens: ['list'], look: 'amber' },
  { id: 'Y29', tokens: ['operator'], look: 'amber' },
  { id: 'Y30', tokens: ['paren', 'squareBracket', 'brace', 'angleBracket', 'bracket'], look: 'grey bold' },
  { id: 'Y31', tokens: ['separator'], look: 'grey' },
  { id: 'Y32', tokens: ['punctuation'], look: 'grey' },
  { id: 'Y33', tokens: ['comment'], look: 'grey italic' },
  { id: 'Y34', tokens: ['Inactive'], look: 'grey plain' },
  { id: 'Y35', tokens: ['strong', 'emphasis', 'monospace', 'underline'], look: 'font' },
  { id: 'Y36', tokens: ['SpriteData'], look: 'grey' },
  { id: 'Y37', tokens: [], look: 'text' },
  { id: 'Y38', tokens: ['url'], look: 'link' },
]

/** The Creole text styles (Y35), which a token may be joined with a base token to carry. */
const TEXT_STYLES = DICTIONARY.find((row) => row.id === 'Y35').tokens

/** The style profile's own number: a string to the theme, a number to the grammar. */
const EXTRA = ['StyleNumber']

const BASES = [...DICTIONARY.flatMap((row) => row.tokens), ...EXTRA]

/**
 * Every token a grammar may emit: the dictionary's, the style profile's own
 * `StyleNumber`, a text style joined with a base token (`strong labelName`),
 * and a diagram name that is a link (`DiagramName url`).
 *
 * @type {Set<string>}
 */
export const DICTIONARY_TOKENS = new Set([
  ...BASES,
  ...TEXT_STYLES.flatMap((style) => BASES.map((base) => `${style} ${base}`)),
  'DiagramName url',
])
