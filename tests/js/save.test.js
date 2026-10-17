// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The DAV client is mocked at the module boundary; what is asserted is what
// would go over the wire and what the caller gets back.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const client = { getFileContents: vi.fn(), customRequest: vi.fn(), stat: vi.fn(), getDirectoryContents: vi.fn() }
vi.mock('@nextcloud/files/dav', () => ({
  getClient: () => client,
  getRootPath: () => '/files/drk',
  getDefaultPropfind: () => '<propfind/>',
  // The Files node is @nextcloud/files' own; standing in, the stat it was made from.
  resultToNode: (stat) => ({ fromStat: stat }),
}))

import { resetOnce } from '../../src/editor/once.js'

const { ConflictError, currentEtag, listFolder, loadFile, saveCopy, saveFile } = await import('../../src/editor/save.js')

/** webdav's handleResponseCode: an Error carrying the status. */
function davError(status) {
  return Object.assign(new Error(`Invalid response: ${status}`), { status })
}

describe('loadFile', () => {
  beforeEach(() => vi.resetAllMocks())

  it('reads the file from the user folder with its ETag', async () => {
    client.getFileContents.mockResolvedValue({ data: '@startuml\n@enduml\n', headers: { etag: '"e1"' }, status: 200 })

    await expect(loadFile('/Diagrams/Order flow.puml')).resolves.toEqual({ content: '@startuml\n@enduml\n', etag: '"e1"' })
    expect(client.getFileContents).toHaveBeenCalledWith('/files/drk/Diagrams/Order flow.puml', { format: 'text', details: true, headers: { 'Cache-Control': 'no-cache' } })
  })
})

