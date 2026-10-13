<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Feature notes

Why each scenario in `features/**/*.feature` is the shape it is — one section per
feature file, in the present tense.

This is the middle of a cascade: the feature files are the specification, this
file is the reasoning as of today, and the spec in
[`../docs/superpowers/specs/`](../docs/superpowers/specs/) is where a decision was
made. Every section opens with a `spec:` pointer. A note that opens *"this used
to…"* belongs in the spec, not here.

The budget is two lines of prose per comment block in a `.feature`; anything
longer lives here behind a `# notes:` breadcrumb, and
`tests/integration/bin/check-notes-anchors.sh` checks that every breadcrumb lands
on a heading in this file.

## connection/admin

`features/connection/admin.feature`

spec: [Architecture → Backend](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#backend-lib) · [Rulings](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#rulings-from-dr-k-2026-10-13)

CONFIGURING THE APP IS ONE ACT, and this file is two scenarios: it works, or it
does not and says what is wrong. The connection is one fact — a URL — so it is one
table with one row; a second field, should one ever exist, is a row and not a
scenario.

THE SUCCESS `Then` READS SOMETHING ONLY THE SERVER CAN SUPPLY. "Reports success"
alone would be the app agreeing with itself; the PlantUML version proves a round
trip through a real server, and it is the one thing an admin wants to see.

A cell names what KIND of value it is (`the test server`) rather than the value,
because the real URL comes from the environment the workflow built.

THE STEPS DRIVE THE OCC TWINS. `plantuml:set-url` is the card's field and
`plantuml:test-connection` is its button: both call the same `ServerConfig` and
`RenderService::version()` the card does, so the CLI and the card cannot disagree.
The check renders PlantUML's `version` diagram as text and reads the version off
it, which only a PlantUML server can answer.

A URL with no http(s) scheme or host is refused: the card's save fails with
Nextcloud's generic message and logs the reason, Test connection then says
`Server URL is not set`, and `occ plantuml:set-url` prints the reason itself.

### An admin enters a server address that cannot render

THE MESSAGE HAS TO NAME THE PROBLEM. There are exactly three, they have three
different fixes, and the health check says which one it found:

| the admin typed | the check says | the fix |
|---|---|---|
| nothing | `Server URL is not set` | type one |
| a host that does not answer | `Server is unreachable` | network, port, typo |
| a web server that is not PlantUML | `Server is not a PlantUML server` | wrong URL |

Each kind of input is a real one. An empty cell deletes `server_url`. The
unreachable host is `127.0.0.1:9`, where nothing listens. The server that is not
PlantUML is Nextcloud itself: it answers the `/txt` POST, with a status or a page
that carries no PlantUML version.

The three are one outline because each row is the same rule — "the check names
what is wrong" — over a different input. The same three words are the whole error
vocabulary of the app, used by every surface, so an admin who has seen this card
recognises the Viewer's message.

## lifecycle

`features/lifecycle.feature`

spec: [Platform facts, 4](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#platform-facts-the-design-rests-on)

The file type is an END STATE of enabling, not a feature of its own: a user never
"registers a mimetype", they install the app and `.puml` files wear the icon.
Removing the app reverts the registration and touches no file — a diagram is an
ordinary file and stays one.

BUILT. `RegisterMimetype` runs on install and every upgrade, mapping `puml` and
`plantuml` to `text/x-plantuml` with icon `plantuml`. The scenario proves it from
outside: PUT `probe.puml` over DAV, read the type back. "Removing the app" is
`@blocked`: occ cannot remove an app, so `UnregisterMimetype` (the `<uninstall>`
step, reverting rows to `text/plain`) runs for real only on a store uninstall.

## diagrams/view

`features/diagrams/view.feature`

spec: [Platform facts, 5](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#platform-facts-the-design-rests-on) · [Security](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#security)

A DIAGRAM FILE OPENS AS A PICTURE, in Nextcloud's own image viewer, because that
is where every other picture opens. The click is the whole gesture; there is no
"render" button.

The Viewer opens it because the app registers a Viewer handler for
`text/x-plantuml`; the menu's "View" entry is the Viewer's own. With no server
set the Viewer still opens, and shows the route's one line — `not set` — where
the picture would be.

### Asking for a diagram file by its path

THE ENDPOINT TAKES A PATH, NEVER TEXT, and resolves it inside the caller's own
folder. That is the security property of the app in one sentence: you can have
drawn exactly what you can read. A path to a file that is not a diagram is refused
rather than rendered, because PlantUML would happily draw an error image for a
text file and a 200 for `notes.txt` would teach the caller nothing.

"Not a diagram" is the file's detected mimetype, `text/x-plantuml`, so these
scenarios rest on the file type `lifecycle.feature` registers. A path that does
not resolve, or climbs out of the caller's folder, is the same 404: the route never
says whether a file it will not draw exists.

A diagram the server answers is a 200 SVG with the file's ETag, and a 304 when the
caller already holds that ETag. A diagram with a mistake in it is still a 200:
PlantUML draws the error into the image. Only a server problem is not an image — a
503 whose body names it in the shared vocabulary.

The two `@api` scenarios are the harness-reachable half of this file, asked over
HTTP as the admin. The click is `@blocked`: it is a browser behaviour and waits for
a browser leg.

## diagrams/edit

`features/diagrams/edit.feature`

spec: [Decisions → Editor engine](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#decisions-taken-in-this-spec) · [The editor choice](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#the-editor-choice-as-it-was-weighed)

THE SOURCE AND THE DIAGRAM ARE ONE VIEW. The point of the editor is seeing the
picture change as you type, so "the diagram follows the source" is its own
scenario and not an `And` on opening. Highlighting is an `And` on opening, because
it is what you see the moment the editor appears, and it is the reason the editor
is ours rather than Text's.

SAVING IS THE ONLY THING THAT TOUCHES THE FILE. The live preview sends text to
the server, never to the file; the file changes when the user says so.

A SAVE NEVER OVERWRITES SOMEONE ELSE'S CHANGE. The editor reads the file over
WebDAV with its ETag and writes it back with `If-Match`; a file changed in the
meantime answers 412, the top bar says "Someone else changed this file", and the
file stays as the other person left it. There is no merge: collaboration is what
Text's editor offers and this one gave up for highlighting.

The right pane redraws 300 ms after typing stops. When the server cannot draw,
the pane shows the problem (`not set`, `unreachable`, `not a PlantUML server`)
where the diagram was, and the source stays editable. The "Saving writes the
source back to the file" outcome is a WebDAV read, but reaching it takes a
keystroke and a click in the overlay, so it waits for a browser leg too.

THE PLAIN-TEXT OPENER IS TEXT'S OWN EDITOR, offered beside ours because some
people want the raw file and Nextcloud already has an editor for that.

Both are menu entries on one diagram, never on a multi-selection. "Edit diagram"
hides while no server is set, since its right pane would have nothing to draw;
"Open with text editor" needs no server and stays.

## diagrams/create

`features/diagrams/create.feature`

spec: [Rulings](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#rulings-from-dr-k-2026-10-13)

A NEW DIAGRAM HOLDS AN EMPTY DIAGRAM — `@startuml`, a blank line, `@enduml` —
rather than nothing, so the file opens ready to write in and the right pane has
something to draw from the first keystroke. The editor opening on it is part of
the same gesture: nobody creates a diagram in order to not edit it.

Choosing **Diagram** writes `New diagram.puml` (`New diagram (1).puml` when that
is taken) and opens the editor; the name is given with Nextcloud's own rename.
It needs no server: a `.puml` is plain text, and the editor says what is wrong.

## readme/render

`features/readme/render.feature`

spec: [Platform facts, 1–2 and 7](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#platform-facts-the-design-rests-on) · [Why the README is a DOM observer](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#why-the-readme-is-a-dom-observer-and-the-exit)

A PLANTUML FENCE IS A PICTURE, and so is an image tag that names a diagram file.
Those are the two ways Markdown has of putting a diagram in a page, and the
README shows both drawn. Only the fence tag `plantuml` is recognised — it is the
one every other tool agrees on, and `puml` is a file extension, not a language.

THE IMAGE BEHAVES AS TEXT TREATS ANY IMAGE: inline, with its alt text as the
caption, and no link to the file. Clicking it does nothing, so Text's own
lightbox never reopens it as the broken `.puml` it would otherwise show.

Both scenarios are browser behaviours: the README is only ever rendered in a
page. They wait for a browser leg and are checked by hand on the live instance
until then.
