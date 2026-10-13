# Contributing

Thanks for stopping by. This is **PlantUML Diagrams** — a Nextcloud app that draws
`.puml` files and README diagrams through a PlantUML server. It lives under the
[kubed-io](https://github.com/kubed-io) GitHub org, shares its workflow plumbing
with the sibling apps
([nextcloud-n8n](https://github.com/kubed-io/nextcloud-n8n),
[nextcloud-grafana](https://github.com/kubed-io/nextcloud-grafana),
[nextcloud-penpot](https://github.com/kubed-io/nextcloud-penpot)), and has a
deliberate process around getting changes in. Please read this whole doc before
you push code.

**Where the work is right now.** Every behaviour has a scenario under
[`features/`](features/); the design is in
[`docs/superpowers/specs/`](docs/superpowers/specs/) and the build order in
[`docs/superpowers/plans/`](docs/superpowers/plans/). The browser behaviours are
built but not yet run by CI. `grep -rE '@unbuilt|@blocked|@todo' features/` is
the authority on what is still owed.

If you only have time for one paragraph: **prefer opening an issue first so the
work can be scoped and approved, then open a PR with tests and a clear changelog
entry, and verify your change on a real Nextcloud instance before asking for
review.**

---

## Repo tour

| Path | What lives here |
|---|---|
| [README.md](README.md) | User-facing docs: what the app does and how to set it up. **Start here for "how does it work?"** |
| [CHANGELOG.md](CHANGELOG.md) | Keep-a-Changelog format. Every PR adds a line under `## [Unreleased]`. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | This file — process, conventions, dev loop. |
| [SECURITY.md](SECURITY.md) | How to report vulnerabilities, and what leaves the instance. |
| [AGENTS.md](AGENTS.md) | Cold-start orientation for AI coding agents. |
| [docs/superpowers/](docs/superpowers/) | The design spec and the implementation plan. **The "why" behind everything else.** |
| [features/](features/) | **The specification.** Gherkin, written before the code — see [features/README.md](features/README.md). |
| [appinfo/](appinfo/) | Nextcloud app metadata — `info.xml` and `routes.php`. |
| [lib/](lib/) | PHP backend (`OCA\PlantUml`): `Service/` holds the behaviour; `Controller/`, `Command/`, `Settings/`, `Listener/`, `Migration/` are the adapters. |
| [src/](src/) | JS frontend, built by Vite into `dist/`: `files.js`, `editor.js`, `readme.js`. |
| [tests/](tests/) | `unit/` (PHPUnit, no NC server), `js/` (vitest) and `integration/` (Behat, against a real Nextcloud and a real PlantUML server). |
| [composer.json](composer.json) | PHP deps + scripts (`test:unit`, `cs:check`, `cs:fix`, `lint`, `psalm`). |
| [package.json](package.json) | JS deps + scripts (`build`, `dev`, `watch`, `lint`, `test`). Node version pinned in `.nvmrc`. |
| [psalm.xml](psalm.xml), [.php-cs-fixer.dist.php](.php-cs-fixer.dist.php) | Static analysis + coding standard config, from the sibling apps. |
| [.devcontainer/](.devcontainer/) | One-shot dev environment (PHP 8.3 + Node + GH CLI + docker-out-of-docker). |
| [.github/workflows/](.github/workflows/) | `pr.yml`, `tests.yml`, `quality.yml`, `integration.yml` (the three-leg Behat matrix), `publish.yml`, `package.yml`, `copilot-setup-steps.yml`. |
| [vite.config.js](vite.config.js) | Frontend build config: one IIFE per `src/` entry, chosen by `ENTRY`. |

---

## Principles

### Do things the Nextcloud way

This is a **Nextcloud app**, not "a PHP project that happens to run inside
Nextcloud." When you need to pick between a Nextcloud-native primitive and a
generic one, pick the Nextcloud one — every time:

- Config storage → `IAppConfig`, not files.
- HTTP out → `IClientService`, not `curl`.
- Settings UI → declarative settings and the admin section pattern.
- Opening a file → the Viewer; a plain-text editor → Text's own, through its API.
- Mimetypes, file actions, the + New menu → the real subsystems.

If a Nextcloud-native path isn't obvious, look at how a mature first-party app does
it (Text, Viewer, Files) or how the sibling apps solved the same problem, before
inventing. **Use what Nextcloud has before writing anything** is a ruling, not a
preference.

### Validate on a real Nextcloud instance

CI green is necessary, not sufficient. **Every change must be tried by a human on
a real Nextcloud instance with the change applied.** The Behat matrix drives
WebDAV, `occ` and the app's own HTTP routes — it has no browser, so nothing it
does proves the Viewer, the editor, the file actions or the README rendering
still work. Those scenarios are `@blocked` on **no browser** and are checked by
hand on the homelab instance before a PR claims them.

### When AI writes code, validate harder

AI assistance is welcome — this app family was built with it — but the quality
bar does not move. If an agent wrote it:

- **Nitpick everything.** Names, signatures, defaults, error paths, the lot.
- **Read the surrounding code before trusting the diff.**
- **Re-derive the assertion before the test.** First-pass AI tests often assert
  what the code happens to do, not what the spec says.
- **Verify external references.** Action versions, package versions, API
  endpoints. Check `gh api repos/<o>/<r>/releases/latest`.
- **Don't fabricate Nextcloud or PlantUML behaviour.** If it isn't verified on a
  live instance or in upstream source, mark it as unverified.

The human submitting the PR owns the diff. "An agent wrote it" is not a defense.

---

## The flow: issue → PR → merge

1. **Prefer opening an issue first.** Describe the problem and what "done" looks
   like. For obvious small fixes you can skip straight to a PR.
2. **Let a maintainer weigh in on the issue** before writing code on anything
   non-trivial.
3. **Branch from `main`**, work, push. **Opening the PR is a separate step and it
   needs the maintainer's word for it.**

   > 🚨 **Agents: never open a PR you were not explicitly told to open**, and never
   > open a second one while work is already in flight on an open branch. Push to
   > the branch instead. [AGENTS.md](AGENTS.md) carries the full rule.
4. **Update [`CHANGELOG.md`](CHANGELOG.md)** with an entry under `## [Unreleased]`
   for any user-visible change. CI enforces it with
   [`tarides/changelog-check-action`](https://github.com/tarides/changelog-check-action);
   a change with nothing user-visible takes the **`no changelog`** label.
5. **CI must pass.** All required workflows green (see
   [What CI expects](#what-ci-expects)).
6. **Get at least one approval** from a maintainer. Address review comments by
   pushing more commits — don't force-push over the review unless asked.
7. **Squash-merge** once CI is green and approved. The PR title becomes the
   commit message — keep it clean.
8. **Release** is a separate, manual step (`publish.yml` with `push: true`), not
   on every merge.

---

## Anatomy of a feature change

**A change starts with a scenario, not with code.**

1. **Find the scenario** your change is about. [`features/README.md`](features/README.md)
   says which file owns which behaviour: the folder is the noun (`connection/`,
   `diagrams/`, `readme/`) and the file is the verb.
   - If a scenario already describes it, that scenario **is** the acceptance
     criterion. Read its `# notes:` pointer into
     [`features/AGENTS.md`](features/AGENTS.md) before you decide it is wrong.
   - If none does, **the spec is the thing to agree on first.** Propose the
     scenario in the issue or the PR description and let a maintainer look at it.
     A new `.feature` scenario is a conversation, not a commit you make on the way
     past.
2. **Write the code** in `lib/` — a `Service` for the testable logic, a thin
   `Controller` / `Command` / `Listener` as the adapter, wired in
   `lib/AppInfo/Application.php`; or in `src/` for the browser side.
3. **Make the scenario run**, and take its status tag off. See
   [Testing](#testing) — this is the step with the rule attached.
4. **Add unit tests** in `tests/unit/` or `tests/js/` for the rules Behat cannot
   reach cheaply.
5. **Update the README** if a user could notice the change, and add a
   `## [Unreleased]` changelog entry.
6. **Update the notes in the same commit.** If behaviour changed, the section of
   `features/AGENTS.md` that explains it is now wrong.

### Where each kind of writing goes

| Document | Holds | Tense |
|---|---|---|
| [`features/**/*.feature`](features/) | The specification — what the app does | present |
| [`features/AGENTS.md`](features/AGENTS.md) | Why a scenario is the shape it is | present |
| [`docs/superpowers/`](docs/superpowers/) | What was decided, and the order it is built in | past |
| [`README.md`](README.md) | What a user can do with this | present |

**History goes in the spec and the plan and nowhere else.** A note that opens
*"this used to…"* in any of the other documents is in the wrong file.

---

## Getting set up

The devcontainer is the supported path.

### With the devcontainer (recommended)

1. Install Docker and the VS Code "Dev Containers" extension.
2. Open this repo in VS Code → "Reopen in Container."
3. Wait for `postCreateCommand` to finish (`nvm install && nvm use && npm install`).
4. Run `composer install` to pull PHP dev deps.

You'll need a Nextcloud instance to deploy into and a PlantUML server to point it
at. The official `plantuml/plantuml-server` image on port 8080 is enough;
`.env.example` names the variables.

### Without the devcontainer

You'll need PHP 8.4 (matches prod/CI), Composer, Node from `.nvmrc`. Then:

```sh
composer install
npm ci
npm run build   # bundles src/*.js to dist/plantuml-*.js
```

---

## Testing

Three suites, and they answer different questions.

| Suite | Runner | Asks |
|---|---|---|
| [`tests/unit/`](tests/unit/) | PHPUnit | Does this rule hold, for every input I can think of? |
| [`tests/js/`](tests/js/) | vitest | Same question, for the browser side's pure helpers |
| [`tests/integration/`](tests/integration/) | Behat | Does the app do what the spec says, against a real Nextcloud and a real PlantUML server? |

```sh
composer run test:unit                                    # PHP unit
npm test                                                  # JS unit
cd tests/integration && vendor/bin/behat                  # every suite
cd tests/integration && vendor/bin/behat --suite=admin    # one leg
cd tests/integration && vendor/bin/behat --tags '@todo'   # the work queue
```

### The Gherkin comes first

The `.feature` files are the specification, written before the code and kept true
after it. So a feature PR runs **scenario → code → test**, in that order:

1. **Pick the scenario the change is for.** It is the acceptance criterion, and
   agreeing on it is cheaper than agreeing on a diff.
2. **Build it.**
3. **Make that scenario run**, and take its status tag off.

**The rule, and it is the only hard one here: a scenario stops being `@unbuilt`
or `@todo` only on a PR that runs it.** Promote it to live when it passes; move it
to `@blocked` or `@decision` **with the reason written down** when it does not.
Never by re-reading the spec and deciding what it probably is. The four status
tags and what each one obliges are in
[features/README.md § Status](features/README.md#status--four-tags-and-only-one-of-them-is-a-backlog).

### Which suite gets the test

Behat is expensive — every scenario is a real Nextcloud, a real PlantUML server
and a real round trip — so the split is by what the assertion needs:

- **A rule with no I/O** — URL normalisation, problem classification, a
  markdown fence parser — is a **unit test**.
- **A request payload** is a unit test too: Behat can see what changed at both
  ends, never what went over the wire.
- **Anything a person would describe as a thing they did** is a **scenario**.

If you are writing a scenario whose `When` has no human in it, it is a unit test
wearing a scenario's clothes.

### Policy

> **Every PR should have tests covering the change when it is reasonable to do
> so.**

Unit tests live in `tests/unit/`, mirroring the `lib/` tree. The bootstrap is
standalone — no running Nextcloud — and OCP interfaces are stubbed in
`tests/ocp-stubs.php`, which grows one entry per interface a test mocks.

### Guards you can fail without failing a test

They run in the quality job, and each protects something that otherwise rots while
the build stays green:

| Script | Checks |
|---|---|
| `tests/integration/bin/check-suites.sh` | Every feature file is in exactly one Behat suite. A file in none is never run. |
| `tests/integration/bin/check-notes-anchors.sh` | Every `# notes:` breadcrumb resolves, and no comment block exceeds its two-line budget. |
| `tests/integration/bin/check-step-definitions.sh` | Every step definition is reachable from `FeatureContext`, and every runnable step is defined. |

CI also runs Behat `--strict`, so **an undefined step in an untagged scenario fails
the build** — a scenario with no status tag is claiming to be live, and CI enforces
the claim.

### Static analysis + coding standard

```sh
composer run cs:check    # php-cs-fixer dry-run
composer run cs:fix      # auto-fix
composer run psalm       # static analysis
composer run lint        # php -l across lib/
npm run lint             # ESLint
```

Once a `tests/psalm-baseline.xml` exists, **don't regenerate it on your branch**
unless you're explicitly paying down debt.

---

## What CI expects

| Workflow | Trigger | Jobs | Must pass? |
|---|---|---|---|
| [`pr.yml`](.github/workflows/pr.yml) | PR only | Auto-assign author + changelog check | yes |
| [`tests.yml`](.github/workflows/tests.yml) | PR + push to `main` | PHP lint + unit suite; JS build + vitest | yes |
| [`quality.yml`](.github/workflows/quality.yml) | PR + push to `main` | composer audit + php-cs-fixer + Psalm + the guards + ESLint + npm audit | yes |
| [`integration.yml`](.github/workflows/integration.yml) | PR + push to `main` | Behat, three suites × the server versions | yes |
| `CodeQL` (default setup) | PR + push to `main` | GitHub-managed JS code scanning | yes |
| [`publish.yml`](.github/workflows/publish.yml) | manual | version bump, tarball, release, store upload | n/a |

### Workflow authoring conventions

- **Never put `${{ }}` expressions inside `run:` bash.** Bind them to an `env:`
  entry and let bash read the clean `$VAR`.
- **Invoke scripts with `bash path/to/x.sh`** rather than relying on the
  executable bit.
- **Provision first, act second.** Setup steps up front, a readiness gate, then
  the work.

---

## Commits, changelog, versions

- **Commits**: focused and descriptive. Conventional Commits prefixes (`feat:`,
  `fix:`, `chore:`, `docs:`, `refactor:`, `test:`) are encouraged for the PR
  title.
- **Changelog**: one user-facing line per entry under `## [Unreleased]`, grouped
  by `Added` / `Changed` / `Fixed` / `Removed`. Only ever edit `[Unreleased]`;
  released sections are immutable.
- **Versioning**: SemVer. The release workflow bumps `package.json` and mirrors
  the version into `appinfo/info.xml` — you don't bump these in feature PRs.
- **Tags**: `v<major>.<minor>.<patch>`.

---

## Releases

Manual, intentional, not on every merge.

1. Maintainer goes to the Actions tab → `🧬 Publish Version`.
2. Picks the bump type (`patch` / `minor` / `major` / `pre*`).
3. **First run with `push: false`** to verify the tarball builds correctly.
4. **Second run with `push: true`** to commit the bump, tag, create the GitHub
   Release and upload to the app store.

---

## Security

If you've found a vulnerability, **do not open a public issue.** Follow
[SECURITY.md](SECURITY.md).

---

## Where to look next

- **"How does this app work?"** → [README.md](README.md)
- **"What is it supposed to do, exactly?"** → the `.feature` file for that
  behaviour. [features/README.md](features/README.md) says which one owns it.
- **"Why is that scenario the shape it is?"** → [features/AGENTS.md](features/AGENTS.md)
- **"Why was it decided that way?"** → [the spec](docs/superpowers/specs/)
- **"I'm an AI agent — where do I start?"** → [AGENTS.md](AGENTS.md)

Thanks for contributing. Be kind in reviews, validate on a real instance, and start
from the scenario.
