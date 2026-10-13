# Security Policy

Thanks for taking the time to look at the security of **PlantUML Diagrams**. This
file describes how to report vulnerabilities and what to expect after you do.

## Supported versions

This app ships fixes only on the latest release. Always update to the newest
version before reporting an issue — the bug may already be fixed.

| Version | Supported |
|---|---|
| Latest minor on `main` | ✅ |
| Anything older | ❌ |

The supported Nextcloud range is declared in [`appinfo/info.xml`](appinfo/info.xml)
(`dependencies/nextcloud` `min-version` / `max-version`). Versions outside that
range are out of scope.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security report.**

Use [GitHub's private vulnerability reporting](https://github.com/kubed-io/nextcloud-plantuml/security/advisories/new)
on this repo. That channel is encrypted, only visible to maintainers, and lets us
coordinate a fix and a release before anything goes public.

Please include:

- A short description of the issue and its impact.
- Steps to reproduce, ideally with a minimal proof-of-concept.
- The version of PlantUML Diagrams, the Nextcloud version, the PlantUML server
  version, and the PHP version you tested on.
- Any relevant logs, request/response samples, or screenshots.
- Your assessment of severity (best guess is fine).

If for some reason you cannot use GitHub's private advisories, open a minimal
public issue saying "I have a security report, please contact me" with no
details, and a maintainer will reach out to set up a private channel.

## What to expect

- **Acknowledgement** of your report — usually within a few days.
- **A triage decision** (confirmed / not-a-vuln / out-of-scope / needs-info) once
  we've reproduced or investigated.
- **A coordinated fix** in a private branch when the report is confirmed.
- **A release with the fix** and a public advisory once the fix is available.
- **Credit** to you in the advisory and release notes, unless you'd rather stay
  anonymous.

This is a small, volunteer-run project — we don't have a paid security team or a
bounty program. We do take reports seriously and will work with you in good
faith.

## Scope

In scope:

- The PHP backend in `lib/` (`OCA\PlantUml\…`).
- The JS frontend in `src/` and its built bundles in `dist/`.
- The release tarball produced by [`publish.yml`](.github/workflows/publish.yml).
- The CI workflows in [`.github/workflows/`](.github/workflows/) when they could
  leak secrets or be coerced into running untrusted code.
- The `appinfo/info.xml` permissions declared by this app.

Out of scope:

- Nextcloud server itself — report those to
  [Nextcloud's security team](https://nextcloud.com/security/).
- The PlantUML server itself — report those to
  [the PlantUML project](https://github.com/plantuml/plantuml-server/security).
- Vulnerabilities in third-party dependencies are tracked by Dependabot and
  `composer audit` / `npm audit`. A report is welcome if you've found one that
  is exploitable *through this app's specific usage*.
- The homelab cluster this app happens to be developed in — it is not a
  production service that this project ships.

## Secrets policy

The app itself holds no secret: a PlantUML server is unauthenticated, and the only
setting is its URL, stored in plain app config. The secrets that exist belong to
the release process and never live in the repo:

- **GitHub App private key** — used by the release workflow to bypass branch
  protection on the version-bump commit. Stored as the `GH_APP_KEY` repo secret.
  Never echoed.
- **Nextcloud app store signing key** — signs release tarballs for
  apps.nextcloud.com. It is `NEXTCLOUD_STORE_KEY` in the **`nextcloud-store`
  GitHub Environment**, written to a temp file by the release job and deleted in
  the same step. The local working copy lives in `.signing/`, gitignored in full —
  **no part of `.signing/` is ever committed**.
- **Nextcloud app store API token** — `NEXTCLOUD_STORE_TOKEN`, in the same
  environment. It authorises uploads; it is not the signing key.

If you spot a secret committed to the repo (current or historical), treat it as
a vulnerability and report it via the private channel above. It will be rotated.

## Network egress (deliberate)

This app makes outbound HTTP requests to **one** destination: the PlantUML server
an admin configures. It never fetches a user-supplied URL.

**What leaves the instance is diagram source.** Every render — a `.puml` file, a
fence in a README, the editor's live preview — POSTs the diagram text to that
server and gets an image back. Anyone who can read a file can have it rendered;
nobody can render a file they cannot read, because the file route resolves the
path inside the caller's own folder. The source route accepts text from a
logged-in, CSRF-checked caller only, and grants nothing the file route did not:
a user who can render text can already upload it as a file.

**Nothing is served to anonymous callers.** Public share pages are out of scope.

**Local addresses.** The client is Nextcloud's `IClientService` with
`allow_local_address` set per request, because a self-hosted PlantUML server is
usually at a private, in-cluster address. Setting the URL is an admin action, so
this is a trust-boundary relaxation an admin opts into, not an unauthenticated
SSRF.

**What the server does with the source is the server's policy.** PlantUML can
`!include` remote URLs and read local files depending on its
`PLANTUML_SECURITY_PROFILE`; this app does not pass source through a filter and
does not pretend to. Run the server with the profile your network needs.

## Security-related CI gates

These run on every PR into `main` and on every push to `main` (see
[CONTRIBUTING.md](CONTRIBUTING.md) for the full gate list):

- **`composer audit`** — fails on any advisory in PHP deps.
- **`npm audit --omit=dev --audit-level=high`** — fails on high-or-above JS deps.
- **Psalm** (PHP static analysis) — uploads SARIF to the Security tab and
  annotates the PR inline; new findings block merge. CodeQL has no PHP support,
  so Psalm is this app's PHP code-scanning engine.
- **CodeQL** (JS / TS) — uploads to the Security tab; new findings block merge.
- **Dependabot** — alerts and version updates active for `composer`, `npm`, and
  `github-actions`.
- **Secret scanning** — enabled, GitHub-side.

If a Quality gate is failing on a PR that purports to fix a vulnerability, **fix
the gate** rather than bypassing it. The gates are how we know the fix is sound.

## Disclosure timeline

We follow standard coordinated disclosure: a public advisory is published once a
fix has shipped in a tagged release, or 90 days after confirmation, whichever
comes first. We will work with you on a tighter timeline if active exploitation
is reported.

Thanks again for helping keep this project safe.
