/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The push bundle's whole source: notify_push and the axios it brings, in one
 * file the editor fetches only where the server has notify_push (vite.config.js).
 */
export { listen } from '@nextcloud/notify_push'
