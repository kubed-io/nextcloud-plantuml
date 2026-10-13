<!--
SPDX-FileCopyrightText: 2026 kubed-io
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# nextcloud-plantuml Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Nextcloud app that renders `.puml` files and README diagrams through an admin-named PlantUML server, with the six feature files under `features/` going live one scenario at a time.

**Architecture:** One PHP `RenderService` POSTs diagram text to `<server>/svg` and names the three things that can go wrong; everything else is a thin caller of it: a declarative admin card with a test button and three `occ` twins, a `RenderController` with a path route and a source route, a mimetype repair step. The frontend is three Vite bundles loaded on Files pages: `files` (Viewer handler, two file actions, + New entry), `editor` (CodeMirror 6 split pane) and `readme` (a DOM observer over Text's workspace).

**Tech Stack:** PHP 8.1+ Nextcloud app (OCP 32–34), PHPUnit 12 with hand-written OCP stubs, Behat 3.32 integration suite against a real Nextcloud + `plantuml/plantuml-server`, Vite 8 + vitest 4, `@nextcloud/files` 4, CodeMirror 6 (`@codemirror/state`, `view`, `language`, `legacy-modes`).

**Spec:** `docs/superpowers/specs/2026-10-13-nextcloud-plantuml-design.md`

## Global Constraints

- App id `plantuml`, namespace `OCA\PlantUml`, display name **PlantUML Diagrams**, licence `AGPL-3.0-or-later`, `<nextcloud min-version="32" max-version="34"/>`, `<types><filesystem/></types>`.
- Mimetype `text/x-plantuml`; extensions `puml` and `plantuml`; icon alias `plantuml`.
- Fence language `plantuml` only. A new diagram holds exactly `@startuml\n\n@enduml\n`.
- Error vocabulary, the only strings any surface may use for a server problem: `not set`, `unreachable`, `not a PlantUML server`. Admin-facing lines: `Server URL is not set`, `Server is unreachable`, `Server is not a PlantUML server`; success line `PlantUML <version>`.
- Admin copy: section "PlantUML", subtitle "Point to your PlantUML server", field "Server URL", button "Test connection". Nothing else on the card.
- Routes: `GET /apps/plantuml/render?path=<path>` and `POST /apps/plantuml/render` with JSON `{source}`. SVG only. Never for anonymous callers.
- Every feature file is in exactly one Behat suite: `admin` = `connection/*` + `lifecycle.feature`; `diagrams` = `diagrams/*`; `readme` = `readme/*`. A scenario loses `@unbuilt` only on the PR that runs it green; a browser-only scenario becomes `@blocked` with the wall named ("no browser").
- Copy the sibling's file when one exists, then rename; `nextcloud-penpot` (v1.0.0) is the template unless the task names `nextcloud-grafana`. Rename map: `penpot_sync`→`plantuml`, `PenpotSync`→`PlantUml`, `Penpot Sync`→`PlantUML Diagrams`, `.penpot`→`.puml`, `PENPOT_URL`→`PLANTUML_URL`; drop every token, team, mapping and sync reference.
- The maintainer is **Dr K** everywhere; SPDX headers say `kubed-io`; no real names in any file.
- PHP tooling runs in the devcontainer or CI, never in the code-server pod (no PHP there); Behat, Psalm and php-cs-fixer run in CI only.
- Patches to YAML follow the cluster repo's style: arrays aligned with the parent key, 2-space indent, no needless quotes.
- Commit after every task; no PR without Dr K saying so, and one PR per session.

## Review Focus

1. **A path that escapes the user's folder** (`../other/x.puml`, an absolute path, a path to a folder) must answer 404 from `GET /render`, never a file outside the caller's tree. Pinned in Task 7.
2. **A README whose fences are not all `plantuml`** (a `mermaid` fence between two `plantuml` ones) must keep fence-to-block alignment; the mermaid block is left to Text. Pinned in Task 10.
3. **A server that answers slowly or not at all** must come back as `unreachable` within the client timeout (10 s), not hang the admin page or the Viewer. Pinned in Task 4.
4. **Saving over a file someone else changed** (ETag no longer matches) must be refused with the file untouched, not silently overwrite. Pinned in Task 9.
5. **A `.puml` with a syntax error** must still produce an image (the server draws the error), and the Viewer must show it rather than the error vocabulary. Pinned in Task 7.

---

### Task 1: Repository skeleton and tooling

**Files:**
- Create: `.gitignore`, `.gitattributes`, `.nvmrc`, `.env.example`, `eslint.config.js`, `vite.config.js`, `vitest.config.js`, `.php-cs-fixer.dist.php`, `psalm.xml`, `composer.json`, `package.json`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `.devcontainer/devcontainer.json`, `tests/bootstrap.php`, `tests/ocp-stubs.php`, `tests/external-stubs.php`, `tests/phpunit.unit.xml`, `appinfo/info.xml`, `lib/AppInfo/Application.php`, `img/app.svg`, `img/app-dark.svg`
- Test: `tests/unit/ApplicationTest.php`

**Interfaces:**
- Produces: `OCA\PlantUml\AppInfo\Application::APP_ID = 'plantuml'`; `composer run test:unit`, `npm run build` producing `dist/plantuml-files.js`.

- [ ] **Step 1: Copy the tooling files from `/projects/kubed-io/nextcloud-penpot`** listed above, applying the rename map. `.github/` is already in the working tree (built separately from penpot's, with the PlantUML sidecar and the three-suite matrix); commit it with this task unchanged. `vite.config.js` keeps the plain-Vite IIFE shape (not `@nextcloud/vite-config`) with three entries — `src/files.js`, `src/editor.js`, `src/readme.js` — emitting `dist/plantuml-<entry>.js`. `package.json` takes grafana's newer pins (`@nextcloud/initial-state ^3`, vite ^8.2.2, eslint ^10.9.1) and penpot's `vitest run`. `psalm.xml` drops the trashbin suppressions. `.env.example` holds `NC_ADMIN_USER`, `NC_ADMIN_PASSWORD`, `PLANTUML_URL` only. `CHANGELOG.md` starts with an empty `[Unreleased]`.
- [ ] **Step 2: Write `appinfo/info.xml`** with id, name, summary "Diagrams from your .puml files and READMEs, drawn by your PlantUML server", namespace `PlantUml`, version `0.1.0`, the licence, `<types><filesystem/></types>`, the dependency range, `<documentation>`, `<website>`, `<bugs>`, `<repository>`. Leave `<settings>`, `<commands>` and `<repair-steps>` empty elements; later tasks fill them.
- [ ] **Step 3: Write the failing test** `tests/unit/ApplicationTest.php`: `testAppIdIsPlantuml()` asserts `Application::APP_ID === 'plantuml'` and that `new Application()` extends `OCP\AppFramework\App`.
- [ ] **Step 4: Run it** — `composer run test:unit` — Expected: FAIL, class not found.
- [ ] **Step 5: Implement `lib/AppInfo/Application.php`** as `final class Application extends App implements IBootstrap` with `register(IRegistrationContext $context): void` and `boot(IBootContext $context): void` both empty bodies; `const APP_ID = 'plantuml'`.
- [ ] **Step 6: Run** `composer run test:unit` and `composer run lint` — Expected: PASS. Run `npm ci && npm run build` — Expected: `dist/plantuml-files.js` exists (entries may be empty files for now).
- [ ] **Step 7: Commit** — `chore: skeleton, tooling and app bootstrap`

### Task 2: Behat harness and the three guards

**Files:**
- Create: `tests/integration/composer.json`, `tests/integration/behat.dist.yml`, `tests/integration/bootstrap/FeatureContext.php`, `tests/integration/bootstrap/Support/OccTrait.php`, `tests/integration/bootstrap/Support/WebDavTrait.php`, `tests/integration/bin/check-suites.sh`, `tests/integration/bin/check-step-definitions.sh`, `tests/integration/bin/check-notes-anchors.sh`, `features/README.md`, `features/AGENTS.md`

**Interfaces:**
- Produces: `FeatureContext` composing `OccTrait` (`occ(string $args): void`, `$lastExit`, `$lastOutput`) and `WebDavTrait` (`davPut`, `davGet`, `davExists`, `davContentType`, `davDelete`, `davMkcol`); env `NC_BASE_URL`, `NC_ADMIN_USER`, `NC_ADMIN_PASS`, `PLANTUML_URL`, `OCC`.

- [ ] **Step 1: Copy the harness from penpot's `tests/integration/`**, renaming; drop `PENPOT_TEST_BACKEND`, the trashbin and metadata helpers from `WebDavTrait`, and every Steps trait (they come with their features). `behat.dist.yml` declares the three suites as explicit path lists sharing `&contexts`, keeps the tag filter `~@todo&&~@unbuilt&&~@blocked&&~@decision` verbatim, and the junit formatter into `%paths.base%/junit`.
- [ ] **Step 2: Copy the three guard scripts** and fix their prose (`check-suites.sh` says "four suites" — make it read the count from the config). Add grafana's `check-listener-conventions.sh` and `check-todo-is-not-a-choice.sh` as they are.
- [ ] **Step 3: Write `features/README.md`** from penpot's, rewritten for this suite: the noun table (`connection/`, `diagrams/`, `readme/`, `lifecycle.feature`), the three suites, the tags (`@gesture @occ @admin @ui @api`; no origin axis — nothing syncs; status tags unchanged, each with its "who picks it up"), the walls (no browser, no app removal), the `Rule:` note, the two editor rules, the two-line comment budget, "where the tests are". Write `features/AGENTS.md` with one `## <folder>/<verb>` section per existing feature file and a `###` subsection for every `# notes:` anchor the feature files already use (`an-admin-enters-a-server-address-that-cannot-render`, `asking-for-a-diagram-file-by-its-path`), each with its reasoning from the spec. Its `saga:` pointers become `spec:` pointers into the design doc.
- [ ] **Step 4: Verify** — `bash tests/integration/bin/check-suites.sh && bash tests/integration/bin/check-notes-anchors.sh && bash tests/integration/bin/check-step-definitions.sh` — Expected: all three exit 0 (no undefined steps yet because every scenario is `@unbuilt`).
- [ ] **Step 5: Commit** — `chore: behat harness, suite partition and feature-suite docs`

### Task 3: ServerConfig

**Files:**
- Create: `lib/Service/ServerConfig.php`
- Test: `tests/unit/ServerConfigTest.php`

**Interfaces:**
- Produces: `ServerConfig::KEY_URL = 'server_url'`; `getUrl(): string` (empty string when unset); `setUrl(string $url): void` (rtrims `/`, throws `\InvalidArgumentException` unless `parse_url` yields an `http`/`https` scheme and a host); `isSet(): bool`.

- [ ] **Step 1: Write the failing tests**: `testUnsetReadsAsEmpty`, `testSetStoresWithoutTrailingSlash` (`'https://p.example.com/'` → stored `'https://p.example.com'`), `testRejectsUrlWithoutScheme` (`'p.example.com'` throws), `testRejectsFtp`. Mock `OCP\IAppConfig` as the siblings do (`getValueString`/`setValueString` with app id `plantuml`).
- [ ] **Step 2: Run** `composer run test:unit -- --filter ServerConfigTest` — Expected: FAIL, class not found.
- [ ] **Step 3: Implement `ServerConfig`** (constructor takes `IAppConfig`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(config): the one setting, server_url`

### Task 4: RenderService and the error vocabulary

**Files:**
- Create: `lib/Service/RenderService.php`, `lib/Service/Rendered.php`, `lib/Exception/RenderException.php`
- Test: `tests/unit/RenderServiceTest.php`

**Interfaces:**
- Consumes: `ServerConfig::getUrl()`.
- Produces: `RenderException` with `const PROBLEM_NOT_SET = 'not set'`, `PROBLEM_UNREACHABLE = 'unreachable'`, `PROBLEM_NOT_PLANTUML = 'not a PlantUML server'`; `getProblem(): string`; `adminMessage(): string` returning the admin-facing line for its problem. `Rendered` is a final readonly value with `string $body`, `string $contentType`. `RenderService::render(string $source): Rendered` (POSTs `$source` as the body to `<url>/svg`, `timeout` 10, `nextcloud => ['allow_local_address' => true]`); `RenderService::version(): string` (POSTs `@startuml\nversion\n@enduml\n` to `<url>/txt`, returns the `\d+\.\d+\.\d+` after `PlantUML`).

- [ ] **Step 1: Write the failing tests** with a mocked `IClientService`/`IClient`/`IResponse` (stubs exist in `tests/ocp-stubs.php`): `testRenderPostsSourceToSvg` (asserts URL `https://p.example.com/svg` and the body is the source verbatim; returns `Rendered` with `image/svg+xml`); `testUnsetUrlIsNotSet` (empty URL → `RenderException` with `PROBLEM_NOT_SET`, no HTTP call); `testConnectFailureIsUnreachable` (client throws `\Exception('cURL error 7')` → `PROBLEM_UNREACHABLE`); `testLocalServerExceptionIsUnreachable`; `testHttp405IsNotPlantuml` (status 405 → `PROBLEM_NOT_PLANTUML`), `testHttp404IsNotPlantuml`; `testVersionParsesTxt` (txt body with `PlantUML   1.2026.8` → `'1.2026.8'`); `testVersionWithoutMarkerIsNotPlantuml` (200 body `<html>` → `PROBLEM_NOT_PLANTUML`); `testAdminMessages` (the three admin lines, exact strings from Global Constraints).
- [ ] **Step 2: Run** — Expected: FAIL, classes not found.
- [ ] **Step 3: Implement** the three classes. Classification order: unset URL first; then any throwable from the client → unreachable; then status ≥ 400 → not a PlantUML server; then for `version()` a body without `PlantUML` → not a PlantUML server. Use grafana's `GrafanaClient` request shape as the template (survey §2, "HTTP client").
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(render): RenderService, Rendered and the three problems`

### Task 5: Admin card, test button and occ twins — `connection/admin.feature` goes live

**Files:**
- Create: `lib/Settings/AdminSection.php`, `lib/Settings/InstanceSettings.php`, `lib/Settings/AdminTest.php`, `templates/admin_test.php`, `js/admin-test.js`, `css/admin-test.css`, `lib/Controller/ConfigController.php`, `appinfo/routes.php`, `lib/Command/SetUrl.php`, `lib/Command/TestConnection.php`, `lib/Command/ShowConfig.php`, `tests/integration/bootstrap/Steps/ConnectionSteps.php`
- Modify: `appinfo/info.xml` (`<settings>`: `AdminTest`, `<admin-section>AdminSection`; `<commands>`: the three), `lib/AppInfo/Application.php` (`registerDeclarativeSettings(InstanceSettings::class)`), `tests/integration/bootstrap/FeatureContext.php` (use `ConnectionSteps`), `features/connection/admin.feature` (status tag), `features/AGENTS.md`
- Test: `tests/unit/InstanceSettingsTest.php`, `tests/unit/ConfigControllerTest.php`, `tests/unit/SetUrlTest.php`, `tests/unit/TestConnectionTest.php`, `tests/unit/ShowConfigTest.php`

**Interfaces:**
- Consumes: `ServerConfig`, `RenderService::version()`, `RenderException::adminMessage()`.
- Produces: `ConfigController::testConnection(): JSONResponse` behind `#[AuthorizedAdminSetting(settings: AdminTest::class)]`, always HTTP 200 with `{success: bool, message: string}` where message is `PlantUML <version>` or the admin line; route `config#testConnection`, `POST /test-connection`. `occ plantuml:set-url <url>` (exit 1 + `<error>` on an invalid URL), `occ plantuml:test-connection` (prints the message; exit 1 unless success), `occ plantuml:show-config` (prints `server_url: <url>` or `server_url: (not set)`, exit 1 when unset).

- [ ] **Step 1: Write the failing unit tests**: `InstanceSettingsTest` — the form has one field, id `server_url`, type `DeclarativeSettingsTypes::URL`, label "Server URL", section id `plantuml`, title "PlantUML", description "Point to your PlantUML server"; `setValue('server_url', 'https://p.example.com/')` reaches `ServerConfig::setUrl` and `getValue` reads it back. `ConfigControllerTest` — success returns `{success: true, message: 'PlantUML 1.2026.8'}`; each `RenderException` problem returns `{success: false, message: <admin line>}`, status 200. The three command tests via `CommandTester`: `set-url` stores and exits 0, rejects `example` with exit 1; `test-connection` exit 0 and prints `PlantUML 1.2026.8`, exit 1 and prints `Server is unreachable`; `show-config` both branches.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** from the siblings: `InstanceSettings` and `AdminSection` from penpot (priority 80, icon `app-dark.svg`); the test panel from grafana (`AdminTest` + `templates/admin_test.php` + `js/admin-test.js` + `css/admin-test.css`, result line rendered under the field as in the design: a check icon with the message on success, an alert icon on error; `ConfigController` from grafana's; the commands from penpot's `SetUrl`, `TestConnection`, `ShowConfig`.
- [ ] **Step 4: Run** `composer run test:unit` — Expected: PASS.
- [ ] **Step 5: Write `ConnectionSteps.php`** from penpot's: `Given nothing is configured yet` / `Given no server is configured yet` (`config:app:delete plantuml server_url`), `When the admin fills in the connection details:` (rows hash; cell `the test server` → `getenv('PLANTUML_URL')`, `an unreachable host` → `http://127.0.0.1:9` , `a server that is not PlantUML` → `NC_BASE_URL` itself, empty → delete the key; drives `occ plantuml:set-url`), `When the admin tests the connection` (`occ plantuml:test-connection`), `Then the health check reports success` (exit 0), `Then the health check reports an error` (exit 1), `Then the health check names the PlantUML version the server is running` (output matches `/PlantUML \d+\.\d+\.\d+/`), `Then the message says the server is :problem` (output contains the admin line for the problem). Compose into `FeatureContext`.
- [ ] **Step 6: Remove `@unbuilt`** from `features/connection/admin.feature`'s Feature line; fill its two `features/AGENTS.md` sections.
- [ ] **Step 7: Verify** — the three guards exit 0; push the branch and the `admin` integration leg is green (`integration.yml` runs on the PR).
- [ ] **Step 8: Commit** — `feat(connection): admin card, test connection and occ twins; admin.feature live`

### Task 6: Mimetype and icon — `lifecycle.feature` goes live

**Files:**
- Create: `lib/Migration/RegisterMimetype.php`, `lib/Migration/UnregisterMimetype.php`, `img/plantuml.svg`, `img/icons/plantuml.svg`, `tests/integration/bootstrap/Steps/AppLifecycleSteps.php`
- Modify: `appinfo/info.xml` (`<repair-steps>` install + post-migration `RegisterMimetype`, uninstall `UnregisterMimetype`), `FeatureContext.php`, `features/lifecycle.feature`, `features/AGENTS.md`
- Test: `tests/unit/RegisterMimetypeTest.php`

**Interfaces:**
- Produces: `.puml` and `.plantuml` detected as `text/x-plantuml` with icon `plantuml` on every install/upgrade; the reverse on uninstall.

- [ ] **Step 1: Write the failing test** `RegisterMimetypeTest`: `mergeJson` adds `{"puml": ["text/x-plantuml"], "plantuml": ["text/x-plantuml"]}` to a temp `mimetypemapping.json` without disturbing existing keys, and `{"text/x-plantuml": "plantuml"}` to the aliases file; running twice changes nothing.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** both repair steps from penpot's (app path via `IAppManager::getAppPath`, never a hard-coded `/custom_apps/`), with the two extensions. Draw `img/plantuml.svg` (the filetype icon: two small boxes joined by an arrow, as in the Penpot design, hard-coded fills) and `img/icons/plantuml.svg` (the same mark, `fill="currentColor"`, for menus).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write `AppLifecycleSteps.php`** from penpot's: enable/disable/`app:list`, and the mimetype probe (PUT `probe.puml` over DAV, assert `davContentType` is `text/x-plantuml`). Remove `@unbuilt` from `lifecycle.feature`; tag "Removing the app" `@blocked` with its comment already in place; fill `features/AGENTS.md#lifecycle`.
- [ ] **Step 6: Verify** — guards exit 0; `admin` leg green.
- [ ] **Step 7: Commit** — `feat(mimetype): .puml is its own file type; lifecycle.feature live`

### Task 7: RenderController — the endpoint scenarios of `diagrams/view.feature` go live

**Files:**
- Create: `lib/Controller/RenderController.php`, `tests/integration/bootstrap/Steps/RenderApiSteps.php`, `tests/integration/bootstrap/Steps/DiagramFileSteps.php`
- Modify: `appinfo/routes.php` (`render#byPath` GET `/render`, `render#bySource` POST `/render`), `FeatureContext.php`, `features/diagrams/view.feature`, `features/AGENTS.md`
- Test: `tests/unit/RenderControllerTest.php`

**Interfaces:**
- Consumes: `RenderService::render()`, `IRootFolder::getUserFolder()`, `IUserSession`.
- Produces: `RenderController::byPath(string $path): Response` — `#[NoAdminRequired]`, `#[NoCSRFRequired]`; resolves `$path` with `getUserFolder($uid)->get($path)`; 404 unless it is a `File` with mimetype `text/x-plantuml`; `ETag` = the file's etag; `If-None-Match` equal → 304 empty; otherwise `DataDisplayResponse` with the SVG body and `Content-Type: image/svg+xml`; a `RenderException` → 503 with body `{problem}`. `RenderController::bySource(string $source): Response` — `#[NoAdminRequired]` only (CSRF enforced); same success and 503 shapes. Behat steps: `Given a diagram file :name in :folder` (DAV PUT with a valid two-participant diagram), `Given a file :name in :folder` (PUT plain text), `When I request the image of :path` (GET `/index.php/apps/plantuml/render?path=`, basic auth as the admin), `Then I receive the diagram as an SVG image` (200, content type `image/svg+xml`, body contains `<svg`), `Then the request is refused` (404).

- [ ] **Step 1: Write the failing tests**: `testPathOutsideUserFolderIs404` (`'../other/x.puml'` → `NotFoundException` from the folder → 404), `testFolderIs404`, `testPlainTextIs404`, `testRendersSvgWithEtag`, `testIfNoneMatchIs304`, `testServerProblemIs503WithProblem` (body `unreachable`), `testBySourceRendersVerbatim` (service receives the exact source), `testSyntaxErrorIsStillAnImage` (service returns a `Rendered` whose body is PlantUML's error SVG → 200, body passed through unchanged).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the controller and routes.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write the two Steps traits**, compose them, remove `@unbuilt` from `diagrams/view.feature` and tag its first scenario (the click) `@blocked` with `# @blocked — no browser.`; fill `features/AGENTS.md#diagramsview`.
- [ ] **Step 6: Verify** — guards exit 0; `diagrams` leg green with the two `@api` scenarios.
- [ ] **Step 7: Commit** — `feat(render): path and source endpoints; view.feature endpoint scenarios live`

### Task 8: Files integration — Viewer, two openers, + New

**Files:**
- Create: `src/files.js`, `src/files-helpers.js`, `src/viewer-component.js`, `src/text-editor-modal.js`, `lib/Listener/LoadFilesScriptListener.php`
- Modify: `lib/AppInfo/Application.php` (`registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScriptListener::class)`), `features/diagrams/view.feature`, `features/diagrams/edit.feature`, `features/diagrams/create.feature`, `features/AGENTS.md`
- Test: `tests/js/files-helpers.test.js`, `tests/unit/LoadFilesScriptListenerTest.php`

**Interfaces:**
- Consumes: initial state `server_configured: bool` provided by the listener; `GET /render?path=`.
- Produces: `files-helpers.js` exports `isDiagram(node): boolean` (mime `text/x-plantuml`), `renderUrl(path): string` (`OC.generateUrl('/apps/plantuml/render') + '?path=' + encodeURIComponent(path)`), `NEW_DIAGRAM_CONTENT = '@startuml\n\n@enduml\n'`, `uniqueDiagramName(existing, base)`; `openEditor(node)` is a global `window.OCA.PlantUml.openEditor` that Task 9 defines. `LoadFilesScriptListener` provides initial state and `Util::addScript('plantuml', '../dist/plantuml-files')` then `'../dist/plantuml-readme'`.

- [ ] **Step 1: Verify the Viewer's Vue major on the live instance first** — `kubectl exec` into the Nextcloud pod and read `apps/viewer/package.json` (`vue` dependency). Record it in `src/viewer-component.js`'s header. The component is a plain options object with a `render` function (`render(h)` under Vue 2; `render()` importing `h` from `vue` under Vue 3) that draws `<img src=renderUrl(path)>` and, on `error`, one line of text from the response body (the problem).
- [ ] **Step 2: Write the failing vitest tests** for the helpers: `isDiagram` true for the mime and false for `text/plain`; `renderUrl` encodes `Diagrams/Order flow.puml`; `NEW_DIAGRAM_CONTENT` is the exact skeleton; `uniqueDiagramName(['Checkout.puml'], 'Checkout')` → `Checkout (2).puml`. And the PHP test that the listener provides `server_configured` and adds both scripts.
- [ ] **Step 3: Run** `npm test` and `composer run test:unit` — Expected: FAIL.
- [ ] **Step 4: Implement `src/files.js`**: `OCA.Viewer.registerHandler({ id: 'plantuml', mimes: ['text/x-plantuml'], component })`; `registerFileAction` "Edit diagram" (id `plantuml-edit`, icon `img/icons/pencil.svg?raw`, enabled for one diagram node, exec → `OCA.PlantUml.openEditor(node)`); `registerFileAction` "Open with text editor" (id `plantuml-text`, enabled for one diagram node, exec → `src/text-editor-modal.js` which mounts `OCA.Text.createEditor({ el, fileId: node.fileid, filePath: node.path })` in a full-size `NcModal`-style overlay, following grafana's overlay mechanics but hosting Text's editor instead of a textarea); `addNewFileMenuEntry` "Diagram" (category `CreateNew`, icon `img/icons/plantuml.svg?raw`, `putFileContents` with `NEW_DIAGRAM_CONTENT`, `emit('files:node:created', …)`, then `openEditor`). Both actions hidden when `server_configured` is false except "Open with text editor".
- [ ] **Step 5: Run** `npm test`, `npm run lint`, `npm run build`, `composer run test:unit` — Expected: PASS and three bundles in `dist/`.
- [ ] **Step 6: Deploy to the live instance and check by hand** (`kubectl cp` the app into the Nextcloud pod's `custom_apps/plantuml`, `occ app:enable plantuml`, set the URL to `http://plantuml.flow.svc`): a click on a `.puml` opens the Viewer on the diagram; the menu shows View, Edit diagram, Open with text editor; + New → Diagram creates the skeleton file. Record what was seen in the commit message.
- [ ] **Step 7: Tag** the click scenario in `view.feature`, both opener scenarios in `edit.feature` and the scenario in `create.feature` `@blocked` with `# @blocked — no browser.`, replacing `@unbuilt` where the behaviour now exists (create's file outcome stays `@unbuilt` until Task 9's editor opens on it). Fill the matching `features/AGENTS.md` sections.
- [ ] **Step 8: Commit** — `feat(files): Viewer handler, Edit diagram, Open with text editor, + New Diagram`

### Task 9: The editor — `diagrams/edit.feature` and `create.feature`

**Files:**
- Create: `src/editor.js`, `src/editor/plantuml-mode.js`, `src/editor/save.js`, `src/editor/preview.js`, `css/editor.css`
- Modify: `package.json` (add `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/legacy-modes`, `@lezer/highlight`), `src/files.js` (define `window.OCA.PlantUml.openEditor`), `features/diagrams/edit.feature`, `features/diagrams/create.feature`, `features/AGENTS.md`
- Test: `tests/js/plantuml-mode.test.js`, `tests/js/save.test.js`, `tests/js/preview.test.js`

**Interfaces:**
- Consumes: `POST /render` `{source}`; WebDAV via `@nextcloud/files/dav` `getClient()`.
- Produces: `plantumlMode` — a `StreamLanguage` built with `simpleMode` from `@codemirror/legacy-modes/mode/simple-mode`, token classes: `keyword` (`@startuml`, `@enduml`, `actor`, `participant`, `skinparam`, `title`, `note`, `end`, `as`, `class`, `interface`, `package`), `operator` (arrows: the regex from Prism's `plant-uml` grammar), `string` (`"…"`), `comment` (`'` to end of line, `/' … '/`), `meta` (`!include`, `!define`, `!theme`). `save.js` exports `loadFile(path): Promise<{content, etag}>` and `saveFile(path, content, etag): Promise<string /* new etag */>` sending `If-Match: etag`, rejecting with `ConflictError` on 412. `preview.js` exports `debouncedRender(source, cb)` (300 ms) and `render(source): Promise<Blob>` returning the SVG or rejecting with the problem text from the 503 body. `editor.js` exports `openEditor(node)`: a full-page overlay matching the Penpot `screens/editor` board — top bar (file icon, name, status "Unsaved changes" / "Saved", primary **Save** pill, ×), left `EditorView` with `lineNumbers()`, `history()`, `plantumlMode`, `syntaxHighlighting(defaultHighlightStyle)`; right pane `<img>` fed by `preview.js`, or the problem line in its place.
- [ ] **Step 1: Write the failing vitest tests**: `plantuml-mode.test.js` tokenises `@startuml`, `participant Shop`, `Customer -> Shop : place order`, `' a comment`, `!include x.puml` into the classes above (use `StreamLanguage.parser` over a `Text` and read the tree). `save.test.js` with a mocked DAV client: `saveFile` sends `If-Match`, resolves with the new etag, and rejects `ConflictError` on 412 without a second request. `preview.test.js` with mocked `fetch`: `render` posts JSON `{source}` with the `requesttoken` header; a 503 rejects with `'unreachable'`; the debounce collapses three calls in 100 ms into one.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the four modules and the CSS (two equal panes, 1px divider `--color-border-dark`, gutter `--color-background-hover`, mono font `var(--font-face-mono, monospace)` 14px).
- [ ] **Step 4: Run** `npm test && npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 5: Deploy and check by hand** as in Task 8: Edit diagram opens the split view; typing redraws within a second; Save writes the file (verify over WebDAV that the body changed) and the status reads Saved; editing the same file from a second browser then saving shows the conflict refusal and leaves the file as the other browser left it.
- [ ] **Step 6: Tag** the remaining `edit.feature` and `create.feature` scenarios `@blocked` (no browser), except "Saving writes the source back to the file" which stays `@unbuilt` until a browser leg exists — note that in the comment. Fill `features/AGENTS.md`.
- [ ] **Step 7: Commit** — `feat(editor): CodeMirror split view with live preview and ETag-guarded save`

### Task 10: README diagrams — `readme/render.feature`

**Files:**
- Create: `src/readme.js`, `src/readme/markdown.js`, `src/readme/workspace.js`
- Modify: `features/readme/render.feature`, `features/AGENTS.md`
- Test: `tests/js/markdown.test.js`, `tests/js/workspace.test.js`

**Interfaces:**
- Consumes: `GET /render?path=`, `POST /render`, the README's text over WebDAV (`loadFile` from Task 9).
- Produces: `markdown.js` exports `findFences(md): Array<{lang, source, index}>` (every fenced block, in document order, with `index` counting all fences so a `mermaid` one keeps the numbering) and `findImages(md): Array<{alt, src}>`; `workspace.js` exports `attach(root: Element, {dir, fences, images})` which, given Text's rendered workspace element: walks its `.code-block` elements in order, and for each whose fence `lang === 'plantuml'` replaces the `<pre>` with an `<img>` whose `src` is a blob from `POST /render`; rewrites each `img[src$=".puml"]` to `renderUrl(dir + '/' + src)`; stops propagation of `click` on both; leaves everything else untouched. `readme.js` observes `#rich-workspace` (MutationObserver on `.files-list__header`), fetches the README named in the workspace's file id, and calls `attach` once per render.

- [ ] **Step 1: Write the failing tests**: `findFences` on a README with ```` ```plantuml ````, ```` ```mermaid ````, ```` ```plantuml ```` returns three entries with `index` 0, 1, 2 and the right `lang`; `findImages` finds `![Order flow](Order flow.puml)` and ignores `http://` images. `workspace.test.js` with a jsdom root holding three `.code-block` elements and two images: after `attach`, blocks 0 and 2 are `<img>`, block 1 is unchanged; the `.puml` image's `src` is the render URL and the `.png` one is untouched; a click on a replaced block does not bubble.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** the three modules. `attach` must be idempotent (mark handled elements with `data-plantuml`), because Text re-renders the workspace when it gains focus.
- [ ] **Step 4: Run** `npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Deploy and check by hand**: a folder with the design's README shows both diagrams; a README with a mermaid fence between them still renders the right two; the images do not open Text's lightbox.
- [ ] **Step 6: Tag** both scenarios `@blocked` (no browser); fill `features/AGENTS.md#readmerender`.
- [ ] **Step 7: Commit** — `feat(readme): plantuml fences and .puml images drawn in the folder README`

### Task 11: Documentation and the first release shape

**Files:**
- Create: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`
- Modify: `appinfo/info.xml` (`<description>` store copy, screenshots list once `screenshots/` exists), `CHANGELOG.md` (`[Unreleased]` lines for every task above)

- [ ] **Step 1: Write `README.md`** in the n8n README's voice (feature-forward, each section linking its `.feature` file, "Setup, in three moves": set the URL, test it, upload a `.puml`; "Every button is also a command" with the three `occ` lines; the PlantUML server's own security profile as the admin's job; trademark line for PlantUML). No status disclaimers, no design rationale.
- [ ] **Step 2: Write `AGENTS.md`** from penpot's: the Dr K rule, the no-PR rule, the repo map, core commands, and "first moves" pointing at `features/README.md`, `CONTRIBUTING.md` and the spec. Write `CONTRIBUTING.md` from penpot's with this repo's suites and guards.
- [ ] **Step 3: Verify** every claim in the README against the feature files' status tags (a claim about a `@blocked` behaviour is allowed only if Step 6 of its task saw it work on the live instance; say so in the README's spec section).
- [ ] **Step 4: Commit** — `docs: README, AGENTS, CONTRIBUTING and changelog`
