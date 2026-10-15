/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The highlight tags of the tokens @lezer/highlight has no tag for, and the
 * table StreamLanguage takes them from: a token's node is named after it, and
 * its tag found here.
 */
import { Tag, tags } from '@lezer/highlight'

/** PlantUML's `__underline__`, which no tag in @lezer/highlight names. */
export const underline = Tag.define()

/** A sprite's pixel rows and payloads: data, which no other tag names. */
export const spriteData = Tag.define()

/** A preprocessor variable: its own tag, so a nested mode's `variable` (YAML's `&anchor`) keeps its colour. */
export const variable = Tag.define(tags.variableName)

/** The name after `@start<type>` (`@startuml UML Fun`), a name of its own. */
export const diagramName = Tag.define(tags.name)

/** A calendar date or a time (`2026-10-14`, `D+5`, `12:30`), a number of its own. */
export const date = Tag.define(tags.number)

/** A link drawn between elements (`-->`, `<|--`), an operator of its own. */
export const linkOperator = Tag.define(tags.operator)

/** A repetition (a regex's `*` or `{2,5}`, ebnf's `3 *`), an operator of its own. */
export const quantifier = Tag.define(tags.operator)

/** The body of a diagram this server cannot draw, a comment of its own. */
export const inactive = Tag.define(tags.comment)

/**
 * StreamLanguage names a node after its token, and takes the highlight from
 * here for a name @lezer/highlight has no tag for. The legacy names an inner
 * mode emits (`atom`, `number`, `property`, `def`, `variable-2`, …) map already.
 */
export const tokenTable = {
  SpriteData: spriteData,
  ColorLiteral: tags.color,
  StyleNumber: tags.string,
  VariableName: variable,
  FunctionName: tags.function(tags.variableName),
  underline,
  DiagramName: diagramName,
  Date: date,
  LinkOperator: linkOperator,
  Quantifier: quantifier,
  Inactive: inactive,
}
