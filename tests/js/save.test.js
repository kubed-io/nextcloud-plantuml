// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The DAV client is mocked at the module boundary; what is asserted is what
// would go over the wire and what the caller gets back.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = { getFileContents: vi.fn(), customRequest: vi.fn() }
vi.mock('@nextcloud/files/dav', () => ({
  getClient: () => client,
  getRootPath: () => '/files/drk',
}))

const { ConflictError, loadFile, saveFile } = await import('../../src/editor/save.js')

/** webdav's handleResponseCode: an Error carrying the status. */
function davError(status) {
  return Object.assign(new Error(`Invalid response: ${status}`), { status })
}

describe('loadFile', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads the file from the user folder with its ETag', async () => {
    client.getFileContents.mockResolvedValue({ data: '@startuml\n@enduml\n', headers: { etag: '"e1"' }, status: 200 })

    await expect(loadFile('/Diagrams/Order flow.puml')).resolves.toEqual({ content: '@startuml\n@enduml\n', etag: '"e1"' })
    expect(client.getFileContents).toHaveBeenCalledWith('/files/drk/Diagrams/Order flow.puml', { format: 'text', details: true })
  })
})

describe('saveFile', () => {
  beforeEach(() => vi.resetAllMocks())

  it('writes the content only if the file still has the ETag it was read with', async () => {
    client.customRequest.mockResolvedValue(new Response(null, { status: 204, headers: { ETag: '"e2"' } }))

    await saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"')

    expect(client.customRequest).toHaveBeenCalledWith('/files/drk/Diagrams/Order flow.puml', {
      method: 'PUT',
      headers: { 'If-Match': '"e1"' },
      data: 'changed',
    })
  })

  it('resolves with the ETag the server gave the new content', async () => {
    client.customRequest.mockResolvedValue(new Response(null, { status: 204, headers: { ETag: '"e2"' } }))

    await expect(saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"')).resolves.toBe('"e2"')
  })

  it('takes the new ETag from OC-ETag when ETag is missing', async () => {
    client.customRequest.mockResolvedValue(new Response(null, { status: 204, headers: { 'OC-ETag': '"e2"' } }))

    await expect(saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"')).resolves.toBe('"e2"')
  })

  it('fails as a plain error, not a conflict, when the server names no ETag', async () => {
    client.customRequest.mockResolvedValue(new Response(null, { status: 204 }))

    const failure = await saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"').catch((e) => e)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(ConflictError)
  })

  it('refuses with a ConflictError when someone else changed the file, and asks once', async () => {
    client.customRequest.mockRejectedValue(davError(412))

    await expect(saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"')).rejects.toBeInstanceOf(ConflictError)
    expect(client.customRequest).toHaveBeenCalledTimes(1)
  })

  it('passes any other failure through as it is', async () => {
    const failure = davError(507)
    client.customRequest.mockRejectedValue(failure)

    await expect(saveFile('/Diagrams/Order flow.puml', 'changed', '"e1"')).rejects.toBe(failure)
  })
})
