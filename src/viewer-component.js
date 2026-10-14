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
import { translate as t } from '@nextcloud/l10n'
import { APP_ID, renderUrl } from './files-helpers.js'

function jsonProblem(body) {
  try {
    const problem = JSON.parse(body)?.problem
    return typeof problem === 'string' ? problem : ''
  } catch {
    return ''
  }
}

export default {
  name: 'PlantUmlDiagram',

  data() {
    return { problem: '' }
  },

  methods: {
    // An <img> never sees the response body, so the failed URL is asked once
    // more for the problem: the render route's `{"problem": …}`, and one fixed
    // line for anything else, as the editor says (an error page is no message).
    async showProblem() {
      const fixed = t(APP_ID, 'Could not draw the diagram')
      try {
        const res = await fetch(renderUrl(this.filename), { credentials: 'same-origin' })
        if (!res.ok) {
          this.problem = jsonProblem(await res.text()) || fixed
        }
      } catch {
        this.problem = fixed
      }
      this.doneLoading()
    },
  },

  render(h) {
    const content = this.problem
      // The Viewer's backdrop is black in both themes.
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
