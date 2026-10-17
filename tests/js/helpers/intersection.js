// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// jsdom has no IntersectionObserver. This one is told by the test which targets come within its
// margin or leave it, and passes on only those it still observes, as the browser would.

export class FakeIntersectionObserver {
  static made = []

  /** The one made last. */
  static last() {
    return FakeIntersectionObserver.made.at(-1)
  }

  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.targets = new Set()
    this.disconnected = false
    FakeIntersectionObserver.made.push(this)
  }

  observe(target) {
    this.targets.add(target)
  }

  unobserve(target) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    this.disconnected = true
  }

  observed() {
    return [...this.targets]
  }

  enter(...targets) {
    this.tell(targets, true)
  }

  leave(...targets) {
    this.tell(targets, false)
  }

  tell(targets, isIntersecting) {
    const entries = targets.filter((target) => this.targets.has(target)).map((target) => ({ target, isIntersecting }))
    if (entries.length) {
      this.callback(entries, this)
    }
  }
}
