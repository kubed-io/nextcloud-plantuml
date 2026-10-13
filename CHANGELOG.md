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

- **Edit diagram**: PlantUML source on the left with highlighting, the diagram redrawing on the right as you type; Save checks nobody else changed the file first.
- A `.puml` opens as its diagram in the image viewer; right-click offers **Edit diagram** and **Open with text editor**; **+ New → Diagram** starts one.
- Admin settings: point the app at a PlantUML server and test the connection; `occ plantuml:set-url`, `test-connection` and `show-config`.
- A `.puml` file renders to SVG at `/apps/plantuml/render?path=…`; diagram text renders through `POST /apps/plantuml/render`.
- `.puml` and `.plantuml` files are their own file type, with the app's icon.

