/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's toolbar (VW2): how to show the diagrams, Export and Edit. A
 * plain group, not an ARIA toolbar: it has no arrow-key model, so ←/→ on its
 * buttons go on to the Viewer as anywhere else.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../files-helpers.js'
import tabsIcon from '../../img/icons/view-tabs.svg?raw'
import stackIcon from '../../img/icons/view-stack.svg?raw'
import wallIcon from '../../img/icons/view-grid.svg?raw'
import exportIcon from '../../img/icons/download.svg?raw'
import chevronIcon from '../../img/icons/chevron-down-small.svg?raw'
import editIcon from '../../img/icons/pencil.svg?raw'

/** Words on the buttons, as drawn; false leaves the icons alone, their words still hover text. */
export const LABELLED = false

function button(className, icon, name, labelled, after = '') {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = `plantuml-viewer__button ${className}`
  node.innerHTML = `<span class="plantuml-viewer__icon" aria-hidden="true">${icon.trim()}</span>`
    + (labelled ? '<span class="plantuml-viewer__label"></span>' : '')
    + (after ? `<span class="plantuml-viewer__chevron" aria-hidden="true">${after.trim()}</span>` : '')
  const rename = (text) => {
    node.setAttribute('aria-label', text)
    node.title = text
    const shown = node.querySelector('.plantuml-viewer__label')
    if (shown) {
      shown.textContent = text
    }
  }
  rename(name)
  return { node, rename }
}

/**
 * @param {object} options
 * @param {boolean} options.single a file of one diagram: no Display switch, no divider
 * @param {boolean} options.editable a server to draw with, so Edit
 * @param {boolean} [options.exportable] false for a share that forbids download: no Export
 * @param {(mode: 'tabs'|'stack'|'wall') => void} options.onMode
 * @param {() => void} options.onExport
 * @param {() => void} options.onEdit
 * @param {boolean} [options.labelled] words on the buttons, or icons alone
 * @return {{ element: HTMLElement, exportButton: HTMLButtonElement|null, setMode: (mode: 'tabs'|'stack'|'wall') => void, setExportLabel: (text: string) => void }}
 */
export function createToolbar({ single, editable, exportable = true, onMode, onExport, onEdit, labelled = LABELLED }) {
  const element = document.createElement('div')
  element.className = 'plantuml-viewer__toolbar'
  element.setAttribute('role', 'group')
  element.setAttribute('aria-label', t(APP_ID, 'Diagram toolbar'))
  const modes = {}
  if (!single) {
    const options = [
      ['tabs', tabsIcon, t(APP_ID, 'Tabs')],
      ['stack', stackIcon, t(APP_ID, 'Stack')],
      ['wall', wallIcon, t(APP_ID, 'Wall')],
    ]
    for (const [mode, icon, name] of options) {
      const { node } = button('plantuml-viewer__mode', icon, name, labelled)
      node.setAttribute('aria-pressed', String(mode === 'tabs'))
      node.addEventListener('click', () => onMode(mode))
      modes[mode] = node
      element.append(node)
    }
    const divider = document.createElement('span')
    divider.className = 'plantuml-viewer__divider'
    element.append(divider)
  }
  const exporting = exportable ? button('plantuml-viewer__export', exportIcon, t(APP_ID, 'Export'), labelled, chevronIcon) : null
  if (exporting) {
    exporting.node.setAttribute('aria-haspopup', 'menu')
    exporting.node.setAttribute('aria-expanded', 'false')
    exporting.node.addEventListener('click', () => onExport())
    element.append(exporting.node)
  }
  if (editable) {
    const editing = button('plantuml-viewer__edit', editIcon, t(APP_ID, 'Edit'), labelled)
    editing.node.addEventListener('click', () => onEdit())
    element.append(editing.node)
  }
  return {
    element,
    exportButton: exporting?.node ?? null,
    setMode(mode) {
      for (const [name, node] of Object.entries(modes)) {
        node.setAttribute('aria-pressed', String(name === mode))
      }
    },
    setExportLabel: (text) => exporting?.rename(text),
  }
}
