// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// One file's save machine, with save.js and watch.js mocked at their seams:
// what is asserted is what it would write and what it says about the file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Text } from '@codemirror/state'

const seams = vi.hoisted(() => {
  class ConflictError extends Error {}
  return { ConflictError, loadFile: vi.fn(), currentEtag: vi.fn(), saveFile: vi.fn(), saveCopy: vi.fn(), watchFile: vi.fn() }
})
vi.mock('../../src/editor/save.js', () => ({
  ConflictError: seams.ConflictError, loadFile: seams.loadFile, currentEtag: seams.currentEtag, saveFile: seams.saveFile, saveCopy: seams.saveCopy,
}))
vi.mock('../../src/editor/watch.js', () => ({ watchFile: seams.watchFile }))

const { createFileSession } = await import('../../src/editor/file-session.js')

// Every session a test made, stopped after it, so no autosave or watcher outlives it.
const sessions = []

function session(options = {}) {
  let text = Text.of(['@startuml', '@enduml'])
  const s = createFileSession({
    path: '/Diagrams/UML_Fun.css', etag: '"e1"',
    doc: () => text, replace: (content) => { text = Text.of(content.split('\n')) }, onChange: () => {}, ...options,
  })
  sessions.push(s)
  return { s, type: (content) => { text = Text.of(content.split('\n')); s.edited() } }
}

beforeEach(() => {
  vi.resetAllMocks()
  seams.watchFile.mockReturnValue({ stop: vi.fn() })
})

afterEach(() => {
  sessions.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a file session', () => {
  it('starts saved, as the text it was read with', () => {
    const { s } = session()

    expect(s.isDirty()).toBe(false)
    expect(s.status().state).toBe('saved')
  })

  it('saves the live text against the ETag it was read at', async () => {
    seams.saveFile.mockResolvedValue('"e2"')
    const { s, type } = session()
    type('a {}')

    await s.save()

    expect(seams.saveFile).toHaveBeenCalledWith('/Diagrams/UML_Fun.css', 'a {}', '"e1"')
    expect(s.status().state).toBe('saved')
  })

  it('stops at a conflict until it is resolved', async () => {
    vi.useFakeTimers()
    seams.saveFile.mockRejectedValue(new seams.ConflictError())
    const { s, type } = session()
    type('a {}')

    await s.save()
    type('b {}')
    await vi.advanceTimersByTimeAsync(31000)

    expect(s.status().conflict).toBe(true)
    expect(s.blocked()).toBe(true)
    expect(seams.saveFile).toHaveBeenCalledTimes(1)
  })

  it('stops watching while paused, and looks at once when resumed', async () => {
    seams.currentEtag.mockResolvedValue('"e1"')
    const stop = vi.fn()
    seams.watchFile.mockReturnValue({ stop })
    const { s } = session()
    s.start()

    s.pause()
    await s.resume()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(seams.watchFile).toHaveBeenCalledTimes(2)
    expect(seams.currentEtag).toHaveBeenCalledWith('/Diagrams/UML_Fun.css')
  })

  it('watches once however often it is started', () => {
    const first = vi.fn()
    seams.watchFile.mockReturnValueOnce({ stop: first })
    const { s } = session()
    s.start()

    s.start()

    expect(first).toHaveBeenCalledTimes(1)
    expect(seams.watchFile).toHaveBeenCalledTimes(2)
  })

  it('takes no edit once stopped: nothing is scheduled and the bar is not told', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { s, type } = session({ onChange })
    s.fail('Could not save the file')
    s.stop()
    onChange.mockClear()

    type('a {}')

    expect(onChange).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(s.status().line).toBe('Could not save the file')
  })

  it('resumes even when the look at the file fails, and says so only to the debug console', async () => {
    seams.currentEtag.mockRejectedValue(new Error('offline'))
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { s } = session()
    s.start()
    s.pause()

    await expect(s.resume()).resolves.toBeUndefined()

    expect(seams.watchFile).toHaveBeenCalledTimes(2)
    expect(debug).toHaveBeenCalledWith('[plantuml] could not check the file', expect.any(Error))
    expect(s.status()).toMatchObject({ state: 'saved', conflict: false, line: '' })
  })

  it('says a line that blocks nothing, until the next change', () => {
    const { s, type } = session()

    s.say('Could not open the file')
    expect(s.status().line).toBe('Could not open the file')
    expect(s.blocked()).toBe(false)

    type('a {}')
    expect(s.status().line).toBe('')
  })

  it('never writes a read-only file', async () => {
    const { s, type } = session({ readOnly: true })
    type('a {}')

    await s.save()

    expect(seams.saveFile).not.toHaveBeenCalled()
  })
})
