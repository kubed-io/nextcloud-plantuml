/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Paths in the user's files, as a line beside the diagram writes them.
 */

/**
 * The folder `typed` names, as a path in the user's files, or null above the root.
 *
 * @param {string} file the edited file's path
 * @param {string} dir the typed path up to its last `/`
 */
export function folderOf(file, dir) {
  const parts = dir.startsWith('/') ? [] : file.split('/').slice(1, -1)
  for (const part of dir.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) {
        return null
      }
    } else if (part !== '' && part !== '.') {
      parts.push(part)
    }
  }
  return '/' + parts.join('/')
}

/**
 * The path `written` names beside `file`, as the resolver reads it; null above the root.
 *
 * @param {string} file the edited file's path
 * @param {string} written the path as a line writes it
 */
export function resolveLinked(file, written) {
  const slash = written.lastIndexOf('/')
  const folder = folderOf(file, written.slice(0, slash + 1))
  return folder === null ? null : `${folder === '/' ? '' : folder}/${written.slice(slash + 1)}`
}
