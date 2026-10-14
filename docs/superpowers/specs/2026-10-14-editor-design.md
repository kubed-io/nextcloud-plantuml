<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# nextcloud-plantuml — the editor

The **Edit diagram** overlay is a PlantUML source editor next to a live diagram. It grew in
small rounds on 2026-10-14 from Dr K using it. This spec collects each requirement in one
place, so none of the details from those rounds gets lost: a reader should be able to rebuild
the editor's behaviour from it alone. It sits beside the app spec
(`2026-10-13-nextcloud-plantuml-design.md`), which still covers the server side, the routes
and the Files integration.

The standing goal: **use what Nextcloud and CodeMirror already provide** before writing
anything by hand.

## Requirements

Status: **shipped** (with its PRs), **building** (on a branch), or **proposed** (an idea Dr K
raised or was offered, not yet agreed). Every colour below is a Nextcloud variable; a
"pulled toward the text" colour is `color-mix(in srgb, var(<variable>) 75%, var(--color-main-text))`
unless a share is given.

### Opening

| # | Requirement | Source | Status |
|---|---|---|---|
| O1 | **Edit diagram** is offered on one diagram file in the user's own files, and only once a PlantUML server is configured. **+ New → UML Diagram** opens the editor on the file the server just wrote (S7). | design | shipped (#3, #18) |
| O2 | The editor is its own bundle, added to the page the first time Edit diagram or + New needs it, then reused. Its URL carries the Files bundle's `?v=` and `&h=<build hash>` (the first 12 hex digits of the editor bundle's SHA-256), so a new build always reaches the browser. If the bundle fails to load, or loads without defining the editor, the Viewer opens the diagram instead and the next open tries the bundle again. Its stylesheet (`css/editor.css`) loads with the Files page. | review | shipped (#15, #20) |
| O3 | One editor at a time: a second open while one is showing does nothing. The overlay is a `role="dialog"` `aria-modal` named after the file, and every sibling of it in `<body>` gets `inert`, so Tab and clicks never reach Files. Focus goes to the source once loaded, and back to the element that opened it on close. | design | shipped (#4) |
| O4 | A file that cannot be read shows "Could not open the file" in the bar, with no source pane, and close still works. | design | shipped (#4) |

### Layout

| # | Requirement | Source | Status |
|---|---|---|---|
| L1 | Full-screen overlay over Files (`position: fixed; inset: 0`, z-index 9998, NcModal's layer). A 50 px bar (padding `0 12px 0 20px`, gap 12 px, a bottom border) holds, in order: the PlantUML file icon (24 px, primary), the name (16 px bold, one line, ellipsis), the status line (`role="status"`, `--color-text-maxcontrast`), **Reload** and **Save as copy** (pill buttons in `--color-primary-element-light`, shown only in a conflict), the Reload icon (E3), the save indicator (S3) and close. The icon buttons are round, `--default-clickable-area` square, transparent, `--color-background-hover` on hover and a 2 px primary outline on keyboard focus. The Reload icon and the save indicator appear once the file is loaded. Under the bar, source on the left and diagram on the right. | design | shipped (#4, #21, #28) |
| L2 | The line between the panes is a WAI-ARIA separator (`role="separator"`, focusable, `aria-orientation="vertical"`, `aria-valuemin` 20, `aria-valuemax` 80, `aria-valuenow`, `aria-controls` the source pane, labelled "Resize the source and the diagram"). A drag with the primary button follows the pointer between 20% and 80%; ←/→ move it 5%, Home and End go to 20% and 80%, and Enter or a double click puts it back to 50%. It writes the source pane's share to `--plantuml-split`. The share is stored in `localStorage` under `plantuml.editor.split` when a drag is let go, on a key and on a double click; a stored value outside 20–80, or storage that throws, opens at 50%. It is a 9 px grab area drawing a 1 px `--color-border-dark` line (primary while hovered or dragged) and a 5 × 36 px `--color-border-maxcontrast` pill while hovered, focused or dragged. While dragging, both panes show the resize cursor and select no text. | Dr K | shipped (#23) |
| L3 | The panes are one grid row of exactly the space left (`grid-template-rows: minmax(0, 1fr)`; columns `minmax(0, var(--plantuml-split, 50%)) 9px minmax(0, 1fr)`). A long source scrolls inside its pane, and the overlay never grows past the screen. | Dr K | shipped (#26) |
| L4 | The diagram is fitted to its pane, so all of it is always visible: centred, `max-width`/`max-height` 100%, `preserveAspectRatio="xMidYMid meet"`. The SVG's `width`/`height` attributes stay as its natural size, so a small diagram never grows past it; the inline style's width and height are removed, since they would beat the stylesheet. The pane has 20 px padding and scrolls if ever needed. | Dr K | shipped (#26, #30) |
| L5 | Long lines wrap (`EditorView.lineWrapping`), always, so the source never scrolls sideways. | Dr K: "let's just always wordwrap" | shipped (#25) |
| L6 | A way to see the diagram at its real size (a fit / 100% toggle, maybe zoom), as PlantUML's own web editor offers. | Dr K pointed at PlantUML's editor | proposed |
| L7 | The source pane: 14 px system monospace (`ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`), line height 1.7, 20 px above and below the text, 16 px either side of each line. The line-number gutter is at least 52 px, on `--color-background-hover`, numbers in `--color-text-maxcontrast`, no border. | design | shipped (#4) |

### Saving

| # | Requirement | Source | Status |
|---|---|---|---|
| S1 | Save on Ctrl/Cmd+S (never the browser's "Save page as") or a click on the indicator: a WebDAV `PUT` with `If-Match` and the ETag last read or written. The new ETag comes from the PUT's `ETag` header, else `OC-ETag`; an answer with neither is an error, never a conflict, so the next save never sends `If-Match: null`. | design | shipped (#4) |
| S2 | Autosave 2 s after the last change, and at most 30 s after the first unsaved one; each autosave starts a new 30 s window. | Dr K: "auto save … after some inactivity" | shipped (#21) |
| S3 | Text's indicator: one flat icon button labelled "Save". A check means saved; a check with an 8 px primary dot (ringed in the background colour) means unsaved; core's `icon-loading-small` spinner in place of the check means saving. Its `title` reads "Saved" before this editor has written anything, then "Saved just now" under a minute, "Saved N min ago" under an hour, "Saved N h ago" after, refreshed every 30 s; while unsaved or saving it reads "Unsaved changes". A click saves now. | Dr K, after Text | shipped (#21) |
| S4 | Close (the × or Escape, K1) saves first, then closes. It keeps saving until the file holds the source, a change typed meanwhile included, waiting out any operation in flight. If that save is refused (412), the editor stays open on the conflict line. If it fails, or 10 s pass with a save hanging, it asks "Discard unsaved changes?"; Cancel stays open. A close after a failed or refused save asks at once, without saving again. Once closed, nothing more is ever sent: the watcher, the timers and any waiting render stop, and a hanging save that settles later writes nothing more. | review | shipped (#21) |
| S5 | Leaving the page with unsaved changes gets the browser's own prompt (`beforeunload`). | design | shipped (#21) |
| S6 | Someone else's change (412) stops autosave and shows "Someone else changed this file", which stays as the source changes, with **Reload** and **Save as copy**. While it lasts, Save, Ctrl/Cmd+S and autosave write nothing and the watcher looks no more; only Reload or Save as copy ends it. Reload asks "Replace your changes with the saved file?" when anything is unsaved, then takes the file and its ETag. | design | shipped (#4, #15) |
| S7 | A new diagram's `@startuml`/`@enduml` come from the server (`NewDiagramListener` on Files' create endpoint), so a click and an API call make the same file. On S3 object storage a new file is one space, which counts as blank. | Dr K: "Shouldn't the backend do that?" | shipped (#18, #19) |
| S8 | **Save as copy** writes the source to `<name> (copy).<ext>` beside the file, else `(copy 2)` up to `(copy 9)`, each with `If-None-Match: *` so a taken name answers 412 and is never overwritten; after `(copy 9)` it gives up. The copy is announced to Files (`files:node:created`), and the editor carries on in it: the title, the overlay's and the diagram's names, V2's file name and the ETag all become the copy's. A copy that fails, for that or any reason, says "Could not save a copy" and keeps both buttons; if only reading the copy back fails, the copy exists all the same. | design | shipped (#15) |
| S9 | One file operation at a time (save, Reload, Save as copy, a watcher check). An operation asked for while another (not a check) runs is dropped, and a change left unsaved is autosaved 2 s after that one ends. A check gives way: it is skipped while anything runs, and anything else waits it out. A check shows no spinner; any other operation shows the spinner and disables Reload, Save as copy and the Reload icon (the icon without dimming, so autosave never makes it flicker). | review | shipped (#21, #28) |
| S10 | A save that fails for any reason but a 412 says "Could not save the file" and stops autosave until the next change, which clears the line and tries again. A failed Reload says "Could not open the file". Each is also logged with `console.error`. | design | shipped (#4, #21) |

### Changes made elsewhere

| # | Requirement | Source | Status |
|---|---|---|---|
| E1 | The editor notices when the file changed elsewhere (VS Code over WebDAV, another browser) without closing. A check is a `PROPFIND` for `getetag` alone (the quotes the client strips are put back). It runs every 10 s while the page is visible, at once when the page is shown again (`visibilitychange`) or the window gets the focus back, and never while the page is hidden. With `@nextcloud/notify_push` available, every `notify_file` push (any change to the user's files; it names no file) runs a check and the clock slows to once a minute; `listen()` is asked once per page. Two checks never overlap: one asked for meanwhile runs once after. A failed check goes to `console.debug` only, and the bar says nothing. | Dr K | shipped (#28) |
| E2 | A matching ETag, our own save's included, is no change. A clean editor then reads the file and replaces only the stretch that differs, so the cursor and the scroll position stay; the change is kept out of the undo history, the indicator's "Saved …" keeps our last save, and when the text differed the bar says "Updated from the file" until the next change. A dirty editor, or one typed into while the file loaded, goes into the S6 conflict state. No check runs while closing or in a conflict. | Dr K | shipped (#28) |
| E3 | A Reload icon (refresh, labelled and titled "Reload from the file") that is always in the bar, not only in a conflict. It asks "Replace your changes with the saved file?" first when anything is unsaved, and is otherwise S6's Reload. Unlike E2's take-in, a Reload is an ordinary edit in the undo history. | Dr K | shipped (#28) |
| E4 | Every read of the file sends `Cache-Control: no-cache`. Nextcloud sends no `Cache-Control` with a file, so a browser may answer from its cache for a tenth of the file's age and a changed file reads back stale. | live check | shipped (#29) |

### Highlighting

| # | Requirement | Source | Status |
|---|---|---|---|
| H1 | Every colour comes from Nextcloud's theme variables, so light, dark and high contrast all work. No literals: `tests/js/theme.test.js` fails on any hex, `rgb()`, `hsl()`, `white` or `black` in the highlight style or the surface rules. | Dr K (black on black) | shipped (#18, #20) |
| H2 | The mode is a `simple-mode` table ported from Prism's `plant-uml` grammar (v1.30.0, MIT). Tokens: a `!` preprocessor line, whole, is bold `--color-primary-element`; `@startuml`/`@enduml` and line-start keywords (the mode's list, two-word ones such as `end note`, `abstract class` included; indentation stays plain) are bold `--color-info-text`, as are `as`, `is` and `then` inside a line and `elseif`, `equals`, `not`, `while` before `(`; `"strings"` are `--color-element-success` pulled toward the text; arrows and links are `--color-element-warning` pulled toward the text; `'` line comments and `/' … '/` block comments (across lines) are `--color-text-maxcontrast` italic. Names, times, variables and other punctuation stay plain, and so do the other `@start…` lines. (The `*-success-text`/`*-warning-text` variables are near white on dark, made for status chips, hence the mix.) | design | shipped (#18, #20) |
| H3 | Every link is coloured: `--`, `..`, `~~` and `==`, headed ones (`->`, `-->`, `->>`, `..>`, `o->`, `==>`, `~~>`, …), placed ones (`-up->`, `.left.`) and styled ones (`-[hidden]-`). A styled link is read in pieces: the strokes and brackets are links, a hex colour is a `ColorLiteral` (C6), and every other part (`bold`, `dashed`, `thickness=2`, `#red`) is `--color-element-warning` pulled toward the text. An `o` or `x` head never runs into a word, so `.org` in a URL is not an arrow, while `--o` and `..x` are. | Dr K | shipped (#24, #25) |
| H4 | A link's label (after the `:`) is italic violet, the one hue no other token uses: `--color-element-error` mixed half and half with `--color-primary-element`, pulled 15% toward the text (`color-mix(in srgb, color-mix(in srgb, var(--color-element-error) 50%, var(--color-primary-element)) 85%, var(--color-main-text))`). That measures #9083ac (5.1:1) on dark and #5b3148 (10.7:1) on light. | Dr K | shipped (#24, #25) |
| H5 | `== separators ==` and `...` delays (alone or `... 5 minutes later ...`) are quiet bold headings (`--color-text-maxcontrast`), not two links. | follows from H3 | shipped (#24) |
| H6 | The active line is tinted with the text colour at 6%, and its gutter number is in the text colour on a 10% tint, translucent so a selection still shows. The selection is `--color-primary-element` at 35% (`--color-primary-element-light` is near-black navy on dark). The cursor is the text colour. With the editor focused, a matching bracket is outlined 1 px in primary and a non-matching one in `--color-element-error`. Other occurrences of the selected text get a 12% primary ground and a 50% primary outline; the selection itself gets neither. | review | shipped (#21) |
| H7 | Core's `server.css` styles every `div[contenteditable]` as a form input (border, radius, margin, font, pointer, a 130 px width), and `files_bpm` sets `color: #000` on it. `div.cm-content` and its `:hover`/`:focus`/`:active` states reset all of it (the `div.` matches core's `(0,3,1)` specificity), with the text colour set on `.cm-content` itself. | live check | shipped (#20, #21) |
| H8 | Creole is highlighted where PlantUML reads text: a link's label; a note after its colon, or from `note`/`hnote`/`rnote` alone on its line down to `end note` (`endnote`, `end hnote`, `endrnote`); a legend down to `end legend`; a `[ … ]` description from a line ending in `[` to a line starting with `]`; `title`, `header` or `footer` alone on its line down to its `end …`; and `title`, `header`, `footer` or `caption` with text, on that line. The rest of a note's or legend's opening line keeps a hex colour and `as`/`is`/`then`. A quoted note (`note "x" as N`) stays plain. Bold (`**`), italic (`//`), monospace (`""`, the monospace face on an 8% text-colour ground) and underline (`__`) change the font only, so a label keeps its violet; a URL's `//` starts no italics. `[[links]]` are primary pulled toward the text, underlined. Tags (`<b>`, `<i>`, `<u>`, `<s>`, `<w>`, `<plain>`, `<sub>`, `<sup>`, `<size…>`, `<font…>`, `<color…>`, `<back…>` and their closers, `<&icon>`, `<:emoji:>`, `<img:…>`) and table bars (`\|`, `\|=`) are `--color-text-maxcontrast`; a hex colour in `<color:…>`/`<back:…>` is a `ColorLiteral`. In a body, a `----`, `....` or `====` rule (four or more) is a heading. `--strike--` and `~~wave~~` are left as text, because they read as the links `--` and `~~`. A label, a styled link, a one-line note or title never runs on into the next line. | Dr K | shipped (#33) |

Measured contrast of each highlight colour against the page, from the live instance's theme
values (light: page `#ffffff`, text `#222222`; dark: page `#171717`, text `#ebebeb`; primary
`#00679e` / `#0091f2`). Every one passes WCAG AA for normal text (4.5:1).

| Token | Light | Dark |
|---|---|---|
| plain text | `#222222` 15.9:1 | `#ebebeb` 15.0:1 |
| keyword, `@startuml` | `#0066ac` 6.0:1 | `#00aeff` 7.3:1 |
| `!` preprocessor (meta) | `#00679e` 6.1:1 | `#0091f2` 5.4:1 |
| string, `ColorLiteral` | `#0f800c` 5.1:1 | `#6bb55f` 7.2:1 |
| arrow, link, attribute | `#986308` 5.1:1 | `#fad43b` 12.4:1 |
| comment, tag, rule | `#6b6b6b` 5.3:1 | `#999999` 6.3:1 |
| label (H4) | `#5b3148` 10.7:1 | `#9083ac` 5.1:1 |

### Completion

| # | Requirement | Source | Status |
|---|---|---|---|
| C1 | `src/editor/completion/` has one module per source, each a function of a `CompletionContext`. Each is registered with its own `plantumlMode.data.of({ autocomplete })`, so adding a source means adding a file and one line in `sources`. Order: directives, keywords, names, snippets, themes, connectors, creole, icons, emoji. `autocompletion()` binds Ctrl-Space (Alt-\` and Alt-I on macOS), ↑/↓, PageUp/PageDown, Enter to accept and Escape to close, and leaves Tab alone. The popup is a Nextcloud popover (border, `--border-radius-large`, shadow), its list monospace and at most 16em tall, the selected row `--color-primary-element-light`. Each kind shows a letter in its token's colour: `k` keyword (info text), `x` name and `c` server list entry (success, pulled), `{ }` snippet and `→` connector (warning, pulled). | Dr K: "a pattern we can expand on" | shipped (#21, #22) |
| C2 | **Directives**: after `@` at the start of a line (after any indentation), the twelve `@start…`/`@end…` lines for `uml`, `mindmap`, `gantt`, `json`, `yaml` and `wbs`; after `!` there, `!theme`, `!include`, `!define` and `!pragma`, each inserted with a trailing space. **Keywords**: the first word of a line only, once a letter is typed (any time on Ctrl-Space): sequence participants, class/component/state elements, sequence and activity words, with a detail for `alt`, `opt`, `par`, `ref`, `autonumber`, `skinparam`; a two-word keyword (`end fork`) keeps offering after its space. **Names**: anywhere a word is typed (or on Ctrl-Space), each declared participant or element (its alias when it has one) and both ends of every arrow, never the word being typed; not on a `'`, `@` or `!` line, inside a string, in an arrow's message after its `:`, or in a Creole tag, icon or emoji. **Snippets**, at the start of a line, with tab-stops (Tab to the next field, Shift-Tab back, Escape leaves them): `note right of participant … end note`, `alt … else … end`, `loop … end`, `class Name { }`, `if (…) then (…) else (…) endif`. | Dr K | shipped (#21) |
| C3 | After `!theme ` at the start of a line, only the themes the server ships, read from `GET /apps/plantuml/themes` (PlantUML's `help themes`, at most 200). | Dr K | shipped (#22) |
| C4 | After the first element of a line and a space, or over a connector half typed (starting with `-`, `.`, `~`, `=`, `<`, `*` or `o`), the 19 connectors, commonest first, each with what it draws: `-->` dashed arrow, `->` arrow, `--` solid line, `..` dotted, `~~` wavy, `==` bold, `<-`, `<--` backwards, `<->` both ways, `->>` async, `--\|>` extends, `..\|>` implements, `*--` composition, `o--` aggregation, `-up->`/`-down->`/`-left->`/`-right->` placed, `-[hidden]-` invisible, for layout. An element is a word, a `"quoted name"`, a `[component]`, a `(use case)` or an `:actor:`. After a keyword, nothing. Picking one adds a space and opens the names. | Dr K | shipped (#22) |
| C5 | `skinparam` completion. PlantUML's `skinparameters` command lists every name the server knows, so this can use the same route-and-cache pattern as C3. | Dr K asked | proposed |
| C6 | A colour picker on hex colours, from `@uiw/codemirror-extensions-color` (4.25.12, MIT). The mode names every `#RGB`, `#RGBA`, `#RRGGBB` and `#RRGGBBAA` not followed by a word character a `ColorLiteral`, the CSS node name the library looks for, highlighted like a string: skinparam values, element colours (`#FF0000;line:red` gives the hex alone), a styled link's brackets (`-[#FF6F61,bold]->`) and `<color:…>`/`<back:…>`. `#Red`, `#ABCDE` and `#line:red` are not colours. A swatch (0.9em, `--border-radius-small`, a 1 px `--color-border-maxcontrast` outline, core's margin and 30 px input height taken back) sits before each one in view, and a pick rewrites it in place as `#rrggbb`, which PlantUML takes. | Dr K: "check for existing libs" | shipped (#33) |
| C7 | Creole completion. After `<` anywhere on a line, the 13 tags as snippets (`<b>…</b>`, `<i>`, `<u>`, `<s>` strike-through, `<w>` wavy underline, `<size:12>` with 12 selected, `<color:#>`, `<back:#>`, `<font:name>…</font>`, `<plain>`, `<sub>`, `<sup>`, `<img:url>`), a paired tag leaving the cursor between. After `</`, the closers of the tags still open on the line before the cursor, innermost first, and nothing when none is open. After `<&` anywhere, the server's OpenIconic icons (`GET /apps/plantuml/icons`, from `listopeniconic` drawn as SVG, at most 500), inserted with the closing `>`. After `<:` anywhere, its emoji (`GET /apps/plantuml/emoji`, from `emoji` and then each block it names, at most 16 blocks and 2000 names, read as text), inserted with the closing `:>`. No tags after `<<`, on a line starting with `'`, `<style>` or `<<`, or where a connector is due (`A <- B`). | Dr K | shipped (#31) |
| C8 | The server lists (C3, C7) are each asked once per page; only strings are kept, and a failed answer is an empty list for the rest of the page rather than a request on every key. The server caches each list for a day per server URL, sorted and once each. | Dr K | shipped (#22, #31) |

### Validation

| # | Requirement | Source | Status |
|---|---|---|---|
| V1 | `src/editor/lint/` has one module per rule, and each rule is a pure `(state) => Diagnostic[]`, listed in `rules`. They run again when the file name or the server's mistake changes, not only on an edit. Wavy underline (redrawn as a `wavy` text-decoration, since the stock one is an SVG with its colour baked in) in `--color-element-error`, `-warning` or `-info`; a gutter circle, triangle or square in the same colour; a caret under a mistake on an empty line; the tooltip a popover edged in the colour; actions as `--color-primary-element-light` buttons. Ctrl/Cmd+Shift+M opens the panel below the source, F8 steps through. | Dr K: "like VS Code" | shipped (#22) |
| V2 | An unnamed `@startuml` (or `@startmindmap`, `@startgantt`, `@startjson`, `@startyaml`, `@startwbs`), after any indentation and before trailing space, is a warning on the directive: `Name the diagram: @startuml <name>`. **Add name** replaces the rest of the line with a space and the file's base name, read when clicked: the extension dropped, each run of anything but letters, digits, `_`, `.` and `-` one `_`, `_` trimmed from the ends, `diagram` if nothing is left. | Dr K | shipped (#22) |
| V3 | PlantUML's own syntax error is an error on its whole line, in the server's words. The render routes forward `X-PlantUML-Diagram-Error` (one line, at most 200 characters) and `-Line`, which PlantUML counts from 0 at the top of the source it was sent, blank lines and comments included; the document line is that + 1, clamped to the last line. The mark follows its line through edits until the next render answers; only an answer for the current source moves it. It clears on a clean render, when the source is emptied, and when the server cannot draw at all (D4). | Dr K | shipped (#22) |

### Keyboard

| # | Requirement | Source | Status |
|---|---|---|---|
| K1 | Escape closes whatever CodeMirror has open first: the completion popup, a snippet's fields, the search panel, the lint panel, a selection (several cursors become one, a range a cursor). Only an Escape nothing used closes the editor, after saving (S4). | review | shipped (#21, #22) |
| K2 | Ctrl/Cmd+S saves (S1). Ctrl/Cmd+F opens search with replace at the top of the source (F3 / Ctrl/Cmd+G next, with Shift previous; Ctrl/Cmd+D next occurrence; Ctrl/Cmd+Alt+G go to line). Ctrl/Cmd+/ toggles a `'` comment. Tab indents (two spaces) and Shift-Tab outdents; Ctrl-M (Shift-Alt-M on macOS) makes Tab move focus instead. `(`, `[`, `{` and `"` auto-close and Backspace removes the pair; `'` starts a comment, so it never does. Undo and redo are Ctrl/Cmd+Z and Ctrl+Y (Cmd+Shift+Z on macOS). The rest of CodeMirror's default keymap applies (Alt+↑/↓ move a line, Ctrl/Cmd+[ and ] indent). | design | shipped (#4, #21) |

### The diagram itself

| # | Requirement | Source | Status |
|---|---|---|---|
| D1 | `[[url label]]` and `[[url{tooltip} label]]` links work: the editor draws the server's SVG inline (`src/editor/inline-svg.js`) as one picture (`role="img"`, named after the file). The SVG is hostile input, sanitised by a private DOMPurify instance made on first use, so a `setConfig()` or hook on the page-wide one (shared with `@nextcloud/l10n`) neither loosens nor is changed by it. Profiles `svg` and `svgFilters`; `title` and `xlink:title` added (the tooltip); `script`, `style` and `foreignObject` forbidden, along with every event handler and animation element. On `<a>`, `href`/`xlink:href` stays only when it starts (after trimming, any case) with `http:`, `https:` or `mailto:`, and such a link gets `target="_blank" rel="noopener noreferrer"`; PlantUML's `target="_top"` goes. On every other element, `href`/`xlink:href` stays only as `#id`, or as a `data:image/` URL on `<image>`/`<feImage>`. Nothing may load from outside: a paint attribute (`fill`, `stroke`, `filter`, `clip-path`, `mask`, `marker-start`/`-mid`/`-end`, `cursor`) is removed, and a `style` declaration dropped, when it holds a `(`, `)` or `\` outside `rgb()`, `rgba()`, `hsl()`, `hsla()` and `url(#id)`. Every id is prefixed `plantuml-diagram-`, and so is every `#id` and `url(#id)` naming one (any case, quoted or not; never inside a `*title`). An answer with no `<svg>` root draws nothing (D4). | Dr K: "let's draw it inline with svg" | shipped (#30) |
| D2 | Themes made for a dark page (superhero, cyborg, …) leave the background transparent, so their light text vanishes on our white pane. Either `skinparam backgroundColor` in the diagram, or a pane background that follows the theme. | Dr K hit it | proposed |
| D3 | The diagram is redrawn 300 ms after the source stops changing, through `POST /apps/plantuml/render` with `{"source": …}` and core's `requesttoken`. One render at a time: a source that comes due meanwhile is parked (the newest replaces any before it) and sent when the answer lands, which is then dropped as stale. A blank source sends nothing, hides the diagram and clears V3. The old diagram stays until the new one is built, so the pane never flashes empty. A mistake in the source is still an image (PlantUML draws the error in), and is drawn. | design | shipped (#4, #22) |
| D4 | When the server cannot draw, the pane shows one line in place of the diagram: the route's `{"problem": …}`, else "Could not draw the diagram" (a non-JSON body such as a proxy's error page, JSON naming no problem such as an expired session's, a success that is not an image, or an SVG that sanitises to nothing). The source stays editable. | design | shipped (#4, #15, #30) |
| D5 | The drawn SVG starts from `all: initial`, so the page's font, colour and line height never reach it; it keeps `color-scheme: light` and `overflow: hidden`, as an `<img>` would. Its links keep the look PlantUML gave them (`color` and `font` inherit over core's `a` rules) with a pointer cursor. | live check | shipped (#30) |

## Known limitations

Each checked against the code on 2026-10-14.

- **No WebDAV request has a timeout.** A hung `PROPFIND` or `GET` in a check holds every Save, Reload and Save as copy behind it (S9); close still exits through its 10 s prompt (S4).
- **notify_push costs ~20.6 kB gzip** (it brings axios) in the editor bundle, while the live instance has no notify_push app. Keeping or dropping it is Dr K's call.
- **Links inside the diagram are keyboard-focusable but hidden from screen readers,** since the container is one `role="img"`.
- **The Viewer and the README still show diagrams as `<img>`,** so their links do not work there.
- **Colour picker:** named PlantUML colours (`#Red`) get no swatch, and a pick drops the alpha of `#RRGGBBAA`/`#RGBA`.
- **Creole `--strike--` and `~~wave~~` are not highlighted** (they collide with links, H8).
- **A JSON diagram line ending in `[` opens a Creole description body** (H8) down to the next line starting with `]`. Rare.
- **The first `<:` of a day waits ~9 s** while the server reads every emoji block (C7).
- **`<<stereotype>>`:** the first `<` briefly opens the tag popup, which the second closes.
- **Behat cannot see highlighting, layout, the picker or the watcher;** those rest on unit tests and live checks.

## Open proposals

Not agreed; each waits on Dr K.

- **L6** a fit / 100% toggle, maybe zoom.
- **C5** `skinparam` completion from the server's `skinparameters`.
- **D2** a pane background for dark-page themes (superhero and others leave a transparent page).
- Inline SVG for the Viewer and the README, so their links work too.
- Named colours (`#Red`) in the picker.
- A diff view in the conflict state (S6), from `@codemirror/merge`.

Pending Gherkin proposals, awaiting Dr K: **"Asking for the server's icons"** and **"Asking for the server's emoji"**, beside the approved "Asking for the server's themes".

## Building blocks

- **CodeMirror, official.** `@codemirror/view`, `state`, `commands`, `language`, `legacy-modes` (simple-mode), `autocomplete`, `search` and `lint`; `@lezer/highlight` tags.
- **CodeMirror, community.** Before hand-coding, check <https://codemirror.net/docs/extensions/> and npm. In use: `@uiw/codemirror-extensions-color`, the colour picker (C6); it imports `@babel/runtime` helpers without declaring them, so the app depends on `@babel/runtime` 7 itself. Candidates, not installed: `@replit/codemirror-indentation-markers`, `@replit/codemirror-minimap`, and `@codemirror/merge` (the S6 diff proposal). Each had a release in the last year when checked on 2026-10-14 (see `avoid abandoned projects`).
- **Other libraries.** `dompurify` (D1), `@nextcloud/notify_push` (E1).
- **Nextcloud.** Theme CSS variables (`--color-*`, `--default-clickable-area`, `--border-radius-*`), core's `icon-loading-small`, `@nextcloud/files/dav`, `@nextcloud/l10n`, `@nextcloud/event-bus`, Files' template create endpoint, and the Viewer.

## Traps found in the live instance

- **Asset caching.** App scripts and styles are cached for six months under `?v=`, which changes only with an app version. The lazy editor URL carries `&h=<build hash>` (O2). Page-load bundles and CSS need one hard refresh after a hand deploy.
- **Route caching.** The route table lives in APCu in the web server. A new route can answer 404 long after the 3600 s TTL. `apachectl -k graceful` fixes it.
- **Object storage.** S3 writes a space for an empty file (S7). In CI, on local storage, two writes in the same second can keep the same ETag, so a conflict test stamps `X-OC-Mtime`.
- **DAV GET caching.** A file comes with no `Cache-Control`, so the browser caches it heuristically; the editor sends `no-cache` (E4).
- **Core and other apps reach into the editor.** Core's `server.css` styles every `div[contenteditable]` as an input, and `files_bpm` forces it black (H7). Core's button rules outrank a single class, so the bar's buttons are styled as `button.<class>` and the search panel's as `& .cm-panel.cm-search …`. Core's input rules give the picker's `<input type="color">` a margin and a 30 px height (C6). Core styles every `a`, which the diagram's links undo (D5).
- **CodeMirror's own colours assume a white page.** Its base theme, `defaultHighlightStyle` and the lint underline SVG all hard-code colours, so each is overridden with variables (H1, V1).
- **Driving the browser.** A selenium key press must target `.cm-content`. A bare Enter reaches Files underneath and opens the Viewer.

## Testing

- **Unit tests (vitest).** Each module has its own test file under `tests/js/`: the completion sources (`completion.test.js`) and lint rules (`lint.test.js`) against a real `EditorState`; the mode's tokens, including what must stay plain (`plantuml-mode.test.js`); the theme, no colour literals and every token coloured (`theme.test.js`); autosave timing (`autosave.test.js`) and the watcher's clock with `notify_push` stubbed (`watch.test.js`) on fake timers; the splitter (`splitter.test.js`); WebDAV reads and writes (`save.test.js`); the render route and its queue (`preview.test.js`); and sanitising (`inline-svg.test.js`).
- **Through the editor.** `tests/js/editor.test.js` drives the whole overlay through `openEditor`, with `save.js`, `preview.js`, `@nextcloud/event-bus` and `@nextcloud/notify_push` mocked at their seams.
- **Behat.** Through the API only, never a browser; a scenario that truly needs one would be `@ui @blocked`, and none does. `features/diagrams/edit.feature` covers a changed source drawing, save, a refused save over someone else's change, Save as copy, the server's themes and a mistake naming its line; `create.feature` covers a new diagram.
- **Live checks.** Layout, colour, the picker and the watcher are checked in a clean selenium profile on both themes each round.

## Decisions

| Decision | Why |
|---|---|
| The editor is a lazily added bundle, its URL carrying a build hash | Most Files pages never open it; `?v=` alone kept a new build from the browser for months |
| Autosave on 2 s idle and 30 s max, after Text | Text saves a few seconds after typing, and Dr K asked for the same |
| Close saves first, and asks only when it cannot | Closing should never lose work, nor trap the user behind a read-only share, a full quota or an outage |
| Only Reload or Save as copy ends a conflict | A save over someone else's change could only be refused again; both ways out keep every version |
| The server writes a new diagram's `@startuml`/`@enduml` | Dr K: "Shouldn't the backend do that?"; a click and an API call make the same file |
| Poll first, `notify_push` when present | The live instance has no `notify_push`, and the client library says when push is unavailable |
| A take-in from elsewhere stays out of the undo history | Undoing it would be an edit of ours, which autosave would write back over theirs |
| A check never shows the spinner and gives way to the user | It runs every 10 s; it must not flicker the bar or delay a save |
| Every colour a Nextcloud variable, mixed with `color-mix()` | A hard-coded colour went black on black; status hues are pulled toward the text because their `-text` variants are near white on dark |
| Labels in violet, not a primary tint | The primary tint read near white on dark; violet is the one free hue (H4) |
| Creole lives in the PlantUML mode's own states | It is only Creole where PlantUML reads text (labels, notes, legends, titles), and a label must keep its violet under it |
| `--strike--` and `~~wave~~` stay plain | They collide with the links `--` and `~~`, which matter more |
| Existing libraries before hand-written code | Dr K: "check for existing libs to use"; hence the colour picker from `@uiw` and DOMPurify |
| Themes, icons and emoji come from the server, never a fixed list | The list follows the server's version; even the emoji blocks are the ones `emoji` names. C5 would do the same for skinparams |
| One file per completion source and per lint rule | Dr K asked for a pattern to grow |
| Draw the SVG inline, sanitised by a private DOMPurify | Dr K: "let's draw it inline with svg" so links work; an `<img>` loaded nothing, and the inline SVG must load nothing either |
| Fit the diagram by default | Dr K: "it should auto fit so it's always visible" |
| Always wrap long lines | Dr K: "let's just always wordwrap" |
| Behat through the API only | Dr K: "The behat tests should not need the browser"; "try not to have any `@ui` tags" |
