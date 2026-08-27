# Pirut Project Instructions

## Current stage

This repository is in project preparation. The desired-state contract is [docs/project-foundation.md](docs/project-foundation.md). Planned files, commands, services, and behavior do not exist until the plan records implementation and verification evidence.

Do not add product code while the repository remains in preparation unless the user explicitly starts the separate foundation implementation task.

## Product and boundaries

Pirut is a personal-first web application for manually importing and analyzing Israeli credit card statements. The initial product is single-user, local-only, and Hebrew-first.

Open banking, bank credentials, payment initiation, financial advice, public hosting, native mobile applications, and multi-user accounts are outside the initial scope.

## Repository language

This is a public-ready repository.

- Use English for repository documentation, code, identifiers, comments, commits, tests, Issues, pull requests, and GitHub communication.
- Keep user-facing text in localization files from the first implementation.
- Hebrew content is allowed only in the exact Hebrew locale and sanitized Hebrew fixture paths approved in the foundation plan.
- Do not duplicate Hebrew test strings outside those paths.

## Planned architecture

The approved high-level shape is a modular web monolith backed by PostgreSQL. Import adapters for each issuer must remain isolated from the canonical transaction model and from presentation code.

The exact application framework and database library are provisional until approved in the foundation implementation task. Do not assume a provisional technology already exists.

Uploaded financial files are sensitive. The planned default is local processing, no telemetry, no external data transfer, no bank credentials, and no retention of raw uploads after a committed import unless a later explicit decision changes that policy.

## UI requirements

Plan Hebrew and English localization from the first implementation. Hebrew is the primary product language. The UI must support correct RTL and LTR behavior, complete light and dark themes, and relevant desktop and mobile-width layouts.

Do not hard-code user-facing strings in components or server responses.

## Docker

Docker is part of the approved development and runtime architecture, but no Docker files or commands exist yet.

- The planned tracked production definition is root-level `docker-compose.yml` and must reference published images without `build:`.
- Root-level `docker-compose-dev.yml` is planned as machine-local and ignored. Ordinary development must invoke it only through `scripts/local.sh`.
- Workflow scripts must build development images explicitly before changing the running environment.
- Application containers must run as dedicated non-root users and expose meaningful readiness checks.
- PostgreSQL must remain on an internal Docker network unless an explicit development-only need is approved.
- Prefer project-owned bind-mounted host directories for durable PostgreSQL data and backups. Ordinary stop and restart operations must preserve them.
- Only an explicit confirmed nuke operation may remove an exact validated project-owned data path.
- Application logs go to stdout and stderr. Do not add persistent log volumes by default.
- Verification must reject `build:` in Compose files, unhealthy services, root application processes, and unexpected running image identities.

## Workflow and verification

The canonical workflows are planned as `scripts/local.sh`, `scripts/verify.sh`, `scripts/try-pr.sh`, and `scripts/release.sh`. They must be Bash scripts executed inside WSL, use LF endings and executable modes, and resolve the repository root from their own paths.

These scripts are not implemented. Do not advertise or invoke them until they exist and have been verified.

Parser changes require sanitized representative fixtures for the affected issuer and regression coverage for duplicate detection, installment transactions, refunds, encodings, and date semantics. Never commit real financial statements or personal data.
