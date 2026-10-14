/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The source pane's colours, all Nextcloud theme variables, so the editor follows
 * the light, dark and high-contrast themes. CodeMirror's defaultHighlightStyle
 * hard-codes dark colours for a white page and vanishes on a dark one.
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * A status element colour pulled a quarter of the way to the text colour: the
 * hue survives both themes, and contrast follows the text. (The `*-success-text`
 * and `*-warning-text` variables are near-white on dark, made for status chips.)
 */
const towardText = (variable) => `color-mix(in srgb, var(${variable}) 75%, var(--color-main-text))`

/** One rule per token plantuml-mode.js emits. */
export const highlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: 'var(--color-primary-element)', fontWeight: 'bold' },
  { tag: tags.keyword, color: 'var(--color-info-text)', fontWeight: 'bold' },
  { tag: tags.string, color: towardText('--color-element-success') },
  { tag: tags.operator, color: towardText('--color-element-warning') },
  { tag: tags.comment, color: 'var(--color-text-maxcontrast)', fontStyle: 'italic' },
])

/** Text, caret and selection over CodeMirror's base theme, which assumes a white page. */
const surface = EditorView.theme({
  '&': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
  },
  // On .cm-content itself: another app's global div[contenteditable=true] rule
  // (files_bpm sets color: #000) outranks a colour inherited from '&'.
  '.cm-content': {
    color: 'var(--color-main-text)',
    backgroundColor: 'transparent',
    caretColor: 'var(--color-main-text)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-main-text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--color-primary-element-light)',
  },
})

export const plantumlTheme = [surface, syntaxHighlighting(highlightStyle)]
