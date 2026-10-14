<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->
# The feature suite

`features/**/*.feature` is this app's **specification**. It is written before the
code and kept true after it — documentation that happens to execute, not a
test-naming convention.

This file is the map: what lives where, what the tags mean, and how the suite is
run. It is the first of three documents, each a level deeper than the last:

| | Document | Answers |
|---|---|---|
| **this file** | `features/README.md` | *Where is the behaviour I'm looking for?* |
| the notes | [`AGENTS.md`](AGENTS.md) | *Why is this scenario the shape it is?* — one section per file, present tense |
| the spec | [`../docs/superpowers/specs/`](../docs/superpowers/specs/) | *What was decided, and what proved it?* |

Each level links to the next: a scenario that needs explaining ends with a
`# notes:` breadcrumb, and every section of `AGENTS.md` opens with a `spec:`
pointer. Stop at the depth your question needs.

For **how to get a change in** — the order a PR lands in, and where the tests go —
see [CONTRIBUTING.md § Testing](../CONTRIBUTING.md#testing).

## The layout: the folder is the noun, the file is the verb

A feature file answers *"what happens when someone edits a diagram?"* — not *"what
does the render endpoint do?"*, because nobody thinks in endpoints.

Three folders. Everything in one of them acts on the same kind of thing:

| Folder | The noun | The verbs |
|---|---|---|
| [`connection/`](connection/) | the PlantUML server | admin |
| [`diagrams/`](diagrams/) | a `.puml` file | view · edit · create |
| [`readme/`](readme/) | a folder README | render |

Plus [`lifecycle.feature`](lifecycle.feature) at the top level — the app enabling,
disabling and being removed belongs to no noun in the app.

**A scenario describing a behaviour another file owns is a defect**, even when it
passes. Move it.

Deliberately absent: delete, rename, move, copy, trash, restore and share. A
`.puml` is an ordinary Nextcloud file and every one of those is Nextcloud's own
behaviour, which this app neither changes nor specifies.

## The files are also a partition — three Behat suites

Every file belongs to **exactly one** suite, declared in
[`tests/integration/behat.dist.yml`](../tests/integration/behat.dist.yml), and the
integration matrix runs one suite per leg:

| Suite | Holds |
|---|---|
| `admin` | `connection/` and `lifecycle.feature` |
| `diagrams` | `diagrams/` |
| `readme` | `readme/` |

**The axis is the path, not a tag.** A tag partition leaks: an untagged scenario
would match no leg and quietly stop running, with every leg still green. A path
partition cannot, because `ls features/**/*.feature` minus the union must be
empty. [`tests/integration/bin/check-suites.sh`](../tests/integration/bin/check-suites.sh)
checks exactly that, in the quality job.

## Tags

### Channel — how it was triggered

| Tag | Meaning |
|---|---|
| `@gesture` | A Files-app action: a click, a menu entry, "+ New". |
| `@occ` | Reachable from the CLI. |
| `@admin` | Needs the admin settings panel or an admin-only command. |
| `@ui` | The behaviour has a user-interface surface at all. |
| `@api` | Asserted through a raw HTTP request to the app's own endpoint. |

These describe the FEATURE's surfaces, not how the harness drove it. A scenario the
test runs via `occ` is still `@ui` if the admin panel has a button for it.

There is no origin axis. Nothing in this app syncs, so nothing ever happens "on
the other side".

### Status — four tags, and only one of them is a backlog

| Tag | Meaning | What to do about it |
|---|---|---|
| *(none)* | Runs in CI. | Keep it green. |
| `@todo` | **The code exists; only the test is missing.** | Write the test. |
| `@unbuilt` | A spec awaiting code. | Build the feature. |
| `@blocked` | Real behaviour this harness cannot reach. | Build the harness capability — or accept it. |
| `@decision` | Records a deliberate absence. There is no operation. | Nothing, ever. |

All four are excluded from the run. The distinction is about **who picks it up**.
`behat --tags @todo` is the work queue.

Where the suite stands: every scenario runs in CI bar the lifecycle file's
`@blocked` removal; `grep -rE '@unbuilt|@blocked|@todo' features/` is the authority. An
`@unbuilt` on a `Feature:` line covers every scenario under it, and comes off on
the PR that runs the file's scenarios.

#### A scenario changes status only on a PR that runs it

Promote it to live when it passes, or move it to its true status **with the reason
written down**. Never by re-reading the spec and deciding what it probably is.

#### `@blocked` must NAME the missing capability

In the scenario, or in the section above it. The walls that exist today:

* **no browser** — anything about a click, a menu entry, the Viewer, the editor
  or the README. The homelab runs a Selenium Grid, so this wall is removable;
  until it falls, these behaviours are checked by hand on the live instance before
  a PR claims them. The README's editable-state mitigation is one of them.
* **no app removal** — `occ` enables and disables; removing and reinstalling an
  app is a store operation this suite cannot perform.

#### `@decision` is a permanent absence, not "nothing happened"

The test is on the `Then`: does it name **the outcome of an operation**, or **the
permanent absence of a capability**? Only the second is a `@decision`. There are
none in this suite today.

## Writing a scenario

### `Rule:` is NOT available

Gherkin 6 added `Rule:`; Behat's parser rejects it
([Behat#1451](https://github.com/Behat/Behat/issues/1451), open). Business rules
are **comment banners** (`# ── RULE: … ──`), which become real `Rule:` blocks the
day Behat ships it.

### Never end a line with the bare word `json`, never start a token with `'`

Both are bugs in the VS Code `cucumberautocomplete` grammar, not in Gherkin, and
both render the rest of the file grey with no error. Finish the sentence (`…the
file's JSON body`) and keep an apostrophe away from a quoted parameter
(`the token of "alex"`, never `"alex"'s token`).

### Comments: two lines, then a breadcrumb

A comment may add scope to a step; it may not carry the reasoning. **Two lines of
prose per block is the budget**, and anything longer goes to
[`AGENTS.md`](AGENTS.md) behind a one-line pointer:

```gherkin
    # notes: ../AGENTS.md#asking-for-a-diagram-file-by-its-path
```

Dividers, a `@blocked` reason and the breadcrumbs themselves do not count.
[`tests/integration/bin/check-notes-anchors.sh`](../tests/integration/bin/check-notes-anchors.sh)
enforces both halves.

### Cells name the kind of value, never the value

`the test server` is whatever the harness stood up; `an unreachable host` is
whatever address refuses a connection. Pinning a real URL would tie the spec to
one CI fixture.

### Data tables: an input, or a different rule?

`Scenario Outline` + `Examples` is right when the rows are **one rule applied to
different inputs** and the outcome is identical for every row — the three server
problems are one outline, because each is "the health check names what is wrong".
Different rules that happen to share a shape are separate scenarios.

### Wording is an API

Every step line is a function signature. Two phrasings of one idea are two
functions to maintain, so the step vocabulary is deliberately small and
parameterised. `tests/integration/bootstrap/Steps/` is the vocabulary; read it
before adding to it.

## Where the tests are

| What | Where |
|---|---|
| The scenarios | `features/**/*.feature` — at the repo root, because they are docs |
| The step definitions | [`tests/integration/bootstrap/Steps/`](../tests/integration/bootstrap/Steps/) |
| The context that composes them | [`tests/integration/bootstrap/FeatureContext.php`](../tests/integration/bootstrap/FeatureContext.php) |
| Transports — `occ`, WebDAV | [`tests/integration/bootstrap/Support/`](../tests/integration/bootstrap/Support/) |
| What CI actually runs | [`tests/integration/behat.dist.yml`](../tests/integration/behat.dist.yml) |
| The unit suites | [`tests/unit/`](../tests/unit/) (PHP, OCP stubbed) and [`tests/js/`](../tests/js/) |

Integration runs against **a real Nextcloud and a real PlantUML server**, one
suite per matrix leg, in
[`.github/workflows/integration.yml`](../.github/workflows/integration.yml).

```sh
composer run test:unit && npm test                # the unit suites
cd tests/integration && vendor/bin/behat          # every suite, in sequence
cd tests/integration && vendor/bin/behat --suite=diagrams
cd tests/integration && vendor/bin/behat --tags '@todo'    # the work queue
```

CI runs `--strict`, so **an undefined step in an untagged scenario fails the
build.** A new `*Steps.php` that nobody `use`d in `FeatureContext` is silently
dead; [`check-step-definitions.sh`](../tests/integration/bin/check-step-definitions.sh)
says so.

### Which unit tests, and which scenarios

- **A rule with no I/O** — URL normalisation, problem classification, the
  markdown fence parser, the PlantUML mode's tokens — is a **unit test**.
- **A request payload** is a unit test too.
- **Anything a person would describe as a thing they did** is a **scenario**.
