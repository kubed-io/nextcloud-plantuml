/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Add diagram's chunk, `import()`ed by the editor on the first click of its
 * split button: the template data, the type menu and the modal.
 *
 * Nothing reached from here imports the editor's own modules, nor a library
 * the editor loads: the bundler would move them into a chunk the editor entry
 * imports statically, which one failed download would then break whole (as
 * profiles/index.js says of the profiles). What the chunk needs of the
 * editor's comes in `core`.
 *
 * @typedef {object} Core
 * @property {typeof import('crelt').default} crelt the editor's element builder
 * @property {typeof import('@nextcloud/l10n').translate} t translate, called with
 *   the app id written out so Nextcloud's string extractor finds the strings
 * @property {typeof import('../tabs.js').MOVES} MOVES the tabs' arrow, Home and End moves (B2)
 * @property {typeof import('../blocks.js').blocksOf} blocksOf the blocks of a scan
 * @property {typeof import('../blocks.js').scan} scan a text's `@start`/`@end` lines
 * @property {typeof import('../completion/directives.js').BRACED} BRACED the types whose body is braced
 */
import own from '../data/docs/own.json'
import { builtins } from './catalog.js'
import { openTypeMenu } from './menu.js'
import { TYPES } from './types.js'

/**
 * @param {Core} core
 * @param {{ container: HTMLElement, onAdd: (template: import('./catalog.js').Template) => void }} options
 */
export function createAdd(core, { container, onAdd }) {
  const builtIn = builtins(own, core)
  let menu = null

  /** The menu adds a type's Empty, which is built in, so it does not ask the route. */
  function openMenu(anchor, onClose) {
    if (menu) {
      menu.close()
      return
    }
    menu = openTypeMenu({
      container,
      anchor,
      types: TYPES,
      core,
      onPick: (type) => onAdd(builtIn.find((t) => t.type === type && t.title === 'Empty')),
      onClose: () => {
        menu = null
        onClose()
      },
    })
  }

  function openModal() {}

  function destroy() {
    menu?.close()
  }

  return { openMenu, openModal, destroy }
}
