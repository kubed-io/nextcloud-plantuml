// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import { createBreadcrumb } from '../../src/editor/breadcrumb.js'

describe('the breadcrumb', () => {
  it('is the file name alone on the main file', () => {
    const crumb = createBreadcrumb({ onBack: vi.fn() })

    crumb.show('Order flow.puml', null)

    expect(crumb.element.textContent).toBe('Order flow.puml')
    expect(crumb.element.querySelector('button')).toBeNull()
    expect(crumb.element.classList.contains('plantuml-editor__name--linked')).toBe(false)
  })

  it('leads back from a linked file', () => {
    const onBack = vi.fn()
    const crumb = createBreadcrumb({ onBack })

    crumb.show('Order flow.puml', { name: 'UML_Fun.css', readOnly: false })

    const [main, back] = crumb.element.querySelectorAll('button')
    expect(crumb.element.textContent).toBe('Order flow.puml›UML_Fun.css')
    expect(main.textContent).toBe('Order flow.puml')
    expect(back.title).toBe('Back to Order flow.puml')
    main.click()
    back.click()
    expect(onBack).toHaveBeenCalledTimes(2)
    expect(crumb.element.querySelector('.plantuml-editor__lock')).toBeNull()
    expect(crumb.element.classList.contains('plantuml-editor__name--linked')).toBe(true)
  })

  it('is the file name alone again on going back', () => {
    const crumb = createBreadcrumb({ onBack: vi.fn() })
    crumb.show('Order flow.puml', { name: 'UML_Fun.css', readOnly: true })

    crumb.show('Order flow.puml', null)

    expect(crumb.element.textContent).toBe('Order flow.puml')
    expect(crumb.element.className).toBe('plantuml-editor__name')
  })

  it('shows a lock on a file that may only be read', () => {
    const crumb = createBreadcrumb({ onBack: vi.fn() })

    crumb.show('Order flow.puml', { name: 'UML_Fun.css', readOnly: true })

    expect(crumb.element.querySelector('.plantuml-editor__lock').title).toBe('Read only')
  })
})
