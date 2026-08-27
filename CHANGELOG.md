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
