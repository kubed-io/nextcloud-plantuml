// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// "Edit diagram" driven through the action files.js registers, with the
// Nextcloud libraries mocked at the module boundary. jsdom fetches no scripts,
// so each test plays the browser: it fires `load` or `error` on the tag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = []
vi.mock('@nextcloud/files', () => ({
  registerFileAction: (action) => actions.push(action),
  addNewFileMenuEntry: () => {},
  getUniqueName: (name) => name,
  NewMenuEntryCategory: { CreateNew: 0 },
}))
vi.mock('@nextcloud/files/dav', () => ({}))
vi.mock('@nextcloud/initial-state', () => ({ loadState: () => true }))
vi.mock('@nextcloud/l10n', () => ({ translate: (_app, text) => text }))

const node = { path: '/Diagrams/Order flow.puml', basename: 'Order flow.puml' }
const scripts = () => document.head.querySelectorAll('script')
let editDiagram

beforeEach(async () => {
  actions.length = 0
  document.head.innerHTML = ''
  window._oc_appswebroots = { plantuml: '/custom_apps/plantuml' }
  window.OCA = { Viewer: { open: vi.fn(), registerHandler: vi.fn() } }
  // files.js remembers the bundle it injected for the page's life.
  vi.resetModules()
  await import('../../src/files.js')
  editDiagram = (n = node) => actions.find((a) => a.id === 'plantuml-edit').exec({ nodes: [n] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** What the editor bundle does when it runs: define the opener. */
function editorBundleRuns() {
  window.OCA.PlantUml = { openEditor: vi.fn() }
  scripts()[0].dispatchEvent(new Event('load'))
}

describe('Edit diagram', () => {
  it('adds no editor bundle to the page until it is used', () => {
    expect(scripts()).toHaveLength(0)
  })

  it('loads the editor bundle once for two opens, then opens the editor on each', async () => {
    const other = { path: '/Diagrams/Payment.puml', basename: 'Payment.puml' }

    const opening = [editDiagram(), editDiagram(other)]
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].getAttribute('src')).toBe('/custom_apps/plantuml/dist/plantuml-editor.js')
    editorBundleRuns()
    await Promise.all(opening)

    expect(window.OCA.PlantUml.openEditor.mock.calls).toEqual([[node], [other]])
    expect(window.OCA.Viewer.open).not.toHaveBeenCalled()
  })

  it('opens straight away once the editor is on the page', async () => {
    window.OCA.PlantUml = { openEditor: vi.fn() }

    await editDiagram()

    expect(scripts()).toHaveLength(0)
    expect(window.OCA.PlantUml.openEditor).toHaveBeenCalledWith(node)
  })

  it('opens the diagram in the Viewer when the editor bundle fails to load, and tries again next time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const opening = editDiagram()
    scripts()[0].dispatchEvent(new Event('error'))
    await opening

    expect(window.OCA.Viewer.open).toHaveBeenCalledWith({ path: node.path })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(scripts()).toHaveLength(0)

    const again = editDiagram()
    expect(scripts()).toHaveLength(1)
    editorBundleRuns()
    await again
    expect(window.OCA.PlantUml.openEditor).toHaveBeenCalledWith(node)
  })
})
