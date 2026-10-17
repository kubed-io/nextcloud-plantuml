// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The component is a plain options object, driven on a bare instance with no
// Vue runtime; the view it builds is mocked at its module.
import { beforeEach, expect, it, vi } from 'vitest'

const seams = vi.hoisted(() => ({ view: { destroy: vi.fn() }, createDiagramView: vi.fn() }))
vi.mock('../../src/viewer/diagram-view.js', () => ({ createDiagramView: seams.createDiagramView }))
const { default: component } = await import('../../src/viewer-component.js')

function instance(active) {
  return { ...component.methods, $el: document.createElement('div'), filename: '/Diagrams/Screens.puml', basename: 'Screens.puml', active, doneLoading: vi.fn() }
}

beforeEach(() => {
  vi.resetAllMocks()
  seams.createDiagramView.mockReturnValue(seams.view)
})

it('draws one empty root for the view', () => {
  const h = (tag, data, children) => ({ tag, data, children })
  expect(component.render.call(instance(true), h)).toEqual({ tag: 'div', data: { class: 'plantuml-viewer' }, children: undefined })
})

it('builds the view on its file when it is the file shown', () => {
  const vm = instance(true)
  component.mounted.call(vm)
  expect(seams.createDiagramView).toHaveBeenCalledWith(vm.$el, expect.objectContaining({ path: '/Diagrams/Screens.puml', basename: 'Screens.puml' }))
  seams.createDiagramView.mock.calls[0][1].onReady()
  expect(vm.doneLoading).toHaveBeenCalled()
})

it('reads nothing for a neighbour the Viewer preloads, until it is shown', () => {
  const vm = instance(false)
  component.mounted.call(vm)
  expect(seams.createDiagramView).not.toHaveBeenCalled()
  component.watch.active.call(vm, true)
  expect(seams.createDiagramView).toHaveBeenCalledOnce()
})

it('builds the view once, however often it is shown', () => {
  const vm = instance(true)
  component.mounted.call(vm)
  component.watch.active.call(vm, false)
  component.watch.active.call(vm, true)
  expect(seams.createDiagramView).toHaveBeenCalledOnce()
})

it('destroys the view with itself', () => {
  const vm = instance(true)
  component.mounted.call(vm)
  component.beforeDestroy.call(vm)
  expect(seams.view.destroy).toHaveBeenCalled()
})

it('destroys nothing for a neighbour never shown', () => {
  const vm = instance(false)
  component.mounted.call(vm)
  expect(() => component.beforeDestroy.call(vm)).not.toThrow()
  expect(seams.view.destroy).not.toHaveBeenCalled()
})

it('keeps a hidden neighbour out of the focus order, and lets it back in when shown', () => {
  const vm = instance(false)
  component.mounted.call(vm)
  expect(vm.$el.hasAttribute('inert')).toBe(true)
  component.watch.active.call(vm, true)
  expect(vm.$el.hasAttribute('inert')).toBe(false)
  component.watch.active.call(vm, false)
  expect(vm.$el.hasAttribute('inert')).toBe(true)
})
