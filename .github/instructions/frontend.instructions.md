---
applyTo: "**/*.js,**/*.vue"
---
<!--
  SPDX-FileCopyrightText: 2026 kubed-io
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Frontend (Vite + Vue) conventions

Applies to the frontend under `src/`. Cross-cutting rules are in
`.github/copilot-instructions.md` and `AGENTS.md`.

## One kind of JS — everything goes through Vite
- **`src/` is the only frontend source** and Vite bundles it into `dist/plantuml-*.js`.
  Four entries, one per surface: `files.js` (Viewer handler, file actions, the
  **+ New → Diagram** entry), `viewer.js`, `editor.js` and `readme.js` (the Text
  workspace observer). Keep a surface in its own entry — a Files-page visitor must
  not pay for the editor.
- The admin card is **declarative settings** and has no JS of its own. Don't add a
  hand-written panel script under `js/`; there is no such directory here.
- The editor is **CodeMirror 6** from `@codemirror/*`, with the app's own PlantUML
  `StreamLanguage`. Never pull in Monaco, a TextMate/wasm bridge, or a second editor.
- Load the diagram as an `<img>` from the app's own `/render` route — never from the
  PlantUML server directly (CSP, and the server URL is the admin's business).

## Use Nextcloud's browser globals (don't reinvent them)
- i18n: `t('plantuml', 'text')` for every user-facing string — never a raw literal.
- URLs: `OC.generateUrl('/apps/plantuml/…')` — never hardcode the path or origin.
- Requests: send `OC.requestToken` as the `requesttoken` header on the `POST /render`
  and on WebDAV writes, and surface the JSON error `message` (one of the three
  problems: not set, unreachable, not a PlantUML server) for user feedback.
- Files-app integration goes through `@nextcloud/files` (`registerFileAction`,
  `addNewFileMenuEntry`) and `OCA.Viewer.registerHandler` — not DOM surgery on the
  file list. The one deliberate exception is `readme.js`, which has no API to use.

## Style & safety
- eslint must pass. No `console.log` (info/warn/error are allowed).
- Escape any server- or user-derived string before inserting it into the DOM. The
  rendered SVG is an `<img src>`, never inlined as markup.
