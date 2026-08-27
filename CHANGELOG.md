# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning scheme selection is deferred until the first release is prepared.

## [Unreleased]

### Added

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

- Removed a vulnerable `esbuild` reached through a deprecated `drizzle-kit` loader chain, using a scoped pnpm override. The advisory affects the esbuild development server, which this project never runs, so exposure was nil, but the dependency no longer appears at all.

### Fixed

- The dependency audit only inspected production dependencies, so a development-only advisory never reached it. Production is now audited at moderate and above, and development dependencies at high and above.
- The lockfile check compared against `HEAD`, so it failed on legitimate uncommitted dependency work rather than on an actually stale lockfile. It now checks whether resolving changes the lockfile.
- The Docker image check passed on a Dockerfile that does not build. `set -e` does not apply inside a function invoked as a condition, so a failed `docker build` fell through and the check inspected a stale image left by an earlier run. The build result is now checked explicitly, and the integration check is skipped rather than reporting a misleading "pull access denied" when the image is missing.
- `scripts/try-pr.sh` could not start a trial at all. It placed the trial database inside the worktree, which sits on a Windows drive where `initdb` cannot set ownership, and it wrote its state file only after the stack started, so a failed start left debris that `restore` did not know about. The trial database now lives on a Linux-native path, state is recorded before anything that can fail, and `start` waits for readiness instead of reporting success on a stack that never came up.
- CI treated the workflow scripts as an isolated area, so a change to `scripts/verify.sh`, the file that defines every check, skipped the application and Docker jobs entirely. Workflow scripts and everything under `.github/` are now shared paths that invalidate every area.
- Nothing verified that the Dockerfile's Node version matched `.node-version` and `engines.node`. A drift surfaced only as an unrelated build error. A guard now compares all three.
- The public-ready Hebrew guard never actually ran. Under the C locale used by the workflow scripts, its character-range pattern made `git grep` exit with `Invalid collation character`, and the error was swallowed, so the check always reported success. It now uses a locale-independent pattern and fails when the search itself fails. Fixing it surfaced real Hebrew text outside the approved locale paths, which was moved into the locale catalogs.
