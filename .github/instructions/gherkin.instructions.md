---
description: 'Gherkin and Behat conventions for review — how a feature file must read, and how to tell whether it is actually tested'
applyTo: "{features/**/*.feature,features/README.md,tests/integration/**}"
---
<!--
  SPDX-FileCopyrightText: 2026 kubed-io
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Gherkin conventions — the spec, and whether it is real

`features/**/*.feature` is this app's **specification**, written before the code
and kept true after it. It is not a test-naming convention. Review it as
documentation that happens to execute.

**Read `features/README.md` first** — it is the authority on layout, tags and
the notes behind every scenario, and this file is the review checklist that
follows from it. Where the two disagree, `features/README.md` wins and this file
is stale. The design the features implement is
`docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`.

**The fastest review pass**: read each `Scenario:` line with its `When`, and ask
*who performed this, and what changed?* Almost every defect the sibling repos
have shipped in a feature file fails that question — a mechanism as the actor, a
construct as the subject, a property as the title, or an assertion that nothing
happened to something nobody touched. Those shapes are catalogued in
[A scenario that is not one](#a-scenario-that-is-not-one--the-shapes-to-reject),
with the offending lines.

## Where the binding lives — check this before saying anything about coverage

A scenario is only real if a step definition matches every one of its lines.

| What | Where |
|---|---|
| The scenarios | `features/<noun>/<verb>.feature` — `connection/`, `diagrams/`, `readme/` — plus `features/lifecycle.feature` at the root |
| The step definitions | `tests/integration/bootstrap/Steps/*.php` |
| The context that composes them | `tests/integration/bootstrap/FeatureContext.php` |
| Transports (occ, WebDAV, HTTP to the app's own routes) | `tests/integration/bootstrap/Support/` |
| What CI actually runs | `tests/integration/behat.dist.yml` |

`behat.dist.yml` filters `~@todo&&~@unbuilt&&~@blocked&&~@decision`, and CI runs
`--strict` — so an **undefined step in an untagged scenario fails the build.**
That is the safety net: a scenario with no status tag is claimed to be live, and
CI enforces the claim.

A new step definition belongs in the trait that owns its concern, and every trait
must be `use`d in `FeatureContext`. **A new `*Steps.php` that nobody composed in
is silently dead** — check for it.

## The four status tags

The single most useful question about a spec is *"what is built but untested?"*.
These tags exist so it is a filter rather than an investigation.

| Tag | Means | Who picks it up |
|---|---|---|
| *(none)* | Runs in CI. | — |
| `@todo` | **The code exists; only the test is missing.** | Someone writing a test |
| `@unbuilt` | A spec awaiting code. | Someone building the feature |
| `@blocked` | Real behaviour the harness cannot reach. | Someone extending the harness |
| `@decision` | Records a deliberate absence. No operation, ever. | Nobody |

**`behat --tags @todo` is the work queue.** Flag anything that pollutes it:

- A scenario tagged `@todo` whose feature has no code → it is `@unbuilt`. Today
  **every** scenario is `@unbuilt`: the app is specified ahead of its code.
- A `@blocked` that does not **name the missing capability** → it is a `@todo`
  nobody checked. The two walls that exist are: **no browser** (the Viewer, the
  editor, the + New menu and the README are all `@ui`, and nothing in the harness
  clicks), and **no app removal** (`occ` enables and disables; removing an app is
  a store operation the suite cannot perform).
- A `@decision` on something with a real gesture. `@decision` is for the
  *permanent absence of a capability* (*"There is no thumbnail for a `.puml`,
  ever"*), **not** for *"nothing happened"* (*"the PlantUML server is never
  contacted"*) — that second kind is ordinary behaviour, testable by absence.
  Read the `Then`: the outcome of an operation, or an absence of one?

A `@todo` that fails because of a **defect** is legitimate — but it must say so
in a comment, or it is indistinguishable from an unwritten one.

## Community standards this project follows

From [Cucumber's own guidance](https://cucumber.io/docs/bdd/better-gherkin/) —
cite these when a scenario drifts:

- **Describe behaviour, not implementation.** The test: *will this wording need
  to change if the implementation does?* If yes, rewrite it.
- **`Given` is a precondition, `When` is the action, `Then` is an observable
  outcome.** Avoid user interaction in a `Given`.
- **Assert on something observable**, not on internal state. Cucumber says
  "resist the temptation to look in the database"; here that means **assert
  over DAV, or on the image the app's route answers with, never only through
  this app's own status output**. A scenario that asks the app whether the app
  did something proves only that the app agrees with itself — that exact shape
  shipped in the sibling repos and hid two real bugs.
- **Keywords are ignored when matching step definitions.** Two steps with the
  same text are the same function whatever their keyword. This is why one
  function may carry several phrasings, and why near-duplicate wordings are a
  defect rather than a style choice.
- **Backgrounds stay short and describe state, not who did what.**

### Where this project deliberately differs, and why

Do not "correct" these:

- **The reasoning is kept, but not in the feature file.** Every feature opens
  with a `# Notes, decisions and history for this feature: ../AGENTS.md#anchor`
  pointer, a scenario that needs one ends with `# notes: ../AGENTS.md#anchor`,
  and the essay lives in `features/AGENTS.md`. A block may carry **at most two
  lines of prose**; `tests/integration/bin/check-notes-anchors.sh` fails the
  build on a longer one and on a pointer that no longer resolves. The siblings
  learned this the hard way — inline reasoning once produced as many lines of
  notes as of spec, and scenarios nobody could read at a glance.
- **Backgrounds may run past the recommended four lines.** Every line is a
  real configuration step against a live Nextcloud and a live PlantUML server;
  there is no `Given I am logged in` shortcut to hide them behind.
- **`Rule:` is not used, and this is verified, not preference.** Behat's parser
  rejects the keyword (`Expected Step, but got text: "  Rule: …"`), and there is
  no newer Behat to upgrade to. Business rules are comment banners
  (`# ── RULE: … ──`). **Never suggest converting them to `Rule:` blocks.**

## Layout — one behaviour, one file

Feature files are organised by **behaviour**, never by the kind of thing acted
on. The folder is the noun, the file is the verb: looking at a diagram is
`diagrams/view.feature`, whether the look is a click in the Files app or a raw
request to the render route, so a reader comparing the two sees one file.

This is the most valuable thing to catch in review, because the failure is
silent. In a sibling repo one file owned renaming, copying, moving *and* deleting
a folder while another file carried **live** coverage of the same rename —
two files, one behaviour, and nobody reads two files to answer one question.

**Flag a scenario that describes a behaviour another file owns.** The owners are
listed in the spec's behaviour table and in `features/AGENTS.md`. The file-type
registration, for instance, belongs to `lifecycle.feature` as an end state of
enabling — not to a feature of its own.

## A scenario that is not one — the shapes to reject

Every one of these shipped in a sibling repo and was removed. They share a root:
the scenario names something that is not a thing anyone **does**. Read the
`Scenario:` line and the `When` together and ask *"who performed this, and what
changed?"* — if either answer is missing, it is one of the shapes below.

### The `When` is a mechanism, not an action

```gherkin
    When the render runs                       # ✘ nobody runs a render
    When the observer notices the README       # ✘ nicer words, same defect
    When the preview cache is refreshed        # ✘
```

A DOM observer is how the picture arrives, not an act. **Say what someone did
and let the step hide the mechanism:**

```gherkin
    Given the README in "Diagrams" holds a plantuml code fence
    When I open "Diagrams" in the Files app          # ✔ pre-state, action,
    Then the README shows the fence as its diagram   #   end state
```

**The exception is narrow:** the mechanism may be the subject when running it
*twice* is the claim (a second request with a matching `If-None-Match` answers
`304`). That is about repetition, not about rendering.

### The subject is a construct

```gherkin
Feature: A .puml file is a first-class file type              # ✘ nobody does this
  Scenario: The mimetype text/x-plantuml is registered        # ✘ nor this
  Scenario: A rendered image carries the file's ETag          # ✘ a property, not an act
```

A mimetype, a response header and an icon are all **end states of something
else**. Nobody registers a mimetype; they enable an app. Nobody sets an ETag;
they save a file and the route answers with it. Put each end state with the
action that produces it — `lifecycle.feature` says `.puml` files are registered
as their own file type as a `Then` of enabling — and what remains is the one
thing someone genuinely performs — *looking* (`diagrams/view.feature`).

### More than one `When`

```gherkin
    When I change the source
    Then the diagram on the right shows the changed source
    When I save                                            # ✘ second When
    Then "Diagrams/Order flow.puml" holds the changed source
```

A second `When` is a scenario rebuilding a pre-state by performing another
behaviour. State it in the `Given` instead. **One `When`, followed by `And`s that
are only continuations of the same act, then one `Then` and its `And`s.**
(`When I change the source / And I save` is one act — saving what was typed —
and `diagrams/edit.feature` writes it that way.)

Two `Given`/`Then` pairs in one scenario is the same defect wearing a different
hat — that is two scenarios sharing a name.

### An action wearing a `Given`

```gherkin
    Given I note the ETag of "Diagrams/Order flow.puml"   # ✘ that is an act
```

A `Given` says how the world **is**. Harness bookkeeping is not pre-state. In a
sibling this forced a whole diff vocabulary (`unchanged` / `changed`) that
vanished the moment the table stated absolute values instead — and the absolute
form is the stronger claim: not *"the content differs from before"* but *"the
file holds the changed source"*.

### The `Then` asserts that nothing happened to something nobody touched

```gherkin
  Scenario: Editing one diagram leaves its neighbours alone   # ✘
  Scenario: A folder with no README is left strictly alone    # ✘
```

Nothing edits a file nobody edited. These are the same action, the same
pre-state and the same end state as the scenario above them, plus a sentence
saying an untouched thing was untouched.

**This is not the same as a negative outcome**, which is real and often the
point: *"the request is refused"*, *"the PlantUML server is never contacted"* —
something happened, and this is what it did not cause. The test is whether an
action was aimed at the thing you are asserting about.

### The scenario summarises other files

```gherkin
  Scenario: A diagram file is a picture everywhere
    Then the Viewer shows it as its diagram
    And the README shows it as its diagram
    # Detail lives in diagrams/view.feature and readme/render.feature; this is the summary
```

A comment admitting the coverage is elsewhere is the tell. A summary is a second
copy free to drift, and the reader who wants the rule is better served by the
file that exercises it.

### The scenario is another file's scenario

Two sibling files once carried the same scenario with the same arrange and the
same two asserts, in two suites. Before adding a scenario, grep the `Then` lines
for one that already says it.

### The operation does not exist

```gherkin
    When the admin sets the render format to "png"   # ✘ no such thing
```

The format is SVG everywhere and the admin card holds one field, the server URL
(the spec's decision table says why). There is no control, no `occ` flag and no
code path — the scenario describes a wish. **Check that the `When` names
something the app can actually be asked to do**; if it cannot, the scenario is
`@unbuilt` at best and usually nonsense.

Its sibling: asserting a value the app never writes. A sibling's PROPFIND table
once listed two properties that were registered and written by nothing.

### The scenario is about an older version of this app

```gherkin
  Scenario: A .puml rendered by an older version is re-rendered on the next open  # ✘
```

This app has never been released. There is nothing in the field to migrate
from, so a compatibility scenario describes a population of zero. Delete it
rather than rewriting it.

## State is a table — both ends of it

Two conventions follow from "a scenario is pre-state, one action, end state", and
both are worth checking on any PR that touches the connection or a file's content.

**The connection is one fact, so it is one sentence and a table** — the same
shape whether it is the pre-state or the action, in the vocabulary the admin
card uses. A blank cell means the app's own default, declared once in the
Background:

```gherkin
    When the admin fills in the connection details:
      | url | the test server |
```

Naming a field is a claim that it matters to the outcome. Leave out the rows that
do not.

**A file's content is the end state of the action that changed it**, never a
subject of its own and never a lone `Then` picking off one property:

```gherkin
    When I choose "Diagram" from the + New menu and name it "Checkout"
    Then "Diagrams/Checkout.puml" holds an empty diagram
```

The vocabulary is closed — `an empty diagram`, `the changed source`, `the test
server`, `an unreachable host`, `a server that is not PlantUML`, or a quoted
literal. **Flag a new value word**: a table that can say anything stops being
readable, and a diff word like `unchanged` drags a "note the state first" action
back into the `Given`.

## The traps this repo's siblings have actually fallen into

Each of these has cost a debugging session in a sibling. They are worth checking
on every PR that touches a feature file.

**A tag floating above a comment block.** Gherkin binds a tag to the next
*scenario*, across any number of comment lines. A `@todo` placed above a banner
silently excluded one scenario while four others ran undefined. **A status tag
must be directly adjacent to its `Scenario:` line.** (The feature-level
`@unbuilt` above `Feature:` is the one legitimate exception: it binds to every
scenario in the file, and the comment above it says so.)

**A Background whose steps do not exist.** Harmless while every scenario in the
file is tagged — which is every file today — and an instant `--strict` failure
the moment one goes live. **If a PR promotes a scenario to live, verify the
Background is real.**

**A scenario borrowing another file's setup habits.** `connection/admin.feature`
deliberately starts with `no server is configured yet`; every `diagrams/` and
`readme/` file starts `connected to a PlantUML server` with `Order flow.puml`
already in `Diagrams`. Copying a scenario between them silently breaks it.
**Check the file's own Background before assuming a path resolves or a server
answers.**

**An assertion about the whole folder inside a one-file scenario.** A claim
about every file in `Diagrams` passes or fails on alphabetical neighbours left
by other scenarios and flaps. **A scenario about one file asserts on that file.**

**An absence assertion that passes for the wrong reason.** `occ
plantuml:test-connection` exits non-zero for all three problems — `not set`,
`unreachable`, `not a PlantUML server`. Asserting only the exit code makes the
test go green precisely when its fixture breaks. **Absence assertions must match
the specific failure** — the outline in `connection/admin.feature` asserts the
message, not the code.

**A `Then` that only asks this app.** See the observable-outcome rule above.

## Two characters that break the editor, and neither is a Gherkin rule

Both are bugs in the VS Code `alexkrechik.cucumberautocomplete` grammar, not in
Gherkin — but the symptom is a file that renders as unreadable grey from some
point onward, with no error to explain it. Reviewers should flag these, because
the author often cannot see what they did.

### Never end a line with the bare word `json`

`syntaxes/json-embed.json` contains:

```json
"begin": "(json|JSON)\\s*$",
```

That was meant to anchor to a `"""json` doc-string delimiter and is not tied to
the `"""` at all, so **any** line ending in the bare word opens an embedded-JSON
region that nothing closes. Only end-of-line occurrences trigger it. Fixes, in
order of preference — pick whichever the sentence wanted anyway:

| | |
|---|---|
| finish the sentence | `…and answers with the problem as JSON.` |
| say what kind of thing | `…from the response's JSON body` |
| quote it as a value | `…defaulting to "json"` |

A **step line is a function signature**, so reword those rather than adding
punctuation, and move the step definition with it.

### Never start a token with an apostrophe

`syntaxes/feature.tmLanguage.json` treats `'` as a string delimiter:

```
begin: (?<![a-zA-Z0-9"])'      end: '(?![a-zA-Z0-9"])
```

So an apostrophe opens a string **unless it directly follows an alphanumeric or a
double quote**. That makes the ordinary cases safe and one case fatal:

| | |
|---|---|
| `alex's diagram` | fine — `'` follows a letter, and no quote is involved |
| `the diagram of "alex"` | fine — the possessive is rephrased away from the quote |
| `"alex"'s diagram` | **breaks** — the closing `"` cannot close, because `"(?![a-zA-Z0-9'])` refuses to close in front of an apostrophe |
| `"alex" 's diagram` | **breaks** — the lone `'` opens a region of its own |

The last form turns up when a possessive gets separated from its noun, usually
while editing around a quoted parameter. If a file suddenly goes grey partway
down, look for a lone `'` before you look for anything else.

## Scenario Outline: an input, or a different rule?

`Examples` is right when the rows are **one rule over different inputs** and the
outcome is identical for every row. *"An admin enters a server address that
cannot render"* is the model: three addresses, one rule (the check reports an
error and names the problem), three values in a column.

It is wrong when the rows are **different rules sharing a shape**. Opening a
diagram in the Viewer and opening it in the editor look like one outline over a
`surface` column; they are different behaviours with different end states, and
`diagrams/view.feature` and `diagrams/edit.feature` keep them apart.

The test: can you write the rows as a list of *values*, or only as a list of
*sentences*? Values → `Examples`. Sentences → separate scenarios.

## Wording is an API

Every step line is a function signature, so the vocabulary is deliberately small
and parameterised:

```gherkin
Then "Diagrams/Checkout.puml" holds an empty diagram
Then "Diagrams/Order flow.puml" holds the changed source   # one step, one value word
Then the health check reports success
Then the health check reports an error                    # same step, one flag
```

**Flag a new step phrasing that duplicates an existing one.** Two wordings for
one idea are two functions to maintain and two ways for the same assertion to
drift. Read `tests/integration/bootstrap/Steps/` before accepting a new one.

The reverse is fine and intentional: one function may answer to several
phrasings, because keywords are ignored in matching. One `connect()` may be
`the app is connected to a PlantUML server` where a connection merely has to
exist first, and `the admin fills in the connection details` where the connecting
is the behaviour under test. Same operation, two honest readings.

**Setup says what IS TRUE, not who did what to make it true.** `the admin tests
the connection` as a `Given` would read as though an admin were permanently on
call before every gesture a user makes. That is not the system being described —
which is why the Background says `connected`, not `tested`.

## Tag axes other than status

- **Origin** — there is none. Nothing syncs, so every action happens in
  Nextcloud and there is no *other side* for a payoff to reach. Flag an
  `@in-…` tag as a habit carried over from a sibling.
- **Channel** — `@gesture` (Files-app gesture, driven over WebDAV) / `@occ` /
  `@admin` / `@ui` (a browser surface — the Viewer, the editor, a menu, the
  README; `@blocked` on *no browser* once the code exists) / `@api` (a raw HTTP
  request to the app's own endpoint).
- **Backend** — there is none. A `.puml` is an ordinary file wherever it sits;
  the suite is not run across storage kinds.

Viewer vs editor is **not** an axis. Both read the same `GET /render` route, so
a scenario about what the route answers belongs in `diagrams/view.feature` once,
not once per surface. Flag a scenario written twice per surface when the outcome
does not differ.
