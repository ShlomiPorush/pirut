# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning scheme selection is deferred until the first release is prepared.

## [Unreleased]

### Added

- A login. Better Auth 1.7.2 provides password hashing, sessions, cookies, CSRF, and passkeys; Pirut adds only the household policy on top. Every `/api/` route except health, the auth routes, and the setup routes now requires a session and answers 401 without one.
- First-run setup: the first visit creates the household's first account and signs it in. Public sign-up is closed from that moment, so only a signed-in member can add another.
- Passkeys, through the Better Auth plugin: sign in with one, and add or remove them in settings. Passkeys need HTTPS or localhost, which the settings screen states.
- Household management: every member sees and imports the same transactions. Members can be listed, added, and removed, with the last member and self-removal both refused.
- Rate limiting on Pirut's own credential routes. Better Auth limits only the routes its own router serves, and setup and member creation call it directly, so they were unbounded.
- `PIRUT_TRUSTED_ORIGINS` for a reverse proxy or a second name, alongside `PIRUT_PUBLIC_URL` and the required `PIRUT_AUTH_SECRET`.

- Statement import, end to end: a preview-first flow that parses an uploaded Isracard file, shows every row with its new-or-duplicate status, and commits in one database transaction. Committing the same file twice is a no-op by source hash, and rows whose card and voucher reference are already stored are skipped, never duplicated. The raw upload is not retained.
- PostgreSQL persistence: cards, imports, and transactions tables with unique constraints backing the duplicate rules, created by a migration that runs automatically at server start.
- Import API: preview, commit, imports, transactions by charge month, and monthly summary endpoints, returning stable machine-readable error codes.
- Import and transactions screens in Hebrew and English: statement preview with counts and warnings, guarded commit, month cards with totals, and a transaction table with installments, refunds, and issuer notes.

- An Isracard statement importer, with a canonical transaction model that keeps amounts in integer minor units, separates the purchase date from the statement's charge date, records the full purchase amount alongside the installment billed this month, marks an inferred exchange rate as derived, and refuses any statement whose rows do not add up to the total the issuer states.
- A narrow SpreadsheetML reader. A general spreadsheet library could not open a real Isracard export at all: the file is valid OOXML but namespaces every element, omits the shared string table, and stores its core properties outside `docProps/`.
- A synthetic Isracard fixture and its generator, covering a shekel purchase, a foreign-currency purchase with a discount, a mid-plan installment, a final installment, and a refund. Nothing in it derives from a real statement; see `tests/fixtures/SANITIZATION.md`.

- Repository baseline: approved application stack, dependency manifests, lockfile, TypeScript and lint configuration, and changelog.
- Health-capable application skeleton: Fastify server with a database-aware `/api/health` endpoint, React interface with Hebrew and English catalogs, right-to-left and left-to-right support, light and dark themes, and an empty Drizzle migration baseline.
- Docker foundation: multi-stage image running as a dedicated non-root user, production Compose using published images with loopback-only web exposure and an internal-only PostgreSQL service, a tracked development Compose template, and a safe environment contract.
- Workflow scripts: `scripts/local.sh`, `scripts/verify.sh`, `scripts/try-pr.sh`, and `scripts/release.sh`.
- A verification check that Drizzle can still generate migrations, which also guards the toolchain the esbuild override touches.
- Path-filtered CI that reuses `scripts/verify.sh` rather than restating its checks, with a summary job safe to require, manual dispatch, and a weekly full sweep.
- Weekly Dependabot updates for npm, GitHub Actions, and Docker, grouping minor and patch changes and leaving majors individual.
- Security policy and issue forms for bugs and issuer formats, both requiring confirmation that no real financial data is included.
- PostgreSQL backup and restore through `scripts/local.sh`, documented in `docs/backup-and-restore.md`.

### Security

- `scripts/local.sh up -d` inspects the running web container's published ports and warns when any binding is not on `127.0.0.1`, since the application has no login yet. It reports only: the machine-local development file and the running environment belong to the developer, and the script never alters them.

- A verification check that fails when statement-shaped files (`.xlsx`, `.xls`, `.csv`, `.pdf`) or anything under `internal/` becomes tracked outside `tests/fixtures/`. Committing a real statement to a public repository is unrecoverable, and an ignore rule alone is one typo away from failing.

- Removed a vulnerable `esbuild` reached through a deprecated `drizzle-kit` loader chain, using a scoped pnpm override. The advisory affects the esbuild development server, which this project never runs, so exposure was nil, but the dependency no longer appears at all.

### Changed

- `scripts/local.sh` now follows the same interface as the owner's other repositories: `up` is the default command, `-b` builds before starting, `-d` runs detached and verifies readiness, the two combine as `-bd`, and `nuke --confirm <exact path>` allows non-interactive use. Without `-b`, `up` reuses the existing image and builds only when it is absent. `up-detached` remains as an alias.
- The repository root now holds only the files tooling must find there. Docker files moved to `config/docker/` (including the machine-local `.env` and `docker-compose-dev.yml`), the ESLint and Vitest configs to `config/`, the changelog to `docs/`, and the security policy to `.github/`. `.prettierignore` and `.node-version` were removed: Prettier exclusions are negated globs in the `format` scripts, and `engines.node` in `package.json` is the single Node version contract.

### Fixed

- `scripts/local.sh -b` demanded Node and pnpm on the host to run `pnpm install` before building the image, and failed in any shell where Node was not on the PATH. The Dockerfile already installs from the lockfile inside the build, so the host install was redundant. Building now needs Docker only.

- The language guard scanned only tracked files, so a new file containing Hebrew passed locally and would have failed only after being committed and pushed. It now scans untracked files too.

- The dependency audit only inspected production dependencies, so a development-only advisory never reached it. Production is now audited at moderate and above, and development dependencies at high and above.
- The lockfile check compared against `HEAD`, so it failed on legitimate uncommitted dependency work rather than on an actually stale lockfile. It now checks whether resolving changes the lockfile.
- The Docker image check passed on a Dockerfile that does not build. `set -e` does not apply inside a function invoked as a condition, so a failed `docker build` fell through and the check inspected a stale image left by an earlier run. The build result is now checked explicitly, and the integration check is skipped rather than reporting a misleading "pull access denied" when the image is missing.
- `scripts/try-pr.sh` could not start a trial at all. It placed the trial database inside the worktree, which sits on a Windows drive where `initdb` cannot set ownership, and it wrote its state file only after the stack started, so a failed start left debris that `restore` did not know about. The trial database now lives on a Linux-native path, state is recorded before anything that can fail, and `start` waits for readiness instead of reporting success on a stack that never came up.
- CI treated the workflow scripts as an isolated area, so a change to `scripts/verify.sh`, the file that defines every check, skipped the application and Docker jobs entirely. Workflow scripts and everything under `.github/` are now shared paths that invalidate every area.
- Nothing verified that the Dockerfile's Node version matched `.node-version` and `engines.node`. A drift surfaced only as an unrelated build error. A guard now compares all three.
- The public-ready Hebrew guard never actually ran. Under the C locale used by the workflow scripts, its character-range pattern made `git grep` exit with `Invalid collation character`, and the error was swallowed, so the check always reported success. It now uses a locale-independent pattern and fails when the search itself fails. Fixing it surfaced real Hebrew text outside the approved locale paths, which was moved into the locale catalogs.
