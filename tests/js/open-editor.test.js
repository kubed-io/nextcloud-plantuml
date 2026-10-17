// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Viewer's way into the editor: the same bundle load as Edit diagram,
// with the diagram to open at passed on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const node = { path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }
const scripts = () => [...document.head.querySelectorAll('script[type="module"]')]

beforeEach(() => {
  vi.resetModules()
  document.head.replaceChildren()
  window.OCA = {}
})
afterEach(() => vi.restoreAllMocks())

/** What the editor bundle does when it runs: define the opener. */
function editorBundleRuns() {
  window.OCA.PlantUml = { openEditor: vi.fn() }
  scripts()[0].dispatchEvent(new Event('load'))
}

describe('opening the editor from elsewhere', () => {
  it('passes the diagram on to the editor', async () => {
    const { openEditor } = await import('../../src/open-editor.js')

    const opening = openEditor(node, { diagram: 2 })
    editorBundleRuns()
    await opening

    expect(window.OCA.PlantUml.openEditor.mock.calls).toEqual([[node, { diagram: 2 }]])
  })

  it('passes nothing more when no diagram is asked for', async () => {
    const { openEditor } = await import('../../src/open-editor.js')

    const opening = openEditor(node)
    editorBundleRuns()
    await opening

    expect(window.OCA.PlantUml.openEditor.mock.calls).toEqual([[node]])
  })

  it('opens the Viewer when the bundle will not load', async () => {
    window.OCA.Viewer = { open: vi.fn() }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { openEditor } = await import('../../src/open-editor.js')

    const opening = openEditor(node, { diagram: 2 })
    scripts()[0].dispatchEvent(new Event('error'))
    await opening

    expect(window.OCA.Viewer.open).toHaveBeenCalledWith({ path: '/Diagrams/Screens.puml' })
  })
})
