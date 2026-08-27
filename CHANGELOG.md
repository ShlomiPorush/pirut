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
- Path-filtered CI that reuses `scripts/verify.sh` rather than restating its checks, with a summary job safe to require, manual dispatch, and a weekly full sweep.
- Weekly Dependabot updates for npm, GitHub Actions, and Docker, grouping minor and patch changes and leaving majors individual.
- Security policy and issue forms for bugs and issuer formats, both requiring confirmation that no real financial data is included.
- PostgreSQL backup and restore through `scripts/local.sh`, documented in `docs/backup-and-restore.md`.

### Fixed

- The public-ready Hebrew guard never actually ran. Under the C locale used by the workflow scripts, its character-range pattern made `git grep` exit with `Invalid collation character`, and the error was swallowed, so the check always reported success. It now uses a locale-independent pattern and fails when the search itself fails. Fixing it surfaced real Hebrew text outside the approved locale paths, which was moved into the locale catalogs.
