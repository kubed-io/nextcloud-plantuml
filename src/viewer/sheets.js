/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer's sheets: one diagram each, drawn inline through GET /render so its
 * links work (D1), or the line saying why not (D4). Until then a sheet shows
 * Nextcloud's loading spinner at a fixed size (VW9). A sheet is drawn only once
 * it is asked for (VW10), a few at a time, so a wall of diagrams does not flood
 * the server: a sheet still loading goes before a check of one drawn from
 * memory, and the lowest position first within each.
 *
 * What is drawn is kept for the page (page-cache.js, VW11). A kept drawing is
 * drawn at once, then checked in its turn with the server by the ETag the route
 * drew it with, which covers the files it includes: unchanged (304) or not
 * answered, the drawing stays; drawn anew, the new drawing takes its place, and
 * the sheet settles again with its new size.
 *
 * Positions count from 1, as the tabs do; the route is asked by `index`, the
 * 0-based place, never `diagram=`, which a diagram named with digits would win.
 */
import { translate as t } from '@nextcloud/l10n'
import { APP_ID, renderUrl } from '../files-helpers.js'
import { toInlineSvg } from '../editor/inline-svg.js'
import { pageCache, sheetKey } from './page-cache.js'

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

// A length in user units or px; a `%` or `em` says nothing of the drawing's own size.
const LENGTH = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/

/**
 * The size PlantUML drew a diagram at, in CSS pixels: its width and height, else its
 * viewBox's; null when it names neither. A later Wall lays cards out by it.
 *
 * @param {SVGSVGElement} svg
 * @return {{ width: number, height: number }|null}
 */
export function sizeOf(svg) {
  const width = Number(LENGTH.exec(svg.getAttribute('width') ?? '')?.[1] ?? 0)
  const height = Number(LENGTH.exec(svg.getAttribute('height') ?? '')?.[1] ?? 0)
  if (width > 0 && height > 0) {
    return { width, height }
  }
  const box = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  return box.length === 4 && box[2] > 0 && box[3] > 0 ? { width: box[2], height: box[3] } : null
}

/**
 * @param {string} path the file, in the user's folder
 * @param {object} options
 * @param {(position: number) => string} options.labelOf
 * @param {string} [options.etag] the ETag the file was read with; without one nothing is kept
 * @param {number} [options.parallel]
 * @param {string} [options.idPrefix] the view's own, so no two views on a page share an SVG id
 * @param {ReturnType<import('./page-cache.js').createPageCache>} [options.cache]
 * @return {{
 *   sheet: (position: number) => HTMLElement,
 *   request: (...positions: number[]) => void,
 *   release: (position: number) => void,
 *   clear: () => void,
 *   sizeOf: (position: number) => ({ width: number, height: number }|null),
 *   destroy: () => void,
 * }}
 */
export function createSheets(path, { labelOf, etag, parallel = 3, idPrefix = 'plantuml-viewer-', cache = pageCache }) {
  const sheets = new Map()
  const sizes = new Map()
  // Asked for and not yet under way; under way or settled.
  const waiting = new Set()
  const started = new Set()
  // Drawn from memory, by the server ETag (or null) the kept drawing came with.
  const remembered = new Map()
  const stop = new AbortController()
  let running = 0
  const keyOf = (position) => (etag ? sheetKey(path, etag, position - 1) : null)
  const inline = (svgText, position) => toInlineSvg(svgText, { idPrefix: `${idPrefix}${position}-` })

  function sheet(position) {
    if (!sheets.has(position)) {
      const node = document.createElement('div')
      node.className = 'plantuml-viewer__sheet plantuml-viewer__sheet--loading'
      node.setAttribute('role', 'img')
      node.setAttribute('aria-label', labelOf(position))
      node.setAttribute('aria-busy', 'true')
      const spinner = document.createElement('span')
      spinner.className = 'plantuml-viewer__spinner'
      node.append(spinner)
      sheets.set(position, node)
    }
    return sheets.get(position)
  }

  /** The drawing in place of what the sheet shows, or the problem line; then the sheet says it is settled. */
  function settle(position, svg, size, problem) {
    const node = sheets.get(position)
    node.classList.remove('plantuml-viewer__sheet--loading')
    node.removeAttribute('aria-busy')
    if (svg) {
      sizes.set(position, size)
      node.replaceChildren(svg)
    } else {
      const line = document.createElement('p')
      line.className = 'plantuml-viewer__problem'
      line.textContent = problem
      node.classList.add('plantuml-viewer__sheet--problem')
      node.replaceChildren(line)
    }
    node.dispatchEvent(new CustomEvent('plantuml-viewer:settled', { detail: { size: sizes.get(position) ?? null } }))
  }

  /** A drawing kept for the page, drawn at once and remembered to be checked. */
  function fromMemory(position) {
    const key = keyOf(position)
    const kept = key === null ? null : cache.get(key)
    const svg = kept ? inline(kept.svg, position) : null
    if (svg) {
      remembered.set(position, kept.serverEtag)
      settle(position, svg, kept.size, '')
    }
  }

  async function draw(position) {
    // A sheet drawn from memory is checked: it keeps its drawing unless the server draws it anew.
    const checking = remembered.has(position)
    const serverEtag = remembered.get(position)
    const init = { credentials: 'same-origin', signal: stop.signal }
    if (typeof serverEtag === 'string') {
      init.headers = { 'If-None-Match': serverEtag }
    }
    let svg = null
    let size = null
    let problem = ''
    try {
      const res = await fetch(renderUrl(path, { index: position - 1 }), init)
      if (checking && res.status === 304) {
        return
      }
      const body = await res.text()
      svg = res.ok ? inline(body, position) : null
      if (svg) {
        size = sizeOf(svg)
        const key = keyOf(position)
        if (key !== null) {
          cache.set(key, { svg: body, size, serverEtag: res.headers.get('ETag') })
        }
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
    if (svg || !checking) {
      settle(position, svg, size, problem)
    }
  }

  /** The next to go: the lowest position still loading, else the lowest to check. */
  function next() {
    const loading = [...waiting].filter((position) => !remembered.has(position))
    return Math.min(...(loading.length ? loading : waiting))
  }

  function pump() {
    while (running < parallel && waiting.size && !stop.signal.aborted) {
      const position = next()
      waiting.delete(position)
      started.add(position)
      running++
      draw(position).finally(() => {
        running--
        pump()
      })
    }
  }

  return {
    sheet,
    /**
     * Draws each sheet asked for, from memory at once, and from the server in its turn; once,
     * however often asked. Those asked for together take their turns as one.
     */
    request(...positions) {
      for (const position of positions) {
        sheet(position)
        if (started.has(position) || waiting.has(position) || stop.signal.aborted) {
          continue
        }
        if (!remembered.has(position)) {
          fromMemory(position)
        }
        waiting.add(position)
      }
      pump()
    },
    /** A sheet no longer wanted before its turn (a card scrolled away) waits no more. */
    release(position) {
      waiting.delete(position)
    },
    /** Nothing waits any more; what is under way still lands. */
    clear() {
      waiting.clear()
    },
    sizeOf: (position) => sizes.get(position) ?? null,
    destroy() {
      waiting.clear()
      stop.abort()
    },
  }
}
