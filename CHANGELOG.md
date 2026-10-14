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

- The editor picks up changes made to the file elsewhere, and has a Reload button.
- Long lines in the editor wrap instead of scrolling sideways.
- Links without a head (`--`, `..`, `~~`, `==`) are coloured like arrows, a link's label is shown in italics, and `== separators ==` stand out.
- Drag the line between the source and the diagram to resize them; the split is remembered.
- A folder README shows its ```plantuml fences and `![](<diagram.puml>)` images as diagrams.
- **Edit diagram**: PlantUML source on the left with highlighting, the diagram redrawing on the right as you type; Save (or Ctrl/Cmd+S) refuses to overwrite a file someone else changed.
- A `.puml` opens as its diagram in the image viewer, and its menu offers **Edit diagram** and **Open with text editor**.
- **+ New → UML Diagram** creates `New diagram.puml` holding an empty diagram and opens the editor on it.
- Admin settings: point the app at a PlantUML server and test the connection; `occ plantuml:set-url`, `test-connection` and `show-config`.
- A `.puml` file renders to SVG at `/apps/plantuml/render?path=…`; diagram text renders through `POST /apps/plantuml/render`.
- `.puml` and `.plantuml` files are their own file type, with the app's icon.
- When someone else changed the file you are editing, Reload or Save as copy.
- The editor saves by itself two seconds after you stop typing, and at least every 30 seconds while you keep going.
- Autocomplete in the editor: `@start`/`@end` lines, keywords, the names the diagram already uses, and blocks such as `alt` and `loop` to fill in.
- Autocomplete offers the PlantUML server's own themes after `!theme`.
- Autocomplete offers the connectors (`-->`, `..`, `~~`, `==`, …) after the first name on a line.
- The editor underlines a diagram with no name after `@startuml`, offering to name it after the file, and the line where the server finds a mistake.
- Editor conveniences: the current line highlighted, matching brackets outlined and closed as you type, Ctrl/Cmd+F to search, Ctrl/Cmd+/ to comment a line, Tab to indent.

### Changed

- The editor's Save button is Text's save indicator: a check when saved, a dot on it while changes are unsaved.
- The editor loads the first time you open it, not on every Files page.
- A new diagram gets its starting lines from the server, so any client creating one through Nextcloud gets the same file.

### Fixed

- The editor reads a changed file fresh instead of from the browser's cache, so a change made elsewhere shows up.
- A long source scrolls inside the editor, and a big diagram is fitted to its pane instead of running off the bottom.
- The editor's source is readable on a dark theme: its text and highlighting follow Nextcloud's theme colours.
- Removing the app keeps a `.puml` or `.plantuml` file type you set yourself in `config/mimetypemapping.json`, and repair now warns when it cannot write `core/js/mimetypelist.js`.
- The editor no longer shows a raw error page when the server answers something other than a diagram.
