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
import { spriteData, underline, variable } from './plantuml-mode.js'

/**
 * A status element colour pulled a quarter of the way to the text colour: the
 * hue survives both themes, and contrast follows the text. (The `*-success-text`
 * and `*-warning-text` variables are near-white on dark, made for status chips.)
 */
const towardText = (variable) => `color-mix(in srgb, var(${variable}) 75%, var(--color-main-text))`

/**
 * A style block's own hues, each a mix of theme variables as the rest are.
 * Moss, a green leaning to olive, is its selectors. Slate, the primary pulled
 * toward the text, is its property names (and a preprocessor's `$variables`).
 * The attribute orange, warning leaning to red, is every attribute and every
 * `.class` or `:depth(n)`; arrows keep the plain warning orange beside it.
 */
const MOSS = 'color-mix(in srgb, color-mix(in srgb, var(--color-element-success) 55%, var(--color-element-warning)) 72%, var(--color-main-text))'
const SLATE = 'color-mix(in srgb, var(--color-primary-element) 55%, var(--color-main-text))'
const ATTRIBUTE = 'color-mix(in srgb, color-mix(in srgb, var(--color-element-warning) 75%, var(--color-element-error)) 75%, var(--color-main-text))'
/** A preprocessor function's name, a muted ochre, as VS Code draws functions brown. */
const OCHRE = 'color-mix(in srgb, var(--color-favorite) 55%, var(--color-text-maxcontrast))'

/** Nextcloud names no monospace face, so the system's own. */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** One rule per token plantuml-mode.js emits, its nested modes' included. */
export const highlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: 'var(--color-primary-element)', fontWeight: 'bold' },
  { tag: tags.keyword, color: 'var(--color-info-text)', fontWeight: 'bold' },
  { tag: tags.string, color: towardText('--color-element-success') },
  { tag: tags.operator, color: towardText('--color-element-warning') },
  { tag: tags.comment, color: 'var(--color-text-maxcontrast)', fontStyle: 'italic' },
  // A link's label reads as an annotation: italic like a caption, in violet,
  // the one hue no other token uses (error red with primary blue, pulled 15%
  // toward the text). #9083ac at 5.1:1 on dark, #5b3148 at 10.7:1 on light.
  { tag: tags.labelName, color: 'color-mix(in srgb, color-mix(in srgb, var(--color-element-error) 50%, var(--color-primary-element)) 85%, var(--color-main-text))', fontStyle: 'italic' },
  { tag: tags.heading, color: 'var(--color-text-maxcontrast)', fontWeight: 'bold' },
  // A colour is a literal value, as a string is; its swatch shows the colour itself.
  { tag: tags.color, color: towardText('--color-element-success') },
  // `bold`, `dashed` in a styled link are part of the link; a style's
  // `.stereotype` and `:depth(n)` are part of its selector.
  { tag: [tags.attributeName, tags.className], color: ATTRIBUTE },
  // Creole. The text styles set no colour, so they keep that of the text they sit in.
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  // The source is monospace already, so a faint ground sets it apart.
  { tag: tags.monospace, fontFamily: MONO, backgroundColor: 'color-mix(in srgb, var(--color-main-text) 8%, transparent)' },
  { tag: underline, textDecoration: 'underline' },
  { tag: tags.link, color: towardText('--color-primary-element'), textDecoration: 'underline' },
  // Tags (`<style …>`, `<b>`, `<&icon>`) in maroon, as
  // VS Code's light theme draws HTML tags: in grey they read as comments.
  { tag: tags.tagName, color: towardText('--color-element-error') },
  // A style block's selectors (`node`, `arrow`) and property names (`BackgroundColor`).
  { tag: tags.typeName, color: MOSS },
  { tag: tags.propertyName, color: SLATE },
  // The preprocessor's `$variables`, and its procedures' and built-ins' names (`$ask(`, `%strlen(`).
  { tag: variable, color: SLATE },
  { tag: tags.function(tags.variableName), color: OCHRE },
  // Table bars and the like recede behind the text they mark up.
  { tag: tags.punctuation, color: 'var(--color-text-maxcontrast)' },
  // A sprite's pixel rows and payloads are data, receding as punctuation does.
  { tag: spriteData, color: 'var(--color-text-maxcontrast)' },
  // A nested mode's values and names (YAML's keys are atoms). Atom would
  // otherwise inherit the keyword's bold.
  { tag: [tags.atom, tags.special(tags.variableName)], color: towardText('--color-element-success') },
  { tag: [tags.number, tags.definition(tags.variableName)], color: 'var(--color-info-text)' },
])

