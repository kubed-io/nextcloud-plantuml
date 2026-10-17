/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Fetches the push bundle (dist/plantuml-push.js, built apart so the editor
 * entry carries no axios). Its URL keeps the editor's own query (`?v=`) and
 * adds a key that changes with the bundle's content, because app scripts are
 * cached for six months.
 */

/** @return {string} */
export function pushUrl(base = import.meta.url) {
  const url = new URL('./plantuml-push.js', base)
  url.search = new URL(base).search
  // Replaced at build time (vite.config.js); absent under vitest.
  // eslint-disable-next-line no-undef
  const hash = typeof __PLANTUML_PUSH_HASH__ === 'string' ? __PLANTUML_PUSH_HASH__ : ''
  if (hash) {
    url.searchParams.set('p', hash)
  }
  return url.href
}

/** @return {Promise<{listen: (name: string, handler: Function) => boolean}>} */
export function loadPush() {
  return import(/* @vite-ignore */ pushUrl())
}
