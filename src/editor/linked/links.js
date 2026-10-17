/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The lines that link a file beside the diagram: `<style file=…>` and the
 * includes, read as the resolver reads them, and only for a relative path.
 */
const STYLE = /^([ \t]*<style\s+file\s*=\s*)(?:"([^"]*)"|([^\s">]+))\s*>\s*$/i
const INCLUDE = /^([ \t]*!include(_many|_once|sub)?[ \t]+)(?:"([^"]*)"(.*)|([^\s!]+)(.*))$/

const relative = (path) => path !== '' && !path.startsWith('/') && !path.startsWith('<')
  && !/^[a-z][a-z0-9+.-]*:\/\//i.test(path) && !/[$%]/.test(path)

/**
 * @param {string} lineText
 * @return {{kind: 'style'|'include', written: string, from: number, to: number, section: string|null, block: string|null}|null}
 *   `from` and `to` are the columns of the path, without its quotes
 */
export function linkOn(lineText) {
  const style = STYLE.exec(lineText)
  if (style) {
    const written = style[2] ?? style[3]
    const from = style[1].length + (style[2] !== undefined ? 1 : 0)
    return relative(written) ? { kind: 'style', written, from, to: from + written.length, section: null, block: null } : null
  }
  const include = INCLUDE.exec(lineText.trimEnd())
  if (!include) {
    return null
  }
  const quoted = include[3] !== undefined
  const written = quoted ? include[3] : include[5]
  const rest = (quoted ? include[4] : include[6]).trim()
  const selector = rest.startsWith('!') && rest.length > 1 ? rest.slice(1) : null
  if (!relative(written) || (rest !== '' && selector === null) || /[$%]/.test(selector ?? '')) {
    return null
  }
  const sub = include[2] === 'sub'
  if (sub && selector === null) {
    return null
  }
  const from = include[1].length + (quoted ? 1 : 0)
  return { kind: 'include', written, from, to: from + written.length, section: sub ? selector : null, block: sub ? null : selector }
}
