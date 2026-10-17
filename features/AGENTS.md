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

`RegisterMimetype` runs on install and every upgrade, mapping `puml` and
`plantuml` to `text/x-plantuml` with icon `plantuml`. The scenario proves it from
outside: PUT `probe.puml` over DAV, read the type back. "Removing the app" is
`@blocked`: occ cannot remove an app, so `UnregisterMimetype` (the `<uninstall>`
step, reverting rows to `text/plain`) runs for real only on a store uninstall,
and its unit tests stand in. An extension the admin has mapped to something else
is left alone on removal, key and file rows both.

## diagrams/view

`features/diagrams/view.feature`

spec: [Platform facts, 5](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#platform-facts-the-design-rests-on) · [Security](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#security)

A DIAGRAM FILE OPENS AS A PICTURE, in Nextcloud's own image viewer, because that
is where every other picture opens. The click is the whole gesture; there is no
"render" button. The Viewer asks the path route below for the picture, so the
route's scenarios are the click's outcome; the lightbox itself is the Viewer's,
and has no scenario of its own.

The Viewer opens it because the app registers a Viewer handler for
`text/x-plantuml`; the menu's "View" entry is the Viewer's own. With no server
set the Viewer still opens, and shows the route's one line — `not set` — where
the picture would be. A failure that is not the route's own (a proxy's error
page, an expired session) is one fixed line, "Could not draw the diagram", as in
the editor.

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

Both scenarios are asked over HTTP as the admin.

### Asking for one diagram of a file

A FILE OF SEVERAL DIAGRAMS DRAWS THE ONE ASKED FOR, by name or by its place
counted from 1, pages included, as the editor's tabs count them; a name wins over
a number. The server splits the file as the tabs do (`lib/Service/Diagrams.php`,
held to `src/editor/blocks.js` by one fixture), from the file as stored, never
from its includes. A name or number the file does not hold is a 404 naming what
was missing (`no diagram named signup`, `no diagram 9`), never the first diagram
in its place: a wrong picture is worse than none. The Viewer draws each of its
tabs this way, by `index` (the 0-based place), which decides when it comes with
a `diagram`.

Both scenarios are asked over HTTP as the admin.

### Saving a diagram file in another format

EXPORT IS A DOWNLOAD of what the Viewer shows: SVG, PNG, PDF, EPS or ASCII art,
the formats the server draws. One diagram is one file, `<file> - <diagram>.<ext>`
(`<file>.<ext>` when the file holds one diagram); several, or every diagram when
none is named, are `<file>.zip`. It is a zip on every system: core's own zip
helper sends macOS a tar. The file is read as the picture route reads it, so it
refuses what that route refuses (404), and a file on a share whose owner forbids
download as well, since an export is a copy of it. A diagram with a mistake
exports with the mistake drawn in, as the server answers it in every format.

A format the server does not draw is a 400, not a 404: the file is there, the
request is wrong. "The request is refused" asserts whichever of the two the last
request should get, so the scenario reads the same for both.

The route takes `diagram[]=` for several diagrams; PHP keeps only the last of a
repeated plain `diagram=`. The Viewer sends `index[]=` (0-based places), which
decides when it comes; the names in the download are the diagrams' own either
way. At most 100 diagrams and 50 MiB per export (413 beyond).

All four scenarios are asked over HTTP as the admin.

## diagrams/edit

`features/diagrams/edit.feature`

