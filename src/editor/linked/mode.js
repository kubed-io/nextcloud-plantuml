/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * R11–R17: a file the source links takes over the source pane until the
 * breadcrumb or Escape goes back; the main file's state is parked whole
 * meanwhile, its session saving on. The editor asks `isOpen()` and is told
 * through `onChange`.
 */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { blocksOf, diagramsOf, scan } from '../blocks.js'
import { loadSheetProfile } from '../profiles/index.js'
import { SECTION } from '../completion/local-files.js'
import { editorChrome, readOnlyFile, sourceExtensions } from '../extensions.js'
import { fileAccess, loadFile } from '../save.js'
import { createFileSession, replaceWith } from '../file-session.js'
import { cancel } from '../preview.js'
import { sheetExtension } from './sheet.js'

/**
 * @param {object} options
 * @param {() => import('@codemirror/view').EditorView|null} options.view the editor's one view; null before the main file is read
 * @param {() => { name: string, session: object }|null} options.main the main file once read: its name and its session
 * @param {() => boolean} options.isClosing a close is saving
 * @param {() => boolean} options.isClosed the editor is gone
 * @param {(session: object) => Promise<boolean>} options.savedOrDiscarded S4: saves first; true once the file may be left (editor.js's own)
 * @param {() => void} options.showState the bar redraws from the open file's session
 * @param {() => void} options.redraw R13: the main file's diagram drawn again (editor.js: draw(mainState().doc.toString()))
 * @param {(state: import('@codemirror/state').EditorState) => void} options.mainChanged the main file came back changed while parked: its diagrams, tab and profiles catch up
 * @param {(open: boolean) => void} options.onChange a linked file opened (true), the main file is back (false), or the open file was renamed by Save as copy (true)
 * @param {() => void} [options.focus] where the focus goes once the view shows the other file: the source, unless it is hidden (L11)
 * @returns {{
 *   open: (link: { kind: 'style'|'include', path: string, written: string, section: string|null, block: string|null }) => Promise<void>,
 *   goBack: () => Promise<boolean>,
 *   isOpen: () => boolean,
 *   current: () => { name: string, readOnly: boolean, session: object }|null,
 *   overrides: () => Record<string, string>|null,
 *   mainState: () => import('@codemirror/state').EditorState,
 *   toMain: (spec: import('@codemirror/state').TransactionSpec) => void,
 *   stop: () => void,
 * }}
 */
