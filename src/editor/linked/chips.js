/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * R9, R10: a `<>` chip after the path of a line that links a readable file
 * beside the diagram, and Ctrl+click (Cmd+click on macOS) on that path.
 * Whether a file is there is asked once for the page, so the editor drawn
 * again on going back does not ask again; R6's moments and each open forget
 * the answers. Each answer redraws every editor drawing chips.
 */
import { StateEffect } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID } from '../../files-helpers.js'
import { filePath } from '../lint/state.js'
import { resolveLinked } from '../paths.js'
import { fileAccess } from '../save.js'
import { linkOn } from './links.js'
import codeTags from '../../../img/icons/code-tags.svg?raw'

/** A file's answer landed, or the answers were forgotten: draw again. */
const answered = StateEffect.define()

const asked = new Set() // paths asked since the answers were last forgotten
const answers = new Map() // path → {writable}|null, once answered
const live = new Set() // the plugins drawing chips
let round = 0 // bumped by each forgetting, so an answer to an older ask is dropped

const mac = () => /Mac|iP(?:hone|ad|od)/.test(navigator.platform)
const held = (event) => (mac() ? event.metaKey : event.ctrlKey)
const baseName = (path) => path.slice(path.lastIndexOf('/') + 1)

function redraw(path) {
  for (const plugin of live) {
    plugin.view.dispatch({ effects: answered.of(path) })
  }
}

/** Forgets every answer, for the next draw to ask again: at R6's moments, and at each open. */
export function forgetLinkedFiles() {
  round++
  asked.clear()
  answers.clear()
  redraw(null)
}

const visible = () => {
  if (document.visibilityState === 'visible') {
    forgetLinkedFiles()
  }
}

function ask(path) {
  if (asked.has(path)) {
    return
  }
  asked.add(path)
  const at = round
  fileAccess(path).then((answer) => {
    if (at === round) {
      answers.set(path, answer)
      redraw(path)
    }
  }, (e) => {
    // A failure is not kept: the next draw asks again.
    console.debug(`[${APP_ID}] could not check a linked file`, e)
    if (at === round) {
      asked.delete(path)
    }
  })
}

class Chip extends WidgetType {
  constructor(path) {
    super()
    this.path = path
  }

  eq(other) {
    return other.path === this.path
  }

  toDOM() {
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'cm-plantuml-link-chip'
    // As the chooser (W1): a press keeps the focus in the editor.
    node.setAttribute('tabindex', '-1')
    node.dataset.linkedPath = this.path
    node.title = t(APP_ID, 'Open {name}', { name: baseName(this.path) })
    node.setAttribute('aria-label', node.title)
    node.innerHTML = codeTags
    return node
  }

  ignoreEvent() {
    return false
  }
}

/** The linked file on `line`, with its path beside the diagram at `file`, or null. */
function linkedOn(file, text) {
  const link = linkOn(text)
  const path = link && resolveLinked(file, link.written)
  return path ? { ...link, path } : null
}

/**
 * @param {(link: object) => void} open given the line's link (links.js) and its `path`
 * @return {import('@codemirror/state').Extension[]} for the main file's state only (R14)
 */
export function linkedChips(open) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view
      this.ctrl = (event) => view.dom.classList.toggle('cm-plantuml-ctrl', held(event))
      this.released = () => view.dom.classList.remove('cm-plantuml-ctrl')
      document.addEventListener('keydown', this.ctrl)
      document.addEventListener('keyup', this.ctrl)
      window.addEventListener('blur', this.released)
      if (live.size === 0) {
        window.addEventListener('focus', forgetLinkedFiles)
        document.addEventListener('visibilitychange', visible)
      }
      live.add(this)
      this.decorations = this.build()
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.startState.facet(filePath) !== update.state.facet(filePath)
        || update.transactions.some((tr) => tr.effects.some((e) => e.is(answered)))) {
        this.decorations = this.build()
      }
    }

    build() {
      const { state } = this.view
      const file = state.facet(filePath)
      const marks = []
      for (const { from, to } of this.view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = state.doc.lineAt(pos)
          const link = linkedOn(file, line.text)
          if (link) {
            ask(link.path)
            if (answers.get(link.path)) {
              // After the `>` of a style line; after the path (and its quote) of an include.
              const at = link.kind === 'style' ? line.text.trimEnd().length : link.to + (line.text[link.to] === '"' ? 1 : 0)
              marks.push(
                Decoration.mark({ class: 'cm-plantuml-link', attributes: { 'data-linked-path': link.path } }).range(line.from + link.from, line.from + link.to),
                Decoration.widget({ widget: new Chip(link.path), side: 1 }).range(line.from + at),
              )
            }
          }
          pos = line.to + 1
        }
      }
      return Decoration.set(marks, true)
    }

    /** The readable linked file whose path or chip `target` is in, or null. */
    linkAt(target) {
      const node = target.closest?.('[data-linked-path]')
      if (!node || !this.view.contentDOM.contains(node)) {
        return null
      }
      const { state } = this.view
      const link = linkedOn(state.facet(filePath), state.doc.lineAt(this.view.posAtDOM(node)).text)
      return link && answers.get(link.path) ? link : null
    }

    destroy() {
      document.removeEventListener('keydown', this.ctrl)
      document.removeEventListener('keyup', this.ctrl)
      window.removeEventListener('blur', this.released)
      live.delete(this)
      if (live.size === 0) {
        window.removeEventListener('focus', forgetLinkedFiles)
        document.removeEventListener('visibilitychange', visible)
      }
    }
  }, {
    decorations: (value) => value.decorations,
    eventHandlers: {
      mousedown(event) {
        if (event.button !== 0) {
          return false
        }
        const chip = event.target.closest?.('button.cm-plantuml-link-chip')
        const link = (chip || held(event)) && this.linkAt(chip ?? event.target)
        if (!link) {
          return false
        }
        event.preventDefault()
        open(link)
        return true
      },
    },
  })
  return [plugin]
}
