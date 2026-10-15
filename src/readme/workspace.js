/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Draws the diagrams into one README Text has rendered (one `.ProseMirror`).
 *
 * The DOM this relies on, read from nextcloud/text stable34 on 2026-10-13:
 *
 *  - src/nodes/CodeBlock/CodeBlockView.vue: a fence is
 *    `div.code-block[data-mode] > (div.code-block-header, div > pre.split-view__code > code)`.
 *    The language is not in the DOM: tiptap's NodeViewContent draws a bare
 *    `<code>`, so fences are matched to blocks by order, and the block's text
 *    must equal the fence's source (an indented code block is a `.code-block`
 *    too and would shift the count).
 *  - src/nodes/ImageView.vue: an image is
 *    `div[data-node-view-wrapper] > figure[data-component="image-view"][data-src]`,
 *    `data-src` holding the Markdown source as markdown-it normalised it
 *    (`Order%20flow.puml`). For a .puml there is never an `<img>` to rewrite:
 *    loadPreview() preloads the WebDAV URL, the browser cannot decode PlantUML
 *    text, and onImageLoadFailure() draws the broken-image icon instead. So
 *    Text's figure is hidden and ours goes beside it. Its click opens Text's
 *    lightbox (handleImageClick), which ours never reaches.
 *  - src/services/AttachmentResolver.js: a relative image resolves against the
 *    README's folder with decodeURI() and path normalisation, as here.
 *
 * Text's elements are hidden with an inline display:none and never removed:
 * Vue and ProseMirror own them, and both ignore a style they did not bind and a
 * child added outside a node's content. A hidden fence's source is still in the
 * editable workspace's document, so its <pre> and <code> are made
 * non-editable, and lock() puts that back if Text's binding resets it.
 *
 * Text draws each README twice per folder open (the preview, then the editor
 * that replaces it), so fence renders are cached by source and README: a fence
 * includes files beside its README (R4).
 */
import { getRequestToken } from '@nextcloud/auth'
import { translate as t } from '@nextcloud/l10n'
import { APP_ID, renderUrl } from '../files-helpers.js'

const BLOCKS = '.code-block'
const FIGURES = 'figure[data-component="image-view"]'
const DRAWN_SOURCE = '.code-block[data-plantuml="done"] pre, .code-block[data-plantuml="done"] pre code'
const CACHED_RENDERS = 64

/** README path and source → its SVG, or null when the server could not draw it. Oldest out first. */
const renders = new Map()

/** Elements already looked at. Text draws fresh ones each time it re-renders. */
const seen = new WeakSet()

/** True when Text has drawn something attach() has not looked at yet. */
export function pending(root) {
  return [...root.querySelectorAll(`${BLOCKS}, ${FIGURES}`)].some((el) => !seen.has(el))
}

/** Keeps every drawn fence's hidden source out of reach of the caret. */
export function lock(root) {
  for (const el of root.querySelectorAll(DRAWN_SOURCE)) {
    // Setting an unchanged value still queues a mutation, which would re-run the observer.
    if (el.getAttribute('contenteditable') !== 'false') {
      el.setAttribute('contenteditable', 'false')
    }
  }
}

/**
 * @param {Element} root one rendered README
 * @param {{dir: string, path?: string, fences: Array<{lang: string, source: string}>, images: Array<{alt: string, src: string}>}} readme
 *   `path` is the README in the user's files, `dir` its folder
 * @return {Promise<void>} settles when every fence has been drawn or left alone
 */
export async function attach(root, { dir, path = '', fences, images }) {
  lock(root)
  const drawing = []
  root.querySelectorAll(BLOCKS).forEach((block, index) => {
    if (seen.has(block)) {
      return
    }
    seen.add(block)
    const fence = fences[index]
    if (fence?.lang === 'plantuml' && block.querySelector('pre code')?.textContent.trim() === fence.source.trim()) {
      drawing.push(drawFence(block, fence.source, path))
    }
  })
  for (const figure of root.querySelectorAll(FIGURES)) {
    if (seen.has(figure)) {
      continue
    }
    seen.add(figure)
    const src = decode((figure.dataset.src ?? '').split('?')[0])
    if (src.endsWith('.puml')) {
      drawImage(figure, join(dir, src), images.find((image) => decode(image.src) === src)?.alt ?? '')
    }
  }
  await Promise.all(drawing)
}

async function render(source, path) {
  try {
    const response = await fetch(OC.generateUrl(`/apps/${APP_ID}/render`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', requesttoken: getRequestToken() ?? '' },
      body: JSON.stringify({ source, path }),
    })
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

function cachedRender(source, path) {
  const key = JSON.stringify([path, source])
  if (!renders.has(key)) {
    const svg = render(source, path).then((blob) => {
      // A failure is not kept: the next re-render asks the server again.
      if (blob === null) {
        renders.delete(key)
      }
      return blob
    })
    renders.set(key, svg)
    if (renders.size > CACHED_RENDERS) {
      renders.delete(renders.keys().next().value)
    }
  }
  return renders.get(key)
}

async function drawFence(block, source, path) {
  const svg = await cachedRender(source, path)
  // A server problem leaves Text's code block showing the source.
  if (svg === null) {
    return
  }
  const url = URL.createObjectURL(svg)
  const img = diagram(url, t(APP_ID, 'Diagram'))
  img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
  img.addEventListener('error', () => URL.revokeObjectURL(url), { once: true })
  for (const child of block.children) {
    child.style.display = 'none'
  }
  block.style.background = 'none'
  block.append(swallowClicks(img))
  block.dataset.plantuml = 'done'
  lock(block)
}

function drawImage(figure, path, alt) {
  const ours = document.createElement('figure')
  ours.style.cssText = 'margin: 0; text-align: center'
  ours.append(diagram(renderUrl(path), alt))
  if (alt) {
    const caption = document.createElement('figcaption')
    caption.style.color = 'var(--color-text-maxcontrast)'
    caption.textContent = alt
    ours.append(caption)
  }
  figure.style.display = 'none'
  figure.after(swallowClicks(ours))
  figure.dataset.plantuml = 'done'
}

function diagram(src, alt) {
  const img = document.createElement('img')
  img.className = 'plantuml-diagram'
  img.src = src
  img.alt = alt
  img.style.maxWidth = '100%'
  return img
}

/** Keeps the click from Text, whose handlers would open its lightbox or the editor. */
function swallowClicks(el) {
  el.setAttribute('contenteditable', 'false')
  el.addEventListener('click', (event) => event.stopPropagation())
  return el
}

function decode(src) {
  try {
    return decodeURI(src)
  } catch {
    return src
  }
}

/** `dir/src`, with `.` and `..` resolved as Text's AttachmentResolver does. */
function join(dir, src) {
  const path = []
  for (const part of `${dir}/${src}`.split('/')) {
    if (part === '..') {
      path.pop()
    } else if (part && part !== '.') {
      path.push(part)
    }
  }
  return '/' + path.join('/')
}
