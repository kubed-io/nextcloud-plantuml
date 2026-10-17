<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# nextcloud-plantuml — design

A Nextcloud app that shows PlantUML diagrams where people already read them: a `.puml`
file in the Files app, and a folder README that quotes or embeds one. The drawing is done
by a PlantUML server the admin names once; the app holds no diagrams of its own.

This spec covers the server side, the routes, the Files integration, the Viewer and the
README. The editor's own requirements, from layout and autosave to highlighting,
completion and validation, live in `2026-10-14-editor-design.md` (requirement ids such as
S2 or C7 below are that spec's); this one says only what the editor asks of the rest.

Fourth member of the kubed-io nextcloud-* family after `nextcloud-n8n`,
`nextcloud-grafana` and `nextcloud-penpot`. It borrows their skeleton, CI, documentation
cascade and Gherkin rules, and none of their sync machinery.

## What it does

Each behaviour is owned by one feature file. The folder is the noun, the file is the
verb.

| # | Behaviour | Feature file |
|---|---|---|
| 1 | An admin points the app at a PlantUML server and tests it | `connection/admin.feature` |
| 2 | `.puml` and `.plantuml` are their own file type, with their own icon | `lifecycle.feature` (an end state of enabling) |
| 3 | Click a `.puml` → its diagram opens in the image viewer | `diagrams/view.feature` (the route; the click is checked by hand) |
| 4 | A URL that names a `.puml` file answers with its image | `diagrams/view.feature` |
| 5 | Right-click a `.puml` → edit it, source beside the live diagram | `diagrams/edit.feature` |
| 6 | **+ New → New puml File** makes `New diagram.puml` and opens the editor on it | `diagrams/create.feature` |
| 7 | A folder README shows its ```` ```plantuml ```` fences and `![](x.puml)` images as diagrams | `readme/render.feature` |
| 8 | A file with several diagrams: the editor shows one tab each (editor spec B1–B8); a README image names the one it shows, `![](x.puml#login)` or `![](x.puml#2)`, else the first; a fence draws all of its diagrams | `readme/render.feature` (proposed, awaits Dr K) |
| 9 | The Viewer shows every diagram of a file, as tabs, one after another or as a wall; exports one, some or all; opens the editor at one (shipped, viewer round) | `diagrams/view.feature` |
| 10 | The editor adds a diagram from a template: built in, from the admin's template folder or from the user's Templates folder (agreed, TP1–TP5, editor spec A1–A9) | to propose to Dr K, `diagrams/edit.feature` |
| 11 | The editor opens a file a diagram links to (`<style file=./x.css>`, `!include ./x.puml`) in place of the source, the diagram live beside it (shipped, editor spec R9–R18) | to propose to Dr K, `diagrams/edit.feature` |

Delete, rename, move, copy, trash, restore, share: Nextcloud's, untouched. A `.puml` is
an ordinary file.

## What it does not do

- **No CRUD API for diagrams.** Nextcloud's own files, WebDAV and sharing are the API.
- **No folder mappings, no sync, no metadata.** A `.puml` is an ordinary file wherever it
  sits; the PlantUML server never holds one.
- **Nothing for anonymous callers.** Every route is for a logged-in user. Public share
  pages are out of scope.
- **Files app and folder README only.** Not Text's full-page editor for `.md` files, not
  Collectives, not Talk.
- **Nothing per user.** One server, set by the admin, used by every logged-in user.

## Platform facts the design rests on

Verified against the live instance (Nextcloud 34.0.3, Text 8.0.0) and upstream source on
2026-10-13, unless a fact names another date.

1. **The folder README is Text's "workspace".** `WorkspaceService` finds `Readme.md`,
   `README.md`, `readme.md` or `.Readme.md`; `RichWorkspace.vue` shows it first with
   `RichTextReader` and then, once ready, with Text's full editor, which is the view that
   lasts (found during the build; the observer therefore sees two renders per folder).
   Code fences go through `CodeBlockView.vue`, whose one renderable language is
   hard-coded: `supportPreview() { return ['mermaid'].includes(this.type) }`. There is no
   registration call, event or markdown-it slot; `window.OCA.Text` exposes only
   `createEditor` and `createTable`. nextcloud/text#705 asked for PlantUML in 2020 and was
   closed; the maintainer's suggestion that other apps could register code-block
   renderers was never built. The fence's language is not in the DOM either: tiptap
   draws a bare `<code>` (read from Text stable34 during the build).
2. **A relative Markdown image is a raw WebDAV URL.** Text's `AttachmentResolver` turns
   `![](diagram.puml)` into `dav/files/<uid>/<dir>/diagram.puml` with no mimetype check
   and no preview. The browser receives PlantUML text and cannot decode it. Read during
   the build: `ImageView.vue` preloads that URL and, when it fails, draws its broken-image
   icon in a `figure[data-component="image-view"]`, so there is no `<img>` left to
   rewrite. Clicking any embedded image opens Text's own lightbox (`showImageModal`),
   which re-resolves images from their original `src`; it never opens the Nextcloud
   Viewer and never links to the file.
3. **A preview provider can call an HTTP service.** `IRegistrationContext::registerPreviewProvider()`
   registers an `IProviderV2` for a mimetype regex; core's `Imaginary` provider and
   richdocuments' `Office` provider both POST the file to a service and return the image.
   Core caches the result under `appdata/preview/<fileid>`. A provider must return a
   raster `IImage`.
4. **A new mimetype is a repair step.** Core reads only `config/mimetypemapping.json` and
   `config/mimetypealiases.json`. The sibling apps' `RegisterMimetype` step merges the
   mapping, copies the icon into `core/img/filetypes/`, updates the filecache and
   regenerates `mimetypelist.js`; `UnregisterMimetype` reverts it on uninstall.
5. **The Viewer opens what a handler claims.** `OCA.Viewer.registerHandler({ id, mimes,
   component })` makes the Viewer — Nextcloud's standard image lightbox — open a mimetype
   with the given component. The Files app's default click on a file goes to the Viewer
   when a handler claims its mimetype. `OCA.Viewer.openWith(handlerId, { path })` opens a
   file with a named handler, and Text's handler then gets the file's real mimetype.
6. **The PlantUML server renders from a POST body.** `POST <server>/<format>` with the
   diagram text as the body returns the image. A `version` diagram rendered as `/txt`
   names the server's PlantUML version. A server that is not PlantUML answers 405 or 404;
   an unreachable host fails to connect. A syntax error is drawn into the image and
   answered with **HTTP 400** plus an `X-PlantUML-Diagram-Error` header and an
   `X-PlantUML-Diagram-Error-Line` header (verified against 1.2026.8 during the build).
   The line counts from 0 at the top of the source sent, blank lines and comments before
   `@startuml` included. So the app decides "is this a render?" by the body's `image/*`
   Content-Type, whatever the status; a non-image body at any status is `not a PlantUML
   server`.
7. **The fence is `plantuml`.** GitLab, Kroki, Asciidoctor, pandoc, Docsify and Joplin
   accept only that tag; every tool that accepts another also accepts it. GitHub Linguist
   registers PlantUML with extensions `.puml`, `.iuml`, `.plantuml` and no aliases. `puml`
   is a file extension, not a language name; on GitHub, Markdown fences tagged `plantuml`
   outnumber `puml` 61,184 to 2,152.
8. **Prior art is thin.** `SkyV0x/plantuml-editor` (one commit, 2026-02) has an admin
   URL, a mimetype repair step, a render service and one file action, and nothing for
   READMEs. `devnoname120/nextcloud-file-viewer` opens `.puml` as text. No store app
   renders PlantUML.
9. **There is no PlantUML editor to embed, and almost no grammar.** PlantUML's own server
   UI (Monaco, GPL) highlights PlantUML *as Apex* — its docs say so. kkeisuke's two Vue
   editors are abandoned (2022, 2023); Kroki's niolesk is React with plain text. No
   PlantUML grammar exists for CodeMirror 6, Monaco or highlight.js (so Text's own code
   blocks can never colour it). Two do exist: Prism's `prism-plant-uml` (MIT, 2022, 3 kB)
   and the VS Code extension's TextMate grammar (MIT, needs an Oniguruma wasm bridge). No
   Nextcloud app ships CodeMirror or Monaco. CodeMirror 6 core is ~200 kB gzipped against
   Monaco's ~1.7 MB.
10. **Files has a create endpoint that announces what it made** (verified 2026-10-14).
    `POST /ocs/v2.php/apps/files/api/v1/templates/create` with `filePath` (and no
    `templatePath`) is `TemplateController::create`, open to any logged-in user. It creates
    an empty file, dispatches `FileCreatedFromTemplateEvent` with a `null` template and the
    new file as the target, and answers OCS 403 "File already exists" for a taken path.
    It has been there since Nextcloud 21. Registering a `TemplateFileCreator` would add a
    second **+ New** entry, and Files opens a file made that way with its default action,
    the Viewer, not our editor. On S3 object storage the "empty" file holds one space
    (found live, 2026-10-14).
11. **A WebDAV GET carries no `Cache-Control`** (found live, 2026-10-14). Browsers then
    cache the file heuristically, for about a tenth of its age, so a file changed
    elsewhere reads back stale unless the request says `Cache-Control: no-cache`.
12. **What a diagram may reach is the server's `PLANTUML_SECURITY_PROFILE`** (verified
    2026-10-14 against the kubed-io/plantuml deployment, pinned to `INTERNET`). Under
    `INTERNET`, cluster URLs (`n8n.flow.svc`, `nextcloud.cloud.svc:8080`) answer "Cannot
    open URL" although the pod reaches them, and local files are refused; public
    `!include https://raw.githubusercontent.com/…`, the standard library's
    `!include <C4/…>` and remote `<img:https://…>` work. (The pin was uncommitted in that
    repo on 2026-10-14.)

## Architecture

```
                 ┌──────────────────────── Nextcloud ─────────────────────────┐
  browser        │                                                            │  PlantUML server
                 │  Files page: plantuml-files.js + plantuml-readme.js        │
  .puml click ──▶│    Viewer handler ─ <img> ─▶ GET  /render?path=…  ─────────┼──▶ POST /svg
  right-click ──▶│    Edit diagram ─▶ plantuml-editor.js (added on first use) │
                 │      source ◀─▶ WebDAV GET (no-cache) · PUT If-Match       │
                 │      diagram ─ inline SVG ◀─ POST /render {source} ────────┼──▶ POST /svg
                 │      completion ◀─ GET /themes · /icons · /emoji ──────────┼──▶ POST /txt, /svg
  + New ────────▶│  New puml File ─▶ Files' create ─▶ NewDiagramListener      │
                 │                                 ─▶ editor                  │
  README ───────▶│  Text workspace ─ readme observer (DOM)                    │
   ```plantuml   │    fence ─ <img> ◀─ POST /render {source} ─────────────────┼──▶ POST /svg
   ![](x.puml)   │    image ─ <img> ─▶ GET  /render?path=… ───────────────────┼──▶ POST /svg
                 │  Admin card ─ Test connection ─▶ POST /test-connection ────┼──▶ POST /txt (version)
                 │  occ plantuml:set-url · test-connection · show-config ─────┼──▶ POST /txt (version)
                 └────────────────────────────────────────────────────────────┘
```

Nextcloud 32 to 34 (`appinfo/info.xml`). The app is of type `filesystem`, so it loads on
WebDAV requests too, as the siblings do.

### Backend (`lib/`)

| Unit | Does | Depends on |
|---|---|---|
| `Service/ServerConfig` | Reads and writes the one setting, `server_url`, through `IAppConfig`. Trims it, drops a trailing slash, and refuses anything but an `http` or `https` URL with a host. `clear()` deletes the key. | `IAppConfig` |
| `Service/RenderService` | The one place the app talks to the server: `POST <server>/<format>`, the source as a `text/plain; charset=utf-8` body, a 10 s timeout, `allow_local_address` set per request (homelab servers live at in-cluster addresses), HTTP errors returned rather than thrown. `render(string $source): Rendered` always asks for SVG and returns body, content type, PlantUML's error as one line (control characters made spaces, at most 200 characters) and its line number when the server sent digits; any non-`image/*` answer is `not a PlantUML server`. `version()` reads `PlantUML x.y.z` off the `version` diagram as text. `themes()` reads the names after "The possible themes are" off `help themes` as text (at most 200). `icons()` reads the `<text>` names off `listopeniconic` drawn as SVG, since its text rendering sets them in columns beside a credit (at most 500). `emoji()` renders `emoji` as text, then each block it names (at most 16), and keeps the `<:name:>` tokens that are not code points (at most 2,000). Icons and emoji come back unique and sorted. Each list is cached a day per server URL in the distributed cache; a failure is not cached. Every failure is a `RenderException` with one of three problems, logged at info with its cause. | `ServerConfig`, `IClientService`, `ICacheFactory`, `LoggerInterface` |
| `Service/Rendered`, `Exception/RenderException` | The render's value object; the problem (`not set`, `unreachable`, `not a PlantUML server`) and its admin line (`Server URL is not set`, `Server is unreachable`, `Server is not a PlantUML server`). | — |
| `Controller/RenderController` | The render routes and the server's lists, below. All for logged-in users only (no `#[PublicPage]`). | `RenderService`, `IncludeResolver`, `DiagramFiles` |
| `Controller/ConfigController` | `POST /apps/plantuml/test-connection` behind `#[AuthorizedAdminSetting(settings: AdminTest::class)]`: calls `version()` and answers `{success: true, message: "PlantUML 1.2026.8"}` or `{success: false, message: <admin line>}`, always with a 200. | `RenderService` |
| `Controller/TemplatesController`, `Service/TemplateLibrary` (agreed) | `GET /templates` (TP1–TP3): finds the actor (TP2), makes sure the folder exists, lists the shared files and the caller's Templates folder and reads them within the caps. | `IAppConfig`, `IGroupManager`, `IRootFolder`, `ITemplateManager`, `IUserSession` |
| `Controller/ExportController` (shipped, viewer round) | `GET /export` (VW6): resolves the file as `GET /render` does (`IncludeResolver`), draws each asked diagram in the asked format (`RenderService::render` takes a format) and answers one file or a zip (PHP's `ZipArchive`: core's `ZipStreamer` sends macOS a tar). | `RenderService`, `DiagramFiles`, `IncludeResolver`, `ITempManager` |
| `Settings/InstanceSettings` | One declarative-settings card, form id `instance`: title "PlantUML", description "Point to your PlantUML server", one URL field "Server URL", stored externally through `ServerConfig`; the Templates section (TP4, agreed) adds "Template folder", stored in `IAppConfig` as `template_folder`. An empty submit clears the URL; a refused one is logged with its reason and fails the save. | `ServerConfig` |
| `Settings/AdminSection`, `Settings/AdminTest` | The section (id `plantuml`, priority 80 as in the siblings, icon `app-dark.svg`) and, under the card, the **Test connection** button: `templates/admin_test.php` with `js/admin-test.js` and `css/admin-test.css`, added through `Util` so they carry the CSP nonce. `AdminTest` is the delegated setting the test endpoint is authorised by. | — |
| `Command/SetUrl`, `Command/TestConnection`, `Command/ShowConfig` | The `occ` twins: `plantuml:set-url <url>`, `plantuml:test-connection` (prints `PlantUML x.y.z` or the admin line), `plantuml:show-config` (`server_url: …`, or `(not set)` and a failure exit). CLI-first is the house style and is what the integration suite drives. | the services above |
| `Listener/LoadFilesScriptListener` | On Files' `LoadAdditionalScriptsEvent`: provides the initial state `server_configured`, adds `dist/plantuml-files.js`, `css/editor.css` and `dist/plantuml-readme.js`. The editor bundle is left to `plantuml-files.js`. | `ServerConfig`, `IInitialState` |
| `Listener/NewDiagramListener` | On `FileCreatedFromTemplateEvent` with no template, writes the empty diagram (`@startuml`, a blank line, `@enduml`) into a new `.puml` or `.plantuml` (any case) that is blank: size 0, or at most 16 bytes of whitespace, because S3 object storage writes one space for an empty file (fact 10). A file made from a template, one that holds something, or any other extension is left alone. The empty diagram is defined here and nowhere else. | Files' create endpoint (fact 10) |
| `Migration/RegisterMimetype`, `Migration/UnregisterMimetype` | `puml` and `plantuml` → `text/x-plantuml`, alias → icon `plantuml`; register runs on install and after every migration. Unregister drops our keys and icon, re-stamps the filecache rows to `text/plain` and regenerates `mimetypelist.js`; an extension the admin remapped keeps its key and its rows (#14). Copied from the siblings, extension and names changed. | core detection |

#### Routes

| Route | Answers | Caching | Refusals |
|---|---|---|---|
| `GET /apps/plantuml/render?path=<path>` | The SVG of the `.puml` at `path`, resolved in the **calling user's** folder, so a user can only render what they can read. Relative includes and `<style file=…>` resolve against the file's folder (shipped #38; editor spec R1–R3); the ETag then covers the included files too (a hash of the file's ETag and each included file's), so a changed include is a new answer, not a 304. No CSRF token (it is an `<img src>`); the path rule keeps it safe. | The file's ETag and `Cache-Control: private, no-cache` (core's default `no-store` would keep the browser from sending the ETag back); `304` on a matching `If-None-Match`, weak or quoted. | `404` for a missing path, one that climbs out with `..`, a folder, or a file that is not `text/x-plantuml`; `503 {"problem": …}` |
| `GET /apps/plantuml/render?path=<path>&diagram=<name or number>` | As above, for one diagram of a file that holds several (shipped, viewer round). `diagram` is a diagram's name (B1) or its position counted from 1, pages included, as the editor's tabs count; a name wins over a number. The server finds the index with the same block rules as the editor's B1 (`lib/Service/Diagrams.php`) and sends it to `<server>/svg/<index>`. Absent, it is the first diagram, as today. An optional positional `index` (0-based, `0`–`999`) names the place directly and decides when present, so a diagram is found by place and not by name. A diagram PlantUML draws no image for (a block left open after the last closed one: its `render` is past the last image, and the server answers that with a 400 page) is refused by name, never sent to the server, whose answer would read as "not a PlantUML server". | As above; the ETag is the file's, so it covers every diagram in it. | As above, and `400` for an `index` that is not an integer 0–999; `404 {"problem": "no diagram named <x>"}` (or `"no diagram <n>"`) when nothing matches, never a fallback to the first; `404 {"problem": "no image for <label>"}` for a diagram with no image, `<label>` as its tab reads |
| `POST /apps/plantuml/render` | JSON `{source}` → its SVG, for the README fences and the editor's live diagram. CSRF-checked. An optional `overrides` (shipped, linked-files round; editor spec R13) maps a path, as written on a `<style file=…>` or include line and relative to `path`'s folder or absolute (`/…`, resolved by the resolver's own rules), to text the resolver reads instead of that file, so the open linked file draws before it is saved; only with `path`, and only for files the caller can read. Overrides replace only folder files, never a zip entry. Text reached through override text loses the owner's view-only exemption, including through `!import` zips. A request with overrides but no `path`, a malformed override or more than 64 is a `400`; source plus override texts past 1 MiB is a `413` (`The diagram is too large to draw`). `{source, index}` (shipped #36; an integer 0–999) draws the diagram at that 0-based index, through `<server>/svg/<index>` (editor spec B5). An optional `path` (shipped #38) resolves relative includes and `<style file=…>` against that file's folder in the caller's files (editor spec R1–R4). | None (core's default). | `400` for a blank source or an `index` that is not an integer 0–999; `404` for a `path` the caller cannot read; `503 {"problem": …}` |
| `GET /apps/plantuml/colors` | `{"colors": {"AliceBlue": "#F0F8FF", …}}`: the names from the server's `help colors`, each with the hex its `colors` drawing gives it, for editor spec X14 (shipped #38). | As the themes row. | As the themes row. |
| `GET /apps/plantuml/export?path=<path>&format=<f>&diagram[]=<n>` (shipped, viewer round) | The diagrams of the `.puml` at `path` (resolved as `GET /render`) in format `svg`, `png`, `pdf`, `eps` or `txt` (ASCII art), each through `<server>/<format>/<index>`. One `diagram[]` (repeatable, positions from 1 as the tabs count, or names; `index[]` beside it takes 0-based places and decides when present) answers that file as a download, `<file> - <diagram>.<ext>`; several, or none (every diagram PlantUML draws an image for), answer `<file>.zip`. None asked leaves out a diagram with no image (a block left open after the last closed one); one asked for by `diagram[]` or `index[]` is refused. In a name, a diagram's label is cut at 150 characters, and unsafe characters (`/ \ : * ? " < > |`, C0 and C1 controls, and `\p{Cf}` such as a bidi override), with the spaces around them, become ` - `. | None. | As `GET /render`; `400` for another format; `404` for a file on a share that forbids download; `404 {"problem": "no image for <label>"}` for an asked diagram with no image, `{"problem": "no diagram has an image"}` when none asked leaves nothing; `413 {"problem": "The export is too large"}` past 100 diagrams or 50 MiB |
| `GET /apps/plantuml/templates` (agreed, TP3) | `{"files": [{"source", "path", "text"}, …]}`, the shared and the caller's own template files (TP1). | None: read on each open of the Add menu or modal. | A missing folder or an unreadable file is left out, never an error |
| `GET /apps/plantuml/fonts` | `{"fonts": [...]}`: the font families the server's `help font` lists, the only ones a diagram can use, for editor spec W4 (shipped, #41). | As the themes row. | As the themes row. |
| `GET /apps/plantuml/keywords` | `{"diagrams": [...], "types": [...], "keywords": [...]}`: the `@start…` types and other keywords from the server's `help keywords`, the element types from `help types`, for editor spec X11 (shipped, #39) and X2, which reads it in round 3. The stdlib completion (X5) needs no route: its per-library index ships with the app under `stdlib-index/`. | As the themes row. | As the themes row. |
| `GET /apps/plantuml/sprites` | `{"sprites": [...]}`, the server's ArchiMate sprites from `listsprite`, for editor spec T9 (agreed, round 3). Same caching and refusals as the row below. | | |
| `GET /apps/plantuml/stdlib` | `{"stdlib": [{"name": "c4", "version": "2.13.0", "source": "https://github.com/plantuml-stdlib/C4-PlantUML"}, …]}`: the libraries the server's `stdlib` command lists, in its order, for editor spec X5 (shipped, #41). | As the themes row. | As the themes row. |
| `GET /apps/plantuml/themes`, `/icons`, `/emoji` | `{"themes": [...]}`, `{"icons": [...]}`, `{"emoji": [...]}` for the editor's `!theme`, `<&icon>` and `<:emoji:>` completion (editor spec C3, C7). No CSRF token: a GET that changes nothing. | A day per server URL on the server (`RenderService`); none over HTTP. The editor asks once per page, and a failed answer is an empty list until the next page load. The first `/emoji` of a day takes about 9 s (one text render per Unicode block, in a row). | `503 {"problem": …}` |
| `POST /apps/plantuml/test-connection` | `{success, message}` (see `ConfigController`). | — | admin or delegated admin only |

Both render routes answer a render with **200** and the server's content type, whatever
status the server used: a mistake in the diagram is PlantUML's error image, and the
routes forward the server's `X-PlantUML-Diagram-Error` (one line, at most 200 characters)
and `X-PlantUML-Diagram-Error-Line` (0-based from the top of the source, fact 6; only
when the server sent a number). The editor turns them into an underlined line (editor
spec V3).

The POST route grants a logged-in user nothing the GET route did not: anyone who can
render text can already upload it as a `.puml` and render that. What it must never do is
serve an anonymous caller, which is the one line the non-goals draw.

Error wording is one vocabulary, used by the health check, the endpoints and the editor
alike: **not set · unreachable · not a PlantUML server**. The routes answer the word; the
admin card and `occ` say its admin line. All three are about the server and are the
admin's to fix. A mistake in a diagram is not in the list, because the server draws it
into the image and the app never paraphrases it. An answer that is neither a render nor
the route's `{"problem": …}` (a proxy's error page, an expired session's login page, a
network failure) is not a server verdict either: the Viewer and the editor show one fixed
line, **Could not draw the diagram**, and the admin card **Could not test the
connection**. The Viewer's other copy: **Diagram toolbar** (the toolbar group's
`aria-label`) and **Could not export the diagram** (a failed export, unless the route
says its own problem).

### Frontend (`src/`, `js/`)

Three bundles built by Vite, one per surface (`package.json`):
`dist/plantuml-files.js` and `dist/plantuml-readme.js` load on every Files page as
single-file IIFEs, and `dist/plantuml-editor.js` only when the editor first opens. From
round 1 of the diagram types the editor is an ES module whose per-type profiles are
hashed chunks under `dist/chunks/`, loaded when a file holds that type (editor spec
P1–P6).

| Unit | Does |
|---|---|
| `files.js`, `files-helpers.js` | Registers the Viewer handler for `text/x-plantuml` (queued on `window._oca_viewer_handlers` when the Viewer loads later), which makes a plain click open the diagram in Nextcloud's standard image lightbox. Registers two file actions for one diagram in the user's files (not a multi-selection, not the trash): **Edit diagram** (order 1, after the Viewer's View), shown only when `server_configured`; and **Open with text editor** (order 2), `OCA.Viewer.openWith('text', { path })`, shown whenever the Viewer is there. Registers **New puml File** in the **+ New** menu, with or without a server: asks Files' create endpoint (fact 10) for `New diagram.puml` (made unique among the folder's names) in the current folder, which `NewDiagramListener` fills; stats it over WebDAV, emits `files:node:created` and opens the editor on it. A failure is logged and shown as "Could not create the diagram". Opening the editor first adds the editor bundle, once, with the Files bundle's `?v=` and `&h=<the editor build's hash>`; a load that fails is forgotten so the next open retries, and that open falls back to the Viewer. `open-editor.js` does the loading and the opening, for the Files bundle and for the Viewer alike, which share it. |
| `viewer-component.js` | The Viewer component (Vue 2 `render(h)`, as Viewer stable34 mounts it, importing no Vue): a `<div>` the plain-DOM view in `src/viewer/` draws into (VW1–VW8: `diagram-view.js`, `sheets.js`, `toolbar.js`, `menu.js`), built only while the Viewer shows the file (it also mounts the previous and next files, hidden and inactive) and inert while hidden. The view reads the file once over WebDAV, splits it with B1, and draws each diagram **inline**, as sanitised SVG on its own sheet, from `GET /render?path=…&index=<n>`; a sheet that cannot be drawn shows, in white on the Viewer's black, the route's `problem` or, for any other failure, the fixed line **Could not draw the diagram** (#32). A diagram mistake is an image, so it shows PlantUML's error drawing. Shipped (viewer round). |
| `editor.js`, `editor/` | The **Edit diagram** overlay, specified in `2026-10-14-editor-design.md`. What it asks of the rest: the file over WebDAV (`editor/save.js`: GET with `Cache-Control: no-cache` (fact 11, E4), PUT with `If-Match` (S1), a copy with `If-None-Match: *` (S8), a Depth-0 `getetag` PROPFIND to watch for changes (E1)); the diagram from `POST /render`, 300 ms after typing stops and one request at a time (`editor/preview.js`, D3; an empty source is not sent), the problem line in its place when the server cannot (D4); the server's lists from `/themes`, `/icons`, `/emoji`, once per page (C8). Loaded on first use (O2). The answer is drawn **inline** as sanitised SVG, not an `<img>`, so its links work (`editor/inline-svg.js`, editor spec D1, #30). |
| `readme.js`, `readme/markdown.js`, `readme/workspace.js` | The README observer, loaded on Files pages. A `MutationObserver` on the page wakes when Text draws a `.ProseMirror` inside `#rich-workspace` holding code blocks or image figures not yet looked at. It asks Text's own `GET ocs/v2.php/apps/text/workspace?path=<dir>` which file the workspace shows (kept while the folder stays the same), reads it over WebDAV, and scans it for fences (backtick or tilde, CommonMark's closing rule) and relative images. Each `.code-block` is matched to the fence at the same index, and drawn only when that fence is `plantuml` and the block's text equals its source; its children are hidden and an `<img>` of `POST /render`'s answer (a `blob:` URL; renders cached by source, 64 of them, failures not kept) is added, the hidden source made non-editable and kept so if Text resets it. Each image figure whose `data-src` ends in `.puml` is hidden and our own `<figure>` goes after it: an `<img>` on `GET /render?path=…`, the path resolved against the README's folder as Text's `AttachmentResolver` does, with the Markdown alt text as its caption. Text's elements are hidden, never removed. Both drawings swallow the click, so Text's lightbox does not reopen them as a broken `.puml`. A fence the server cannot draw keeps Text's code block. **Several diagrams (agreed, round 4):** an image's `#fragment` names the diagram (`Screens.puml#login`, `Screens.puml#2`) and goes to `GET /render` as `&diagram=`, URL-decoded; the path before the `#` is what must end in `.puml`. When Text's figure has dropped the fragment from `data-src`, it is read from the README's own Markdown, matching images to figures in order. A fence draws each of its diagrams in turn, one `POST /render` per index, since the README shows its source and every block in it is the author's. |
| `js/admin-test.js` | The **Test connection** button, a plain script outside the build: POSTs to `/test-connection` with the request token, shows the message with a check or an error icon, and "Could not test the connection" for an answer that is not the JSON. |

### Why the README is a DOM observer, and the exit

Facts 1 and 2 leave two routes: a Text PR adding a code-block renderer API, or a script
that edits what Text drew. The observer is what every third-party README app does
(`files_readme_extended` mounts beside the workspace the same way) and is the only route
this app controls. Its cost is that one unit tracks Text's DOM, so a Text upgrade is the
one event that can break it silently, and the integration suite cannot see it without a
browser.

The exit is upstream: a nextcloud/text PR that lets an app register a renderer for a
fence language, which the maintainer invited in #705. When that lands, `readme.js`
shrinks to one registration call. It is a separate project and is not on this app's
critical path.

### Data flow for one `.puml`

1. Upload `diagram.puml`. Core detects `text/x-plantuml` from the extension, so the row
   wears the PlantUML icon. There is no thumbnail: the grid shows the icon, as it does
   for any text file.
2. Click the row → Viewer → `GET /render?path=…` → SVG, with the file's ETag; the next
   open revalidates and gets a `304` while the file is unchanged.
3. Right-click → Edit diagram → the editor bundle loads (first time only) → the file is
   read over WebDAV → each change, 300 ms after typing stops → `POST /render` → the right
   pane. Autosave writes it 2 s after the last change (editor spec S2) with `If-Match` →
   the file gets a new ETag → the next Viewer open draws the new diagram.

### Error handling

| Where | Server unset | Server down / not PlantUML | Diagram mistake |
|---|---|---|---|
| Admin health check (card and `occ`) | error, "Server URL is not set" | error, "Server is unreachable" / "Server is not a PlantUML server" | n/a |
| Viewer | one line, "not set" | one line naming the problem | PlantUML's error image |
| Editor right pane | the problem word, source still editable (Edit diagram is hidden; + New still opens the editor) | the problem word, source still editable | PlantUML's error image, and the line it names underlined in the source with its message (editor spec V3) |
| Render routes | 503 `{"problem": "not set"}` | 503 naming the problem | 200, PlantUML's error image, with `X-PlantUML-Diagram-Error` and `-Line` |
| List routes | 503 `{"problem": "not set"}` | 503 naming the problem; the editor offers no server names | n/a |
| README | fence stays a code block; image shows broken | same | PlantUML's error image |

Anything that is not one of these answers is the fixed line, **Could not draw the
diagram**, in the Viewer and the editor (see the error vocabulary above).

### Security

- The GET route takes a **path**, resolved in the caller's user folder; the POST route
  takes text from a logged-in, CSRF-checked caller; the list routes return only what the
  server lists. None serves anonymously.
- Only the server URL is admin-set, so only an admin decides where source leaves the
  instance. It is stored in plain `IAppConfig` (it is not a secret). The app sends
  requests to that server and nowhere else; `allow_local_address` per request lets it be
  an in-cluster address, a relaxation only an admin can point anywhere (`SECURITY.md`).
- **The app relies on the server's security profile.** What a diagram may `!include`,
  read or fetch is `PLANTUML_SECURITY_PROFILE` on the server, not a filter here. The
  kubed-io deployment pins `INTERNET` (fact 12): cluster addresses and local files are
  refused, public includes, the standard library and remote images work. A server run
  with a looser profile lets any user who can render reach what the server can.
- **The editor draws the server's SVG inline, sanitised** (`src/editor/inline-svg.js`,
  editor spec D1): a private DOMPurify instance with the SVG and SVG-filter profiles; no
  `<script>`, `<style>`, `<foreignObject>` or event handlers; a link keeps only an `http`,
  `https` or `mailto` address and opens with `target="_blank" rel="noopener noreferrer"`;
  `href` and `url()` may name only the diagram's own ids (or a `data:` image on an
  `<image>`/`<feImage>`), so nothing loads from outside; ids are prefixed
  `plantuml-diagram-`. The Viewer and the README keep the SVG inside an `<img>`, where it
  can run and load nothing.
- Content-Security-Policy is untouched: every image the browser loads comes from the
  Nextcloud origin or is a `blob:` URL of a render it answered, and the lazily added
  editor bundle is a script from the app's own path.

## The Viewer (shipped 2026-10-17, viewer round)

Dr K, 2026-10-17: "the double click to preview right now only shows the first diagram, it
should have tabs like the preview … somewhere in the UI we would have an edit button", then
"tabs should float centered … below some kind of toolbar like element where we can have our
edit button … something to display as tabs or just one after the other … or even a wall …
maybe an export button too". The Viewer's own bar (file name, its ⋯ menu, ×) stays the
Viewer's; everything below it is this component's.

| # | Requirement | Source | Status |
|---|---|---|---|
| VW1 | **The diagrams are drawn inline**, as the editor draws them (D1's sanitiser, `editor/inline-svg.js`), each on a white sheet (`plantuml.background`, 8 px radius, 40 px padding) on the Viewer's black, so links work. The file is read once and split with the editor's B1; each diagram is drawn through `GET /render?path=…&index=<n>` (its 0-based place). | Dr K: "the same preview like element with the embedded SVG" | shipped (viewer round) |
| VW2 | **A toolbar** floats centred under the Viewer's bar and stays in place when the page scrolls: a pill on `--color-main-background` with a 1 px `--color-border-maxcontrast` outline (the pill's own colour on black reads 1.17:1 in the dark theme, the outline 5.1:1) and the popover shadow. In order: the **Display** switch (Tabs, Stack, Wall; the active one on `--color-primary-element-light`), a divider, **Export ▾** (VW6) and **Edit** (VW7). The icons are the Penpot boards' own components, by ruling: `img/icons/view-tabs.svg`, `view-stack.svg`, `view-grid.svg`, `download.svg` in the Export menu, `chevron-down-small.svg` after Export, and `pencil.svg` for Edit. A file with one diagram shows no Display switch and no divider. | Dr K | shipped (viewer round) |
| VW3 | **Tabs**, on every open: a tab bar floats centred under the toolbar (the editor's B2 tabs, the "All diagrams" menu included), only with two or more diagrams; one sheet, centred in the space below, the first diagram on open. The toolbar and the tabs never move when the diagram changes size. | Dr K: "tabs should float centered if they exist at sort of a fixed location" | shipped (viewer round) |
| VW4 | **Stack**: every diagram as a card one after another, 720 px wide, the page scrolling under the fixed bar and toolbar. A card is a caption row (a checkbox labelled with the diagram's name) over its sheet, the card outlined as VW2's pill. | Dr K: "just one after the other on top of each other" | shipped (viewer round) |
| VW5 | **Wall**: the same cards in a wrapping grid, in file order. A click on a card (not on its checkbox) opens that diagram in Tabs; a click on a link inside a card opens the link and stays in the Wall. | Dr K: "a wall that could possibly try to organize them in a tile like grid" | shipped (viewer round) |
| VW6 | **Export** saves the diagram in view in Tabs, its button reading "Export". In Stack and Wall the checkboxes choose: none checked reads "Export all" and exports every diagram, N checked reads "Export N"; a checked card is outlined 2 px in `--color-primary-element`. The menu's heading names what is exported (the diagram's name, or "N diagrams, as .zip"), then **SVG, PNG, PDF, EPS, ASCII art** (the formats the server answers: checked live 2026-10-17, `utxt` answers 405, `latex` 404). One diagram downloads as `<file name> - <diagram name>.<ext>` (`<file name>.<ext>` when the file holds one diagram); several download as `<file name>.zip` of those files, through `GET /export` (below). | Dr K: "how does the export to like PNG work if there are multiple diagrams?" and "in tab mode we would know what to export" | shipped (viewer round) |
| VW7 | **Edit** opens the editor (O1) at the diagram in view: the open tab, or in Stack and Wall the first checked card, else the first diagram; its cursor goes to that diagram's `@start` line as B4 does. There is no edit control per card. | Dr K: "we only need the one edit in the toolbar" | shipped (viewer round) |
| VW8 | **The mode is not remembered**: every open is Tabs on the first diagram. | design | shipped (viewer round) |

**Rulings (viewer round, Dr K approved 2026-10-17).** `GET /export` takes several
diagrams as `diagram[]=` (PHP keeps only the last of a repeated plain
`diagram=`); one `diagram=` still works. Asked diagrams are drawn in file order,
each once; a set of one is one file. Zips are PHP's `ZipArchive`, since core's
`ZipStreamer` answers macOS with a tar. At most 100 diagrams and 50 MiB drawn per
export, else 413 "The export is too large"; no time cap beyond each render's 10 s.
A file on a share whose owner forbids download has no Export in the Viewer and
`GET /export` answers 404 for it (`IncludeResolver::forbidsDownload`, the rule
includes already follow). A repeated name in a zip gets ` (2)`; unsafe
characters become ` - `. A failed export says so under the toolbar ("Could not
export the diagram", or the route's problem) and saves nothing. The toolbar's
icons are the Penpot components'. Edit shows only with `server_configured`, as
O1's file action does. The toolbar group is labelled "Diagram toolbar".

## Templates (agreed 2026-10-17, add-diagram round)

What the editor's Add diagram (editor spec A1–A9) reads. Dr K, 2026-10-17: "admin can set a
directory and we ensure it exists like how the other nextcloud-* apps treat an 'admin
folder' … default to 'Templates' … a global option that our extension can see these files in
code … without having to literally share the files … our built in templates … built in …
ignore the tag filter for now … always select *.puml".

| # | Requirement | Source | Status |
|---|---|---|---|
| TP1 | **Three sources, one list.** The built-ins ship in the editor (A8). The **shared** templates are the `.puml` and `.plantuml` files (the `text/x-plantuml` type) under the admin's template folder (TP2), subfolders included, read on the server as the folder's owner, so nothing is shared and every logged-in user gets them. The **user's own** are those under the caller's Nextcloud Templates folder (`ITemplateManager::getTemplatePath()`, the per-user `core/templateDirectory` set in Files' settings), skipped when it is unset or missing; nothing in Nextcloud keeps a user from deleting it, and Files offers to make a new one. A file that is in both (the actor's own Templates folder when the admin folder is `Templates`) is listed once, as shared. | Dr K; platform facts checked on Nextcloud 34.0.3 | agreed (add-diagram round) |
| TP2 | **The admin's template folder** is a path in one user's files, default `Templates`, set on the admin card (TP4). That user is the **actor**, as `nextcloud-grafana` and `nextcloud-n8n` pick theirs: the app config `template_actor`, else the first member of Nextcloud's `admin` group. Saving the setting creates the folder in the actor's files when it is missing (`mkdir -p`, as the siblings' `ensureFolder`), and listing the templates creates it again if it has gone. A Team Folder works by naming its mount path in the actor's files. No tag filter. | Dr K | agreed (add-diagram round) |
| TP3 | **`GET /apps/plantuml/templates`** answers `{"files": [{"source": "shared" or "yours", "path": …, "text": …}, …]}`; the editor cuts each text into diagrams with B1 (A9). Capped as R2 caps includes: at most 64 files and 1 MB of text in all; a file past a cap, unreadable or not valid UTF-8 is skipped, never an error. Asked each time the Add menu or modal opens, so a new template file shows next time without a reload. | design | agreed (add-diagram round) |
| TP4 | **The admin card gains a Templates section** under the server URL: title "Templates", subtitle "Diagrams everyone can start from, in Add diagram", one field "Template folder" (default `Templates`), and a status line under it, "In <actor>'s files · N templates in M files" (N counts diagrams). `occ plantuml:show-config` prints `template_folder` and `template_actor`. | Dr K | agreed (add-diagram round) |
| TP5 | **Built-in templates never use `skinparam`**; any styling is a `<style>` block (editor spec A8). | Dr K: "skinparam is deprecated" | agreed (add-diagram round) |

## The design (Penpot, file "NXT PlantUML")

Every board is exported as a PNG under [`docs/design/`](../../design/README.md), so the
Penpot file is not needed to read this section.

Four pages, one per surface, drawn on 2026-10-13 against Nextcloud 34's light theme
(50px primary header, 300px navigation, 44px controls, 8px element radius and pill
buttons, Noto Sans); the Editor page and the + New menu were redrawn on 2026-10-14 to
match what ships (#23). Each page has its own prototype flow; links change state within a
page and never cross one. A fifth page, Components, holds the library: five `library / …`
boards (icons, controls, navigation and files, admin, editor) that hold the component mains
and are not screens.

| Page | Boards | What the click does |
|---|---|---|
| Admin | `screens / admin` → `screens / admin-success`; `Admin — health check states` | *Test connection* reveals the result line. The states board holds the four lines the check can show: `PlantUML 1.2026.8`, `Server URL is not set`, `Server is unreachable`, `Server is not a PlantUML server`. |
| Editor | `screens / editor` → `screens / editor-saving` → `screens / editor-saved`; `screens / editor-autocomplete`, `screens / editor-lint`, `screens / editor-style`, `screens / editor-style-stepper`, `screens / editor-dark`, `screens / editor-diagram-only` | The unsaved board (check with a dot, the divider's handle) moves to saving and then saved by itself after a delay, as autosave does; a click on the save state saves at once; typing in the saved board makes it unsaved again. *Add name* on the lint board returns to the editor. The other boards are states: connector completions after `node1 `, the unnamed-`@startuml` warning with its panel, a `<style>` block with swatches before its colours and the pencil after `FontStyle bold` opening its list (bold first), the stepper after `FontSize 22`, the dark theme with search open. The Source toggle switches between the editor and `screens / editor-diagram-only`, where it is unpressed and the diagram spans the full width. Detail: editor spec. |
| Files | `screens / files`, `screens / viewer` (Tabs on `nodes`), `screens / viewer-order-flow`, `screens / viewer-config`, `screens / viewer-stack`, `screens / viewer-wall`, `screens / viewer-single`, `screens / editor (from the viewer)`, `overlay / export-menu-…` (`nodes`, `order-flow`, `config`, `all`, `checked`, `single`), `overlay / context-menu`, `overlay / new-menu` (2026-10-17) | A row's name or icon opens the Viewer: Order flow.puml in Tabs on its first diagram, Checkout.puml on the one-diagram board; × returns. Tabs switch boards; Tabs, Stack and Wall switch modes; Export opens its menu for what is in view (VW6); Edit lands on a copy of the Editor page's `screens / editor-saved` (a component), whose × returns to Files; a Wall card opens its diagram in Tabs. The row's *…* and *+ New* open their menus as before. |
| Readme | `screens / readme` ↔ `screens / readme-source` | The Diagrams folder with Text's README workspace above the list: a ```` ```plantuml ```` fence and an `![Order flow](Order flow.puml)` both shown as the diagram, the image with its alt text as caption. Clicking the README.md row shows the markdown source; its × returns. |
| Add diagram (2026-10-17) | `screens / editor`, `overlay / type-menu`, `screens / add-modal-uml` with `overlay / class-preview`, `screens / add-modal-hover` (a still), `screens / add-modal-mindmap`, `screens / added-class`, `screens / added-gantt` | **+** opens the modal on UML; **▾** opens the type menu, where Gantt adds an empty Gantt. In the modal, holding the pointer on Class pops up the text it adds and a click adds it: one blank line, then the block, its tab active, the cursor inside. The search box shows the list after typing "mind"; × returns. Only Gantt, Class and the search are wired. |
| Linked files (2026-10-17) | `screens / linked-main` (the `<>` chip after `<style file=./UML_Fun.css>`), `screens / linked-ctrl` (the path underlined while Ctrl is held), `screens / linked-style` (`UML_Fun.css` open), `screens / linked-include` (`UML_Fun_parts.puml` open, no chips in it) | The chip or the underlined path opens the file; the breadcrumb's × or first crumb goes back. The diagram pane keeps the main file's tabs throughout and draws the style file's colours. |

Copy on the admin card: section title "PlantUML", subtitle "Point to your PlantUML server",
field label "Server URL", button "Test connection". Nothing else. The Templates section (TP4, 2026-10-17) adds title "Templates", subtitle "Diagrams
everyone can start from, in Add diagram", field label "Template folder" and the status line
"In admin's files · 12 templates in 4 files", on both admin boards.

Added on 2026-10-17: the Components page holds `library / viewer` (`viewer-header`,
`viewer-toolbar`, `display-option` (Active, Default, Hover, Focus), `toolbar-button` (Default,
Hover, Focus), `viewer-tab-bar`, `diagram-sheet`, `diagram-card` (Checked False, True),
`checkbox` Checked=True, `export-menu`, and the drawings `diagram / nodes` and
`diagram / config`), `library / diagram icons` (the 36 icons of editor spec A7 as
`icon / type-…` and `icon / uml-…`, and `icon-tile`) and `library / add diagram`
(`split-button` (Default, HoverAdd, Open, Focus), `type-row` (Default, Hover, Active),
`template-row` (Default, Hover), `template-preview`); `editor-bar` holds the split button, so
every editor board shows it. The Style guide page has `style-guide / diagram-icons`. Links on
the Files, Add diagram and Linked files pages sit on transparent hotspots on the boards, never
on layers inside component copies, since editing a main resets those copies' links.

Every board is built from library components, and every fill, stroke, radius, shadow and
flex spacing on a layer is a token (2026-10-14), with two exceptions: the syntax colours in
the editor boards' `source / code` texts are per-character fills, which Penpot cannot bind
to a token, so they copy the token values; and the style boards paint their diagram's
participants (and the swatches) in the style block's own `#FFE08A` and `gold`, the
diagram's colours rather than the theme's. Colour tokens carry the names of the Nextcloud
variables they stand for (`color-main-text`, `color-primary-element-light`, …) in a `Light`
and a `Dark` theme. Switching to `Dark` flips every board except two: `editor-dark` binds
pinned `dark.*` tokens so it stays dark whichever theme is active, and the code texts keep
their light syntax colours. The PlantUML drawing has its own `plantuml.*` tokens because it
is the server's picture, not the theme's. The components are on the Components page as
`Name / Property=Value`: the icons, `icon-button` (Default, Hover, Pressed, Focus),
`source-toggle` (Pressed), `save-indicator` (Unsaved, Saving, Saved), `tab` (Active,
Inactive), `tab-strip`, `editor-bar`, `source-pane`, `splitter`, `fold-placeholder`,
`completion-row` (Default, Selected), `value-chooser` (Default, Hover), `number-stepper`
(Default, HoverUp, HoverDown), `color-swatch`, `checkbox`, `app-navigation` (Heading),
`navigation-item`, `files-table-head`, `files-row`, `menu-item`, `menu-separator`, `button`
(Primary, Secondary, PrimaryLight), `text-field` and `health-check`. Two older mains stay
where they were drawn: `header` (Admin board) and `order-flow`, the rendered diagram (the
editor's right pane), drawn from shapes in PlantUML's default style because the Penpot
backend could not fetch a render from any server.

Not drawn: the editor's right pane when the server is down (one line of the error
vocabulary where the diagram would be), and the README surface, which is Text's own
rendering with our images in it.

## Testing

| Suite | Covers |
|---|---|
| PHP unit (`tests/unit/`, PHPUnit, OCP stubbed as in the siblings) | `RenderService`: request shape, problem classification (no URL → not set; connect failure → unreachable; 404, 405 or a non-image body → not a PlantUML server; an image with a 400 → a render), version parsing, the themes, icons and emoji parsing with their caps, a day's cache per server and no cache for a failure, the error header as one short line with its number. `RenderController`: the path rules (outside the folder, climbing out, missing, a folder, plain text → 404), ETag and 304, a blank source → 400, a server problem → 503 with the problem, a syntax error still a 200 image, the error headers forwarded (and no line without one), the three lists. `Diagrams` (held to the editor's answers by `tests/fixtures/diagrams/expected.json`), `DiagramFiles`, `ExportController` (one file or a zip, names, caps, refusals), `ConfigController`, `ServerConfig`, `InstanceSettings`, the three commands, `NewDiagramListener` (S3's one space included), `LoadFilesScriptListener` (the editor bundle left to first use), `RegisterMimetype` and `UnregisterMimetype` (an admin's override survives). |
| JS unit (`tests/js/`, vitest with jsdom) | `files-helpers` (action gating, the editor bundle URL), `files`, `viewer-component` (problem word and fixed line, the Viewer's modes, Export and Edit; `src/viewer/` has its own tests), `readme/markdown` and `readme/workspace`; every editor module, as the editor spec's Testing says. |
| Behat (`tests/integration/`) | A real Nextcloud (PHP's built-in server, SQLite, `allow_local_remote_servers`) and a `plantuml/plantuml-server:jetty-v1.2026.8` container. Pull requests run Nextcloud stable34; `main` runs stable32, stable33 and stable34. Three suites, partitioning `features/` by path. **admin**: `connection/admin.feature` over `occ`, `lifecycle.feature` (enable, disable, the file type). **diagrams**: `view.feature` over the GET route; `edit.feature` over WebDAV GET and PUT with `If-Match` (someone else's change stamped with `X-OC-Mtime`, since two local-storage writes in one second can keep the ETag), the copy with `If-None-Match: *`, `POST /render` for the changed diagram and the mistake's line, `GET /themes` compared with the server's own `help themes`; `create.feature` through Files' create endpoint. **readme**: `render.feature` reads the README over WebDAV and draws its fence through `POST /render` and its image through `GET /render`. |
| Not in Behat | `@blocked`: "Removing the app", because `occ` cannot remove an app. No `@ui` scenario, since Dr K's ruling of 2026-10-14. What only a page shows — the Viewer's lightbox, where a README's drawing lands, the editor's layout, highlighting, colour picker and change watcher — is unit-tested where it can be and checked by hand on the live instance. The icon and emoji routes are unit-tested only: the scenarios "Asking for the server's icons" and "Asking for the server's emoji" are proposed and await Dr K. |

Behat runs in CI only, never in a pod. PHPUnit, `php -l`, Psalm and php-cs-fixer may run
in the code-server pod (Dr K, 2026-10-14). The three quality-job guards from the
siblings (`check-suites.sh`, `check-notes-anchors.sh`, `check-step-definitions.sh`) come
across unchanged.

## Traps found in the live instance

- **Object storage.** S3 writes one space for an "empty" new file; `NewDiagramListener`
  counts it as blank (#19).
- **Same-second ETags.** On local storage two writes in one second can keep the same
  ETag; the conflict scenario stamps `X-OC-Mtime`.
- **Asset caching.** App JS and CSS are cached for six months under a `?v=` that changes
  only with the app version. The lazily added editor URL carries `&h=<build hash>`
  (#20); the Files and README bundles and the CSS need one hard refresh after a hand
  deploy.
- **Route caching.** The route table lives in APCu in the web server and can outlive its
  3600 s TTL, so a new route answers 404; `apachectl -k graceful` fixes it.
- **WebDAV GET has no `Cache-Control`** (fact 11): `editor/save.js`'s `loadFile`, used by
  the editor and the README observer, sends `no-cache` (#29).
- Styling and browser-driving traps (core's `server.css` on every
  `div[contenteditable]`, files_bpm's forced black, Nextcloud's buttons outranking a
  single class, selenium key presses on `.cm-content`) are the editor's: editor spec,
  Traps.

## Known limitations and open proposals

- The README still shows the diagram as an `<img>`, so its links do not work there.
  *Proposed, not agreed:* inline SVG through `inline-svg.js`. The Viewer has it since the
  viewer round (VW1).
- *Open with Dr K (2026-10-17):* his rule that buttons carry no words came after the viewer
  toolbar was drawn with labels (Tabs, Stack, Wall, Export, Edit); whether it goes icon-only
  too waits on him. The Add button already is (editor spec A1).
- Wall's open-in-Tabs is pointer-only; Tabs, and the diagram's tab, reach the same state by keyboard.
- An included `newpage` shifts the picture by one page.
- The Wall is drawn with every card at its diagram's own size. With many or large
  diagrams the cards may need to shrink to thumbnails; not decided.
- A template file's relative includes resolve beside the file it is added to, not beside
  the template (editor spec Known limitations).
- The first `/emoji` of a day takes about 9 s, so the first `<:` completion waits for it.
- Trash and shares need nothing from the app (#13, closed): a `.puml` is a plain file to
  Nextcloud. The file actions are not offered in the trash (the `/files` root guard), and a
  received share sits under the recipient's `/files`, so the actions, the Viewer and the render
  route work there. A public link has no logged-in user, which the scope rules out.
- The README observer tracks Text's DOM, so a Text upgrade can break it without any test
  noticing (see the exit above).
- Editor-only limitations (no WebDAV timeout, the notify_push bundle cost, links hidden
  from screen readers, the colour picker's named colours and alpha, Creole edge cases)
  and open proposals (L6, C5, D2, named colours, a diff view in the conflict state) are
  in the editor spec's Known limitations and Open proposals.

## Decisions taken in this spec

| Decision | Chosen | Alternative not taken |
|---|---|---|
| App id / name | `plantuml` / **PlantUML Diagrams** | `plantuml_render`; the bare product name reads as official |
| Mimetype | `text/x-plantuml`, extensions `puml` and `plantuml` | `application/x-plantuml` (SkyV0x); `text/` keeps generic text tooling willing to open it |
| Fence language | `plantuml` only (fact 7) | `puml` as an alias — two editors' courtesy, not a standard; `c4plantuml` — nobody asked |
| Default click on a `.puml` | the Viewer, Nextcloud's standard image lightbox | the editor; a diagram is read far more often than it is changed |
| Editing | the app's own side-by-side editor, source left and diagram right | Text's plain editor — no highlighting, no preview |
| Editor engine | **CodeMirror 6**, used directly from `@codemirror/*`, with a PlantUML `StreamLanguage` written as a simple-mode rule table ported from Prism's `prism-plant-uml` (MIT), kkeisuke's CM5 mode as a second reference; the split pane is ours (fact 9). The spec said "in a thin Vue component"; it shipped as a plain DOM overlay, which needed no Vue. | an off-the-shelf editor — none is a component with a PlantUML grammar and a pulse; Monaco — 5–10× the bundle, AMD loader and workers inside a Nextcloud app, and no PlantUML tokenizer either; a TextMate bridge — 160 kB of wasm for a grammar Shiki does not even carry |
| Editor bundle | added to the page the first time the editor opens (#15) | on every Files page — most of the app's JavaScript, for pages that never open it |
| The diagram in the editor | inline, sanitised SVG (Dr K: "let's draw it inline with svg", #30) | an `<img>` — safe, but its links cannot be followed |
| Choosing one diagram of several in a README | `x.puml#name` or `x.puml#2`: the name the editor's tab shows, else the position counted from 1 like the tabs; the server resolves it | `?diagram=` in the image path — any other Markdown reader (GitHub, an IDE preview) would look for a file whose name holds the query, while a fragment is ignored there and the file still shows; 0-based numbers — PlantUML's own index, but not what a reader counts |
| A fence holding several diagrams | draws them all | only the first — hides what the author wrote right there in the README |
| Fences | a POST passthrough render for logged-in users | `path=<README>&fence=<n>` — the server would re-parse Markdown to find text the client already has |
| Image format | SVG everywhere | PNG — only a thumbnail would have needed a raster, and there is none |
| Thumbnails | none; the grid shows the file-type icon, as Nextcloud does for any text file | a preview provider of our own (fact 3) — code written for a behaviour nobody asked for |
| Secondary opener | Text's plain editor, through `OCA.Viewer.openWith('text', { path })` (changed during the build, #3) | `OCA.Text.createEditor()`, the spec's first choice — it forces Text's Markdown editor, whose serializer would rewrite PlantUML source; a textarea of our own, as the siblings did for JSON — a rewrite of what Text already does |
| README image click | swallowed, so Text's lightbox cannot show a broken `.puml` | open the file in the Viewer — a link nobody asked for |
| Admin surface | URL + Test connection, nothing else | a format or timeout setting — neither is a decision an admin makes per instance |
| Error vocabulary | three fixed problems, shared by every surface | per-surface wording |
| A new diagram's starting lines | written by the server, `NewDiagramListener` on Files' create endpoint (Dr K, 2026-10-14: "regardless of an api call or click in the UI you would get the same start/end uml tags") | the + New handler PUTting them from JavaScript — only that one client would get them |
| The **+ New** entry | our own, "New puml File", opening the editor | a `TemplateFileCreator` — a second entry, and the new file opens in the Viewer (fact 10) |
| Saving in the editor | by itself as Text does (Dr K, 2026-10-14): 2 s after the last change, at least every 30 s, stopped by a conflict; closing saves first, and asks before discarding when that save fails or hangs 10 s (editor spec S2, S4) | Save only — a long edit all at risk until a click; Text's 5 s session sync — there is no session to sync to |
| Autocomplete | `@codemirror/autocomplete`, one source per file in `src/editor/completion/`, registered through the language's data facet so a source is a file and a line; Tab never accepts | one hand-written source with every rule in it — the pattern was the point (Dr K: "a pattern going for autocomplete that we can expand on") |
| What the server knows (themes, icons, emoji) | the server's own lists, through the app's routes, cached a day per server URL | a list written into the bundle — wrong the day the server's version differs |
| Validation | `@codemirror/lint`, one rule per file in `src/editor/lint/`, each `(state) => Diagnostic[]`, so a rule is a file and a line; the server's mistake is a rule too, reading the last render's error line from editor state | a hand-written underline layer — CodeMirror ships the wavy marks, the gutter, the tooltip and a panel |
| Editor conveniences | stock CodeMirror only: active line, bracket matching and closing (`'` is never paired, it starts a comment), search with its panel on top, selection matches, `toggleComment` from the mode's `commentTokens`, `indentWithTab`; all themed with Nextcloud variables | hand-rolled equivalents — CodeMirror ships each one |
| A change made elsewhere | looked for by ETag (Dr K, 2026-10-14: "maybe even a simple poll to check like the etag"): a Depth-0 `getetag` PROPFIND every 10 s while the page is visible and at once when it is shown or focused, or on notify_push's `notify_file` with a 60 s poll behind it when that app is there; a clean source takes the new version in, an unsaved one is the save conflict; a Reload icon in the bar at all times (editor spec E1–E4) | notify_push alone — an app of its own with a push daemon, not installed on the live instance; a full GET per poll — the whole file every 10 s to learn one header; reloading over unsaved changes — loses ours without asking |
| The save indicator | Text's: one icon button, check when saved, a primary dot while not, core's `icon-loading-small` while saving, the time since the last save as its tooltip (editor spec S3) | a "Save" pill and status words — Dr K's terse-UI rule, a dot not a word |

## Rulings from Dr K (2026-10-13)

- **Use what Nextcloud has before writing anything.** A high-priority goal for every
  decision below and every one still to come.
- **No thumbnails.** A thumbnail for `.puml` would need a preview provider of our own;
  Nextcloud shows a text file's icon in the grid natively, and that is what a `.puml`
  gets. The provider is out, and with it the PNG path.
- **A new diagram holds an empty diagram**: `@startuml`, a blank line, `@enduml`.
- **Text's plain editor stays as the secondary opener**, "Open with text editor".
- **The editor's left pane is CodeMirror 6** (ruled 2026-10-13, "the lightest-weight
  option"). Highlighting wins over Text's free save path; the save path is ours to write.

## Rulings from Dr K (2026-10-14)

Editor rulings are listed here with the requirement they became; the editor spec holds
the detail.

- **"The behat tests should not need the browser."** Gherkin never names the medium: it
  states what holds before and after, and the step definition picks how to get there.
  "If you think a browser is needed in behat it's because of how you worded the feature."
  `edit`, `create` and `readme/render` were reworded and run over WebDAV, Files' create
  endpoint and the render routes; the scenarios about layout ("Opening a diagram file for
  editing"), Text's editor ("Opening a diagram file as plain text") and the Viewer's click
  were dropped (#18).
- **"Try not to have any `@ui` tags."** `@ui` only when a browser is unavoidable, and then
  also `@blocked`, untested for now. It no longer means "has a user interface";
  `connection/admin.feature` lost it.
- **"It's ok to break that psalm rule now that this pod actually has php."** Psalm and
  php-cs-fixer may run in the code-server pod; Behat stays CI-only, and nothing runs in a
  service pod.
- **"The fact JS would make the start and end tags is odd. Shouldn't the backend do
  that?"** The backend writes a new diagram's starting lines, so an API call and a click
  give the same file (`NewDiagramListener`, #18; see the decisions table).
- **"New puml File"** is the **+ New** label (Dr K, 2026-10-17, viewer round; it was "UML Diagram", #18). The file it makes is still `New diagram.puml`.
- **"I would like ours to auto save after some time … after some inactivity."** Autosave
  and Text's save indicator (S2, S3, #21).
- **"Get a pattern going for autocomplete that we can expand on."** One file per
  completion source and per lint rule (C1, V1, #21, #22).
- **"Maybe even a simple poll to check like the etag."** The change watcher (E1–E3, #28).
- **"It should auto fit so it's always visible."** (L4, #26.)
- **"Let's just always wordwrap."** (L5, #25.)
- **"Let's draw it inline with svg."** The editor's inline, sanitised diagram (D1, #30).
- **"Check for existing libs to use."** The colour picker is
  `@uiw/codemirror-extensions-color` (C6, #33); Creole's highlighting and completion are
  the app's own mode rules and completion source (H8, C7).
- Approved the two server-knowledge scenarios ("Asking for the server's themes", "A
  mistake in the source names its line") and the two narrative lines that no longer name
  the Files app (#23).
- **"We also should have a superpowers spec just for the editor."**
  `2026-10-14-editor-design.md` (#27).

### The editor choice, as it was weighed

The "use what is built in" rule and "a nice editor with syntax highlighting" pulled
against each other, and only one could win:

| | Text's editor, via `OCA.Text.createEditor()` | CodeMirror 6 + our grammar |
|---|---|---|
| Highlighting | **none** — Text colours code with highlight.js, which has no PlantUML grammar and no way to add one | PlantUML, from the ported Prism grammar |
| Save, autosave, conflicts, sessions | Text's own, for free; `onUpdate(content)` feeds the preview | ours: WebDAV PUT, dirty state, ETag conflict handling |
| Collaborative editing | yes, Text's | no |
| Code we write | the split pane and the preview | the split pane, the preview, the grammar, and the save path |

Highlighting was the point of the editor, so it is CodeMirror, and the save path is the
price: load over WebDAV, a dirty flag, PUT with `If-Match` on the ETag, and a plain
"someone else changed this file" refusal when it does not match. No collaboration. (The
price grew on 2026-10-14: autosave, Reload or Save as copy after a refusal, and a watcher
for changes made elsewhere; editor spec S2–S10, E1–E4.)
