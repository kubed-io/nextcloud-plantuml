<!--
  SPDX-FileCopyrightText: 2026 kubed-io
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Copilot code review — PlantUML Diagrams (a Nextcloud app)

## Purpose & scope

You are reviewing pull requests for a **Nextcloud app**: a PHP backend under
`lib/` (namespace `OCA\PlantUml`, once it exists) and a small Vite-built
frontend under `src/` (also not yet created). **This repo is currently
pre-code** — most PRs today touch the spec, the feature files, tooling config,
or CI, not `lib/`/`src/`. Review changes against **this project's** standards
below, not generic ones, and don't flag the absence of application code as a
problem — that's the current, intentional state (see `README.md` / `AGENTS.md`).

**Read these repo files first — they are the source of truth, and you should
back your comments with them:**

- **`AGENTS.md`** — cold-start orientation + the architectural non-negotiables.
- **`CONTRIBUTING.md`** — conventions, PR rules, testing policy.
- **`SECURITY.md`** — the deliberate trust boundary.
- **`docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`** — the
  design: what the app does, what it deliberately does not, the platform facts
  it rests on, and the **decisions taken** (a table) with the alternatives not
  taken. If the spec decided something, do not suggest relitigating it. If a PR
  departs from the spec, it should say so and update the spec in the same PR.
- **`features/*.feature`** and **`features/AGENTS.md`** — the behaviour, one
  file per verb, and the notes behind each scenario.

Prefer these over assumptions. When a convention is undocumented here, the
sibling repos are the reference — `kubed-io/nextcloud-penpot` (the newest and
closest template), `kubed-io/nextcloud-grafana` and `kubed-io/nextcloud-n8n`.
This app is **not** a fourth copy of their sync machinery, though: it holds no
content of its own and syncs nothing. Don't suggest adding mappings, a mirror,
metadata, a background job or a per-user credential just because the siblings
have them.

## The maintainer is **Dr K**. Never write a real name.

This repository is public and the app is going on a public store. The maintainer
is referred to as **Dr K** — in prose, in commit messages, in gate tables, in PR
descriptions, in comments, everywhere.

**No first name, no surname, no family nickname, no personal email, no personal
domain, no personal GitHub handle.** Not in a code comment, not in an SPDX
header (those say `kubed-io`), not in a test fixture's user id, and not in a
transcript quoting a live instance. This is not a style preference.

**Where it leaks from, every time:** copyright headers pasted from an editor
template, a real hostname pasted into a document as evidence, and a username
copied out of a live database dump into a code block.

If you need to attribute something, `Dr K` is the whole answer. If you need a
username in a fixture, use `drk`. **Flag any real name in a diff as a blocker.**

## The principle that dominates every review: be Nextcloud-native

This is a Nextcloud app, **not "a PHP project that runs inside Nextcloud."**
The most valuable comment you can make here finds code that reinvents
something the framework already provides. In priority order:

- **Flag anything hand-rolled that a Nextcloud primitive already does**, and
  name the primitive. The common ones this codebase will need:
  - HTTP out → `OCP\Http\Client\IClientService` — never `curl`,
    `file_get_contents`, or a raw Guzzle client.
  - Config → `OCP\IAppConfig` — never files or custom tables. The one setting
    here, `server_url`, is **not** a secret and is not marked `sensitive`.
  - Files → `OCP\Files\IRootFolder` + the calling user's folder — never a
    filesystem path, never `\OC\Files\Filesystem`.
  - Mimetype → the `RegisterMimetype` / `UnregisterMimetype` repair steps the
    siblings use (core reads only `config/mimetypemapping.json`) — not a
    runtime detector hook.
  - Settings UI → declarative settings + admin section — not a bespoke
    controller+route for the form.
  - Console → `OCP\…\Command` registered in `info.xml` — not custom
    entrypoints.
  - Files app → `@nextcloud/files` actions, `addNewFileMenuEntry`, and
    `OCA.Viewer.registerHandler` — not DOM surgery on the file list.
- **Actively look for code that could be deleted in favour of core.** A
  helper that duplicates framework behaviour is a finding — say so and point
  at the native path.
- **When the native path isn't obvious, match a mature first-party app**
  (Files, Text, Viewer, richdocuments) or the sibling apps rather than
  inventing a new pattern.

## Signal over volume — the most important rule for this reviewer

Fewer, higher-value comments beat exhaustive nitpicking. A review with 3 real
findings is better than one with 15 where 12 are cosmetic. Noise trains the
team to ignore you.

- **Worth a comment:** correctness, security, and Nextcloud-nativeness —
  always.
- **Usually skip:** a minor wording tweak, a slightly-stale docblock comment,
  or a non-user-facing string that isn't translated — unless the file is
  otherwise clean or it's egregious. Don't open a separate thread for each
  cosmetic nit.
