/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Files-app integration for plantuml:
 *
 *  - the Viewer handler for text/x-plantuml, which makes a plain click open the
 *    diagram in Nextcloud's image lightbox (the menu's "View", named by Nextcloud);
 *  - "Edit diagram" and "Open with text editor", for one diagram at a time;
 *  - "Diagram" in the + New menu, which writes an empty diagram and opens the
 *    editor on it.
 *
 * Without a server URL there is nothing to draw, so "Edit diagram" and + New
 * hide; "Open with text editor" and the Viewer (which then says "not set") stay.
 * The mechanics are nextcloud-grafana's src/files.js.
 */
import { registerFileAction, addNewFileMenuEntry, NewMenuEntryCategory } from '@nextcloud/files'
import { getClient, getDefaultPropfind, getRootPath, resultToNode } from '@nextcloud/files/dav'
import { loadState } from '@nextcloud/initial-state'
import { translate as t } from '@nextcloud/l10n'
import { emit } from '@nextcloud/event-bus'
import { APP_ID, MIMETYPE, NEW_DIAGRAM_CONTENT, isDiagram, uniqueDiagramName } from './files-helpers.js'
import component from './viewer-component.js'
import { openTextEditor } from './text-editor-modal.js'
// Menu glyphs are fill="currentColor" files under img/icons/, inlined by Vite
// (?raw), because Nextcloud themes menu icons to the surface they land on.
import pencilIcon from '../img/icons/pencil.svg?raw'
import textIcon from '../img/icons/text.svg?raw'
import plantumlIcon from '../img/icons/plantuml.svg?raw'

const serverConfigured = loadState(APP_ID, 'server_configured', false)

const viewerHandler = { id: APP_ID, mimes: [MIMETYPE], component }
if (window.OCA?.Viewer) {
  window.OCA.Viewer.registerHandler(viewerHandler)
} else {
  // The Viewer may load after us; it drains this queue on DOMContentLoaded.
  window._oca_viewer_handlers = [...(window._oca_viewer_handlers ?? []), viewerHandler]
}

/** The editor is the editor bundle's; until it is on the page, the Viewer opens. */
function openEditor(node) {
  if (window.OCA?.PlantUml?.openEditor) {
    window.OCA.PlantUml.openEditor(node)
  } else {
    window.OCA?.Viewer?.open({ path: node.path })
  }
}

const oneDiagram = ({ nodes }) => nodes?.length === 1 && isDiagram(nodes[0])

registerFileAction({
  id: 'plantuml-edit',
  displayName: () => t(APP_ID, 'Edit diagram'),
  iconSvgInline: () => pencilIcon,
  enabled: (context) => serverConfigured && oneDiagram(context),
  async exec({ nodes }) {
    openEditor(nodes[0])
    return null
  },
  order: 1, // right after the Viewer's "View" (0), before Nextcloud's Rename (10)
})

registerFileAction({
  id: 'plantuml-text',
  displayName: () => t(APP_ID, 'Open with text editor'),
  iconSvgInline: () => textIcon,
  enabled: oneDiagram,
  // null = silent (the overlay is the feedback); false = an error toast.
  async exec({ nodes }) {
    return (await openTextEditor(nodes[0])) ? null : false
  },
  order: 2,
})

/** The name for a new diagram, or '' when the user cancels. */
function askName() {
  if (!window.OC?.dialogs?.prompt) return Promise.resolve(t(APP_ID, 'New diagram'))
  return new Promise((resolve) => {
    window.OC.dialogs.prompt('', t(APP_ID, 'New diagram'), (ok, value) => resolve(ok ? String(value ?? '').trim() : ''), true)
  })
}

addNewFileMenuEntry({
  id: 'plantuml-new',
  displayName: t(APP_ID, 'Diagram'),
  category: NewMenuEntryCategory.CreateNew,
  iconSvgInline: plantumlIcon,
  enabled: () => serverConfigured,
  async handler(context, content) {
    const base = await askName()
    if (!base) return
    const name = uniqueDiagramName((content || []).map((n) => n.basename), base)
    const dir = context.path === '/' ? '' : context.path
    const davPath = `${getRootPath()}${dir}/${name}`
    try {
      const client = getClient()
      await client.putFileContents(davPath, NEW_DIAGRAM_CONTENT, { overwrite: false })
      // Stat it back and announce it so the Files view shows it.
      const res = await client.stat(davPath, { details: true, data: getDefaultPropfind() })
      const node = resultToNode(res.data)
      emit('files:node:created', node)
      openEditor(node)
    } catch (e) {
      console.error(`[${APP_ID}] could not create the diagram`, e)
      window.OC?.Notification?.showTemporary?.(t(APP_ID, 'Could not create the diagram'))
    }
  },
})
