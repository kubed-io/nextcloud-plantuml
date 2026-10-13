# AGENTS.md

> Cold-start orientation for AI coding agents. Keep it open in another tab.
> **Goal of this file:** get you productive in 60 seconds, then point you to the
> right deeper doc for whatever task you were given.

---

## What this repo is

**PlantUML Diagrams** — a Nextcloud app (PHP backend + a small JS frontend) that
renders `.puml` files and README diagrams through a PlantUML server the admin
names. Lives under the [kubed-io](https://github.com/kubed-io) GitHub org.
Licensed AGPL-3.0-or-later. Target: the official Nextcloud app store.

Fourth member of a family: [nextcloud-n8n](https://github.com/kubed-io/nextcloud-n8n),
[nextcloud-grafana](https://github.com/kubed-io/nextcloud-grafana) and
[nextcloud-penpot](https://github.com/kubed-io/nextcloud-penpot) (the newest, and
the template for anything structural). This app shares their skeleton, CI,
documentation cascade and Gherkin rules — and none of their sync machinery.

For the user-facing "what does it do?" → [README.md](README.md).

## What this repo is **not**

- Not a sync app. Nothing is mirrored anywhere; the PlantUML server holds no files.
- Not a CRUD API for diagrams. Nextcloud's files, WebDAV and sharing are the API.
- Not a renderer for anonymous callers. Public share pages are out of scope.
- Not a fork of any upstream Nextcloud app.

---

## 🚨 NEVER open a pull request without being told to. Not once, not ever.

**Opening a PR requires the maintainer's explicit approval, in this session, for
this PR.** Not a guess, not an inference from "we're done". Ask, and wait.

**One session, one PR.** If a PR is already open for the work you are doing, your
change is a **commit on that branch**. Do not open a second one because the new
work "feels like a different subject".

| Not approval | Why |
|---|---|
| *"and then let's get the next PR started"* | Approves **one** PR. Spend it once. |
| Approval of an earlier PR this session | Each PR is its own ask. |
| The work being finished and green | Finishing is not permission to publish. |
| Fixing review feedback on an open PR | That is a push, not a new PR — and it needs no ask. |

When the work is done and you have no approval: **stop at the commit.** Say the
branch is ready, say what is on it, and offer to open the PR.

---

## 🚨 The maintainer is **Dr K**. Never write a real name.

This repository is public and the app is going on a public store. The maintainer
is referred to as **Dr K** — in prose, in commit messages, in PR descriptions, in
comments, everywhere.

**No first name, no surname, no personal email, no personal domain, no personal
GitHub handle.** Not in a code comment, not in an SPDX header (those say
`kubed-io`), not in a test fixture's user id. Where it leaks from, every time:
copyright headers pasted from an editor template, a real hostname pasted in as
evidence, a username copied out of a live instance. If you need a username in a
fixture, use `drk`.

---

## 🚨 Never reword a scenario. Propose it.

`features/**/*.feature` is the specification and Dr K reads every line of it. An
agent touches a `.feature` file for one reason only: to flip a status tag on the
PR that runs the scenario. A new scenario, a changed step, a reworded title —
those are proposed in chat, as the exact Gherkin and what it claims, and Dr K
decides whether it goes in.

---

## First moves on any task

1. **Read the `.feature` file for the behaviour you were sent to change.**
   [`features/README.md`](features/README.md) says which file owns what.
2. **Read [CONTRIBUTING.md](CONTRIBUTING.md)** for the process — the Gherkin-first
   order, PR rules, what CI expects. **Don't re-derive it.**
3. **Follow the scenario's `# notes:` pointer** into
   [`features/AGENTS.md`](features/AGENTS.md) when you need the why.
4. **Before anything design-relevant, read the spec**:
   [`docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`](docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md).
   It carries the verified platform facts (what Text and the Viewer do and do not
   expose), the rulings, and the Penpot design. The plan beside it in
   [`docs/superpowers/plans/`](docs/superpowers/plans/) is the build order.

---

## Repo map

| Path | What's there |
|---|---|
| `appinfo/info.xml`, `appinfo/routes.php` | App metadata, settings and commands registration, repair steps; the two render routes |
| `lib/AppInfo/Application.php` | Bootstrap: declarative settings, event listeners |
| `lib/Service/` | `ServerConfig`, `RenderService` (+ `Rendered`), the behaviour |
| `lib/Exception/RenderException.php` | The three problems: `not set`, `unreachable`, `not a PlantUML server` |
| `lib/Controller/` | `RenderController` (path + source routes), `ConfigController` (test connection) |
| `lib/Settings/`, `templates/`, `js/`, `css/` | The admin card and its test panel |
| `lib/Command/` | `plantuml:set-url`, `plantuml:test-connection`, `plantuml:show-config` |
| `lib/Migration/` | `RegisterMimetype` / `UnregisterMimetype` |
| `lib/Listener/` | `LoadFilesScriptListener` — the Files bundles and their initial state |
| `src/` | `files.js` (Viewer handler, actions, + New), `editor.js` (CodeMirror), `readme.js` (workspace observer), pure helpers beside them |
| `features/` | The spec; `README.md` is the map, `AGENTS.md` the notes |
| `tests/unit/`, `tests/js/`, `tests/integration/` | PHPUnit, vitest, Behat |
| `docs/superpowers/` | Spec and plan |

## Core commands

```sh
composer install && npm ci
composer run test:unit && composer run lint && composer run cs:check && composer run psalm
npm run build && npm test && npm run lint
bash tests/integration/bin/check-suites.sh
bash tests/integration/bin/check-notes-anchors.sh
bash tests/integration/bin/check-step-definitions.sh
```

PHP tooling runs in the devcontainer or CI. The code-server pod this app is
developed in has Node but no PHP; never run Psalm, php-cs-fixer or Behat in a pod.

## Architectural non-negotiables

Rulings, not preferences. Each has its reasoning in the spec.

- **Use what Nextcloud has before writing anything.** The Viewer opens the
  diagram; Text's own editor is the plain-text opener; the admin card is
  declarative settings.
- **One `RenderService`, one error vocabulary.** Every surface says `not set`,
  `unreachable` or `not a PlantUML server`, and nothing paraphrases a diagram
  error — the server draws it.
- **Nothing for anonymous callers.** The path route resolves inside the caller's
  folder; the source route is logged-in and CSRF-checked.
- **Fence language `plantuml` only.** `puml` is a file extension.
- **No thumbnails, SVG everywhere.** A preview provider would be code written for
  a behaviour nobody asked for.
- **CodeMirror 6 on the left of the editor**, with the app's own PlantUML mode.
  Highlighting won over Text's free save path, and the save path is ours.
- **`readme.js` is a DOM observer** over Text's workspace, because Text has no
  hook for code fences. The exit is an upstream Text PR, not a cleverer observer.
