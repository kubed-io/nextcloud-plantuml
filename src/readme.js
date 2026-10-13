/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The folder-README observer. Text renders the README as its "workspace",
 * `#rich-workspace`, above the file list (Files mounts it in
 * `.files-list__before > .files-list__header-workspace`). Text gives no hook for
 * a fence language, so this watches the page, and whenever Text has drawn a
 * README (`.ProseMirror`) holding code blocks or images not yet looked at,
 * reads the README's text and lets workspace.js draw the diagrams in.
 *
 * Each `.ProseMirror` is one README. While Text loads, the workspace holds two
 * (the read-only preview and the editor that replaces it), so the fence count
 * is per view, never per workspace.
 *
 * The README is the one Text's own RichWorkspace.vue asks for: GET
 * `ocs/v2.php/apps/text/workspace?path=<dir>`, whose `file.path` is the file
 * the workspace shows, Text's translated "Readme.md" and `.Readme.md` included,
 * and no 404 per name tried. `dir` is the Files URL's `?dir=`. The lookup is
 * kept while the folder stays the same, since Text draws the README twice per
 * folder open and again on focus.
 */
import { getRequestToken } from '@nextcloud/auth'
import { generateOcsUrl } from '@nextcloud/router'
import { loadFile } from './editor/save.js'
import { findFences, findImages } from './readme/markdown.js'
import { attach, lock, pending } from './readme/workspace.js'

/** The current folder's README lookup: `{dir, found: Promise}`. */
let cached = null

function readme() {
  const dir = new URLSearchParams(window.location.search).get('dir') || '/'
  if (cached?.dir !== dir) {
    const entry = { dir, found: lookup(dir) }
    // A lookup that failed is not kept: the next render of this folder asks again.
    entry.found.then((found) => {
      if (found === null && cached === entry) {
        cached = null
      }
    })
    cached = entry
  }
  return cached.found.then((found) => found ?? { dir, fences: [], images: [] })
}

/** @return {Promise<{dir, fences, images}|null>} null when the README cannot be read */
async function lookup(dir) {
  try {
    const response = await fetch(`${generateOcsUrl('apps/text/workspace')}?${new URLSearchParams({ path: dir, format: 'json' })}`, {
      credentials: 'same-origin',
      headers: { 'OCS-APIRequest': 'true', requesttoken: getRequestToken() ?? '' },
    })
    const path = (await response.json())?.ocs?.data?.file?.path
    if (path) {
      const { content } = await loadFile(path)
      return { dir: path.slice(0, path.lastIndexOf('/')), fences: findFences(content), images: findImages(content) }
    }
  } catch {
    // Fall through: a .puml image needs only its own path.
  }
  return null
}

let running = false
let again = false

async function run() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      const views = [...document.querySelectorAll('#rich-workspace .ProseMirror')]
      views.forEach(lock)
      const unseen = views.filter(pending)
      if (unseen.length > 0) {
        const found = await readme()
        unseen.forEach((view) => attach(view, found))
      }
    } while (again)
  } finally {
    running = false
  }
}

function observe() {
  // Never disconnected: Text re-renders the workspace on focus and on every folder change.
  // contenteditable is watched so lock() can undo Text resetting it on a drawn fence.
  new MutationObserver((mutations) => {
    const workspace = document.getElementById('rich-workspace')
    if (workspace && mutations.some(({ target }) => workspace.contains(target) || target.contains(workspace))) {
      run()
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['contenteditable'] })
  run()
}

if (document.body) {
  observe()
} else {
  window.addEventListener('DOMContentLoaded', observe)
}
