<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# nextcloud-plantuml — the editor

The **Edit diagram** overlay is a PlantUML source editor next to a live diagram. It grew in
small rounds on 2026-10-14 from Dr K using it. This spec collects each requirement in one
place, so none of the details from those rounds gets lost. It sits beside the app spec
(`2026-10-13-nextcloud-plantuml-design.md`), which still covers the server side, the routes
and the Files integration.

The standing goal: **use what Nextcloud and CodeMirror already provide** before writing
anything by hand.

## Requirements

Status: **shipped** (with its PR), **building** (on a branch), or **proposed** (an idea Dr K
raised or was offered, not yet agreed).

### Layout

| # | Requirement | Source | Status |
|---|---|---|---|
| L1 | Full-screen overlay over Files. A 50 px bar holds the file icon, the name, the save state, Reload and close. Under it, source on the left and diagram on the right. | design | shipped (#4) |
| L2 | The line between the panes can be dragged from 20% to 80%. It is a WAI-ARIA separator: arrow keys move it 5%, Home and End go to the ends, and Enter or a double click puts it back to half. The split is remembered per browser. | Dr K | shipped (#23) |
| L3 | A long source scrolls inside its pane, and the overlay never grows past the screen. | Dr K | shipped (#26) |
| L4 | The diagram is fitted to its pane, so all of it is always visible. | Dr K | shipped (#26) |
| L5 | Long lines wrap, so there is no sideways scrollbar. | Dr K | shipped (#25) |
| L6 | A way to see the diagram at its real size (a fit / 100% toggle, maybe zoom), as PlantUML's own web editor offers. | Dr K pointed at PlantUML's editor | proposed |

### Saving

| # | Requirement | Source | Status |
|---|---|---|---|
| S1 | Save on Ctrl/Cmd+S, through `If-Match` with the ETag last read or written. | design | shipped (#4) |
| S2 | Autosave 2 s after the last change, and at most 30 s after the first unsaved one. | Dr K, after Text | shipped (#21) |
| S3 | Text's indicator: one flat icon button. A check means saved, a check with a primary dot means unsaved, a spinner means saving. The `title` says when it last saved ("Saved just now", "… N min ago", "… N h ago"). A click saves now. | Dr K, after Text | shipped (#21) |
| S4 | Close saves first, then closes. If that save is refused, the editor stays on the conflict line. If it fails or hangs for 10 s, it asks "Discard unsaved changes?". Once closed, nothing more is ever sent. | review | shipped (#21) |
| S5 | Leaving the page with unsaved changes gets the browser's own prompt. | design | shipped (#21) |
| S6 | Someone else's change (412) stops autosave and shows "Someone else changed this file" with **Reload** and **Save as copy**. | design | shipped (#15) |
| S7 | A new diagram's `@startuml`/`@enduml` come from the server (`NewDiagramListener` on Files' create endpoint), so a click and an API call make the same file. On S3 object storage a new file is one space, which counts as blank. | Dr K | shipped (#18, #19) |

### Changes made elsewhere

| # | Requirement | Source | Status |
|---|---|---|---|
| E1 | The editor notices when the file changed elsewhere (VS Code over WebDAV, another browser) without closing. It uses `@nextcloud/notify_push` when that app is installed, otherwise it polls the ETag every 10 s and whenever the page becomes visible again. | Dr K | shipped (#28) |
| E2 | A clean editor quietly loads the new version and keeps the cursor and scroll position. A dirty editor goes into the S6 conflict state. | Dr K | shipped (#28) |
| E3 | A **Reload** button that is always there, not only in a conflict. It confirms first when there are unsaved changes. | Dr K | shipped (#28) |

### Highlighting

| # | Requirement | Source | Status |
|---|---|---|---|
| H1 | Every colour comes from Nextcloud's theme variables, so light, dark and high contrast all work. No literals; the theme test enforces this. | Dr K (black on black) | shipped (#18, #20) |
| H2 | Tokens: `@startuml`/`@enduml` bold primary; keywords bold `--color-info-text`; strings `--color-element-success` pulled toward the text; arrows and links `--color-element-warning` pulled toward the text; comments grey italic. | design | shipped |
| H3 | Every link is coloured: `--`, `..`, `~~` and `==`, headed ones, placed ones (`-up->`) and styled ones (`-[hidden]-`). An `o` or `x` head never runs into a word, so `.org` in a URL is not an arrow. | Dr K | shipped (#24, #25) |
| H4 | A link's label (after the `:`) is italic violet, the one hue no other token uses: error red mixed with primary blue, pulled 15% toward the text. That measures #9083ac (5.1:1) on dark and #5b3148 (10.7:1) on light. | Dr K | shipped (#24, #25) |
| H5 | `== separators ==` and `... delays ...` are quiet bold headings, not two links. | follows from H3 | shipped (#24) |
| H6 | Active line and its gutter number tinted translucently, so a selection still shows. The selection is the primary colour at a third. | review | shipped (#21) |
| H7 | Core's `server.css` styles every `div[contenteditable]` as a form input, and `files_bpm` sets `color: #000` on it. `.cm-content` resets both. | live check | shipped (#20, #21) |
| H8 | Creole is highlighted where PlantUML reads text: a link's label, a note after its colon or down to `end note` (and `hnote`, `rnote`), a legend, a `[ … ]` description, and a title, header, footer or caption on its line or down to its `end`. Bold, italic, monospace and underline change the font only, so a label keeps its violet. `[[links]]` are underlined in a primary tint. Tags (`<size:N>`, `<color:…>`, `<b>`, `<&icon>`, `<:emoji:>`, `<img:…>`) and table bars are grey (`--color-text-maxcontrast`), and `----`, `....` and `====` rules are headings. `--strike--` and `~~wave~~` are left as text, because they read as the links `--` and `~~`. A label, a styled link or a one-line note never runs on into the next line. | Dr K | shipped (#33) |

### Completion

| # | Requirement | Source | Status |
|---|---|---|---|
| C1 | `src/editor/completion/` has one module per source. Each is registered with its own `plantumlMode.data.of({ autocomplete })`, so adding a source means adding a file and one line. | Dr K: "a pattern we can expand on" | shipped (#21) |
| C2 | Sources: `@start…`/`@end…` directives; `!theme`, `!include`, `!define`, `!pragma`; line-start keywords, including two-word ones (`end fork`); names already in the diagram; snippets with tab-stops (`alt`, `loop`, `note`, `class`, `if`). | Dr K | shipped (#21, #22) |
| C3 | After `!theme `, only the themes the server ships, read from `GET /apps/plantuml/themes` (PlantUML's `help themes`, cached for a day per server URL). | Dr K | shipped (#22) |
| C4 | After a name and a space, the connectors (19, each with what it draws). After a keyword, nothing. Picking one adds a space and opens the names. | Dr K | shipped (#22) |
| C5 | `skinparam` completion. PlantUML's `skinparameters` command lists every name the server knows, so this can use the same route-and-cache pattern as C3. | Dr K asked | proposed |
| C6 | A colour picker on `#hex` colours, from `@uiw/codemirror-extensions-color` (4.25.12, MIT). The mode names every `#RGB`, `#RGBA`, `#RRGGBB` and `#RRGGBBAA` a `ColorLiteral`, the CSS node name the library looks for: skinparam values, element colours, a styled link's brackets (`-[#FF6F61,bold]->`, read in pieces) and `<color:…>`/`<back:…>`. A swatch sits before each one, and a pick writes the colour back as `#rrggbb`, which PlantUML takes. Named colours (`#Red`) are a follow-up, because the library knows only lowercase CSS names. | Dr K asked | shipped (#33) |
| C7 | Creole completion. After `<` in text, the tags as snippets (`<size:12>`, `<color:#>`, `<b>…</b>`, …); after `</`, the closers of the tags still open on the line. After `<&`, the server's OpenIconic icons (`GET /apps/plantuml/icons`, from `listopeniconic` drawn as SVG); after `<:`, its emoji (`GET /apps/plantuml/emoji`, from `emoji` and then each block it names, as text). Both cached a day per server URL like C3. Not in a `<<stereotype>>`, a `<style>` line, a comment, or where an arrow is due (`A <- B`). | Dr K | shipped (#31) |

### Validation

| # | Requirement | Source | Status |
|---|---|---|---|
| V1 | `src/editor/lint/` has one module per rule, and each rule is a pure `(state) => Diagnostic[]`. Wavy underline, gutter mark, Ctrl/Cmd+Shift+M for the panel, F8 to step through. | Dr K: "like VS Code" | shipped (#22) |
| V2 | An unnamed `@startuml` (and the other `@start…`) is a warning. **Add name** inserts the file's base name, read when clicked. | Dr K | shipped (#22) |
| V3 | PlantUML's own syntax error is an error on its line. The render routes forward `X-PlantUML-Diagram-Error` and `-Line`. The line is 0-based from the top of the whole source, so the document line is the header + 1. It clears on a clean render. | Dr K | shipped (#22) |

### Keyboard

| # | Requirement | Source | Status |
|---|---|---|---|
| K1 | Escape closes whatever CodeMirror has open first: completion, search, the lint panel, a snippet, a selection. Only then does it close the editor, after saving. | review | shipped (#21, #22) |
| K2 | Ctrl/Cmd+F search with replace; Ctrl/Cmd+/ toggles a comment; Tab indents; brackets and `"` auto-close (`'` starts a comment, so it never does). | design | shipped (#21) |

### The diagram itself

| # | Requirement | Source | Status |
|---|---|---|---|
| D1 | `[[url label]]` links and `[[url{tooltip} label]]` render as real SVG links. The editor draws the server's SVG inline (`src/editor/inline-svg.js`): DOMPurify keeps SVG and its filters and drops scripts, `<style>`, `foreignObject` and handlers; a link keeps only an http, https or mailto address and opens in a new tab; nothing may load from outside (`url()` and `href` name the diagram's own ids or a `data:` image); ids are prefixed so two diagrams never clash. The Viewer and the README still show an `<img>`. | Dr K asked | shipped (#30) |
| D2 | Themes made for a dark page (superhero, cyborg, …) leave the background transparent, so their light text vanishes on our white pane. Either `skinparam backgroundColor` in the diagram, or a pane background that follows the theme. | Dr K hit it | proposed |

## Building blocks

- **CodeMirror, official.** `@codemirror/view`, `state`, `commands`, `language`, `legacy-modes` (simple-mode), `autocomplete`, `search` and `lint`.
- **CodeMirror, community.** Before hand-coding, check <https://codemirror.net/docs/extensions/> and npm. These were checked for activity on 2026-10-14:
  - `@uiw/codemirror-extensions-color`, the colour picker (C6). It imports `@babel/runtime` helpers without declaring them, so the app depends on `@babel/runtime` 7 itself;
  - `@replit/codemirror-indentation-markers`;
  - `@replit/codemirror-minimap`;
  - `@codemirror/merge`, a side-by-side diff that would make S6 show what differs;
  - `@nextcloud/notify_push`, for E1.

  Every one of them has had a release in the last year (see `avoid abandoned projects`).
- **Nextcloud.** Theme CSS variables (`--color-*`), core's `icon-loading-small`, `@nextcloud/files/dav`, `@nextcloud/axios`, `@nextcloud/event-bus`, Files' template create endpoint, and the Viewer.

## Traps found in the live instance

- **Asset caching.** App scripts are cached for six months under `?v=`, which changes only with an app version. The lazy editor URL carries `&h=<build hash>`. Page-load bundles and CSS need one hard refresh after a hand deploy.
- **Route caching.** The route table lives in APCu in the web server. A new route can answer 404 long after the 3600 s TTL. `apachectl -k graceful` fixes it.
- **Object storage.** S3 writes a space for an empty file (S7). In CI, on local storage, two writes in the same second can keep the same ETag, so a conflict test stamps `X-OC-Mtime`.
- **Driving the browser.** A selenium key press must target `.cm-content`. A bare Enter reaches Files underneath and opens the Viewer.

## Testing

- **Unit tests (vitest).** Every module is unit-tested against a real `EditorState`. That covers each completion source, each lint rule, the mode's tokens (including what must stay plain), the theme (no colour literals, every token coloured), autosave timing on fake timers, and the splitter.
- **Through the editor.** `tests/js/editor.test.js` drives the whole editor with the DAV and render seams mocked.
- **Behat.** It covers what goes over HTTP: save, conflict, copy, create, the themes route, and the error line. Layout and colour can only be checked in a live browser. Each round was checked in a clean selenium profile on both themes.

## Decisions

| Decision | Why |
|---|---|
| Autosave on 2 s idle and 30 s max, after Text | Text saves a few seconds after typing, and Dr K asked for the same |
| Themes, skinparams, icons and emoji come from the server, never a fixed list | The list follows the server's version; even the emoji blocks are the ones `emoji` names |
| One file per completion source and per lint rule | Dr K asked for a pattern to grow |
| Labels in violet, not a primary tint | The primary tint read near white on dark; violet is the one free hue (H4) |
| Fit the diagram by default | Dr K: "it should auto fit so it's always visible" |
| Poll first, `notify_push` when present | The live instance has no `notify_push`, and the client library says when push is unavailable |
