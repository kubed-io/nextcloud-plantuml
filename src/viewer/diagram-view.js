/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's diagrams (VW1–VW11), on a root the Vue component hands over. The
 * file is read once and split as the editor's tabs split it; every open starts
 * in Tabs on the first diagram (VW8). The head (toolbar, export notice, tab
 * bar) sits outside the scrolling stage, so none moves when a diagram changes
 * size (VW3).
 * Stack and Wall (VW4, VW5) show every diagram as a card with a checkbox; what
 * is checked lasts while the view does, across modes. Export (VW6) and Edit
 * (VW7) act on the open tab, or in Stack and Wall on the checked cards.
 * Only what is on screen is drawn (VW10): the open tab, or the cards near the
 * visible part of the stage; a hidden view asks for nothing.
 */
import { n, translate as t } from '@nextcloud/l10n'
import { loadState } from '@nextcloud/initial-state'
import { APP_ID, exportUrl } from '../files-helpers.js'
import { canDownload, loadFile } from '../editor/save.js'
import { label, scan } from '../editor/blocks.js'
import { createTabs } from '../editor/tabs.js'
import { openEditor } from '../open-editor.js'
import { createMenu } from './menu.js'
import { createSheets, jsonProblem } from './sheets.js'
import { createToolbar } from './toolbar.js'

// The Viewer keeps the file before mounted, hidden, beside the one shown: each
// view numbers its ids, so a tab's aria-controls and a diagram's url(#…) find
// their own view.
let views = 0

// How long the share's answer may hold the first drawing; past it, Export is offered and the route decides.
const SHARE_WAIT = 3000

// The Viewer (NcModal) takes ←/→ for the previous and next file and Escape for
// closing. Keys a tab strip or an open menu of ours uses stop at the root: the
// arrows, Home and End in a tablist or menu, and Escape in a menu.
const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

function element(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}

// Each label a literal, so the translation tooling finds it.
const formats = () => [
  { label: t(APP_ID, 'SVG'), value: 'svg' },
  { label: t(APP_ID, 'PNG'), value: 'png' },
  { label: t(APP_ID, 'PDF'), value: 'pdf' },
  { label: t(APP_ID, 'EPS'), value: 'eps' },
  { label: t(APP_ID, 'ASCII art'), value: 'txt' },
]

/** The name a download is saved under: the UTF-8 one, else the plain one, from Content-Disposition. */
function filenameOf(disposition) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      // Not percent-encoding after all: the plain name below.
    }
  }
  return /filename="([^"]*)"/i.exec(disposition ?? '')?.[1] ?? ''
}

/**
 * @param {HTMLElement} root
 * @param {{ path: string, basename: string, onReady: () => void }} options
 * @return {{ setActive: (active: boolean) => void, destroy: () => void }}
 */
