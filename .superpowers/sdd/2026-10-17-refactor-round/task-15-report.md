# Task 15 report: docs, measurements and status (Steps 1-3)

## Built
Step 1 (stale docs, refactor.md 3.4 plus the dispatch's extras): vitest.config.js header; plantuml-mode.js header
(times, brackets, separators, operators are tokenised); package.json "comment" (four bundles); CONTRIBUTING.md vite
row (four entries, push bundle); AGENTS.md map of src/editor/; editor spec C1 (18 sources in index.js order) and the
notify_push limitation (own bundle, ~28 kB gz, loaded by URL only where present); hover.js lintSection names
@codemirror/lint renderDiagnostic 6.9.7; CHANGELOG (Changed x3, new Security x4). The mode's shim comment
(`plantuml-mode.js:38`) was already gone with the shim (Task 8).
Step 2: refactor spec Targets with "Measured:"; all 29 rows set to `shipped (refactor round, 2026-10-17)`
(line 24's "Status: agreed ... approved by Dr K" left as the record of approval).
Step 3: committed `Spec: the refactor round shipped`.

## Measurements (scratch bench in /tmp/t15bench.Pnvs, not committed; vitest+jsdom, median of 20 after 5 warm-ups)
| Target | Result |
|---|---|
| editor entry gzip <= 236 kB (vite's decimal kB) | 240.94 kB per `npm run build`: MISSED by about 4.9 kB (260.45 -> 240.94, a 19.5 kB drop). Above the audit's 235.3 kB experiment because the push loader stays in the entry and later tasks added code. Push bundle 28.03 kB gz. |
| all completion sources / keystroke <= 1.2 ms | raw 0.80 / 0.65 / 0.56 ms (docs A / B / C); with withDocs 1.24 / 1.03 / 0.75. Raw met; withDocs on A (3,637 lines) MISSED by 0.04 ms. |
| hover on plain name, 3,350-line block <= 1 ms | 0.36 ms. Met. |
| `npx vitest run` <= 15 s | 12.22, 11.87, 11.99 s (1,941 tests). Met. |
Docs: A uml.puml x N (3,637 lines), B every grammar fixture with all 24 profiles loaded (4,013 lines), C one block of 3,353 lines.

## Checks
npm test 1941 passed (55 files); npm run lint 0 errors, only the 2 known warnings; npm run build ok, chunk guard
GUARD_OK; composer run test:unit OK (281 tests, 1635 assertions); psalm: No errors found. No TDD: docs/comments only.

## Concerns
The entry-size target is missed (see the table); an earlier version of this report wrongly called it met by changing units.
withDocs completion on doc A is 1.24 ms vs 1.2 target (reported in the spec, not hidden). Whether the target counts withDocs
is ambiguous; the raw figure meets it.
