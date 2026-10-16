// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The doc card (I5): the parts of an entry in a fixed order, a part the entry
// lacks left out, the close button always there.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderDoc } from '../../src/editor/docs/card.js'

const full = {
  name: 'skinparam',
  kind: 'keyword',
  look: 'keyword',
  summary: 'sets a style parameter',
  example: 'skinparam shadowing false',
  icon: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  link: { page: 'skinparam', anchor: 'usage', section: 'Skin parameters' },
}

describe('the doc card', () => {
  it('holds head, summary, example and link, in that order', () => {
    const { dom } = renderDoc(full)
    expect(dom.className).toBe('cm-doc')
    expect([...dom.children].map((el) => el.className)).toEqual(['cm-doc-head', 'cm-doc-summary', 'cm-doc-example', 'cm-doc-link'])
    expect([...dom.children].map((el) => el.localName)).toEqual(['div', 'div', 'pre', 'a'])
    expect([...dom.querySelector('.cm-doc-head').children].map((el) => el.className)).toEqual(['cm-doc-icon', 'cm-doc-name cm-doc-keyword', 'cm-doc-kind', 'cm-doc-close'])
    expect(dom.querySelector('.cm-doc-name').localName).toBe('code')
    expect(dom.querySelector('.cm-doc-summary').textContent).toBe('sets a style parameter')
    expect(dom.querySelector('.cm-doc-example').textContent).toBe('skinparam shadowing false')
    expect(dom.querySelector('.cm-doc-kind').textContent).toBe('keyword')
  })

  it('shows a function by its signature', () => {
    const { dom } = renderDoc({ name: '%strlen', kind: 'function', look: 'function', signature: '%strlen(str)' })
    expect(dom.querySelector('.cm-doc-name').textContent).toBe('%strlen(str)')
    expect(dom.querySelector('.cm-doc-name').className).toBe('cm-doc-name cm-doc-function')
  })

  it('falls back to the name without a signature', () => {
    expect(renderDoc(full).dom.querySelector('.cm-doc-name').textContent).toBe('skinparam')
  })

  it('leaves out a summary, example and link the entry lacks, and an icon it lacks stays empty', () => {
    const { dom } = renderDoc({ name: 'x', kind: 'library', look: 'library' })
    expect(dom.querySelector('.cm-doc-summary')).toBeNull()
    expect(dom.querySelector('.cm-doc-example')).toBeNull()
    expect(dom.querySelector('.cm-doc-link')).toBeNull()
    expect(dom.querySelector('.cm-doc-icon').innerHTML).toBe('')
    expect(dom.querySelector('.cm-doc-icon').hidden).toBe(true)
  })

  it('draws an entry\'s icon', () => {
    const icon = renderDoc(full).dom.querySelector('.cm-doc-icon')
    expect(icon.hidden).toBe(false)
    expect(icon.querySelector('svg')).not.toBeNull()
  })

  it('has a labelled close button in the head of every card', () => {
    for (const entry of [full, { name: 'x', kind: 'library', look: 'library' }]) {
      const close = renderDoc(entry).dom.querySelector('.cm-doc-head > button.cm-doc-close')
      expect(close.getAttribute('aria-label')).toBe('Close')
      expect(close.type).toBe('button')
      expect(close.querySelector('svg')).not.toBeNull()
    }
  })

  it('links to the anchor on plantuml.com, in a new tab', () => {
    const link = renderDoc(full).dom.querySelector('a.cm-doc-link')
    expect(link.getAttribute('href')).toBe('https://plantuml.com/skinparam#usage')
    expect(link.textContent).toBe('plantuml.com › Skin parameters')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('links a page-level entry without a #', () => {
    const { dom } = renderDoc({ ...full, link: { page: 'color', section: 'Colors' } })
    expect(dom.querySelector('a.cm-doc-link').getAttribute('href')).toBe('https://plantuml.com/color')
  })

  it('has a destroy that can be called', () => {
    expect(() => renderDoc(full).destroy()).not.toThrow()
  })
})
