/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The doc card (I5): what a hover and a completion's info box both show for an
 * entry. A part the entry lacks is left out; the close button is always there,
 * hidden by the theme until the card is pinned.
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { ICONS } from './icons.js'
import closeIcon from '../../../img/icons/close.svg?raw'

/** @param {import('./index.js').Entry} entry */
export function renderDoc(entry) {
  const dom = crelt('div', { class: 'cm-doc' })
  const head = crelt('div', { class: 'cm-doc-head' })

  const icon = crelt('span', { class: 'cm-doc-icon' })
  // The entry names an icon; only a name in ICONS is drawn, so no markup comes from data.
  const known = Object.hasOwn(ICONS, entry.icon)
  icon.hidden = !known
  if (known) {
    icon.innerHTML = ICONS[entry.icon]
  }

  const close = crelt('button', { class: 'cm-doc-close', type: 'button', 'aria-label': t(APP_ID, 'Close') })
  close.innerHTML = closeIcon

  head.append(icon, crelt('code', { class: `cm-doc-name cm-doc-${entry.look}` }, entry.signature ?? entry.name), crelt('span', { class: 'cm-doc-kind' }, entry.kind), close)
  dom.append(head)

  if (entry.summary) {
    dom.append(crelt('div', { class: 'cm-doc-summary' }, entry.summary))
  }
  if (entry.example) {
    dom.append(crelt('pre', { class: 'cm-doc-example' }, entry.example))
  }
  if (entry.link) {
    const { page, anchor, section } = entry.link
    const link = crelt('a', {
      class: 'cm-doc-link',
      href: `https://plantuml.com/${page}${anchor ? `#${anchor}` : ''}`,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, `plantuml.com › ${section}`)
    dom.append(link)
  }

  return { dom, destroy() {} }
}
