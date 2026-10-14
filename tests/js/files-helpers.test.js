// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_ID, MIMETYPE, NEW_DIAGRAM_CONTENT, canEditDiagram, canOpenAsText, editorBundleUrl, isDiagram, renderUrl } from '../../src/files-helpers.js'

describe('files-helpers', () => {
  it('names the app', () => {
    expect(APP_ID).toBe('plantuml')
  })

  it('recognises a diagram file by its mimetype', () => {
    expect(isDiagram({ mime: MIMETYPE })).toBe(true)
    expect(isDiagram({ mime: 'text/x-plantuml' })).toBe(true)
    expect(isDiagram({ mime: 'text/plain' })).toBe(false)
    expect(isDiagram(undefined)).toBe(false)
  })

  it('holds the empty diagram a new file starts with', () => {
    expect(NEW_DIAGRAM_CONTENT).toBe('@startuml\n\n@enduml\n')
  })
})

describe('renderUrl', () => {
  // OC is the page global Nextcloud injects; node has none, so one is lent here.
  beforeEach(() => {
    globalThis.OC = { generateUrl: (url) => `/index.php${url}` }
  })
  afterEach(() => {
    delete globalThis.OC
  })

  it('asks the render route for the file by its encoded path', () => {
    expect(renderUrl('Diagrams/Order flow.puml'))
      .toBe('/index.php/apps/plantuml/render?path=Diagrams%2FOrder%20flow.puml')
  })
})

describe('editorBundleUrl', () => {
  // The web roots are page globals Nextcloud injects; node has no window.
  beforeEach(() => {
    vi.stubGlobal('window', { _oc_webroot: '', _oc_appswebroots: { plantuml: '/custom_apps/plantuml' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('points at the editor bundle under the app\'s web root', () => {
    expect(editorBundleUrl()).toBe('/custom_apps/plantuml/dist/plantuml-editor.js')
  })
})

describe('action gating', () => {
  // The node shape @nextcloud/files gives a row in the user's files.
  const diagram = { mime: MIMETYPE, isDavResource: true, root: '/files/drk' }
  const text = { ...diagram, mime: 'text/plain' }

  it('offers both actions on one diagram with a server set', () => {
    expect(canEditDiagram([diagram], true)).toBe(true)
    expect(canOpenAsText([diagram])).toBe(true)
  })

  it('hides both actions on a multi-selection', () => {
    expect(canEditDiagram([diagram, diagram], true)).toBe(false)
    expect(canOpenAsText([diagram, diagram])).toBe(false)
  })

  it('hides both actions on a file that is not a diagram', () => {
    expect(canEditDiagram([text], true)).toBe(false)
    expect(canOpenAsText([text])).toBe(false)
  })

  it('hides both actions on a diagram in the trash', () => {
    const trashed = { ...diagram, root: '/trashbin/drk/trash' }
    expect(canEditDiagram([trashed], true)).toBe(false)
    expect(canOpenAsText([trashed])).toBe(false)
  })

  it('hides Edit diagram but not the text editor when no server is set', () => {
    expect(canEditDiagram([diagram], false)).toBe(false)
    expect(canOpenAsText([diagram])).toBe(true)
  })
})
