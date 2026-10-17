/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Viewer component for a diagram file: a root the plain-DOM view in
 * src/viewer/ draws into.
 *
 * VUE 2. Viewer stable34 mounts this object with its own Vue 2.7, so it imports
 * nothing of Vue and draws with `render(h)`; its `Mime` mixin supplies
 * `filename`, `basename`, `active` and `doneLoading()`. The Viewer also mounts
 * the previous and next files' components, hidden and inactive, so the view is
 * built only once this one is the file shown.
 */
import { createDiagramView } from './viewer/diagram-view.js'

export default {
  name: 'PlantUmlDiagram',

  watch: {
    active(now) {
      if (now) {
        this.build()
      }
    },
  },

  mounted() {
    if (this.active) {
      this.build()
    }
  },

  beforeDestroy() {
    this.view?.destroy()
  },

  methods: {
    build() {
      this.view ??= createDiagramView(this.$el, { path: this.filename, basename: this.basename, onReady: () => this.doneLoading() })
    },
  },

  render(h) {
    return h('div', { class: 'plantuml-viewer' })
  },
}
