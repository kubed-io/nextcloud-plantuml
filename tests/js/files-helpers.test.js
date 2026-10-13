// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { APP_ID, MIMETYPE, NEW_DIAGRAM_CONTENT, isDiagram, renderUrl, uniqueDiagramName } from '../../src/files-helpers.js'

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

describe('uniqueDiagramName', () => {
  it('adds the extension to a free name', () => {
    expect(uniqueDiagramName([], 'Checkout')).toBe('Checkout.puml')
  })

  it('numbers a name that is taken, starting at 2', () => {
    expect(uniqueDiagramName(['Checkout.puml'], 'Checkout')).toBe('Checkout (2).puml')
    expect(uniqueDiagramName(['Checkout.puml', 'Checkout (2).puml'], 'Checkout')).toBe('Checkout (3).puml')
  })

  it('does not double an extension the user typed', () => {
    expect(uniqueDiagramName([], 'Checkout.puml')).toBe('Checkout.puml')
  })
})
