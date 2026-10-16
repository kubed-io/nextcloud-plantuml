/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The doc card (I5): what a hover and a completion's info box both show for an
 * entry. A part the entry lacks is left out; the close button is always there,
 * hidden by the theme until the card is pinned.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import closeIcon from '../../../img/icons/close.svg?raw'

/** The element `tag` with `className` and, if given, `text`. */
function element(tag, className, text) {
  const el = document.createElement(tag)
  el.className = className
  if (text !== undefined) {
    el.textContent = text
  }
  return el
}

/** @param {import('./index.js').Entry} entry */
export function renderDoc(entry) {
  const dom = element('div', 'cm-doc')
  const head = element('div', 'cm-doc-head')

  const icon = element('span', 'cm-doc-icon')
  icon.hidden = !entry.icon
  if (entry.icon) {
    icon.innerHTML = entry.icon
  }

  const close = element('button', 'cm-doc-close')
  close.type = 'button'
  close.setAttribute('aria-label', t(APP_ID, 'Close'))
  close.innerHTML = closeIcon

  head.append(icon, element('code', `cm-doc-name cm-doc-${entry.look}`, entry.signature ?? entry.name), element('span', 'cm-doc-kind', entry.kind), close)
  dom.append(head)

  if (entry.summary) {
    dom.append(element('div', 'cm-doc-summary', entry.summary))
  }
  if (entry.example) {
    dom.append(element('pre', 'cm-doc-example', entry.example))
  }
  if (entry.link) {
    const { page, anchor, section } = entry.link
    const link = element('a', 'cm-doc-link', `plantuml.com › ${section}`)
    link.href = `https://plantuml.com/${page}${anchor ? `#${anchor}` : ''}`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    dom.append(link)
  }

  return { dom, destroy() {} }
}
