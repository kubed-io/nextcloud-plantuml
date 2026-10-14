/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML's SVG as an element of the page rather than an <img>, so its links
 * can be followed. The SVG is drawn from a file anyone may have shared, so it
 * is treated as hostile: DOMPurify keeps SVG and its filters and nothing that
 * runs, links go only to http, https and mailto in a new tab, and nothing in
 * it may load from anywhere — an <img> would have loaded nothing either.
 */
import DOMPurify from 'dompurify'

const LINK = /^(?:https?|mailto):/i
const DATA_IMAGE = /^data:image\//i
// A CSS value may call these; any other call could fetch something, and a
// backslash is a CSS escape, which nothing PlantUML draws needs.
const HARMLESS_CALL = /(?:rgba?|hsla?)\([^()\\]*\)|url\(\s*(['"]?)#[^'"()\s\\]+\1\s*\)/gi
const PAINT = ['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor']
const REFERENCE = /url\(\s*(['"]?)#/g

const CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // A link's tooltip, PlantUML's `[[url{tooltip} label]]`.
  ADD_ATTR: ['title', 'xlink:title'],
  // An inline <style> would restyle the whole page, not just the diagram.
  FORBID_TAGS: ['style', 'script', 'foreignobject'],
  RETURN_DOM_FRAGMENT: true,
}

const loadsNothing = (value) => !/[()\\]/.test(value.replace(HARMLESS_CALL, ''))

function confine(node) {
  const link = node.localName === 'a'
  for (const name of ['href', 'xlink:href']) {
    const value = node.getAttribute(name)
    const allowed = link
      ? LINK.test(value?.trim())
      : value?.startsWith('#') || (DATA_IMAGE.test(value) && ['image', 'feImage'].includes(node.localName))
    if (value !== null && !allowed) {
      node.removeAttribute(name)
    }
  }
  if (link && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
  for (const name of PAINT) {
    if (node.hasAttribute(name) && !loadsNothing(node.getAttribute(name))) {
      node.removeAttribute(name)
    }
  }
  const style = node.getAttribute('style')
  if (style !== null) {
    node.setAttribute('style', style.split(';').filter(loadsNothing).join(';'))
  }
}

/** Every id gets the prefix, and so does every `#id` and `url(#id)` naming one. */
function prefixIds(svg, prefix) {
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (attr.name === 'id') {
        attr.value = prefix + attr.value
      } else if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')) {
        attr.value = `#${prefix}${attr.value.slice(1)}`
      } else if (!attr.name.endsWith('title') && attr.value.includes('url(')) {
        attr.value = attr.value.replace(REFERENCE, `$&${prefix}`)
      }
    }
  }
}

/**
 * Fitted like an <img>: the width and height attributes stay as its natural
 * size, which CSS may shrink but which keeps a small diagram from growing, and
 * the inline style's size goes, since it would beat any stylesheet.
 */
function fit(svg) {
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  const style = svg.getAttribute('style') ?? ''
  svg.setAttribute('style', style.split(';').filter((rule) => !/^\s*(?:width|height)\s*:/i.test(rule)).join(';'))
}

/**
 * @param {string} svgText what the server answered
 * @param {{idPrefix: string}} options a prefix no other diagram on the page uses
 * @return {SVGSVGElement|null} null when the answer holds no SVG
 */
export function toInlineSvg(svgText, { idPrefix }) {
  // Scoped to this call: other code on the page may use DOMPurify too.
  DOMPurify.addHook('afterSanitizeAttributes', confine)
  let fragment
  try {
    fragment = DOMPurify.sanitize(svgText, CONFIG)
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes', confine)
  }
  const svg = fragment.firstElementChild
  if (!(svg instanceof SVGSVGElement)) {
    return null
  }
  prefixIds(svg, idPrefix)
  fit(svg)
  return document.importNode(svg, true)
}
