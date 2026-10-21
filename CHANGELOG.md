# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/).

<!--
  One short, user-facing line per entry. Only `[Unreleased]` is ever edited;
  every released section below it is immutable. The deeper why lives in the
  spec and the PR, not here.
-->

## [Unreleased]

### Added

- Add diagram in the editor: a type's empty diagram from ▾, or any template from +, built in, from the admin's template folder or from your own Templates folder.
- Open a diagram's linked style or include file from its `<>` chip or Ctrl/Cmd+click, and edit it in place while the diagram redraws live.
- **+ New** reads **New puml File** and still makes `New diagram.puml`.
- The Viewer shows every diagram of a `.puml` as tabs, a stack or a wall, drawn inline so their links work; the wall packs diagrams of every size together, live, and opens as it was last packed. The mode is not remembered, every open is Tabs.
- Export from the Viewer to SVG, PNG, PDF, EPS or ASCII art: the diagram in view, the checked ones or all as a zip, named so every file system takes them, except from a share that forbids download. `GET /apps/plantuml/export` does the same.
- **Edit** in the Viewer opens the editor at the diagram in view.
- The Viewer shows a spinner on each diagram until it is drawn, draws a stack or wall as you scroll to it, and shows a diagram it drew before on the same page at once.
- In the Viewer, ← and → step to the previous and next `.puml` in the folder.
- `GET /apps/plantuml/render` takes `diagram` (a name or a place) and `index`, for one diagram of a file.
- `.puml` and `.plantuml` files are their own file type, with the app's icon. Removing the app reverts that and leaves alone a mapping you set yourself in `config/mimetypemapping.json`; repair warns when it cannot write `core/js/mimetypelist.js`.
- Admin settings: point the app at a PlantUML server and test the connection, which names the server's PlantUML version or says what is wrong; `occ plantuml:set-url`, `test-connection` and `show-config` do the same from the command line.
- A `.puml` opens as its diagram in the image viewer, which says "Could not open the file" when it cannot read the file and "Could not draw the diagram" (or the server's reason) when a drawing fails, rather than showing a raw error page; its menu offers **Edit diagram** and **Open with text editor**.
- A `.puml` file renders to SVG at `/apps/plantuml/render?path=…`, and diagram text through `POST /apps/plantuml/render`; both pass on PlantUML's error and its line in `X-PlantUML-Diagram-Error` headers.
- **+ New → UML Diagram** creates `New diagram.puml` holding an empty diagram and opens the editor on it. The app writes the starting lines on the server, so any client creating a `.puml` through Files' create endpoint gets the same file, on object storage too.
- **Edit diagram**: PlantUML source on the left, the diagram on the right redrawing as you type, drawn inline so its links open in a new tab; when the server cannot draw, the pane says why.
- The editor loads the first time you open it, not with every Files page, and a new build of it reaches the browser without a hard refresh.
- Drag the line between the source and the diagram to resize them; the split is remembered. A long source scrolls in its pane and its lines wrap; a big diagram is fitted to its pane.
- The editor saves by itself two seconds after you stop typing, and at least every 30 seconds while you keep going. Text's save indicator shows it (a check, a dot while unsaved, a spinner while saving) and saves at once when clicked, as Ctrl/Cmd+S does; closing saves first.
- A save never overwrites someone else's change: the editor says so and offers Reload or Save as copy.
- The editor picks up changes made to the file elsewhere, reading past the browser's cache, and has a Reload button.
- Highlighting in Nextcloud's theme colours, readable on light and dark: keywords, arrows and every kind of link (never one inside a URL), a link's label in violet italics, `== separators ==`, and Creole markup (bold, italic, monospace, underline, `[[links]]`, tags, tables) in labels, notes, legends and titles.
- A colour picker on `#hex` colours, such as `skinparam backgroundColor #2B3E50` or `-[#FF6F61,bold]->`.
- Autocomplete: `@start`/`@end` lines, keywords, the names the diagram already uses, and blocks such as `alt` and `loop` to fill in.
- Autocomplete from your PlantUML server: its themes after `!theme`, its OpenIconic icons after `<&` and its emoji after `<:`.
- Autocomplete offers the connectors (`-->`, `..`, `~~`, `==`, …) after the first name on a line, the Creole tags after `<`, and their closers after `</`.
- The editor underlines a diagram with no name after `@startuml`, offering to name it after the file, and the line where the server finds a mistake.
- Editor conveniences: the current line highlighted, matching brackets outlined and closed as you type, Ctrl/Cmd+F to search, Ctrl/Cmd+/ to comment a line, Tab to indent.
- A folder README shows its ```plantuml fences and `![](<diagram.puml>)` images as diagrams.
- A file with several diagrams shows them as tabs above the diagram; the diagram follows the cursor and the cursor follows the tab. A block can be folded, and the **Source** toggle hides and restores the code.
- The editor marks an `@start` with no `@end`, or an `@end` of the wrong type, with quick fixes; picking `@start` inserts the whole block, `salt`, `regex` and `ebnf` included.
- `@startyaml` blocks are highlighted as YAML and checked, every mistake underlined; each diagram type's support loads only when a file holds that type.
- Drawing one diagram of several: `POST /apps/plantuml/render` takes an `index`.
- The editor bundle is an ES module, with its per-type chunks in `dist/chunks/`.
- A style editor: `<style>` blocks have their own colours, completion for selectors, properties and values, checks for unknown properties and unclosed blocks, and folding; style blocks no longer confuse the rest of the diagram.
- Pencil choosers on values from a list and steppers on numbers, on the line you are editing.
- Named colours (`#Red`) complete with a swatch and get one in the source, gradients are coloured part by part, and `GET /apps/plantuml/colors` lists the server's names.
- `%` completes PlantUML's built-in functions, and helper commands such as `colors`, `listsprite` and `help themes` complete on a line of their own.
- `@startcreole` and `@startfiles` diagrams are highlighted and complete, and the rest of Creole is read: headings, lists, escapes, titled rules, coloured table cells and `<code>`.
- Relative `!include`, `!includesub`, `<style file=…>` and `!import lib.zip` resolve in your own files, for the editor, the README and `.puml` files alike; a mistake in an included file lands on its include line.
- Local path completion after `!include` and `<style file=`, one folder at a time.
- Autocomplete offers every `!` directive, with a block snippet where it has one.
- Autocomplete offers the section and block names of a file after `!includesub path!` and `!include path!`.
- Line-start autocomplete adds the server's keywords and element types, from the new route `GET /apps/plantuml/keywords`.

- Tags are coloured like HTML: the tag, its attribute names, a quiet `=`, and values in the string colour.
- A tag's attributes complete (`<font size= color=>`, `<img src= vspace= valign=>`, `<style file=>`, `{scale= color=}` after icons, emoji and sprites), and their values too: `valign`'s three, the server's fonts and named colours, with the pencil and the stepper on them. New route `GET /apps/plantuml/fonts`.
- `!include <` completes PlantUML's standard library: the libraries the server has (new route `GET /apps/plantuml/stdlib`), then each library's folders and files.
- An **All diagrams** menu at the end of the tab strip when the tabs overflow: every diagram, its type beside it, a pick activating it.
- Pick a named colour by name: a pencil after a colour's swatch opens the server's colour names, each with its swatch.
- Grammars for board, git, gantt and project diagrams, AsciiMath and LaTeX formulas, and sprite blocks.
- Grammars for mindmap, wbs, regex, EBNF, chart, Chen ER, wire, flow, BPM, DOT, HCL, packetdiag and nwdiag diagrams.
- The editor colours every kind of token one way across diagram types: keywords, names, values, operators by kind, brackets, paths and stereotypes.
- A diagram's name after `@start…` is underlined.
- `@startchronology` and `@startjcckit` bodies are grey: this server cannot draw them.
- Typing a path offers `file://`, `https://` and `http://`.
- A pencil picks an icon (`<&…>`) or an emoji (`<:…:>`) by name.
- A check marks `<back:#Name>` (and `<u:`, `<s:`, `<w:`), which PlantUML draws as text, with **Remove #**.
- Grammars for salt wireframes and JSON diagrams.
- JSON diagrams are checked as PlantUML reads them, the first mistake underlined with the reader's message.
- A `{{type` … `}}` sub-diagram (salt, json, yaml, …) in a note, legend, description or class body is coloured with its own type's grammar, folds, and `{{` completes the types.
- A `{{json` sub-diagram is checked like a `@startjson` block, its first mistake underlined.
- Resting the pointer on a keyword, directive, function, style property, theme or library shows its docs after half a second; a click pins the card, and Escape or × closes it.
- The completion list shows the docs of the selected option beside it.

### Changed

- Supports Nextcloud 35.
- On a phone the editor shows the code or the diagram, switched by Source; it opens on the diagram.
- Style blocks colour selectors moss and property names slate.
- The preprocessor colours `$variables` and function names, no longer the whole line in one colour.
- Every `@start…` and `@end…` line is coloured, whatever the diagram type.
- A warmer orange for attributes.
- `!include file!NAME` picks a block by its index or its `@startuml(id=NAME)` only, as PlantUML documents; a block named only `@startuml NAME` is now a mistake that says to add `(id=NAME)`.
- The editor is faster on long documents: hovering a name, typing and completing no longer rescan the whole text.
- Completion no longer offers `ExportedName`, `Image` and `ImagePosition`, which PlantUML does not read.
- notify_push loads only on servers that have it, as its own file, so the editor opens lighter everywhere else.
- A click on a card in the Wall does nothing; open a diagram from Tabs.
- A linked file's path is always underlined, no key needed; Ctrl/Cmd+click opens it.
- The built-in templates each say in a line what they make.

### Fixed

- `!include <` no longer offers Creole tags such as `<b>`.
- `!includesub NAME` of a section in the same diagram no longer shows a mistake.
- `!includesub ./file.puml` without a section name says which sections the file has, instead of PlantUML's bare "cannot include".
- Tags such as `<style …>`, `<b>` and `<&icon>` are maroon, no longer the grey of a comment.
- The tabs after a block with arguments (`@startjcckit(300,200)`) no longer draw the block before them.
- Picking a font in an unclosed `<font:` closes the tag.
- Element names are no longer offered inside a tag.
- A block comment inside a nested block no longer runs past its `@end`.
- The colour pencil, completion and snippets write a colour name in `<back:` and its kin without `#`.
- A tab shows a quoted or braced `@start` name as PlantUML reads it.
- A note, legend, title or description left open no longer hides the diagrams after it.
- A class member's visibility with a space after it (`+ render()`) is coloured as PlantUML reads it.
- A quoted multiplicity or role after a link (`A *-- "many" B`) is coloured as a string.
- A sub-diagram's indented lines read as the server reads them: an indented `#highlight` is highlighted, a `<style>` inside is a style block, and one left open in a class or description body ends at the body's own closer, never at a `}` or `]` of its own content.
- A salt button holding a `]` reads as PlantUML draws it, and so does a tree with text after its `{T` (`{T{`): that text and the tree's first `}` line are rows.
- A linked style file's pencils open their choosers: font styles after `FontStyle`, colours on `FontColor`.
- The Wall's cards sit centred, within the scrollbar's gutter.
- A double-click in the Viewer selects no text.
- `archimate` and the other element keywords are coloured as keywords, and a line's declared name is moss.
- Focus no longer falls to the page: a bar button that disappears hands it on, and closing the editor returns it to the file's row.
- The Export menu stays inside the window on a narrow screen.
- A failed export's line goes when the mode or tab changes or a box is checked.
- The Viewer's toolbar, tabs and menus show the app's focus ring.
- The Wall's background is opaque, so the Files page no longer shows through.
- A failed drawing is read by a screen reader as text.
- A drawing that failed is asked for again on retry, with a spinner; a refused answer is not.
- Edit opens nothing once the Viewer has moved on, and a Viewer whose editor will not load stays and says so.
- A failed Add diagram load says so, and the line clears on a later success.
- The editor's bar fits a phone.
- On a phone, Add diagram lists the types above the templates, names and counts whole, and the + ▾ halves and the main file's crumb are full-size touch targets.

### Security

- A diagram source over 1 MiB is refused ("The diagram is too large to draw"), whether posted or read from a file.
- A file shared as view-only cannot be read out through an include, `!import` or `<style file=>` in your own diagram.
- The PlantUML server's address is logged and reported without its user, password, path or query.
- Rendered images carry a strict Content-Security-Policy, `nosniff` and an inline Content-Disposition.
