/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Opening the editor from anywhere: the Files actions and the Viewer share
 * this one way to load the editor bundle and call it.
 */
import { APP_ID, editorBundleUrl } from './files-helpers.js'

// Read now: currentScript is only set while this bundle first runs.
const bundleQuery = document.currentScript?.src ? new URL(document.currentScript.src).search : ''
let editorLoading = null
let editorFailures = 0

/**
 * Puts the editor bundle on the page, once: it is most of the app's JavaScript
 * and most Files pages never open it. A failed load is forgotten, so the next
 * open tries again, under a new URL. It carries the Files bundle's version query.
 *
 * @return {Promise<void>}
 */
export function ensureEditor() {
  if (window.OCA?.PlantUml?.openEditor) {
    return Promise.resolve()
  }
  editorLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // An ES module: it imports its profiles from dist/chunks/ as they are needed.
    script.type = 'module'
    // Replaced at build time (vite.config.js); absent under vitest.
    // eslint-disable-next-line no-undef
    script.src = editorBundleUrl(bundleQuery, typeof __PLANTUML_EDITOR_HASH__ === 'string' ? __PLANTUML_EDITOR_HASH__ : '', editorFailures)
    const fail = (message) => {
      script.remove()
      editorLoading = null
      editorFailures++
      reject(new Error(message))
    }
    script.addEventListener('load', () => {
      if (window.OCA?.PlantUml?.openEditor) {
        resolve()
      } else {
        fail(`${script.src} did not define the editor`)
      }
    })
    script.addEventListener('error', () => fail(`could not load ${script.src}`))
    document.head.append(script)
  })
  return editorLoading
}

/**
 * Opens the editor bundle's editor, at a diagram when one is asked for (VW7);
 * if the bundle will not load, the Viewer opens.
 *
 * @param {{path: string, basename: string}} node
 * @param {{diagram?: number}} [options]
 */
export async function openEditor(node, options) {
  try {
    await ensureEditor()
  } catch (e) {
    console.error(`[${APP_ID}] could not load the editor`, e)
    window.OCA?.Viewer?.open({ path: node.path })
    return
  }
  if (options === undefined) {
    window.OCA.PlantUml.openEditor(node)
  } else {
    window.OCA.PlantUml.openEditor(node, options)
  }
}
