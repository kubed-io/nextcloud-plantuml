/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer component for a diagram file: an <img> on the render route, or the
 * one line the route answered with when it cannot draw.
 *
 * VUE 2. The Viewer on Nextcloud 34 is viewer `stable34` (7.0.0-dev), whose
 * package.json pins `vue: ^2.7.16` and `@nextcloud/vue: ^8.37.0` (read
 * 2026-10-13). It mounts this object with its own Vue, so the object imports
 * nothing and draws with Vue 2's `render(h)`. The Viewer mixes its `Mime` mixin
 * in, which supplies the `filename` and `basename` props and `doneLoading()`.
 *
 * The root is a <div>, not the <img>: the mixin listens for `error` on the root
 * element and swaps in the Viewer's generic error page, which would hide the
 * problem this component exists to show.
 */
import { renderUrl } from './files-helpers.js'

export default {
  name: 'PlantUmlDiagram',

  data() {
    return { problem: '' }
  },

  methods: {
    // An <img> never sees the response body, so the failed URL is asked once
    // more for the line that names the problem.
    async showProblem() {
      try {
        const res = await fetch(renderUrl(this.filename), { credentials: 'same-origin' })
        if (!res.ok) {
          this.problem = (await res.text()).split('\n')[0].trim() || res.statusText || String(res.status)
        }
      } catch (e) {
        this.problem = e.message
      }
      this.doneLoading()
    },
  },

  render(h) {
    const content = this.problem
      ? h('p', { style: { color: '#fff', fontSize: '16px' } }, this.problem)
      : h('img', {
          attrs: { src: renderUrl(this.filename), alt: this.basename },
          style: { maxWidth: '100%', maxHeight: '100%' },
          on: { load: () => this.doneLoading(), error: () => this.showProblem() },
        })
    return h('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },
    }, [content])
  },
}