- **Verify a bug is real before flagging it.** Before raising a possible
  crash/throw/edge case, trace the guards in the *same function* and confirm
  the failure path is actually reachable. Don't file speculative "this could
  break if X" without a concrete path to X.
- **Assume the framework is correct before calling something "unsafe".** If a
  Nextcloud/OCP helper plausibly already handles the concern (escaping,
  SSRF, path traversal inside a user folder), assume it does unless the code
  shows otherwise.

## Review priorities (highest first)

1. **Security** — the two render routes are the whole attack surface. `GET
   /render?path=` must resolve `path` **in the calling user's folder** (so a
   user renders only what they can read) and refuse anything that is not a
   `.puml`; `POST /render` must be CSRF-checked and logged-in only. **Neither
   route may ever answer an anonymous caller** — that is the one line the
   spec's non-goals draw. Network egress: the app is expected to set
   `allow_local_address` **on purpose** (single admin-chosen PlantUML target —
   see `SECURITY.md`); flag *new, undocumented* egress, not that documented use.
2. **Nextcloud-nativeness** — the section above.
3. **Correctness** — does the change do what the PR/spec says? Error paths,
   edge cases, and re-derive test expectations from the spec and the feature
   files, not from current behaviour.
4. **Dead code & simplification** — unused code/imports, redundant
   abstractions, anything removable now that a native API covers it.
5. **Tests** — a `lib/` change should carry unit tests (`tests/unit/`), once
   that directory exists. Flag missing coverage.

## Project non-negotiables — do not approve changes that break these

- **The app holds no diagrams.** A `.puml` is an ordinary Nextcloud file; the
  PlantUML server never stores one. No CRUD API for diagrams (WebDAV and
  sharing are the API), no folder mappings, no sync, no metadata, nothing per
  user. Flag any of these as reopening a decision the spec closed.
- **Nothing for anonymous callers.** Every render is for a logged-in user;
  public share pages are out of scope.
- **The fence language is `plantuml` only.** Not `puml`, not `c4plantuml`.
- **SVG everywhere; no thumbnails, no preview provider.** The grid shows the
  file-type icon, as Nextcloud does for any text file. Flag a `IProviderV2` or
  a PNG path as code for a behaviour nobody asked for.
- **The error vocabulary is three fixed problems** — `not set`, `unreachable`,
  `not a PlantUML server` — shared by the health check, both endpoints and the
  editor. A diagram mistake is **not** an error: the server draws it into the
  image and the app never paraphrases it. Flag per-surface wording.
- **The editor is CodeMirror 6** with the app's own PlantUML mode; the save
  path is WebDAV `PUT` with `If-Match` on the ETag and a plain refusal on a
  mismatch. No Monaco, no TextMate bridge, no collaborative editing.
- **The default click on a `.puml` opens the Viewer**, not the editor;
  **"Open with text editor"** is Text's plain editor via `OCA.Text.createEditor()`,
  not a textarea of our own.
- **`readme.js` edits what Text drew, and that is a known cost.** It is the
  only route the app controls (Text has no code-block renderer API). Don't
  suggest a Text fork or a markdown-it plugin inside this repo; the exit is an
  upstream nextcloud/text PR and is tracked in the spec.
- **No `External Storage` / `OCP\Files\Storage` backend** — wrong tool.

## Review style

- Be specific and actionable: cite the file/line and name the exact native
  API or fix.
- Explain the "why" in one line; acknowledge good native patterns when you
  see them.
- Stay within the diff and its blast radius.

## What not to flag (known-safe here — these are settled, and are the recurring false positives)

- **`OCP\Util::sanitizeHTML()` already escapes with `htmlspecialchars(…,
  ENT_QUOTES)`** — its output is safe in HTML-attribute context. Don't ask to
  "also escape" it.
- **The frontend targets Nextcloud's supported (evergreen) browsers.**
  ES2019+ syntax — optional `catch {}`, `?.`, `??` — is fully supported.
  Don't raise old-JS-engine compatibility.
- **The server URL is plain `IAppConfig`, not `sensitive`.** It is not a
  secret; don't ask for `ICrypto`.
- **`!include` of remote URLs and PlantUML's security profile are the
  server's configuration** (`PLANTUML_SECURITY_PROFILE`), documented as the
  admin's job. Don't ask the app to filter diagram source.
- The deliberate `allow_local_address` egress, the `text/x-plantuml` mimetype
  with the `puml` and `plantuml` extensions, and the no-thumbnail decision are
  all intentional and documented — don't suggest "fixing" them.
- Don't ask for an `appinfo/info.xml` `<version>` bump — the release flow
  owns versions.
- **Don't flag the absence of `lib/`, `src/`, or `tests/`** — this repo is
  intentionally pre-code; see `README.md`.
