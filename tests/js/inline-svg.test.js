// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The fixtures are plantuml/plantuml-server 1.2026.8's answers to POST /svg:
// links.svg is a sequence diagram with a gradient, a shadow filter and three
// links (https, javascript: and mailto:); syntax-error.svg is the 400 error
// image; interactive.svg is `!pragma svginteractive true`, which brings a
// <script> and a <style>.
import { afterEach, describe, expect, it } from 'vitest'
import DOMPurify from 'dompurify'
import { toInlineSvg } from '../../src/editor/inline-svg.js'
import links from './fixtures/links.svg?raw'
import syntaxError from './fixtures/syntax-error.svg?raw'
import interactive from './fixtures/interactive.svg?raw'

const SVG = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
const drawing = (body, attrs = '') => `<svg ${SVG} viewBox="0 0 100 50" width="100px" height="50px"${attrs}>${body}</svg>`
const inline = (text, idPrefix = 'p-') => toInlineSvg(text, { idPrefix })

/** Every element and attribute name in a tree, as `tag` and `tag@attribute`. */
function shape(root) {
  const names = new Set()
  for (const node of root.querySelectorAll('*')) {
    names.add(node.localName)
    for (const attr of node.attributes) {
      names.add(`${node.localName}@${attr.name}`)
    }
  }
  return names
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('toInlineSvg', () => {
  it('returns an SVG element of the page, ready to append', () => {
    const svg = inline(links)

    expect(svg).toBeInstanceOf(window.SVGSVGElement)
    expect(svg.ownerDocument).toBe(document)
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(0)
  })

  it.each([
    ['a sequence diagram with links, a gradient and a filter', links],
    ['the error image of a syntax error', syntaxError],
  ])('keeps everything PlantUML drew in %s', (_what, text) => {
    const served = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement
    const kept = shape(inline(text))

    // What it gives up, none of it drawn: a CSS 1 hint, and XLink's own link
    // behaviour, which target and rel now state.
    const dropped = new Set(['svg@contentStyleType', 'a@xlink:type', 'a@xlink:actuate', 'a@xlink:show'])
    const lost = [...shape(served)].filter((name) => !kept.has(name) && !dropped.has(name))
    expect(lost).toEqual([])
  })

  it('keeps the text of the error image, so a syntax error still shows', () => {
    expect(inline(syntaxError).textContent).toContain('Syntax Error?')
  })
})

describe('sanitising', () => {
  it('drops scripts, wherever they hide', () => {
    const svg = inline(drawing(
      '<script>alert(1)</script><g><script xlink:href="https://evil.example/x.js"/></g>'
      + '<text>safe</text>',
    ))

    expect(svg.querySelector('script')).toBeNull()
    expect(svg.textContent).toBe('safe')
  })

  it('drops PlantUML\'s own interactive script and stylesheet', () => {
    const svg = inline(interactive)

    expect(svg.querySelector('script')).toBeNull()
    // An inline <style> would restyle the whole Nextcloud page, not just the diagram.
    expect(svg.querySelector('style')).toBeNull()
    expect(svg.textContent).not.toContain('floating-header')
  })

  it('drops every event handler', () => {
    const svg = inline(drawing(
      '<rect onclick="alert(1)" onmouseover="alert(2)" width="10" height="10"/>'
      + '<a href="https://example.com/" onfocus="alert(3)"><text>x</text></a>',
      ' onload="alert(0)"',
    ))

    const handlers = [svg, ...svg.querySelectorAll('*')]
      .flatMap((node) => [...node.attributes].map((attr) => attr.name))
      .filter((name) => name.startsWith('on'))
    expect(handlers).toEqual([])
    expect(svg.querySelector('rect').getAttribute('width')).toBe('10')
  })

  it('drops foreignObject and the HTML inside it', () => {
    const svg = inline(drawing(
      '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">'
      + '<img src="x" onerror="alert(1)">html</div></foreignObject><text>svg</text>',
    ))

    expect(svg.querySelector('foreignObject, foreignobject, div, img')).toBeNull()
    expect(svg.textContent).toBe('svg')
  })

  it('opens an http, https or mailto link in a new tab, with no opener', () => {
    const svg = inline(links)
    const docs = [...svg.querySelectorAll('a')].find((a) => a.textContent === 'docs')
    const mail = [...svg.querySelectorAll('a')].find((a) => a.textContent === 'mail')
    const plain = inline(drawing('<a href="http://example.com/"><text>x</text></a>')).querySelector('a')

    expect(docs.getAttribute('href')).toBe('https://example.com/docs')
    expect(docs.getAttribute('xlink:href')).toBe('https://example.com/docs')
    expect(mail.getAttribute('href')).toBe('mailto:drk@example.com')
    expect(plain.getAttribute('href')).toBe('http://example.com/')
    for (const link of [docs, mail, plain]) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('keeps a link\'s tooltip', () => {
    const docs = [...inline(links).querySelectorAll('a')].find((a) => a.textContent === 'docs')

    expect(docs.getAttribute('xlink:title')).toBe('the docs')
    expect(docs.getAttribute('title')).toBe('the docs')
  })

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: in disguise', ' JaVaScRiPt:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['a relative URL', '/index.php/apps/files'],
    ['an empty one, as PlantUML writes for javascript:', ''],
  ])('takes the link off for %s, in href and xlink:href, and leaves its text', (_what, url) => {
    const quoted = url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    const svg = inline(drawing(`<a target="_top" href="${quoted}" xlink:href="${quoted}"><text>label</text></a>`))
    const link = svg.querySelector('a')

    expect(link.hasAttribute('href')).toBe(false)
    expect(link.hasAttribute('xlink:href')).toBe(false)
    expect(link.hasAttribute('target')).toBe(false)
    expect(svg.textContent).toBe('label')
  })

  it('cannot be animated into a javascript: link', () => {
    const svg = inline(drawing(
      '<a href="https://example.com/"><set attributeName="href" to="javascript:alert(1)"/>'
      + '<animate attributeName="xlink:href" values="javascript:alert(1)"/><text>x</text></a>',
    ))

    expect(svg.querySelector('set, animate')).toBeNull()
    expect(svg.querySelector('a').getAttribute('href')).toBe('https://example.com/')
  })

  it('loads nothing from anywhere: images and filter images keep only data: and the diagram\'s own ids', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    const svg = inline(drawing(
      `<image id="i1" href="https://evil.example/track.png" width="1" height="1"/>`
      + `<image id="i2" xlink:href="${png}" width="1" height="1"/>`
      + '<filter id="f"><feImage id="i3" xlink:href="http://evil.example/x.svg"/></filter>'
      + '<linearGradient id="g"/><linearGradient id="h" xlink:href="#g"/>',
    ))

    expect(svg.querySelector('#p-i1').hasAttribute('href')).toBe(false)
    expect(svg.querySelector('#p-i2').getAttribute('xlink:href')).toBe(png)
    expect(svg.querySelector('#p-i3').hasAttribute('xlink:href')).toBe(false)
    expect(svg.querySelector('#p-h').getAttribute('xlink:href')).toBe('#p-g')
  })

  it.each([
    ['a url()', 'fill:url(https://evil.example/x.svg#a)'],
    ['a quoted url()', "fill:url('//evil.example/x.svg#a')"],
    ['a url() spelt with a CSS escape', 'fill:\\75 rl(https://evil.example/x.svg#a)'],
    ['an image-set()', "background:image-set('https://evil.example/x.png' 1x)"],
    ['a cursor image', 'cursor:url(https://evil.example/c.png),auto'],
  ])('drops a style declaration that names %s, and keeps the rest', (_what, declaration) => {
    const svg = inline(drawing(`<rect style="stroke:#181818;${declaration};stroke-width:0.5;" width="1" height="1"/>`))
    const style = svg.querySelector('rect').getAttribute('style')

    expect(style).not.toContain('evil')
    expect(style).toContain('stroke:#181818')
    expect(style).toContain('stroke-width:0.5')
  })

  it('drops a paint attribute that points outside the diagram', () => {
    const svg = inline(drawing(
      '<rect fill="url(https://evil.example/x.svg#a)" stroke="#000" width="1" height="1"/>'
      + '<rect filter="url(//evil.example/x.svg#f)" width="1" height="1"/>',
    ))
    const [first, second] = svg.querySelectorAll('rect')

    expect(first.hasAttribute('fill')).toBe(false)
    expect(first.getAttribute('stroke')).toBe('#000')
    expect(second.hasAttribute('filter')).toBe(false)
  })

  it('opens an xlink:href-only link in a new tab too', () => {
    const svg = inline('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="https://example.com/"><text>x</text></a></svg>')
    const link = svg.querySelector('a')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('prefixes a reference written in capitals', () => {
    const svg = inline('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="URL(#g)" style="mask:URL(#g)"/></svg>')
    const rect = svg.querySelector('rect')
    expect(rect.getAttribute('fill')).toContain('#p-g')
    expect(rect.getAttribute('style')).toContain('#p-g')
  })

  it('is not loosened by a setConfig on the page-wide DOMPurify', () => {
    DOMPurify.setConfig({ ADD_TAGS: ['script'], ALLOW_UNKNOWN_PROTOCOLS: true })
    try {
      const svg = inline('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="javascript:alert(1)"><text>x</text></a></svg>')
      expect(svg.querySelector('script')).toBeNull()
      expect(svg.querySelector('a').hasAttribute('href')).toBe(false)
    } finally {
      DOMPurify.clearConfig()
    }
  })

  it('leaves DOMPurify as it found it for everyone else on the page', () => {
    inline(links)

    const elsewhere = DOMPurify.sanitize('<a href="https://example.com/">x</a>')
    expect(elsewhere).toBe('<a href="https://example.com/">x</a>')
  })

  it.each([
    ['an HTML page', '<!DOCTYPE html><html><body><h1>Log in</h1></body></html>'],
    ['nothing', ''],
    ['a script alone', '<script>alert(1)</script>'],
  ])('returns null for %s', (_what, text) => {
    expect(inline(text)).toBeNull()
  })
})

describe('ids', () => {
  it('prefixes every id and every reference to one', () => {
    const svg = inline(links, 'plantuml-1-')
    const ids = [...svg.querySelectorAll('[id]')].map((node) => node.id)
    const refs = [...svg.querySelectorAll('[fill^="url("], [filter]')]
      .flatMap((node) => [node.getAttribute('fill'), node.getAttribute('filter')])
      .filter((value) => value?.startsWith('url('))

    expect(ids).toEqual(['plantuml-1-gpiq079o51txk0', 'plantuml-1-fpiq079o51txk'])
    expect(new Set(refs)).toEqual(new Set(['url(#plantuml-1-gpiq079o51txk0)', 'url(#plantuml-1-fpiq079o51txk)']))
  })

  it('rewrites references in href, xlink:href and inline style too, quoted or not', () => {
    const svg = inline(drawing(
      '<defs><path id="track" d="M0 0"/><filter id="blur"/><linearGradient id="g"/></defs>'
      + '<text><textPath href="#track">a</textPath><textPath xlink:href="#track">b</textPath></text>'
      + '<rect style="filter:url(#blur);fill:url(\'#g\')" width="1" height="1"/>',
    ))

    const [first, second] = svg.querySelectorAll('textPath')
    expect(first.getAttribute('href')).toBe('#p-track')
    expect(second.getAttribute('xlink:href')).toBe('#p-track')
    expect(svg.querySelector('rect').getAttribute('style')).toBe('filter:url(#p-blur);fill:url(\'#p-g\')')
  })

  it('lets two diagrams share a page without a clash', () => {
    document.body.append(inline(links, 'a-'), inline(links, 'b-'))

    const ids = [...document.querySelectorAll('[id]')].map((node) => node.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('proportions', () => {
  it('scales evenly inside its box, centred, never stretched', () => {
    expect(inline(links).getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
  })

  it('keeps the viewBox, and its size only as the natural size CSS can shrink', () => {
    const svg = inline(links)

    expect(svg.getAttribute('viewBox')).toBe('0 0 202 194')
    // The attributes are what a stylesheet can override; the inline style
    // would beat any stylesheet, so its size goes.
    expect(svg.getAttribute('width')).toBe('202px')
    expect(svg.getAttribute('height')).toBe('194px')
    expect(svg.getAttribute('style')).toBe('background:#EEEBDC;')
  })
})
