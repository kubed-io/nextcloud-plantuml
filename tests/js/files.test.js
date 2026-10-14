// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// "Edit diagram" and + New → UML Diagram, driven through what files.js registers,
// with the Nextcloud libraries mocked at the module boundary. jsdom fetches no
// scripts, so each test plays the browser: it fires `load` or `error` on the tag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = []
const newEntries = []
vi.mock('@nextcloud/files', () => ({
  registerFileAction: (action) => actions.push(action),
  addNewFileMenuEntry: (entry) => newEntries.push(entry),
  getUniqueName: (name) => name,
  NewMenuEntryCategory: { CreateNew: 0 },
}))
const dav = vi.hoisted(() => ({
  putFileContents: vi.fn(),
  stat: vi.fn(),
}))
vi.mock('@nextcloud/files/dav', () => ({
  getClient: () => dav,
  getDefaultPropfind: () => '<propfind/>',
  getRootPath: () => '/files/drk',
  resultToNode: (data) => ({ ...data, fromDav: true }),
}))
const axios = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@nextcloud/axios', () => ({ default: axios }))
const emit = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/event-bus', () => ({ emit }))
vi.mock('@nextcloud/initial-state', () => ({ loadState: () => true }))
vi.mock('@nextcloud/l10n', () => ({ translate: (_app, text) => text }))

const node = { path: '/Diagrams/Order flow.puml', basename: 'Order flow.puml' }
const scripts = () => document.head.querySelectorAll('script')
let editDiagram

beforeEach(async () => {
  actions.length = 0
  newEntries.length = 0
  document.head.innerHTML = ''
  window._oc_appswebroots = { plantuml: '/custom_apps/plantuml' }
  window.OCA = { Viewer: { open: vi.fn(), registerHandler: vi.fn() } }
  // The tag Nextcloud wrote for the Files bundle, versioned by Util::addScript.
  const filesBundle = document.createElement('script')
  filesBundle.src = 'http://localhost/custom_apps/plantuml/dist/plantuml-files.js?v=1a2b3c'
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(filesBundle)
  // files.js remembers the bundle it injected for the page's life.
  vi.resetModules()
  await import('../../src/files.js')
  editDiagram = (n = node) => actions.find((a) => a.id === 'plantuml-edit').exec({ nodes: [n] })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
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
    expect(scripts()[0].getAttribute('src')).toBe('/custom_apps/plantuml/dist/plantuml-editor.js?v=1a2b3c')
    // An ES module: it imports its profiles as chunks beside it.
    expect(scripts()[0].type).toBe('module')
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

    // A module URL that failed is never fetched again in this page.
    const again = editDiagram()
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].getAttribute('src')).toBe('/custom_apps/plantuml/dist/plantuml-editor.js?v=1a2b3c&r=1')
    editorBundleRuns()
    await again
    expect(window.OCA.PlantUml.openEditor).toHaveBeenCalledWith(node)
  })

  it('tries again next time when the bundle loads but defines no editor', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const opening = editDiagram()
    scripts()[0].dispatchEvent(new Event('load'))
    await opening

    expect(window.OCA.Viewer.open).toHaveBeenCalledWith({ path: node.path })
    expect(scripts()).toHaveLength(0)
    // A module that ran is never run again in this page, under the same URL.
    const retrying = editDiagram()
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].getAttribute('src')).toBe('/custom_apps/plantuml/dist/plantuml-editor.js?v=1a2b3c&r=1')
    scripts()[0].dispatchEvent(new Event('error'))
    await retrying
    editDiagram()
    expect(scripts()[0].getAttribute('src')).toBe('/custom_apps/plantuml/dist/plantuml-editor.js?v=1a2b3c&r=2')
  })

  // A Files bundle cached from before the editor was a module adds it as a
  // classic script: the bundle's trailing `export` is a syntax error there, yet
  // the tag still fires load. That the whole script fails matters: run as a
  // classic script, its minified top-level vars would clobber Nextcloud's global
  // t and n.
  it('opens the Viewer when an old Files bundle runs the module editor as a classic script', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const opening = editDiagram()
    scripts()[0].dispatchEvent(new Event('load'))
    await opening

    expect(window.OCA.Viewer.open).toHaveBeenCalledWith({ path: node.path })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error.mock.calls[0][1].message).toMatch(/did not define the editor$/)
  })
})

describe('+ New → UML Diagram', () => {
  const createUrl = /\/ocs\/v2\.php\/apps\/files\/api\/v1\/templates\/create$/
  const newDiagram = (path) => newEntries.find((e) => e.id === 'plantuml-new').handler({ path }, [])

  beforeEach(() => {
    window.OCA.PlantUml = { openEditor: vi.fn() }
    window.OC = { Notification: { showTemporary: vi.fn() } }
    dav.stat.mockResolvedValue({ data: { basename: 'New diagram.puml' } })
  })

  afterEach(() => {
    delete window.OC
  })

  it('asks the server to create the file, and writes no content itself', async () => {
    axios.post.mockResolvedValue({ data: {} })

    await newDiagram('/Diagrams')

    expect(axios.post).toHaveBeenCalledTimes(1)
    const [url, body] = axios.post.mock.calls[0]
    expect(url).toMatch(createUrl)
    expect(body).toEqual({ filePath: '/Diagrams/New diagram.puml' })
    expect(dav.putFileContents).not.toHaveBeenCalled()
  })

  it('creates it at the top of the user\'s files from the root folder', async () => {
    axios.post.mockResolvedValue({ data: {} })

    await newDiagram('/')

    expect(axios.post.mock.calls[0][1]).toEqual({ filePath: '/New diagram.puml' })
  })

  it('shows the new file in the view and opens the editor on it', async () => {
    axios.post.mockResolvedValue({ data: {} })

    await newDiagram('/Diagrams')

    expect(dav.stat).toHaveBeenCalledWith('/files/drk/Diagrams/New diagram.puml', expect.objectContaining({ details: true }))
    const created = { basename: 'New diagram.puml', fromDav: true }
    expect(emit).toHaveBeenCalledWith('files:node:created', created)
    expect(window.OCA.PlantUml.openEditor).toHaveBeenCalledWith(created)
  })

  it('says it could not create the diagram when the server refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    axios.post.mockRejectedValue(new Error('Request failed with status code 403'))

    await newDiagram('/Diagrams')

    expect(window.OC.Notification.showTemporary).toHaveBeenCalledWith('Could not create the diagram')
    expect(dav.stat).not.toHaveBeenCalled()
    expect(window.OCA.PlantUml.openEditor).not.toHaveBeenCalled()
  })
})
