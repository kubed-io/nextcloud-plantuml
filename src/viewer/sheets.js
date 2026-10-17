/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's sheets: one diagram each, drawn inline through GET /render so its
 * links work (D1), or the line saying why not (D4). A few requests at a time, in
 * the order asked, so a wall of diagrams does not flood the server.
 *
 * Positions count from 1, as the tabs do; the route is asked by `index`, the
 * 0-based place, never `diagram=`, which a diagram named with digits would win.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID, renderUrl } from '../files-helpers.js'
import { toInlineSvg } from '../editor/inline-svg.js'

/**
 * The route's own words for a refusal, `{"problem": …}`, or '' for any other body.
 *
 * @param {string} body
 * @return {string}
 */
export function jsonProblem(body) {
  try {
    const problem = JSON.parse(body)?.problem
    return typeof problem === 'string' ? problem : ''
  } catch {
    return ''
  }
}

/**
 * @param {string} path the file, in the user's folder
 * @param {{ parallel?: number, labelOf: (position: number) => string, idPrefix?: string }} options
 *   `idPrefix` is the view's own, so no two views on a page share an SVG id
 * @return {{ sheet: (position: number) => HTMLElement, destroy: () => void }}
 */
export function createSheets(path, { parallel = 3, labelOf, idPrefix = 'plantuml-viewer-' }) {
  const sheets = new Map()
  const queue = []
  const stop = new AbortController()
  let running = 0

  async function draw(position) {
    const sheet = sheets.get(position)
    let problem = ''
    try {
      const res = await fetch(renderUrl(path, { index: position - 1 }), { credentials: 'same-origin', signal: stop.signal })
      const body = await res.text()
      const svg = res.ok ? toInlineSvg(body, { idPrefix: `${idPrefix}${position}-` }) : null
      if (svg) {
        sheet.replaceChildren(svg)
      } else {
        // The route's own words, as it sent them: its "no diagram N" counts from 1.
        problem = (!res.ok && jsonProblem(body)) || t(APP_ID, 'Could not draw the diagram')
      }
    } catch {
      if (stop.signal.aborted) {
        return
      }
      problem = t(APP_ID, 'Could not draw the diagram')
    }
    if (problem) {
      const line = document.createElement('p')
      line.className = 'plantuml-viewer__problem'
      line.textContent = problem
      sheet.classList.add('plantuml-viewer__sheet--problem')
      sheet.replaceChildren(line)
    }
    sheet.dispatchEvent(new CustomEvent('plantuml-viewer:settled'))
  }

  function pump() {
    while (running < parallel && queue.length && !stop.signal.aborted) {
      running++
      draw(queue.shift()).finally(() => {
        running--
        pump()
      })
    }
  }

  return {
    sheet(position) {
      if (!sheets.has(position)) {
        const sheet = document.createElement('div')
        sheet.className = 'plantuml-viewer__sheet'
        sheet.setAttribute('role', 'img')
        sheet.setAttribute('aria-label', labelOf(position))
        sheets.set(position, sheet)
        queue.push(position)
        pump()
      }
      return sheets.get(position)
    },
    destroy() {
      queue.length = 0
      stop.abort()
    },
  }
}
