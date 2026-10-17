// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A file the web server sends compressed (a linked .css of a hundred bytes or more): its GET's
// ETag carries `-gzip`. Through the real save.js and file session, with only the DAV client and
// the watcher's clock mocked: the save is not refused and the clean file is not read again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from '@codemirror/state'

const seams = vi.hoisted(() => ({ client: { getFileContents: vi.fn(), customRequest: vi.fn(), stat: vi.fn() }, watchFile: vi.fn() }))
vi.mock('@nextcloud/files/dav', () => ({
  getClient: () => seams.client,
  getRootPath: () => '/files/drk',
  getDefaultPropfind: () => '<propfind/>',
  resultToNode: (stat) => stat,
}))
vi.mock('../../src/editor/watch.js', () => ({ watchFile: seams.watchFile }))

const { loadFile } = await import('../../src/editor/save.js')
const { createFileSession } = await import('../../src/editor/file-session.js')

const PATH = '/Diagrams/UML_Fun.css'
let session

/** The file as the editor opens it, read through the web server that compressed it. */
async function opened() {
  seams.client.getFileContents.mockResolvedValue({ data: 'a {}\n', headers: { etag: '"e1-gzip"' }, status: 200 })
  const file = await loadFile(PATH)
  let text = Text.of(file.content.split('\n'))
  session = createFileSession({ path: PATH, etag: file.etag, doc: () => text, replace: (content) => { text = Text.of(content.split('\n')) }, onChange: () => {} })
  return { type: (content) => { text = Text.of(content.split('\n')); session.edited() } }
}

beforeEach(() => {
  vi.resetAllMocks()
  seams.watchFile.mockReturnValue({ stop: vi.fn() })
  // Sabre's getetag, which webdav's stat hands over unquoted.
  seams.client.stat.mockResolvedValue({ filename: `/files/drk${PATH}`, etag: 'e1' })
})
afterEach(() => session?.stop())

describe('a file the web server compresses', () => {
  it('is saved against the ETag Sabre knows, not the -gzip one', async () => {
    seams.client.customRequest.mockResolvedValue(new Response(null, { status: 204, headers: { ETag: '"e2"' } }))
    const { type } = await opened()
    type('b {}')

    await session.save()

    expect(seams.client.customRequest).toHaveBeenCalledWith(`/files/drk${PATH}`, expect.objectContaining({ headers: { 'If-Match': '"e1"' } }))
    expect(session.status().state).toBe('saved')
  })

  it('is unchanged to the watcher while its getetag is the one it was read at', async () => {
    await opened()
    session.start()
    const { check } = seams.watchFile.mock.calls[0][0]

    await check()
    await check()

    expect(seams.client.getFileContents).toHaveBeenCalledOnce()
    expect(session.status().state).toBe('saved')
  })
})
