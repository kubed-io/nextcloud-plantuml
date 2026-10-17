/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The bar's file name, a breadcrumb while a linked file is open (R11, R17):
 * the main file's crumb and the × lead back to it.
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import closeIcon from '../../img/icons/close.svg?raw'
import lockIcon from '../../img/icons/lock-outline.svg?raw'

/** An icon file's markup without the line breaks between its tags, which would read as part of the name. */
const glyph = (svg) => svg.replace(/>\s+</g, '><').trim()

/**
 * @param {{onBack: () => void}} options
 * @return {{element: HTMLHeadingElement, show: (main: string, linked: {name: string, readOnly: boolean}|null) => void}}
 */
export function createBreadcrumb({ onBack }) {
  const element = crelt('h2', { class: 'plantuml-editor__name' })

  function show(main, linked) {
    element.classList.toggle('plantuml-editor__name--linked', linked !== null)
    if (!linked) {
      element.replaceChildren(main)
      return
    }
    const backTitle = t(APP_ID, 'Back to {name}', { name: main })
    const crumb = crelt('button', { class: 'plantuml-editor__crumb', type: 'button' }, main)
    const back = crelt('button', { class: 'plantuml-editor__back', type: 'button', title: backTitle, 'aria-label': backTitle })
    back.innerHTML = glyph(closeIcon)
    crumb.addEventListener('click', onBack)
    back.addEventListener('click', onBack)
    const parts = [
      crumb,
      crelt('span', { class: 'plantuml-editor__separator', 'aria-hidden': 'true' }, '›'),
      crelt('span', { class: 'plantuml-editor__linked' }, linked.name),
    ]
    if (linked.readOnly) {
      const readOnly = t(APP_ID, 'Read only')
      const lock = crelt('span', { class: 'plantuml-editor__lock', title: readOnly, role: 'img', 'aria-label': readOnly })
      lock.innerHTML = glyph(lockIcon)
      parts.push(lock)
    }
    element.replaceChildren(...parts, back)
  }

  return { element, show }
}
