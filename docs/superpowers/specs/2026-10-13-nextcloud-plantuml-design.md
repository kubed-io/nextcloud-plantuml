<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# nextcloud-plantuml — design

A Nextcloud app that shows PlantUML diagrams where people already read them: a `.puml`
file in the Files app, and a folder README that quotes or embeds one. The drawing is done
by a PlantUML server the admin names once; the app holds no diagrams of its own.

Fourth member of the kubed-io nextcloud-* family after `nextcloud-n8n`,
`nextcloud-grafana` and `nextcloud-penpot`. It borrows their skeleton, CI, documentation
cascade and Gherkin rules, and none of their sync machinery.

## What it does

Each behaviour is owned by one feature file. The folder is the noun, the file is the
verb.

| # | Behaviour | Feature file |
|---|---|---|
| 1 | An admin points the app at a PlantUML server and tests it | `connection/admin.feature` |
| 2 | `.puml` is its own file type, with its own icon | `lifecycle.feature` (an end state of enabling) |
| 3 | Click a `.puml` → its diagram opens in the image viewer | `diagrams/view.feature` |
| 4 | A URL that names a `.puml` file answers with its image | `diagrams/view.feature` |
| 5 | Right-click a `.puml` → edit it, source beside the live diagram | `diagrams/edit.feature` |
| 6 | **+ New → UML Diagram** makes a `.puml` and opens the editor on it | `diagrams/create.feature` |
| 7 | A folder README shows its ```` ```plantuml ```` fences and `![](x.puml)` images as diagrams | `readme/render.feature` |

Delete, rename, move, copy, trash, restore, share: Nextcloud's, untouched. A `.puml` is
an ordinary file.

## What it does not do

- **No CRUD API for diagrams.** Nextcloud's own files, WebDAV and sharing are the API.
- **No folder mappings, no sync, no metadata.** A `.puml` is an ordinary file wherever it
  sits; the PlantUML server never holds one.
- **Nothing for anonymous callers.** Every render is for a logged-in user. Public share
  pages are out of scope.
- **Files app and folder README only.** Not Text's full-page editor for `.md` files, not
  Collectives, not Talk.
- **Nothing per user.** One server, set by the admin, used by every logged-in user.

## Platform facts the design rests on

Verified against the live instance (Nextcloud 34.0.3, Text 8.0.0) and upstream source on
2026-10-13.

1. **The folder README is Text's "workspace".** `WorkspaceService` finds `Readme.md`,
   `README.md`, `readme.md` or `.Readme.md`; `RichWorkspace.vue` shows it first with
   `RichTextReader` and then, once ready, with Text's full editor, which is the view that
   lasts (found during the build; the observer therefore sees two renders per folder). Code fences go through
   `CodeBlockView.vue`, whose one renderable language is hard-coded:
   `supportPreview() { return ['mermaid'].includes(this.type) }`. There is no
   registration call, event or markdown-it slot; `window.OCA.Text` exposes only
   `createEditor` and `createTable`. nextcloud/text#705 asked for PlantUML in 2020 and was
   closed; the maintainer's suggestion that other apps could register code-block
   renderers was never built.
2. **A relative Markdown image is a raw WebDAV URL.** Text's `AttachmentResolver` turns
   `![](diagram.puml)` into `dav/files/<uid>/<dir>/diagram.puml` and `ImageView.vue` puts
   it in an `<img>`, with no mimetype check and no preview. The browser receives PlantUML
   text and shows a broken image. Clicking any embedded image opens Text's own lightbox
   (`showImageModal`), which re-resolves images from their original `src`; it never opens
   the Nextcloud Viewer and never links to the file.
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
   when a handler claims its mimetype.
6. **The PlantUML server renders from a POST body.** `POST <server>/<format>` with the
   diagram text as the body returns the image. A `version` diagram rendered as `/txt`
   names the server's PlantUML version. A server that is not PlantUML answers 405 or 404;
   an unreachable host fails to connect. A syntax error is drawn into the image and
   answered with **HTTP 400** plus an `X-PlantUML-Diagram-Error` header (verified against
   1.2026.8 during the build), so the app decides "is this a render?" by the body's
   `image/*` Content-Type, whatever the status; a non-image body at any status is `not a
   PlantUML server`.
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
    the Viewer, not our editor.

## Architecture

```
                 ┌──────────────────── Nextcloud ────────────────────┐
  browser        │                                                   │     PlantUML server
                 │  Files app ─ src/files.js                         │
  .puml click ──▶│    default: Viewer handler ──▶ GET /render?path=… ┼──▶ POST /svg
  right-click ──▶│    Edit diagram ──▶ src/editor.js (source | diagram)
  + New ────────▶│    UML Diagram ──▶ Files' create ──▶ editor        │
  README ───────▶│  Text workspace ─ src/readme.js (DOM observer)    │
   ```plantuml   │    fence  ──▶ POST /render  {source}              │
   ![](x.puml)   │    <img>  ──▶ GET  /render?path=…                 │
                 │  Admin settings ─ Instance card ─ Test connection ┼──▶ POST /txt (version)
                 │  occ plantuml:set-url · test-connection · show-config
                 └───────────────────────────────────────────────────┘
```

### Backend (`lib/`)

| Unit | Does | Depends on |
|---|---|---|
| `Service/ServerConfig` | Reads and writes the one setting, `server_url`, through `IAppConfig`. Normalises the trailing slash. | `IAppConfig` |
| `Service/RenderService` | `render(string $source, string $format): Rendered` — POSTs the source to `<server>/<format>`, returns bytes + content type, or throws `RenderException` naming the problem (`not set`, `unreachable`, `not a PlantUML server`). `version(): string` renders the `version` diagram as text and parses the version out. | `ServerConfig`, `IClientService` |
| `Controller/RenderController` | Two routes, one service. `GET /apps/plantuml/render?path=<path>` resolves `path` in the **calling user's** folder, so a user can only render what they can read; answers the image with the file's ETag, `304` on a matching `If-None-Match`, `404` for a missing or non-`.puml` file. `POST /apps/plantuml/render` with `{source}` renders text for the README fences and the editor's live preview; CSRF-checked, logged-in only. Either answers `503` naming the problem when the server cannot render. | `RenderService`, `IRootFolder`, `IUserSession` |
| `Settings/InstanceSettings` + `AdminSection` | One declarative-settings card, "Instance": the server URL. Same section id and priority as the siblings so an admin who knows one knows this one. | `ServerConfig` |
| `Controller/ConfigController` | The **Test connection** endpoint behind `#[AuthorizedAdminSetting]`: calls `RenderService::version()` and answers success + version, or error + problem. | `RenderService` |
| `Command/SetUrl`, `Command/TestConnection`, `Command/ShowConfig` | The `occ` twins. CLI-first is the house style and is what the integration suite drives. | the services above |
| `Listener/NewDiagramListener` | On `FileCreatedFromTemplateEvent` with no template, writes the empty diagram into a new, empty `.puml` or `.plantuml` (any case). Anything else it leaves alone. The empty diagram is defined here and nowhere else. | Files' create endpoint (fact 10) |
| `Migration/RegisterMimetype`, `Migration/UnregisterMimetype` | `puml` and `plantuml` → `text/x-plantuml`, alias → icon `plantuml`. Copied from the siblings, extension and names changed. | core detection |

The POST route grants a logged-in user nothing the GET route did not: anyone who can
render text can already upload it as a `.puml` and render that. What it must never do is
serve an anonymous caller, which is the one line the non-goals draw.

Error wording is one vocabulary, used by the health check, the endpoints and the editor
alike: **not set · unreachable · not a PlantUML server**. All three
are about the server and are the admin's to fix. A mistake in a diagram is not in the
list, because the server draws it into the image and the app never paraphrases it.

### Frontend (`src/`)

| Unit | Does |
|---|---|
| `files.js` | Registers the Viewer handler for `text/x-plantuml`, which makes a plain click open the diagram in Nextcloud's standard image lightbox. Registers two file actions, hidden for a multi-selection: **Edit diagram** (ours) and **Open with text editor** (Text's plain editor, hosted through `OCA.Text.createEditor()` because Text claims a fixed mimetype list that does not include ours). Registers **UML Diagram** in the **+ New** menu: asks Files' create endpoint (fact 10) for `<name>.puml` in the current folder, which `NewDiagramListener` fills with an empty diagram, then stats it over WebDAV, announces it to the Files view and opens the editor on it. |
| `viewer.js` | The Viewer component: an `<img>` on `GET /render?path=…`, and the problem as a one-line message when the render fails. |
| `editor.js` | The editor page: PlantUML source on the left in CodeMirror 6 with the app's own PlantUML mode, the diagram on the right, redrawn from `POST /render` as the source changes (debounced). Load and save go over WebDAV with the ETag as the conflict check; `editor/autosave.js` saves two seconds after the last change, at least every 30 s, and the save indicator is Text's check-and-dot button. `editor/completion/` holds one module per completion source (directives, keywords, names in the diagram, snippets), each a pure function of a CodeMirror `CompletionContext`, registered through the PlantUML language's data. Its look comes from a Penpot design before it is built. |
| `readme.js` | Loaded on Files pages. Waits for Text's read-only workspace to render, fetches the README's own text over WebDAV, and then: rewrites each `<img>` whose `src` ends in `.puml` to `GET /render?path=…`; replaces each ```` ```plantuml ```` block with an `<img>` of its source via `POST /render`, matching fences to code blocks by order (the `language-plantuml` class, if Text leaves it in the DOM, is a shortcut and not relied on). Both images swallow the click, so Text's lightbox does not reopen them as a broken `.puml`. On a failed render it leaves Text's own rendering in place and adds nothing. |

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
2. Click the row → Viewer → `GET /render?path=…` → SVG, with the ETag.
3. Right-click → Edit diagram → the editor; each change (debounced) → `POST /render` →
   the right pane. Save → the file is written → the next Viewer open sees a new ETag.

### Error handling

| Where | Server unset | Server down / not PlantUML | Diagram mistake |
|---|---|---|---|
| Admin health check | error, "not set" | error, "unreachable" / "not a PlantUML server" | n/a |
| Viewer | one-line message, "not set" | one-line message naming the problem | PlantUML's error image |
| Editor right pane | the message, source still editable | the message, source still editable | PlantUML's error image |
| Endpoints | 503 "not set" | 503 naming the problem | PlantUML's error image, passed through with the server's 400 |
| README | fence stays a code block, image stays broken | same | PlantUML's error image |

### Security

- The GET route takes a **path**, resolved in the caller's user folder; the POST route
  takes text from a logged-in, CSRF-checked caller. Neither serves anonymously.
- Only the server URL is admin-set, so only an admin decides where source leaves the
  instance. It is stored in plain `IAppConfig` (it is not a secret).
- PlantUML's `!include` of remote URLs and its security profile are the **server's**
  configuration (`PLANTUML_SECURITY_PROFILE`), documented in the README as the admin's
  job, not enforced here.
- Content-Security-Policy is untouched: every image the browser loads comes from the
  Nextcloud origin.

## The design (Penpot, file "NXT PlantUML")

Every board is exported as a PNG under [`docs/design/`](../../design/README.md), so the
Penpot file is not needed to read this section.

Four pages, one per surface, drawn on 2026-10-13 against Nextcloud 34's light theme
(50px primary header, 300px navigation, 44px controls, 8px element radius and pill
buttons, Noto Sans). Each page has its own prototype flow; links change state within a
page and never cross one.

| Page | Boards | What the click does |
|---|---|---|
| Admin | `screens/admin` → `screens/admin-success`; `Admin — health check states` | *Test connection* reveals the result line. The states board holds the four lines the check can show: `PlantUML 1.2026.8`, `Server URL is not set`, `Server is unreachable`, `Server is not a PlantUML server`. |
| Editor | `screens/editor` → `screens/editor-saved` | *Save* turns "Unsaved changes" into "Saved" and quiets the button. |
| Files | `screens/files`, `screens/viewer`, `overlay/context-menu`, `overlay/new-menu` | A row's name or icon opens the Viewer; its × returns. The row's *…* opens the menu: **View**, **Edit diagram**, **Open with text editor**, then Nextcloud's own entries. *+ New* opens its menu with **Diagram** as the new entry. |
| Readme | `screens/readme` ↔ `screens/readme-source` | The Diagrams folder with Text's README workspace above the list: a ```` ```plantuml ```` fence and an `![Order flow](Order flow.puml)` both shown as the diagram, the image with its alt text as caption. Clicking the README.md row shows the markdown source; its × returns. |

Copy on the admin card: section title "PlantUML", subtitle "Point to your PlantUML server",
field label "Server URL", button "Test connection". Nothing else.

Library components: `header` (main on the Admin board, instance on Files) and
`order-flow`, the rendered diagram (main in the editor's right pane, instance in the
Viewer). The diagram is drawn from shapes in PlantUML's default style because the Penpot
backend could not fetch a render from any server.

Not drawn, and not needed before code: the editor's right pane when the server is down
(one line of the error vocabulary where the diagram would be), and the README surface,
which is Text's own rendering with our images in it.

## Testing

| Suite | Covers |
|---|---|
| Unit (`tests/unit/`) | `RenderService` request shape and problem classification (405 → not a PlantUML server, connect failure → unreachable, empty URL → not set); version parsing; `ServerConfig` normalisation; `RenderController` path rules (outside the user folder, not `.puml`, ETag/304). OCP stubbed as in the siblings. |
| Behat (`tests/integration/`) | A real Nextcloud + a `plantuml/plantuml-server` container. `connection/admin.feature` over `occ`; `lifecycle.feature`; `diagrams/view.feature`'s endpoint scenarios over HTTP; `diagrams/edit.feature`, `create.feature` and `readme/render.feature` through what the editor, the + New entry and the README observer send: WebDAV with ETags, Files' create endpoint, the render routes. |
| `@ui @blocked` — no browser | A scenario that cannot be run without a page. None, since Dr K's ruling of 2026-10-14; what only a page shows is checked by hand. |

Suites partition `features/` by path; the three quality-job guards from the siblings
(`check-suites.sh`, `check-notes-anchors.sh`, `check-step-definitions.sh`) come across
unchanged.

## Decisions taken in this spec

| Decision | Chosen | Alternative not taken |
|---|---|---|
| App id / name | `plantuml` / **PlantUML Diagrams** | `plantuml_render`; the bare product name reads as official |
| Mimetype | `text/x-plantuml`, extensions `puml` and `plantuml` | `application/x-plantuml` (SkyV0x); `text/` keeps generic text tooling willing to open it |
| Fence language | `plantuml` only (fact 7) | `puml` as an alias — two editors' courtesy, not a standard; `c4plantuml` — nobody asked |
| Default click on a `.puml` | the Viewer, Nextcloud's standard image lightbox | the editor; a diagram is read far more often than it is changed |
| Editing | the app's own side-by-side editor, source left and diagram right | Text's plain editor — no highlighting, no preview |
| Editor engine | **CodeMirror 6**, used directly from `@codemirror/*` in a thin Vue component, with a PlantUML `StreamLanguage` written as a simple-mode rule table (~100 lines) ported from Prism's `prism-plant-uml` (MIT), kkeisuke's CM5 mode as a second reference; the split pane is ours (fact 9) | an off-the-shelf editor — none is a component with a PlantUML grammar and a pulse; Monaco — 5–10× the bundle, AMD loader and workers inside a Nextcloud app, and no PlantUML tokenizer either; a TextMate bridge — 160 kB of wasm for a grammar Shiki does not even carry |
| Fences | a POST passthrough render for logged-in users | `path=<README>&fence=<n>` — the server would re-parse Markdown to find text the client already has |
| Image format | SVG everywhere | PNG — only a thumbnail would have needed a raster, and there is none |
| Thumbnails | none; the grid shows the file-type icon, as Nextcloud does for any text file | a preview provider of our own (fact 3) — code written for a behaviour nobody asked for |
| Secondary opener | Text's plain editor through its public `createEditor()` | a textarea of our own, as the siblings did for JSON — a rewrite of what Text already does |
| README image click | swallowed, so Text's lightbox cannot show a broken `.puml` | open the file in the Viewer — a link nobody asked for |
| Admin surface | URL + Test connection, nothing else | a format or timeout setting — neither is a decision an admin makes per instance |
| Error vocabulary | three fixed problems, shared by every surface | per-surface wording |
| A new diagram's starting lines | written by the server, `NewDiagramListener` on Files' create endpoint (Dr K, 2026-10-14: "regardless of an api call or click in the UI you would get the same start/end uml tags") | the + New handler PUTting them from JavaScript — only that one client would get them |
| The **+ New** entry | our own, opening the editor | a `TemplateFileCreator` — a second entry, and the new file opens in the Viewer (fact 10) |
| Saving in the editor | by itself as Text does (Dr K, 2026-10-14): 2 s after the last change, at least every 30 s, stopped by a conflict; closing saves first | Save only — a long edit all at risk until a click; Text's 5 s session sync — there is no session to sync to |
| Autocomplete | `@codemirror/autocomplete`, one source per file in `src/editor/completion/`, registered through the language's data facet so a source is a file and a line; Tab never accepts | one hand-written source with every rule in it — the pattern was the point (Dr K: "a pattern going for autocomplete that we can expand on") |
| The save indicator | Text's: one icon button, check when saved, a primary dot while not, core's `icon-loading-small` while saving, the time since the last save as its tooltip | a "Save" pill and status words — Dr K's terse-UI rule, a dot not a word |

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

- **"The behat tests should not need the browser."** Gherkin never names the medium: it
  states what holds before and after, and the step definition picks how to get there.
  "If you think a browser is needed in behat it's because of how you worded the feature."
  `edit`, `create` and `readme/render` were reworded and run over WebDAV, Files' create
  endpoint and the render routes; the scenarios about layout ("Opening a diagram file for
  editing"), Text's editor ("Opening a diagram file as plain text") and the Viewer's click
  were dropped.
- **`@ui` only when a browser is unavoidable**, and then also `@blocked`, untested for now.
  It no longer means "has a user interface"; `connection/admin.feature` lost it.
- **The backend writes a new diagram's starting lines**, so an API call and a click give
  the same file (see the decisions table).

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
"someone else changed this file" refusal when it does not match. No collaboration.