export function createDiagramView(root, { path, basename, onReady }) {
  const prefix = `plantuml-viewer-${++views}-`
  const stageId = `${prefix}stage`
  const state = { mode: 'tabs', active: 0, checked: new Set() }
  let diagrams = []
  let sheets = null
  let toolbar = null
  let menu = null
  let observer = null
  let active = true
  let destroyed = false
  let ready = false
  // A card → the position of its sheet.
  const positions = new WeakMap()
  const settle = () => {
    if (!ready && !destroyed) {
      ready = true
      onReady()
    }
  }

  const head = element('div', 'plantuml-viewer__head')
  // A failed export says why here, under the toolbar, until the next export. The region stays
  // rendered, empty and collapsed (viewer.css), so its text is read out when it arrives.
  const notice = element('p', 'plantuml-viewer__notice')
  notice.setAttribute('role', 'status')
  const tabBar = element('div', 'plantuml-viewer__tabbar')
  tabBar.hidden = true
  const stage = element('div', 'plantuml-viewer__stage')
  stage.id = stageId
  stage.setAttribute('aria-label', basename)
  const tabs = createTabs({
    onActivate: (index) => {
      state.active = index
      show()
    },
    controls: stageId,
  })
  tabBar.append(tabs.element)
  head.append(notice, tabBar)
  root.replaceChildren(head, stage)

  root.addEventListener('keydown', (event) => {
    const inMenu = event.target.closest?.('[role="menu"]')
    const inTabs = event.target.closest?.('[role="tablist"]')
    if ((MOVES.has(event.key) && (inMenu || inTabs)) || (event.key === 'Escape' && inMenu)) {
      event.stopPropagation()
    }
  })

  /** The 0-based places Export and Edit act on, in file order; none in Stack or Wall is every diagram. */
  function chosen() {
    return state.mode === 'tabs' ? [state.active] : [...state.checked].sort((a, b) => a - b)
  }

  /** The Export label follows what is checked. */
  function afterCheck() {
    const count = state.checked.size
    toolbar?.setExportLabel(state.mode === 'tabs'
      ? t(APP_ID, 'Export')
      : count === 0 ? t(APP_ID, 'Export all') : n(APP_ID, 'Export %n', 'Export %n', count))
  }

  /**
   * What the menu exports: the one diagram's label, else how many go in the zip. None chosen is
   * every diagram the server draws an image for; it leaves out the rest (`drawn`).
   */
  function exportHeading() {
    const indexes = chosen()
    const going = indexes.length ? indexes.map((index) => diagrams[index]) : diagrams.filter((diagram) => diagram.drawn)
    if (going.length > 1) {
      return n(APP_ID, '%n diagrams, as .zip', '%n diagrams, as .zip', going.length)
    }
    const one = going[0] ?? diagrams[0]
    // A file of one unnamed diagram is named after the file (the export-menu-single board).
    return diagrams.length === 1 && !one.name ? basename.replace(/\.(?:puml|plantuml)$/i, '') : label(one)
  }

  function say(problem) {
    notice.textContent = problem
  }

  /** Fetched, then saved through a blob: URL: a link straight to the route would save a refusal's JSON as the file. */
  async function download(format) {
    say('')
    try {
      const res = await fetch(exportUrl(path, format, chosen()), { credentials: 'same-origin' })
      if (!res.ok) {
        say(jsonProblem(await res.text()) || t(APP_ID, 'Could not export the diagram'))
        return
      }
      const url = URL.createObjectURL(await res.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = filenameOf(res.headers.get('Content-Disposition'))
      document.body.append(link)
      link.click()
      link.remove()
      // The click starts the download on its own task; the URL goes on a later one.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      say(t(APP_ID, 'Could not export the diagram'))
    }
  }

  /** A second click on Export closes its menu, as the tabs' "All diagrams" does. */
  function exportMenu() {
    menu ??= createMenu({ anchor: toolbar.exportButton, heading: exportHeading, items: formats(), onPick: download, idPrefix: prefix })
    if (toolbar.exportButton.getAttribute('aria-expanded') === 'true') {
      menu.close()
    } else {
      menu.open()
    }
  }

  /** The editor at the diagram in view; the Viewer closes first, as the editor opens over Files. */
  function edit() {
    const index = chosen()[0] ?? 0
    window.OCA?.Viewer?.close()
    openEditor({ path, basename }, { diagram: index })
  }

  function card(index) {
    const node = element('div', 'plantuml-viewer__card')
    const caption = element('label', 'plantuml-viewer__caption')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = state.checked.has(index)
    box.addEventListener('change', () => {
      if (box.checked) {
        state.checked.add(index)
      } else {
        state.checked.delete(index)
      }
      node.classList.toggle('plantuml-viewer__card--checked', box.checked)
      afterCheck()
    })
    caption.append(box, label(diagrams[index]))
    positions.set(node, index + 1)
    node.classList.toggle('plantuml-viewer__card--checked', box.checked)
    node.append(caption, sheets.sheet(index + 1))
    // The caption is a <label>: a click on its text toggles the box, so it counts as the checkbox.
    // A diagram's link opens in a new tab (inline-svg.js) and leaves the Wall as it is.
    node.addEventListener('click', (event) => {
      if (state.mode === 'wall' && !caption.contains(event.target) && !event.target.closest?.('a')) {
        state.mode = 'tabs'
        state.active = index
        show()
      }
    })
    return node
  }

  /**
   * What the stage shows is asked for: the open tab, or in Stack and Wall each card once it comes
   * within a stage's height of the visible part, watched from the scrolling stage, the nearest
   * in file order. A card that leaves before its turn waits no more; a hidden view asks for nothing.
   */
  function want() {
    observer?.disconnect()
    observer = null
    sheets.clear()
    if (!active) {
      return
    }
    if (state.mode === 'tabs') {
      sheets.request(state.active + 1)
      return
    }
    const shown = [...stage.children]
    if (typeof IntersectionObserver === 'undefined') {
      sheets.request(...shown.map((node) => positions.get(node)))
      return
    }
    observer = new IntersectionObserver((entries) => {
      const near = []
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) {
          near.push(positions.get(target))
        } else {
          sheets.release(positions.get(target))
        }
      }
      sheets.request(...near.sort((a, b) => a - b))
    }, { root: stage, rootMargin: '100%' })
    shown.forEach((node) => observer.observe(node))
  }

  function show() {
    toolbar?.setMode(state.mode)
    tabBar.hidden = state.mode !== 'tabs' || diagrams.length < 2
    stage.className = `plantuml-viewer__stage plantuml-viewer__stage--${state.mode}`
    if (state.mode === 'tabs') {
      tabs.update(diagrams, state.active)
      stage.replaceChildren(sheets.sheet(state.active + 1))
    } else {
      stage.replaceChildren(...diagrams.map((_diagram, index) => card(index)))
    }
    want()
    afterCheck()
  }

  function build({ exportable }) {
    toolbar = createToolbar({
      single: diagrams.length < 2,
      editable: loadState(APP_ID, 'server_configured', false),
      exportable,
      onMode: (mode) => {
        state.mode = mode
        show()
      },
      onExport: () => exportMenu(),
      onEdit: () => edit(),
    })
    head.prepend(toolbar.element)
  }

  // A failed look at the share, or one that has not answered in SHARE_WAIT, leaves Export to the
  // route, which refuses what it must.
  let waited
  const downloadable = Promise.race([
    canDownload(path).catch(() => true),
    new Promise((resolve) => {
      waited = setTimeout(() => resolve(true), SHARE_WAIT)
    }),
  ]).finally(() => clearTimeout(waited))
  Promise.all([loadFile(path), downloadable]).then(([{ content, etag }, exportable]) => {
    if (destroyed) {
      return
    }
    // CodeMirror reads any line ending for the editor; scan() splits on \n alone.
    diagrams = scan(content.replace(/\r\n?/g, '\n'))
    sheets = createSheets(path, { etag, labelOf: (position) => label(diagrams[position - 1]), idPrefix: prefix })
    build({ exportable })
    // Before show(): a drawing kept for the page settles the sheet as soon as it is asked for.
    sheets.sheet(1).addEventListener('plantuml-viewer:settled', settle, { once: true })
    show()
  }, () => {
    if (destroyed) {
      return
    }
    const line = element('p', 'plantuml-viewer__problem')
    line.textContent = t(APP_ID, 'Could not draw the diagram')
    root.replaceChildren(line)
    settle()
  })

  return {
    /** The Viewer shows this file (true) or keeps it hidden beside the one shown (false). */
    setActive(now) {
      active = now
      if (sheets && !destroyed) {
        want()
      }
    },
    destroy() {
      destroyed = true
      observer?.disconnect()
      menu?.destroy()
      sheets?.destroy()
      tabs.destroy()
      root.replaceChildren()
    },
  }
}
