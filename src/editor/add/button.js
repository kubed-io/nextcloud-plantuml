/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The bar's Add diagram split button (editor spec A1): + opens the modal, ▾ the
 * type menu. In the editor entry; what it opens is loaded on the first click.
 */
import crelt from 'crelt'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import plusIcon from '../../../img/icons/plus.svg?raw'
import chevronIcon from '../../../img/icons/chevron-down.svg?raw'

/**
 * @param {{ onAdd: () => void, onMenu: (anchor: HTMLElement) => void }} handlers
 * @returns {{ element: HTMLElement, menuButton: HTMLButtonElement, setMenuOpen: (open: boolean) => void }}
 */
export function createAddButton({ onAdd, onMenu }) {
  const add = crelt('button', { class: 'plantuml-editor__add-new', type: 'button', 'aria-label': t(APP_ID, 'Add diagram'), title: t(APP_ID, 'Add diagram') })
  add.innerHTML = plusIcon
  const menuButton = crelt('button', { class: 'plantuml-editor__add-type', type: 'button', 'aria-label': t(APP_ID, 'Add a diagram of a type'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' })
  menuButton.innerHTML = chevronIcon
  const element = crelt('span', { class: 'plantuml-editor__add', hidden: '' }, add, crelt('span', { class: 'plantuml-editor__add-divider', 'aria-hidden': 'true' }), menuButton)
  add.addEventListener('click', onAdd)
  menuButton.addEventListener('click', () => onMenu(menuButton))
  return {
    element,
    menuButton,
    setMenuOpen(open) {
      menuButton.setAttribute('aria-expanded', String(open))
      element.classList.toggle('plantuml-editor__add--open', open)
    },
  }
}
