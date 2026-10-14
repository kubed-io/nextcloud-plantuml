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

- A folder README shows its ```plantuml fences and `![](<diagram.puml>)` images as diagrams.
- **Edit diagram**: PlantUML source on the left with highlighting, the diagram redrawing on the right as you type; Save (or Ctrl/Cmd+S) refuses to overwrite a file someone else changed.
- A `.puml` opens as its diagram in the image viewer, and its menu offers **Edit diagram** and **Open with text editor**.
- **+ New → Diagram** creates `New diagram.puml` holding an empty diagram and opens the editor on it.
- Admin settings: point the app at a PlantUML server and test the connection; `occ plantuml:set-url`, `test-connection` and `show-config`.
- A `.puml` file renders to SVG at `/apps/plantuml/render?path=…`; diagram text renders through `POST /apps/plantuml/render`.
- `.puml` and `.plantuml` files are their own file type, with the app's icon.

### Fixed

- Removing the app keeps a `.puml` or `.plantuml` file type you set yourself in `config/mimetypemapping.json`, and repair now warns when it cannot write `core/js/mimetypelist.js`.
### Changed

- The editor loads the first time you open it, not on every Files page.