export function createLinkedMode({ view, main, isClosing, isClosed, savedOrDiscarded, showState, redraw, mainChanged, onChange, focus = () => view().focus() }) {
  let parked = null // { state, doc, scrollTop }: doc is the text it was parked with
  let linked = null // { link, name, readOnly, session, wantProfiles } while a linked file is open
  let opening = false // a linked file is being read
  let goingBack = null // the way back from it, while it saves

  /** The main file's state, in the view or parked. */
  const mainState = () => parked?.state ?? view().state

  /** A change to the main file's state, wherever it is. */
  function toMain(spec) {
    if (parked) {
      parked.state = parked.state.update(spec).state
    } else {
      view().dispatch(spec)
    }
  }

  /** A linked file's Save as copy carried it on in the copy (S8): the breadcrumb takes its name. */
  function renamedLinked(record, copy) {
    record.name = copy.basename
    if (linked === record) {
      onChange(true)
    }
  }

  /** R13: the open linked file's text in place of its file, while it may be written and is still the file the line names. */
  function overrides() {
    if (!linked || linked.readOnly || linked.session.copied) {
      return null
    }
    return { [linked.link.written]: view().state.doc.toString() }
  }

  /**
   * R11, R12, R16: the linked file takes over the source pane, read with the
   * profile its link names and opened where the line points. The main file's
   * state is parked whole, its session saving on and no longer watching. A
   * file that cannot be read leaves the main file shown, saying so.
   */
  async function openLinked(link) {
    // A close under way leaves nothing behind the overlay: no file opens while it saves.
    if (linked || opening || isClosing()) {
      return
    }
    opening = true
    let file
    let access
    let sheet
    try {
      ;[file, access, sheet] = await Promise.all([
        loadFile(link.path),
        fileAccess(link.path),
        link.kind === 'style' ? loadSheetProfile() : null,
      ])
      if (!access) {
        throw new Error(`${link.path} is not readable`)
      }
    } catch (e) {
      console.error(`[${APP_ID}] could not open ${link.path}`, e)
      // Said, not failed: the main file's own saving goes on as before.
      if (!isClosed()) {
        main().session.say(t(APP_ID, 'Could not open the file'))
      }
      return
    } finally {
      opening = false
    }
    if (isClosed() || isClosing()) {
      return
    }
    const name = link.path.slice(link.path.lastIndexOf('/') + 1)
    const readOnly = !access.writable
    const record = { link, name, readOnly, session: null, wantProfiles: null }
    const save = () => record.session.save()
    let extensions
    if (link.kind === 'style') {
      extensions = [...editorChrome({ save, onUpdate: linkedUpdate }), ...sheetExtension(sheet)]
    } else {
      // R14: a linked .puml has no chips of its own.
      const built = sourceExtensions({
        name,
        path: link.path,
        save,
        onUpdate: linkedUpdate,
        chips: [],
        // Its state is the view's only while it is open.
        apply: (effects) => {
          if (linked === record && !isClosed()) {
            view().dispatch({ effects })
          }
        },
      })
      extensions = built.extensions
      record.wantProfiles = built.wantProfiles
    }
    // As CodeMirror reads the file's line breaks, so an offset in it is one in the editor's text.
    const text = file.content.replace(/\r\n?/g, '\n')
    const state = EditorState.create({
      doc: text,
      selection: { anchor: landing(text, link) },
      extensions: readOnly ? [...extensions, readOnlyFile] : extensions,
    })
    parked = { state: view().state, doc: view().state.doc, scrollTop: view().scrollDOM.scrollTop }
    main().session.pause()
    view().setState(state)
    // Made once the view shows the file: a session reads its text as saved when it starts.
    record.session = createFileSession({
      path: link.path,
      etag: file.etag,
      doc: () => view().state.doc,
      replace: (content, opts) => replaceWith(view().state, (spec) => view().dispatch(spec), content, opts),
      onChange: showState,
      onCopied: (copy) => renamedLinked(record, copy),
      readOnly,
    })
    linked = record
    view().dispatch({ effects: EditorView.scrollIntoView(view().state.selection.main.head, { y: 'start', yMargin: 20 }) })
    record.wantProfiles?.(diagramsOf(view().state.doc, text), text)
    record.session.start()
    onChange(true)
    showState()
    focus()
  }

  function linkedUpdate(update) {
    if (!update.docChanged || !linked) {
      return
    }
    linked.session.edited()
    const text = update.state.doc.toString()
    linked.wantProfiles?.(diagramsOf(update.state.doc, text), text)
    // R13: the main file's diagram, drawn with this text in place of the file.
    redraw()
  }

  /** R11, R15: back to the main file once the linked one is saved or discarded; true once there. Asked again meanwhile, it is the same way back. */
  function goBack() {
    if (!goingBack) {
      const way = leaveLinked().finally(() => {
        if (goingBack === way) {
          goingBack = null
        }
      })
      goingBack = way
    }
    return goingBack
  }

  /** The main file as it was left, its text, selection, folds, undo and scroll. */
  async function leaveLinked() {
    if (!linked) {
      return true
    }
    const { session } = linked
    if (!(await savedOrDiscarded(session))) {
      return false
    }
    // R13: the drawing still carries the discarded text, waiting or on its way; the main file's own files draw it again.
    const discarded = session.isDirty()
    session.stop()
    linked = null
    const { state, doc, scrollTop } = parked
    parked = null
    view().setState(state)
    // Back on the main file: a linked file opened from it while it is checked has a way back of its own.
    goingBack = null
    view().requestMeasure({ read: () => null, write: () => { view().scrollDOM.scrollTop = scrollTop } })
    if (discarded) {
      cancel()
    }
    // A change landed while parked (a check that was under way) ran no update listener: the tabs and drawing catch up.
    if (!state.doc.eq(doc)) {
      mainChanged(state)
    } else if (discarded) {
      redraw()
    }
    onChange(false)
    showState()
    focus()
    // It looks at once for a change made elsewhere while it was parked.
    await main().session.resume()
    return true
  }

  return {
    open: openLinked,
    goBack,
    isOpen: () => linked !== null,
    current: () => (linked && { name: linked.name, readOnly: linked.readOnly, session: linked.session }),
    overrides,
    mainState,
    toMain,
    stop: () => { linked?.session.stop() },
  }
}

/**
 * R16: where a linked file opens, as an offset in its text (`\n` lines): the
 * `!startsub` line the link's section names, or the `@start` line of its block
 * by index or id (B1), else the top.
 */
function landing(text, { section, block }) {
  if (section !== null) {
    const found = [...text.matchAll(SECTION)].find((m) => m[1] === section)
    return found ? text.lastIndexOf('\n', found.index + found[0].indexOf('!startsub')) + 1 : 0
  }
  if (block === null) {
    return 0
  }
  const blocks = blocksOf(scan(text))
  const found = /^\d+$/.test(block) ? blocks[Number(block)] : blocks.find((b) => b.id === block)
  return found ? text.split('\n', found.start - 1).reduce((offset, line) => offset + line.length + 1, 0) : 0
}
