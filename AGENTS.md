# Pirut Project Instructions

## Current stage

The foundation and the first product slice are implemented. The application runs in Docker against PostgreSQL, imports an Isracard statement through a preview-first flow, prevents duplicates, and shows stored transactions with monthly totals.

The living contract is [docs/project-foundation.md](docs/project-foundation.md). It records what is implemented, the verification evidence, deviations forced by the environment, and what remains. Trust its status column over any assumption; a planned item does not exist until the plan records evidence.

The Isracard importer and the import and transactions screens exist. Do not add further issuers, categorization, or dashboards without a separate approved task.

## Product and boundaries

Pirut is a personal-first web application for manually importing and analyzing Israeli credit card statements. The initial product is single-user, local-only, and Hebrew-first.

Open banking, bank credentials, payment initiation, financial advice, public hosting, native mobile applications, and multi-user accounts are outside the initial scope.

## Repository language

This is a public-ready repository.

- Use English for repository documentation, code, identifiers, comments, commits, tests, Issues, pull requests, and GitHub communication.
- Keep user-facing text in localization files from the first implementation.
- Hebrew content is allowed only in `src/locales/he/`, `tests/fixtures/he/`, and each issuer's format-token module such as `src/importers/isracard/format.ts`. A format module holds the literal strings an issuer writes into its files; those are data tokens, not user-facing text, and nothing in them may be shown to a user.
- Do not duplicate Hebrew test strings outside those paths.

## Architecture

The shape is a modular web monolith backed by PostgreSQL. Import adapters for each issuer must remain isolated from the canonical transaction model and from presentation code.

The approved stack is TypeScript on Node.js 24 LTS, React with Vite, Fastify, Drizzle ORM, pnpm, i18next, and Vitest. Source layout: `src/server/`, `src/web/`, `src/infrastructure/`, `src/locales/`, with migrations under `db/migrations/`.

Uploaded financial files are sensitive. The planned default is local processing, no telemetry, no external data transfer, no bank credentials, and no retention of raw uploads after a committed import unless a later explicit decision changes that policy.

## UI requirements

Plan Hebrew and English localization from the first implementation. Hebrew is the primary product language. The UI must support correct RTL and LTR behavior, complete light and dark themes, and relevant desktop and mobile-width layouts.

Do not hard-code user-facing strings in components or server responses.

## Docker

- Everything Docker-related lives under `config/docker/`: the `Dockerfile` and its `Dockerfile.dockerignore`, the tracked production `docker-compose.yml` (published images, no `build:`), the development template, and the machine-local ignored `docker-compose-dev.yml` and `.env` that `scripts/local.sh init` generates there. Compose is always run with that directory as its project directory.
- The repository root holds only files that tooling must find there. Do not add configuration, reports, or helpers to the root; put them in `config/`, `docs/`, or `scripts/`.
- `PIRUT_DATA_DIR` must be a Linux-native path. A `/mnt/` path on a Windows drive cannot hold a PostgreSQL cluster.
- Workflow scripts must build development images explicitly before changing the running environment.
- Application containers must run as dedicated non-root users and expose meaningful readiness checks.
- PostgreSQL must remain on an internal Docker network unless an explicit development-only need is approved.
- Prefer project-owned bind-mounted host directories for durable PostgreSQL data and backups. Ordinary stop and restart operations must preserve them.
- Only an explicit confirmed nuke operation may remove an exact validated project-owned data path.
- Application logs go to stdout and stderr. Do not add persistent log volumes by default.
- Verification must reject `build:` in Compose files, unhealthy services, root application processes, and unexpected running image identities.

## Workflow and verification

The canonical workflows are `scripts/local.sh`, `scripts/verify.sh`, `scripts/try-pr.sh`, and `scripts/release.sh`. They are Bash scripts executed inside WSL, use LF endings and executable modes, and resolve the repository root from their own paths.

`scripts/verify.sh --full` is the authoritative check. Run it before proposing changes. CI must call the same commands rather than reimplementing them.

Parser changes require sanitized representative fixtures for the affected issuer and regression coverage for duplicate detection, installment transactions, refunds, encodings, and date semantics. Never commit real financial statements or personal data.