spec: [Decisions → Editor engine](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#decisions-taken-in-this-spec) · [The editor choice](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#the-editor-choice-as-it-was-weighed) · [The editor spec](../docs/superpowers/specs/2026-10-14-editor-design.md)

THE DIAGRAM FOLLOWS THE SOURCE. The point of the editor is seeing the picture
change as you type, so a changed source is drawn at once, and the file still
holds what it held: the scenario asserts both halves.

SAVING IS THE ONLY THING THAT TOUCHES THE FILE. The live preview sends text to
the server, never to the file. The editor saves as Text does, by itself: two
seconds after the last change, and at least every 30 seconds while changes keep
coming, through the same guarded PUT as a save asked for. "Without saving" in a
step is the state before that, which the step reaches by never sending the PUT.

The indicator is Text's: one icon button, a check when the file holds the
source, a dot on the check while it does not, a spinner while a save is in
flight; its tooltip says when the last save was. Clicking it, or Ctrl/Cmd+S,
saves at once. Closing saves first. A refused save keeps the editor open on the
conflict line; a save that fails, or still hangs after 10 s, asks before
discarding rather than trapping the user (a read-only share, a full quota).
Leaving the page with unsaved changes gets the browser's own prompt.

A SAVE NEVER OVERWRITES SOMEONE ELSE'S CHANGE. The editor reads the file over
WebDAV with its ETag, `Cache-Control: no-cache` so the browser never answers
from its cache, and writes it back with `If-Match`; a file changed in the
meantime answers 412, the top bar says "Someone else changed this file", and the
file stays as the other person left it. There is no merge: collaboration is what
Text's editor offers and this one gave up for highlighting. The way out is beside
the message until it is used: **Reload** takes their version, confirming first
while there is anything unsaved, and **Save as copy** writes ours to
`<name> (copy).puml` (then `(copy 2)` up to `(copy 9)`) and carries on there.
Autosave stops until one of them (or a save that lands) resolves it, and closing
asks before discarding. A save that fails for any other reason says "Could not
save the file" and is tried again on the next change, not in a loop.

A CHANGE MADE ELSEWHERE IS NOTICED, not waited for at the next save. The editor
asks for the file's ETag alone (a Depth-0 `getetag` PROPFIND) every 10 s while
the page is visible, at once when it is shown or focused again, and on
notify_push's `notify_file` when that app is installed, which then leaves a 60 s
poll behind it. A new ETag with everything saved takes the file in, cursor and
scroll kept, and says "Updated from the file" until the next change; with
anything unsaved it is the conflict above. The editor's own saves carry their
new ETag, so they are no change; a failed look says nothing. The Reload icon in
the bar does the conflict's Reload at any time, asking first only when there is
something to lose.

THE STEPS SEND WHAT THE EDITOR SENDS. A change without saving is the source
posted to `POST /render`, as the right pane posts it; a save is a WebDAV PUT with
`If-Match` and the ETag the file was opened with; a copy is the PUT with
`If-None-Match: *` that **Save as copy** sends first. "Someone else" is a plain
PUT between the opening and the save, stamped a minute ahead with `X-OC-Mtime`,
because two writes in one second on local storage can keep the same ETag. A
change adds one participant, so the changed diagram can be told from the old one.

THE EDITOR KNOWS WHAT THE SERVER KNOWS, and each scenario checks it against the
test server itself, never against a list written down in the suite. The themes
the app offers (`GET /apps/plantuml/themes`) are exactly the ones the server's
own `help themes` lists. A mistake goes on the line before `@enduml`, so its
document line is known; the render route passes on the server's
`X-PlantUML-Diagram-Error` and `X-PlantUML-Diagram-Error-Line`, which counts from
0 at the top of the source, blank lines and comments before `@startuml`
included, so the document line is that number + 1.

Autocomplete has no scenario: what the popup offers is a rule with no I/O, so
each source in `src/editor/completion/` is unit-tested against a real editor
state, and adding one is a file there and a line in its `index.js`. The themes
after `!theme`, the icons after `<&` and the emoji after `<:` are the server's
own (`/themes`, `/icons` from `listopeniconic`, `/emoji` from `emoji` and each
block it names), cached a day per server URL and asked once per page; picking an
icon or an emoji closes its tag. Connectors are offered after a line's first
element and a space, unless that first word is a keyword such as `node` or
`loop`. A `<` there is an arrow, so the Creole tags are offered after any other
`<` in text, except in a `<<stereotype>>`, a `<style>` or `<<` line, or a comment;
`</` offers the closers of the tags still open on the line.

Highlighting has no scenario for the same reason: the PlantUML mode's tokens are
unit-tested, what stays plain included, and every colour is a Nextcloud theme
variable, so the source reads on the light, dark and high-contrast themes.
Creole is marked up only where PlantUML reads text (link labels, notes, legends,
`[ … ]` descriptions, titles, headers, footers, captions), and every `#hex`
colour (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`) and every named colour
(`#Red`, a gradient's parts) is a `ColorLiteral`; the app's own swatch layer
(`src/editor/swatches.js`) puts a swatch before each, a named one as the
configured server draws it (`GET /apps/plantuml/colors`), and keeps only
`@uiw/codemirror-extensions-color`'s base theme. A picked colour is an edit
like any other, so it autosaves.

Validation is the same pattern: one rule per file in `src/editor/lint/`, each a
pure function of the editor state, unit-tested the same way. A diagram opened
without a name is a warning whose **Add name** action names it after the file
(its base name, anything but letters, digits, `_`, `-` and `.` as `_`), and the
name follows a Save as copy. The mistake PlantUML finds is an error on the line
it names, as above. It clears when a render comes back clean. Ctrl/Cmd+Shift+M
lists them in a panel that Escape closes before it closes the editor; F8 steps
through them.

The right pane redraws 300 ms after typing stops, one render at a time, drawing
the SVG inline and sanitised, so a link in the diagram opens in a new tab. When
the server cannot draw, the pane shows the problem (`not set`, `unreachable`,
`not a PlantUML server`) where the diagram was, or "Could not draw the diagram"
for an answer that is neither an image nor the route's own, and the source stays
editable.

The layout has no scenario either. The line between the panes drags from 20% to
80% (arrow keys, Home, End; Enter or a double click halves it) and is remembered
per browser; the source scrolls and its long lines wrap; the diagram is fitted
to its pane, never larger than it is drawn.

The menu entries have no scenario: how the editor is laid out, and Text's own
editor opening a file, are not this app's outcomes to assert. **Edit diagram**
and **Open with text editor** (Text's plain editor, beside ours because some
people want the raw file) are on one diagram in the user's files, never on a
multi-selection and never in the trash. "Edit diagram" hides while no server is
set, since its right pane would have nothing to draw; "Open with text editor"
needs no server and stays. The editor's code is fetched the first time either
the entry or + New opens it, not with every Files page.

AN INCLUDE READS ONLY WHAT MAY BE DOWNLOADED. A view-only share answers "Cannot
read" on its include line, whether the diagram is the user's own beside the share
or inside it, and no word of the shared text reaches the drawing or its headers.
A drawing of a file inside such a share is still allowed: the user may see that
file, so its own text and the files it names may be drawn.

AN OPEN LINKED FILE IS DRAWN BEFORE IT IS SAVED (editor spec R13). The render
takes the open file's text in place of the saved one, but only for a file the
user may already read: it cannot stand in for a missing file, and it cannot turn
a view-only share into a readable one. The open file itself still reads, since
the user may view it; only what its new text reaches loses the owner's rights.

## diagrams/create

`features/diagrams/create.feature`

spec: [Rulings](../docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md#rulings-from-dr-k-2026-10-13)

A NEW DIAGRAM HOLDS AN EMPTY DIAGRAM — `@startuml`, a blank line, `@enduml` —
rather than nothing, so the file opens ready to write in and the right pane has
something to draw from the first keystroke.

THE SERVER WRITES THOSE LINES. Files' own create endpoint makes the file and
`NewDiagramListener` fills it, so the + New entry and any other client that asks
Nextcloud for a new `.puml` get the same file. A file made from a template, or
one that already holds something, is left alone; blank means empty or
whitespace only, because object storage writes a new empty file as one space.
The step asks that endpoint, as the + New entry does, for `New diagram.puml` in
the folder.

Choosing **UML Diagram** creates `New diagram.puml` (`New diagram (1).puml` when that
is taken) and opens the editor on it, because nobody creates a diagram in order
not to edit it; the name is given with Nextcloud's own rename.
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

A fence is found by its place: the README's fences are counted in order, a
mermaid one included, and the code block Text drew at the same place is drawn
only when its text is that fence's source. Anything that shifts the count, such
as an indented code block or a fence inside a blockquote (`> ```plantuml`), which
Text draws and the scanner does not see, leaves the block as Text drew it rather
than putting the wrong diagram there. When the server cannot draw, the README
shows Text's own rendering and says nothing; the problem is the admin card's to
name.

The workspace is Text's editor, so a drawn fence's source is still in its
document, hidden. Its `<pre>` and `<code>` are made non-editable, and made so again
whenever Text resets them, so the caret cannot change source nobody can see; this
was checked in a browser on the live instance on 2026-10-14 (#11).

An image is a diagram when its path ends in `.puml`, resolved against the README's
folder; the steps join the two plainly and use no `./` or `../`. Markdown ends a
link at a bare space, so a file name with one is written
`![Order flow](<Order flow.puml>)` or `![Order flow](Order%20flow.puml)`;
`![Order flow](Order flow.puml)` is text.

THE STEPS READ THE README AS THE OBSERVER DOES: its text over WebDAV, a fence
found by `src/readme/markdown.js`'s rule and drawn through `POST /render`, an
image's destination resolved against the README's folder and drawn through
`GET /render?path=…`. Where the drawing lands in Text's page is checked by hand.

## Known limitations and next

What the reviews and the live checks deferred. None changes a scenario; each is
work for a later round, or a call for Dr K.

* **What only a page shows.** The Behat leg sees HTTP, never a page: the
  Viewer's lightbox, the editor's layout, highlighting, colour picker and change
  watcher, and where a README's drawing lands are unit-tested and checked by
  hand on the live instance.
* **A hung check has no timeout.** A PROPFIND or GET that never answers holds
  the editor's one file operation, so Save, Reload and Save as copy wait behind
  it; closing still exits through its 10 s prompt.
* **`@nextcloud/notify_push` costs ~20.6 kB gzip** (it brings axios) in the
  editor bundle, and the live instance has no notify_push app, so only the poll
  has run there. Keeping it is Dr K's call.
* **Links in the diagram are hidden from screen readers.** The pane is one
  `role="img"`, so its links can be tabbed to but are not announced.
* **The Viewer and the README draw an `<img>`**, so a diagram's links work only
  in the editor.
* **The colour picker** gives a named colour (`#Red`) no swatch, and a pick
  drops the alpha of `#RRGGBBAA` or `#RGBA`: the library writes `#rrggbb`.
* **Creole `--strike--` and `~~wave~~` are not highlighted**; they read as the
  links `--` and `~~`.
* **A line ending in `[`**, as a JSON diagram's can, opens a `[ … ]` description,
  so the lines after it are highlighted as Creole until a line starts with `]`.
* **The first `<:` of a day waits ~9 s** while the server lists its emoji block
  by block; after that the list is cached a day.
* **While a `<<stereotype>>` is typed**, its first `<` briefly opens the Creole tag list.
* **The README observer reads Text's DOM**, so a Text upgrade can break it with
  no test noticing; the exit is an upstream Text hook for fences.

Proposed, not agreed: a fit / 100% toggle for the diagram (editor spec L6);
`skinparam` completion from the server's `skinparameters` (C5); a pane
background that follows the theme, since dark PlantUML themes such as superhero
leave the diagram transparent (D2); the inline SVG in the Viewer and the README;
named colours in the picker; a diff of the two versions in the conflict state
(`@codemirror/merge`). Two scenarios await Dr K: "Asking for the server's icons"
and "Asking for the server's emoji".