describe('currentEtag', () => {
  beforeEach(() => vi.resetAllMocks())

  it('asks for the ETag alone, of the file and nothing under it', async () => {
    client.stat.mockResolvedValue({ filename: '/files/drk/Diagrams/Order flow.puml', etag: 'e1' })

    await currentEtag('/Diagrams/Order flow.puml')

    expect(client.stat).toHaveBeenCalledTimes(1)
    const [davPath, options] = client.stat.mock.calls[0]
    expect(davPath).toBe('/files/drk/Diagrams/Order flow.puml')
    // stat() is webdav's Depth-0 PROPFIND; the body names the one property.
    expect(options.data).toMatch(/xmlns:d="DAV:"/)
    expect(options.data.match(/<d:prop>(.*)<\/d:prop>/s)[1].replace(/\s/g, '')).toBe('<d:getetag/>')
  })

  // webdav's stat strips the quotes Sabre sends; GET and PUT headers keep them.
  it('resolves with the ETag quoted, as loadFile and saveFile have it', async () => {
    client.stat.mockResolvedValue({ filename: '/files/drk/Diagrams/Order flow.puml', etag: 'e1' })

    await expect(currentEtag('/Diagrams/Order flow.puml')).resolves.toBe('"e1"')
  })

  it('fails when the server names no ETag, rather than calling every file changed', async () => {
    client.stat.mockResolvedValue({ filename: '/files/drk/Diagrams/Order flow.puml', etag: null })

    await expect(currentEtag('/Diagrams/Order flow.puml')).rejects.toThrow()
  })

  it('passes a failure through as it is', async () => {
    const failure = davError(404)
    client.stat.mockRejectedValue(failure)

    await expect(currentEtag('/Diagrams/Order flow.puml')).rejects.toBe(failure)
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

describe('saveCopy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    client.stat.mockImplementation(async (davPath) => ({ data: { filename: davPath } }))
  })

  /** A server where `taken` already exist: 412 for those, 201 with an ETag otherwise. */
  function serverWith(...taken) {
    client.customRequest.mockImplementation(async (davPath) => {
      if (taken.includes(davPath)) {
        throw davError(412)
      }
      return new Response(null, { status: 201, headers: { ETag: '"copy"' } })
    })
  }

  it('writes the content beside the file as "(copy)", never over a file already there', async () => {
    serverWith()

    await saveCopy('/Diagrams/Order flow.puml', 'mine')

    expect(client.customRequest).toHaveBeenCalledTimes(1)
    expect(client.customRequest).toHaveBeenCalledWith('/files/drk/Diagrams/Order flow (copy).puml', {
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      data: 'mine',
    })
  })

  it('resolves with the copy as a Files node and the ETag the server gave it', async () => {
    serverWith()

    await expect(saveCopy('/Diagrams/Order flow.puml', 'mine')).resolves.toEqual({
      node: { fromStat: { filename: '/files/drk/Diagrams/Order flow (copy).puml' } },
      etag: '"copy"',
    })
    expect(client.stat).toHaveBeenCalledWith('/files/drk/Diagrams/Order flow (copy).puml', { details: true, data: '<propfind/>' })
  })

  it('numbers the copy when "(copy)" is taken, from 2', async () => {
    serverWith('/files/drk/Diagrams/Order flow (copy).puml', '/files/drk/Diagrams/Order flow (copy 2).puml')

    const { node } = await saveCopy('/Diagrams/Order flow.puml', 'mine')

    expect(client.customRequest.mock.calls.map(([davPath]) => davPath)).toEqual([
      '/files/drk/Diagrams/Order flow (copy).puml',
      '/files/drk/Diagrams/Order flow (copy 2).puml',
      '/files/drk/Diagrams/Order flow (copy 3).puml',
    ])
    expect(node.fromStat.filename).toBe('/files/drk/Diagrams/Order flow (copy 3).puml')
  })

  it('keeps the file\'s own extension, and works at the top of the user folder', async () => {
    serverWith()

    await saveCopy('/Order flow.plantuml', 'mine')

    expect(client.customRequest.mock.calls[0][0]).toBe('/files/drk/Order flow (copy).plantuml')
  })

  it('gives up after "(copy 9)" with "Could not save a copy"', async () => {
    client.customRequest.mockRejectedValue(davError(412))

    await expect(saveCopy('/Diagrams/Order flow.puml', 'mine')).rejects.toThrow('Could not save a copy')
    expect(client.customRequest).toHaveBeenCalledTimes(9)
    expect(client.customRequest.mock.calls[8][0]).toBe('/files/drk/Diagrams/Order flow (copy 9).puml')
    expect(client.stat).not.toHaveBeenCalled()
  })

  it('passes any other failure through as it is, without trying another name', async () => {
    const failure = davError(507)
    client.customRequest.mockRejectedValue(failure)

    await expect(saveCopy('/Diagrams/Order flow.puml', 'mine')).rejects.toBe(failure)
    expect(client.customRequest).toHaveBeenCalledTimes(1)
  })
})

describe('listFolder', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetOnce()
  })

  it('lists a folder with one Depth-1 PROPFIND, without the folder itself, and keeps the answer', async () => {
    client.getDirectoryContents.mockResolvedValue([
      { filename: '/files/drk/Diagrams', basename: 'Diagrams', type: 'directory' },
      { filename: '/files/drk/Diagrams/a.puml', basename: 'a.puml', type: 'file' },
      { filename: '/files/drk/Diagrams/sub', basename: 'sub', type: 'directory' },
    ])

    const expected = [{ name: 'a.puml', folder: false }, { name: 'sub', folder: true }]
    await expect(listFolder('/Diagrams')).resolves.toEqual(expected)
    await expect(listFolder('/Diagrams')).resolves.toEqual(expected)

    expect(client.getDirectoryContents).toHaveBeenCalledTimes(1)
    expect(client.getDirectoryContents).toHaveBeenCalledWith('/files/drk/Diagrams')
  })

  it('asks once per folder, and does not keep a failure', async () => {
    client.getDirectoryContents.mockRejectedValueOnce(davError(503)).mockResolvedValue([])

    await expect(listFolder('/Other')).rejects.toThrow('503')
    await expect(listFolder('/Other')).resolves.toEqual([])
    await expect(listFolder('/Third')).resolves.toEqual([])

    expect(client.getDirectoryContents.mock.calls.map(([path]) => path)).toEqual(['/files/drk/Other', '/files/drk/Other', '/files/drk/Third'])
  })
})
