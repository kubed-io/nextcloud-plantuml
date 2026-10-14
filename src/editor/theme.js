/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The source pane's colours, all Nextcloud theme variables, so the editor follows
 * the light, dark and high-contrast themes. CodeMirror's defaultHighlightStyle
 * and base theme hard-code colours for a white page and vanish on a dark one.
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

/** Over CodeMirror's base theme, which assumes a white page; each rule there has one here. */
export const surfaceRules = {
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

  '.cm-activeLine': { backgroundColor: 'var(--color-background-hover)' },
  '.cm-activeLineGutter': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-background-dark)',
  },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'transparent',
    outline: '1px solid var(--color-primary-element)',
  },
  '&.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'transparent',
    outline: '1px solid var(--color-element-error, var(--color-error))',
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--color-primary-element-light)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--color-element-warning) 35%, transparent)',
    outline: 'none',
  },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--color-primary-element-light)' },

  // The search panel, as a Nextcloud toolbar: its fields and buttons keep the
  // page's own input and button styles.
  '.cm-panels': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
  '.cm-panel.cm-search': { padding: '4px 40px 4px 16px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': { margin: '2px 6px 2px 0', fontSize: 'inherit' },
  '.cm-panel.cm-search [name=close]': {
    top: '50%',
    right: '8px',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-maxcontrast)',
  },

  // The completion popup, as Nextcloud draws a popover.
  '.cm-tooltip': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius-large)',
    boxShadow: '0 1px 10px var(--color-box-shadow)',
  },
  // The list scrolls, so its own rounding keeps the selected row inside the corners.
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    borderRadius: 'inherit',
    fontFamily: 'var(--font-face-mono, monospace)',
    maxHeight: '16em',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '2px 8px',
    lineHeight: '1.6',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    color: 'var(--color-primary-element-light-text)',
    backgroundColor: 'var(--color-primary-element-light)',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none',
    fontWeight: 'bold',
  },
  '.cm-completionDetail': {
    color: 'var(--color-text-maxcontrast)',
    fontStyle: 'normal',
  },
  // Each kind of option in its highlight colour.
  '.cm-completionIcon': { color: 'var(--color-text-maxcontrast)', opacity: '1' },
  '.cm-completionIcon-keyword': { color: 'var(--color-info-text)' },
  '.cm-completionIcon-variable': { color: towardText('--color-element-success') },
  '.cm-completionIcon-text': { color: towardText('--color-element-warning') },
  '.cm-completionInfo': {
    padding: '4px 8px',
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius-large)',
  },
}

export const plantumlTheme = [EditorView.theme(surfaceRules), syntaxHighlighting(highlightStyle)]