/** Text tinted over whatever is beneath, so a selection drawn behind it still shows. */
const tint = (percent) => `color-mix(in srgb, var(--color-main-text) ${percent}%, transparent)`

/** One colour per diagnostic severity; a hint is drawn as info. */
const ERROR = 'var(--color-element-error, var(--color-error))'
const WARNING = 'var(--color-element-warning, var(--color-warning))'
const INFO = 'var(--color-element-info, var(--color-info))'

/** Core's button rules (height, padding, border, margin, hover ground) taken back. */
const QUIET_BUTTON = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '0',
  minHeight: '0',
  margin: '0',
  padding: '0',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: '0',
  boxShadow: 'none',
  outline: 'none',
  cursor: 'pointer',
}

/** A button's selector with core's state selectors beside it, which outrank it alone. */
const buttonStates = (selector) => [selector, `${selector}:not(:disabled):hover`, `${selector}:not(:disabled):active`, `${selector}:focus`].join(', ')

/**
 * Over CodeMirror's base theme, which assumes a white page, wherever the editor
 * shows its colours; and over core's input and button rules, which reach in.
 */
export const surfaceRules = {
  '&': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
  },
  // On .cm-content itself: core's server.css styles every div[contenteditable]
  // as a form input (border, radius, margin, font, pointer), and files_bpm sets
  // color: #000 on it; inherited values from '&' lose to both.
  // div.* matches core's div[contenteditable=true]:not(:disabled):hover (0,3,1).
  'div.cm-content, div.cm-content:not(:disabled):hover, div.cm-content:not(:disabled):focus, div.cm-content:not(:disabled):active': {
    color: 'var(--color-main-text)',
    backgroundColor: 'transparent',
    caretColor: 'var(--color-main-text)',
    border: 'none',
    borderRadius: '0',
    boxShadow: 'none',
    outline: 'none',
    margin: '0',
    cursor: 'text',
    fontFamily: MONO,
    // Core fixes width: 130px and its UI font size; the content must grow to its longest line.
    width: 'auto',
    fontSize: 'inherit',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-main-text)' },
  // Primary at a third: --color-primary-element-light is near-black navy on the dark theme.
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--color-primary-element) 35%, transparent)',
  },

  '.cm-activeLine': { backgroundColor: tint(6) },
  '.cm-activeLineGutter': {
    color: 'var(--color-main-text)',
    backgroundColor: tint(10),
  },
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'transparent',
    outline: '1px solid var(--color-primary-element)',
  },
  '&.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'transparent',
    outline: '1px solid var(--color-element-error, var(--color-error))',
  },
  // Marks paint over the selection: the other matches are outlined, the selected one left to it.
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--color-primary-element) 12%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--color-primary-element) 50%, transparent)',
  },
  '.cm-selectionMatch.cm-selectionMatch-main': { backgroundColor: 'transparent', outline: 'none' },
  // The fold chevrons recede until pointed at; the placeholder is a pill, as a tag.
  '.cm-foldGutter span': { color: 'var(--color-text-maxcontrast)' },
  '.cm-foldGutter span:hover': { color: 'var(--color-main-text)' },
  '.cm-foldPlaceholder': {
    color: 'var(--color-text-maxcontrast)',
    backgroundColor: 'var(--color-background-dark)',
    border: 'none',
    borderRadius: 'var(--border-radius-pill, 100px)',
    padding: '0 8px',
  },
  '.cm-snippetField': { backgroundColor: tint(12) },
  '.cm-snippetFieldPosition': { borderLeft: '1.4px dotted var(--color-text-maxcontrast)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--color-element-warning) 35%, transparent)',
    outline: 'none',
  },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--color-primary-element-light)' },

  // The search panel, as a Nextcloud toolbar. The base theme's white field and
  // grey gradient outrank core's input and button rules; '& .cm-panel.cm-search'
  // outranks both, and core's :hover too.
  '.cm-panels': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
  },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-border)' },
  '.cm-panel.cm-search': { padding: '4px 40px 4px 16px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': { margin: '2px 6px 2px 0', fontSize: 'inherit' },
  '& .cm-panel.cm-search .cm-textfield': {
    minHeight: 'var(--default-clickable-area)',
    padding: '0 12px',
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
    border: '2px solid var(--color-border-maxcontrast)',
    borderRadius: 'var(--border-radius-large)',
  },
  '& .cm-panel.cm-search .cm-textfield:focus': { borderColor: 'var(--color-main-text)' },
  '& .cm-panel.cm-search .cm-button, & .cm-panel.cm-search .cm-button:active': {
    minHeight: 'var(--default-clickable-area)',
    padding: '0 14px',
    color: 'var(--color-primary-element-light-text)',
    backgroundColor: 'var(--color-primary-element-light)',
    backgroundImage: 'none',
    border: 'none',
    borderRadius: 'var(--border-radius-element, var(--border-radius-large))',
    fontWeight: 'bold',
  },
  '& .cm-panel.cm-search .cm-button:hover': { backgroundColor: 'var(--color-primary-element-light-hover)' },
  '& .cm-panel.cm-search [name=close]': {
    top: '50%',
    right: '8px',
    width: 'var(--default-clickable-area)',
    height: 'var(--default-clickable-area)',
    minHeight: '0',
    padding: '0',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-maxcontrast)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '50%',
    fontSize: '20px',
  },
  '& .cm-panel.cm-search [name=close]:hover': {
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-background-hover)',
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
    fontFamily: MONO,
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
  '.cm-tooltip-autocomplete-disabled ul li[aria-selected]': {
    color: 'var(--color-text-maxcontrast)',
    backgroundColor: 'var(--color-background-dark)',
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
  // Letters, not CodeMirror's emoji (a key for a keyword), which read as clip art here.
  '.cm-completionIcon-keyword': { color: 'var(--color-info-text)' },
  '.cm-completionIcon-keyword:after': { content: '"k"' },
  '.cm-completionIcon-variable': { color: towardText('--color-element-success') },
  '.cm-completionIcon-variable:after': { content: '"x"' },
  '.cm-completionIcon-text': { color: towardText('--color-element-warning') },
  '.cm-completionIcon-text:after': { content: '"{ }"' },
  '.cm-completionInfo': {
    padding: '4px 8px',
    color: 'var(--color-main-text)',
    backgroundColor: 'var(--color-main-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius-large)',
  },
  '.cm-completionIcon-constant': { color: towardText('--color-element-success') },
  '.cm-completionIcon-constant:after': { content: '"c"' },
  '.cm-completionIcon-operator': { color: towardText('--color-element-warning') },
  '.cm-completionIcon-operator:after': { content: '"→"' },

  // The colour picker's swatch (swatches.js), and a named colour's in the
  // completion list: the colour is painted on the span, and the native input's
  // own swatch hidden past its edge. Core's input rules give that input a
  // margin and a 30px height, which are taken back.
  'span[data-color]': {
    width: '0.9em',
    height: '0.9em',
    marginRight: '0.4ch',
    borderRadius: 'var(--border-radius-small, var(--border-radius))',
    outline: '1px solid var(--color-border-maxcontrast)',
  },
  'span[data-color] input[type="color"]': {
    width: 'auto',
    height: '0.9em',
    minHeight: '0',
    margin: '0',
    cursor: 'pointer',
  },

  // The chooser (W1) and the stepper (W2) after a value on the cursor's line:
  // quiet until pointed at.
  [buttonStates('.cm-plantuml-chooser')]: { ...QUIET_BUTTON, display: 'inline-flex', width: '16px', height: '16px', marginLeft: '2px', verticalAlign: 'middle' },
  '.cm-plantuml-chooser svg': { width: '12px', height: '12px' },
  '.cm-plantuml-stepper': { display: 'inline-flex', flexDirection: 'column', width: '12px', height: '18px', marginLeft: '2px', verticalAlign: 'middle' },
  [buttonStates('.cm-plantuml-stepper button')]: { ...QUIET_BUTTON, width: '12px', height: '9px', fontSize: '7px', lineHeight: '1' },
  '.cm-plantuml-chooser, .cm-plantuml-stepper button': { color: 'var(--color-text-maxcontrast)' },
  '.cm-plantuml-chooser:hover, .cm-plantuml-stepper button:hover': { color: 'var(--color-main-text)' },

  // Diagnostics. The stock wavy underline is an SVG with its colour baked in, so
  // it is redrawn as a wavy text-decoration, whose colour can be a variable.
  '.cm-lintRange, .cm-lintRange-error, .cm-lintRange-warning, .cm-lintRange-info, .cm-lintRange-hint': {
    backgroundImage: 'none',
    textDecorationLine: 'underline',
    textDecorationStyle: 'wavy',
    textDecorationSkipInk: 'none',
  },
  '.cm-lintRange-error': { textDecorationColor: ERROR },
  '.cm-lintRange-warning': { textDecorationColor: WARNING },
  '.cm-lintRange-info, .cm-lintRange-hint': { textDecorationColor: INFO },
  '.cm-lintRange-active': { backgroundColor: tint(12) },
  // A mistake on an empty line is a caret under it.
  '.cm-lintPoint:after': { borderBottomColor: ERROR },
  '.cm-lintPoint-warning:after': { borderBottomColor: WARNING },
  '.cm-lintPoint-info:after, .cm-lintPoint-hint:after': { borderBottomColor: INFO },
  // The gutter marks keep the stock shapes (circle, triangle, square), filled
  // by the severity's colour instead of the base theme's SVG.
  '.cm-lint-marker': { content: 'normal', width: '0.8em', height: '0.8em', margin: '0.1em' },
  '.cm-lint-marker-error': { backgroundColor: ERROR, borderRadius: '50%' },
  '.cm-lint-marker-warning': { backgroundColor: WARNING, clipPath: 'polygon(50% 5%, 100% 95%, 0 95%)' },
  '.cm-lint-marker-info, .cm-lint-marker-hint': { backgroundColor: INFO, borderRadius: '2px' },
  // The tooltip is the popover above; each message is edged in its colour.
  '.cm-tooltip-lint': { padding: '4px 0' },
  '.cm-diagnostic': { padding: '2px 8px' },
  '.cm-diagnostic-error': { borderLeftColor: ERROR },
  '.cm-diagnostic-warning': { borderLeftColor: WARNING },
  '.cm-diagnostic-info, .cm-diagnostic-hint': { borderLeftColor: INFO },
  '& .cm-diagnosticAction, & .cm-diagnosticAction:active': {
    minHeight: '0',
    margin: '0 0 0 8px',
    padding: '2px 10px',
    color: 'var(--color-primary-element-light-text)',
    backgroundColor: 'var(--color-primary-element-light)',
    border: 'none',
    borderRadius: 'var(--border-radius-element, var(--border-radius-large))',
    fontWeight: 'bold',
  },
  '& .cm-diagnosticAction:hover': { backgroundColor: 'var(--color-primary-element-light-hover)' },
  // The diagnostics panel (Ctrl/Cmd+Shift+M), below the source.
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-border)' },
  '& .cm-panel.cm-panel-lint ul [aria-selected], & .cm-panel.cm-panel-lint ul:focus [aria-selected]': {
    color: 'var(--color-primary-element-light-text)',
    backgroundColor: 'var(--color-primary-element-light)',
  },
  '& .cm-panel.cm-panel-lint [name=close]': {
    minHeight: '0',
    padding: '0 8px',
    color: 'var(--color-text-maxcontrast)',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '20px',
  },
  '& .cm-panel.cm-panel-lint [name=close]:hover': { color: 'var(--color-main-text)' },
}

export const plantumlTheme = [EditorView.theme(surfaceRules), syntaxHighlighting(highlightStyle)]
