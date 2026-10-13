/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Files-app integration for plantuml:
 *
 *  - the Viewer handler for text/x-plantuml, which makes a plain click open the
 *    diagram in Nextcloud's image lightbox (the menu's "View", named by Nextcloud);
 *  - "Edit diagram" and "Open with text editor", for one diagram at a time;
 *  - "Diagram" in the + New menu, which writes an empty "New diagram.puml" and
 *    opens the editor on it; naming it is Nextcloud's own rename.
 *
 * Without a server URL only "Edit diagram" hides. A .puml is plain text, so
 * + New and "Open with text editor" need no server, and the Viewer says "not set".
 * The mechanics are nextcloud-grafana's src/files.js.
 */
import { registerFileAction, addNewFileMenuEntry, getUniqueName, NewMenuEntryCategory } from '@nextcloud/files'
import { getClient, getDefaultPropfind, getRootPath, resultToNode } from '@nextcloud/files/dav'
import { loadState } from '@nextcloud/initial-state'
import { translate as t } from '@nextcloud/l10n'
import { emit } from '@nextcloud/event-bus'
import { APP_ID, MIMETYPE, NEW_DIAGRAM_CONTENT, canEditDiagram, canOpenAsText } from './files-helpers.js'
import component from './viewer-component.js'
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

registerFileAction({
  id: 'plantuml-edit',
  displayName: () => t(APP_ID, 'Edit diagram'),
  iconSvgInline: () => pencilIcon,
  enabled: ({ nodes }) => canEditDiagram(nodes, serverConfigured),
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
  enabled: ({ nodes }) => canOpenAsText(nodes),
  // Text's handler gets the real mime, so a .puml opens in its plain editor.
  // Viewer stable34 src/services/Viewer.js:351 `openWith(handlerId, options = {})`.
  async exec({ nodes }) {
    window.OCA.Viewer.openWith('text', { path: nodes[0].path })
    return null
  },
  order: 2,
})

addNewFileMenuEntry({
  id: 'plantuml-new',
  displayName: t(APP_ID, 'Diagram'),
  category: NewMenuEntryCategory.CreateNew,
  iconSvgInline: plantumlIcon,
  async handler(context, content) {
    const name = getUniqueName(t(APP_ID, 'New diagram') + '.puml', (content || []).map((n) => n.basename))
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
