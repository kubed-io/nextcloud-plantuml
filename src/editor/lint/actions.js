/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A diagnostic's quick fix that writes `insert` over the range it marks.
 *
 * @param {string} name the label the fix shows
 * @param {string} insert
 */
export const replaceAction = (name, insert) => ({
  name,
  apply(view, from, to) {
    view.dispatch({ changes: { from, to, insert } })
  },
})
