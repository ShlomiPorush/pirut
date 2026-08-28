# Pirut Project Foundation

Status: Foundation complete. All fourteen deliverables are built and verified, including the GitHub collaboration baseline. Product work has not started.

This document separates the repository's current state from the approved foundation that a later implementation task must build. A planned item does not exist until its status and verification evidence say otherwise.

Status vocabulary:

- `PREPARED`: created and inspected during project preparation.
- `APPROVED`: explicitly chosen for the desired state but not necessarily implemented.
- `PROVISIONAL`: recommended direction that requires confirmation before implementation.
- `PLANNED`: required future work that is not implemented.
- `BLOCKED`: cannot be implemented safely until the named evidence or decision exists.
- `DEFERRED`: intentionally outside the current stage.
- `IMPLEMENTED`: built during the foundation implementation task with recorded verification evidence.

## Current truth

- Pirut is a new public-ready repository owned by `ShlomiPorush` and licensed under MIT.
- The public GitHub repository is `https://github.com/ShlomiPorush/pirut`; `main` tracks `origin/main` and is protected by the `main protection` ruleset.
- Verified GitHub settings enable Issues, squash merge, automatic head-branch deletion, secret scanning, push protection, Dependabot security updates, and read-only default workflow permissions. Wiki, Discussions, merge commits, rebase merges, and workflow pull-request approvals are disabled. GitHub Projects remains enabled by the platform default, but no project board has been configured.
- The repository contains the implemented foundation: dependency manifests and lockfile, a health-capable Fastify server, a localized React shell, a Drizzle database boundary with an empty migration baseline, the Docker image and Compose definitions, and the four workflow scripts.
- CI, dependency automation, the security policy, issue forms, and the backup and restore procedure exist and are working. CI has run green on `main` and on every pull request since it was added.
- Repository labels and a `main` ruleset are configured. The ruleset requires a pull request, the `CI summary` check, a branch current with `main`, and resolved review conversations, and it blocks deletion and force-push. Repository administrators retain bypass so a solo maintainer cannot be locked out.
- There is no release artifact and no deployment.
- There is no statement import behavior, issuer adapter, categorization, or dashboard. Those are product features outside the foundation scope.
- No Israeli credit card statement sample has been inspected or committed.
- Data persistence was verified: a probe row written to PostgreSQL survived a full `down` and `up-detached` cycle, and the guarded `nuke` flow deleted only the validated project-owned path after an exact confirmation.
- The loopback-only security boundary was verified: `web` publishes `127.0.0.1:4610` and `db` publishes no host port.
- Backup and restore were implemented and proven with synthetic data, then the test state was removed.
- The implementation environment was Windows with WSL 2 on Ubuntu 26.04, Docker Engine 29.5.3, Docker Compose 5.1.4, Node.js 24.20.0 installed through nvm, and pnpm 11.24.0 through Corepack.
- `main` is the default branch. Branch protection was adopted only after CI was proven green, as planned.
- Node.js and pnpm were not previously installed inside WSL. They were installed at user level with nvm; no system-level change was made.

## Product intent and boundaries

### Purpose

Pirut will help one person understand Israeli credit card spending without granting access to bank accounts or relying on a commercial financial-data provider. The normal workflow will be a manual upload of a statement exported by an Israeli card issuer, followed by import review, categorization, and analysis.

The product should turn issuer-specific files into a trustworthy canonical transaction history while preserving the financial meaning that generic budgeting applications often lose, especially purchase date versus charge date, installments, refunds, foreign-currency purchases, and multiple cards.

### Intended users and stage

- Initial user: the repository owner.
- Product posture: personal-first, public-ready source code.
- Stage: foundation implemented; product features not started.
- Initial operating environment: a single Windows workstation using Docker through WSL 2.

### Initial product boundaries

In scope:

- Manual upload of exported statement files.
- Issuer-specific import adapters, beginning only after representative sanitized samples are available.
- Import preview before persistence.
- Deterministic normalization, duplicate prevention, and auditable corrections.
- Hebrew-first spending exploration, category management, recurring-charge visibility, installment visibility, refunds, and useful monthly comparisons.
- Local PostgreSQL persistence and local browser access.

Explicitly out of scope for the initial product:

- Open banking and direct synchronization with banks or card issuers.
- Collection or storage of banking credentials.
- Payment initiation or modification of financial accounts.
- Financial advice, credit recommendations, or automated spending decisions.
- Public SaaS hosting, multi-tenant operation, or multi-user accounts.
- Native mobile applications.
- OCR or PDF-only ingestion until structured issuer exports are understood.
- Investment, pension, mortgage, and full household-accounting features.

### Deployment and security boundary

The approved initial shape is a Dockerized local web application backed by PostgreSQL. The web service must bind to loopback by default. PostgreSQL must be reachable only on the internal Compose network.

The initial product may omit authentication only while it is verifiably loopback-only and single-user. Exposing the application to a LAN, reverse proxy, tunnel, or public network is blocked until an authentication, authorization, TLS, session, and threat-model decision is approved and implemented.

The application must not send financial data, file contents, merchant names, analytics, or telemetry to external services by default.

## Preparation decisions

| Decision                 | Status      | Choice                                                                                                              | Rationale or blocker                                                                                                                                                                                                                        |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name             | APPROVED    | Pirut                                                                                                               | A short transliteration of the Hebrew word for a statement or breakdown and a direct fit for the manual statement workflow.                                                                                                                 |
| Publication posture      | APPROVED    | Public-ready                                                                                                        | The owner is comfortable publishing the project and wants repository content ready for public collaboration.                                                                                                                                |
| GitHub visibility        | APPROVED    | Public                                                                                                              | Explicitly authorized by the owner.                                                                                                                                                                                                         |
| License                  | APPROVED    | MIT                                                                                                                 | Explicitly approved and suitable for a small reusable utility.                                                                                                                                                                              |
| Repository language      | APPROVED    | English                                                                                                             | Required by the public-ready posture. Hebrew is limited to exact localization and sanitized fixture paths.                                                                                                                                  |
| Product languages        | APPROVED    | Hebrew first, English from the first implementation                                                                 | The product must fit the owner while avoiding hard-coded RTL assumptions.                                                                                                                                                                   |
| Runtime shape            | APPROVED    | Single-user local web application in Docker                                                                         | Provides a browser UI and reproducible runtime without creating a hosted service.                                                                                                                                                           |
| Network exposure         | APPROVED    | Loopback-only by default                                                                                            | Allows an initial no-auth personal workflow without silently exposing financial data.                                                                                                                                                       |
| Application architecture | APPROVED    | Modular monolith                                                                                                    | The product has one user and one deployment unit; importer and domain boundaries still require explicit modules.                                                                                                                            |
| Database                 | APPROVED    | PostgreSQL                                                                                                          | Chosen for Docker consistency, migrations, analytical queries, and future headroom. Data volume alone was not treated as a reason to reject SQLite.                                                                                         |
| Raw upload retention     | PROVISIONAL | Do not retain raw files after a committed import                                                                    | Minimizes sensitive-data exposure while preserving hashes, parser version, import metadata, and normalized records for audit. Confirm after sample-file analysis.                                                                           |
| Application stack        | APPROVED    | TypeScript on Node.js 24 LTS, React with Vite, Fastify server, Drizzle ORM, pnpm, i18next, Vitest, ESLint, Prettier | A single language across UI, import validation, and server logic; mature structured-file parsing; explicit SQL and migrations. Approved by the owner on 2026-08-27, including the accompanying build, localization, test, and lint tooling. |
| Docker role              | APPROVED    | Development and local runtime; production-ready Compose contract                                                    | Explicitly requested because the product is a web application.                                                                                                                                                                              |
| Compose tracking         | APPROVED    | Track production Compose; ignore machine-local development Compose                                                  | Keeps deployment portable while preventing machine-specific development state from entering Git.                                                                                                                                            |
| Durable storage          | APPROVED    | Bind-mounted project-owned host directories                                                                         | Keeps PostgreSQL data and backups visible and operable on the Docker host.                                                                                                                                                                  |
| Workflow scripts         | APPROVED    | WSL Bash `.sh` files under `scripts/`                                                                               | Required canonical interface across local work, CI, PR trials, and release.                                                                                                                                                                 |
| Root layout              | APPROVED    | Minimal root with every file justified below                                                                        | Avoids accumulating reports, plans, helpers, and movable configuration at the root.                                                                                                                                                         |
| Release artifact         | PROVISIONAL | Versioned OCI image in GHCR plus tracked production Compose                                                         | Fits the Docker runtime and public repository, but image publication remains a separate release authorization.                                                                                                                              |
| Versioning               | BLOCKED     | Not selected                                                                                                        | Choose SemVer or another scheme only after the application artifact and compatibility contract are implemented.                                                                                                                             |

## Publication and language policy

The repository is public-ready even if a future development environment or deployment is private.

- Repository documentation, code, identifiers, comments, commits, tests, Issues, pull requests, reviews, release notes, and GitHub discussion are English.
- User-facing strings must live in localization resources from the first implementation.
- Hebrew exception paths are `src/locales/he/`, `tests/fixtures/he/`, and per-issuer format-token modules such as `src/importers/isracard/format.ts`. The third was added when the first importer was built: a statement written in Hebrew cannot be parsed without matching its Hebrew column headers and markers literally, and those tokens are part of the file format rather than text anyone reads.
- The English locale is planned at `src/locales/en/`.
- Sanitized Hebrew issuer fixtures may contain only the minimum synthetic data required for parser verification. They must not be copied from a real statement without irreversible sanitization and review.
- The language guard scans tracked and untracked text for Hebrew and excludes only the exact paths above. Broad file-type or directory exclusions are prohibited. Untracked files are included deliberately: without that, a new file passes locally and fails only after it has been committed and pushed.
- Tests outside the fixture path must load Hebrew samples from approved fixture files instead of embedding duplicate Hebrew literals.

## Planned architecture

The application is one deployable unit with internal module boundaries. A split into services is not justified for the initial single-user product.

| Component             | Responsibility                                                                                                | Expected path                              | Status  | Dependencies or blockers                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------- | -------------------------------------------------------------- |
| Web presentation      | Localized RTL/LTR interface, uploads, previews, corrections, dashboards, light and dark themes                | `src/web/`                                 | PLANNED | Confirm the provisional web stack and accessibility baseline.  |
| Application layer     | Coordinate import, preview, commit, categorization, query, and export use cases                               | `src/application/`                         | PLANNED | Canonical domain vocabulary and persistence interfaces.        |
| Canonical domain      | Issuer-independent statements, imports, cards, transactions, installments, refunds, merchants, and categories | `src/domain/`                              | PLANNED | Inspect sanitized issuer samples before finalizing invariants. |
| Issuer adapters       | Detect, parse, validate, and map each supported issuer format without leaking issuer columns into the domain  | `src/importers/`                           | BLOCKED | Sanitized representative files from Isracard, max, and Cal.    |
| Persistence           | PostgreSQL repositories, transactions, migrations, and database constraints                                   | `src/infrastructure/db/`, `db/migrations/` | PLANNED | Confirm Drizzle or choose another migration contract.          |
| Localization          | English and Hebrew message catalogs with no hard-coded user-facing text                                       | `src/locales/en/`, `src/locales/he/`       | PLANNED | Select localization library with framework choice.             |
| Verification fixtures | Synthetic and sanitized issuer samples, malformed cases, and expected canonical results                       | `tests/fixtures/he/`                       | BLOCKED | Real format evidence and a documented sanitization review.     |
| PostgreSQL service    | Durable local state, constraints, reporting queries, migration target                                         | Docker service `db`                        | PLANNED | Production and development Compose definitions.                |

### Import transaction boundary

The import workflow must be preview-first and atomic:

1. Receive a manually selected file without sending it outside the local runtime.
2. Detect issuer and format or require an explicit user selection when detection is ambiguous.
3. Parse into an issuer-specific intermediate representation.
4. Validate required fields, encoding, dates, amounts, card identity, and row totals where the source provides them.
5. Normalize into canonical candidate transactions.
6. Show a review that distinguishes new rows, duplicates, warnings, and rejected rows.
7. Commit the accepted import in one database transaction.
8. Store a source hash, parser identity and version, import timestamp, warnings, and canonical records.
9. Remove the raw upload after commit under the provisional retention policy.

An importer must never persist partial results after a failed commit. Reimporting the same source must be idempotent. Duplicate detection must not rely only on date and amount.

### Financial semantics requiring explicit tests

- Purchase date versus issuer charge date.
- Original purchase amount versus current installment amount.
- Installment index and total installment count.
- Refund linkage without rewriting historical spending.
- Foreign-currency amount, currency, exchange-rate evidence, and final billed amount in ILS.
- Pending versus final transactions when present in an export.
- Multiple cards and cardholders in one file.
- Merchant aliases in Hebrew and English.
- Transfers, fees, interest, cash withdrawals, and non-purchase rows.
- File encoding, locale-specific numbers, time zones, and date formats.

## Data and privacy contract

- PostgreSQL is the source of truth after an import is committed.
- Financial records must use exact decimal or integer minor-unit representation. Floating-point amounts are prohibited.
- Every normalized record must retain traceability to its import and source row without retaining unnecessary personal identifiers.
- Logs must not include uploaded rows, merchant names, full card numbers, personal identifiers, or secrets.
- Card numbers must be reduced to an issuer-safe masked identifier or last four digits when available. Full primary account numbers must never be stored.
- Telemetry and external analytics are disabled by default and are not part of the initial scope.
- Export and deletion behavior must be designed before the product is considered usable with real data.
- Database backups contain sensitive data and must follow the same access and retention rules as the live database.

## Docker desired state

No Docker artifact currently exists. Everything in this section is a requirement for the separate foundation implementation task.

### Compose contract

- Root `docker-compose.yml` is tracked and describes the production deployment using published images.
- Root `docker-compose-dev.yml` is machine-local, ignored, and invoked only through `scripts/local.sh`.
- A tracked template at `config/docker/docker-compose-dev.example.yml` lets `scripts/local.sh init` create the local development file without committing it.
- Neither Compose file may contain `build:`. Workflow scripts build images explicitly and stop on failure.
- The application image has an explicit development tag such as `pirut-web:dev`.
- The production application image is planned as `ghcr.io/shlomiporush/pirut:<immutable-version>`.
- Compose interpolation is limited to values Compose must resolve, such as the application image tag and durable host-data path.
- Container runtime variables are supplied through a root `.env` file referenced by `env_file`. The tracked `.env.example` contains only safe placeholders.
- PostgreSQL has no published host port in the ordinary runtime.
- The web service publishes only the documented application port and binds it to `127.0.0.1` by default.

### Planned containers

| Service | Runtime identity                                        | Health check                                                                                                          | Persistent state   | Host directory policy                                                                                    | Named volume exception | Backup lifecycle                                                                                                                                           |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`   | Dedicated non-root application user; UID 0 is forbidden | Application readiness endpoint that checks process readiness and required database connectivity without exposing data | None               | No durable bind mount                                                                                    | None                   | Rebuild from immutable image and configuration.                                                                                                            |
| `db`    | Official PostgreSQL runtime user                        | `pg_isready` plus application-level migration compatibility verification                                              | PostgreSQL cluster | Development under ignored project-owned `data/postgres/`; production under `${PIRUT_DATA_DIR}/postgres/` | None approved          | Consistent `pg_dump` backups under `${PIRUT_DATA_DIR}/backups/`, documented restore into a clean target, and restore verification before old data removal. |

Ordinary `down`, restart, upgrade, and PR trial operations preserve PostgreSQL data. Only an explicit `nuke` flow may delete development data, after resolving and verifying that the absolute target remains within the exact project-owned development data directory and after interactive confirmation.

## Planned repository root

Directories are intentionally excluded from this inventory. Scripts, extended documentation, configuration templates, migrations, fixtures, and workflows belong in purpose-specific directories.

| Root file                | Git tracking policy       | Why this exact root location is required                                                | Status      |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------------- | ----------- |
| `README.md`              | Tracked                   | Standard repository entry point and current-truth summary.                              | PREPARED    |
| `AGENTS.md`              | Tracked                   | Repository instruction discovery for contributors and coding agents.                    | PREPARED    |
| `LICENSE`                | Tracked                   | Standard license discovery and GitHub license detection.                                | PREPARED    |
| `.gitignore`             | Tracked                   | Git discovery requires repository-wide ignore policy at the root.                       | PREPARED    |
| `.gitattributes`         | Tracked                   | Enforces LF for planned Bash scripts and stable text handling across Windows and WSL.   | PREPARED    |
| `CHANGELOG.md`           | Tracked                   | Canonical `Unreleased` record and release history.                                      | IMPLEMENTED |
| `package.json`           | Tracked                   | Root Node package and canonical workflow metadata if the provisional stack is approved. | IMPLEMENTED |
| `pnpm-lock.yaml`         | Tracked                   | Standard reproducible lockfile for the provisional package manager.                     | IMPLEMENTED |
| `.node-version`          | Tracked                   | Cross-tool discovery of the selected Node.js LTS version.                               | IMPLEMENTED |
| `tsconfig.json`          | Tracked                   | IDE and TypeScript ecosystem discovery for the application root.                        | IMPLEMENTED |
| `.dockerignore`          | Tracked                   | Docker build-context discovery requires this exact location.                            | IMPLEMENTED |
| `Dockerfile`             | Tracked                   | Standard Docker build contract for the single application image.                        | IMPLEMENTED |
| `docker-compose.yml`     | Tracked                   | Approved production Compose discovery path.                                             | IMPLEMENTED |
| `docker-compose-dev.yml` | Ignored and machine-local | Approved development Compose discovery path used only by `scripts/local.sh`.            | IMPLEMENTED |
| `.env.example`           | Tracked                   | Safe runtime and Compose environment contract discoverable beside Compose.              | IMPLEMENTED |
| `.env`                   | Ignored and machine-local | Contains real local configuration and secrets consumed by Compose `env_file`.           | IMPLEMENTED |
| `pnpm-workspace.yaml`    | Tracked                   | pnpm 11 reads build-approval policy only from this exact root file.                     | IMPLEMENTED |
| `eslint.config.mjs`      | Tracked                   | ESLint flat-config discovery requires this exact root location.                         | IMPLEMENTED |
| `vitest.config.ts`       | Tracked                   | Vitest configuration discovery for the repository-wide test suite.                      | IMPLEMENTED |
| `.prettierignore`        | Tracked                   | Prettier discovery requires repository-wide ignore policy at the root.                  | IMPLEMENTED |

No report, scratch file, generated artifact, editor configuration, or one-off helper belongs at the repository root.

## Foundation implementation plan

Deliverables 1 through 10 were implemented and verified on 2026-08-27 and 2026-08-28. Deliverables 11 through 14 remain open. Evidence below records what was actually executed and inspected.

| Order | Deliverable                   | Status      | Acceptance criteria                                                                                                                                                                                              | Required verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Confirm implementation stack  | IMPLEMENTED | Owner approves the runtime, UI framework, server framework, database library, package manager, and supported Node LTS version.                                                                                   | Owner approved TypeScript on Node.js 24 LTS, React with Vite, Fastify, Drizzle ORM, pnpm, i18next, Vitest, ESLint, and Prettier on 2026-08-27, before any manifest was created. Recorded in the preparation decisions table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2     | Repository baseline           | IMPLEMENTED | Add changelog, exact manifests, lockfile, tool configuration in purpose-specific paths, and safe dependency policy without product features.                                                                     | Inspect tracked root inventory; install strictly from lockfile; run format and config validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Added `CHANGELOG.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.node-version`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `.prettierignore`, and `config/typescript/tsconfig.server.json`. Verified by `pnpm install --frozen-lockfile`, `pnpm run format:check`, and `pnpm run lint`, all clean. TypeScript is pinned to 6.x because typescript-eslint does not yet support TypeScript 7.                                                                                                                                                                                                                                                                                                                                |
| 3     | Minimal runtime skeleton      | IMPLEMENTED | Create only the health-capable web process, database connectivity boundary, localization shell, and empty migration baseline needed to prove infrastructure. No statement parsing or product dashboard.          | Production build, unit smoke test, Hebrew and English render smoke checks, and no hard-coded user text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Implemented the Fastify server, database boundary, React shell, he/en catalogs, and empty Drizzle journal. Verified by `pnpm run typecheck`, `pnpm run build`, and 10 passing tests covering the ready and degraded health responses, locale key parity, absence of Hebrew in the English catalog, Hebrew right-to-left default rendering, the English left-to-right switch, dark-theme selection, and the degraded state. Additionally inspected in a real browser against the running container: Hebrew renders right-to-left with the system dark theme and a live connected-database status drawn from the Hebrew catalog, switching to English renders left-to-right with the light theme, and a 390-pixel viewport produces no horizontal overflow. |
| 4     | Production Docker image       | IMPLEMENTED | Multi-stage image, locked dependencies, dedicated non-root runtime user, no embedded secrets, and meaningful health endpoint.                                                                                    | Build image; inspect UID; scan configuration; run health check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Multi-stage `Dockerfile` on `node:24.20.0-trixie-slim` installing from the lockfile, running as dedicated UID 10001, with no embedded secrets and a health check that exercises `/api/health`. Verified by building the image and observing `uid=10001(pirut)` in the running container and `id -u` = 10001 in the image.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5     | Production Compose definition | IMPLEMENTED | Uses published immutable images, no `build:`, internal-only PostgreSQL, loopback-only web port, `env_file`, and visible durable bind mounts.                                                                     | Parse Compose; guard against `build:`; inspect networks, mounts, port bindings, and health checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `docker-compose.yml` uses `${PIRUT_IMAGE}` with no `build:`, keeps `db` on the internal network with no published port, binds `web` to `127.0.0.1`, uses `env_file`, and bind-mounts `${PIRUT_DATA_DIR}`. Verified by rendering the file with `docker compose config --format json` and asserting these properties programmatically in `scripts/verify.sh`.                                                                                                                                                                                                                                                                                                                                                                                               |
| 6     | Development Docker definition | IMPLEMENTED | Tracked template creates ignored root `docker-compose-dev.yml`; uses explicit dev image names and preserves data.                                                                                                | Generate on a clean checkout; confirm ignored status; start and stop twice without data loss.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `config/docker/docker-compose-dev.example.yml` and `config/docker/env.example` generate the ignored root `docker-compose-dev.yml` and `.env` through `scripts/local.sh init`. Verified that both generated files are Git-ignored, and that a probe row written to PostgreSQL survived a full `down` and `up-detached` cycle.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7     | Local workflow                | IMPLEMENTED | `scripts/local.sh` supports init, build, up, detached up, down, status, and confirmed nuke. It never silently uses production Compose.                                                                           | Shell syntax and lint; missing-file failure; healthy startup; image identity; non-root process; persistence and guarded nuke tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Verified `init` on a clean checkout; the actionable failure when `docker-compose-dev.yml` is missing; `build`; `up-detached` reporting healthy services, image `pirut-web:dev`, and effective UID 10001; `status`; `down` preserving data; `nuke` refusing a mismatched confirmation and preserving data; and `nuke` deleting only the validated path after an exact confirmation.                                                                                                                                                                                                                                                                                                                                                                        |
| 8     | Verify workflow               | IMPLEMENTED | `scripts/verify.sh` is the authoritative formatter, lint, type-check, test, build, migration, Docker-contract, locale, language-guard, and integration entry point. Supports full and useful changed-area modes. | Clean full run in WSL and repeatable CI invocation using the same commands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `scripts/verify.sh --full` passed all 16 checks in WSL: format, Hebrew guard, shell scripts, env-example safety, lint, types, unit tests, locale completeness, production build, migration journal, lockfile currency, dependency audit, Dockerfile contract, Compose contract, Docker image identity, and a live integration run returning `{"status":"ready","database":"connected"}`. `shellcheck` runs in CI and, when the binary is absent locally, through a pinned container image. It is never silently skipped.                                                                                                                                                                                                                                  |
| 9     | Try PR workflow               | IMPLEMENTED | `scripts/try-pr.sh` accepts a PR number and start, status, and restore operations; uses a disposable worktree and preserves PostgreSQL state.                                                                    | Trial a safe test PR; confirm fresh image identity; restore checkout and runtime; remove worktree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `scripts/try-pr.sh` fetches a pull request into a disposable worktree outside the repository, builds a trial image, and runs it against a disposable database so durable development data is never reused. Verified `status` with no active trial and rejection of a non-numeric pull request number. An end-to-end trial against a real pull request has not been run, because no pull request exists yet.                                                                                                                                                                                                                                                                                                                                               |
| 10    | Release workflow              | IMPLEMENTED | `scripts/release.sh` separates preview from execution, requires explicit target, clean synchronized source, full verification, version and changelog update, immutable tag, image build, and GHCR publication.   | Non-mutating preview; local package inspection; no secret output; no publication during foundation work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `scripts/release.sh` previews without mutating anything and requires `--execute` to act. Verified the non-mutating preview and rejection of a missing target, a malformed version, and an unsupported target. Nothing was built, tagged, pushed, or published. Execution additionally requires a clean synchronized `main`, a full verification pass, an unused tag, and an unpublished image version.                                                                                                                                                                                                                                                                                                                                                    |
| 11    | Path-filtered CI              | IMPLEMENTED | Cheap detection gates expensive jobs; docs-only work skips application jobs; shared root files affect all; final summary always succeeds for intentional skips; manual and scheduled full runs exist.            | Implemented `.github/workflows/ci.yml`. A cheap `changes` job with path filters gates the `app` and `docker` jobs; shared roots, tooling, and non-pull-request events force a full run. Each job invokes `scripts/verify.sh --only <area>` so CI and local runs cannot drift. The `summary` job runs with `if: always()` and treats a skipped job as an intentional path-filter outcome, making it safe as a required check. Manual dispatch and a weekly scheduled sweep exist. Third-party actions are pinned to immutable commit revisions. Permissions start at `contents: read`. Not yet observed running on GitHub.                                                                                                                                                                      |
| 12    | Dependency management         | IMPLEMENTED | Lockfile required everywhere; weekly grouped minor and patch updates; majors separate; no auto-merge.                                                                                                            | Implemented `.github/dependabot.yml` covering npm, GitHub Actions, and Docker on a weekly schedule. Minor and patch updates are grouped into one pull request per ecosystem; majors match no group and therefore arrive individually. No auto-merge is configured. Lockfile drift is rejected by the `lockfile is current` check in `scripts/verify.sh`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 13    | GitHub collaboration baseline | IMPLEMENTED | Focused labels, issue forms, security policy, least-privilege Actions, Dependabot, vulnerability alerts, and branch rules after required checks exist.                                                           | Implemented `SECURITY.md` with private vulnerability reporting and an explicit prohibition on real financial data, plus issue forms for bugs and issuer-format support that both require an affirmative data-safety checkbox. Blank issues are disabled and security reports are routed to private advisories. Repository labels and a `main` ruleset were configured on 2026-08-28 after CI was proven green: focused `area:`, `priority:`, and nature labels replace the unused GitHub defaults, and the ruleset requires a pull request, the `CI summary` check, a current branch, and resolved conversations, while blocking deletion and force-push. Administrators keep bypass so a solo maintainer cannot be locked out; verified by merging a pull request through the active ruleset. |
| 14    | Backup and restore operations | IMPLEMENTED | Documented PostgreSQL backup, retention, restore, and restore verification using exact project-owned paths.                                                                                                      | Implemented `scripts/local.sh backup` and `restore`, documented in `docs/backup-and-restore.md`. Proven with synthetic data only: a seeded table was backed up with `pg_dump --format=custom`, dropped, and restored, and the exact rows returned. The restore refused a mismatched confirmation and refused source paths outside the backups directory, including `/etc/passwd` and a traversal attempt. All test tables and backup files were removed afterwards and the database was confirmed empty.                                                                                                                                                                                                                                                                                       |

## Implementation deviations from the plan

These are the only places where implementation differs from what preparation assumed. Each was forced by verified evidence, not preference.

| Area                                      | Planned assumption                                                      | What was implemented                                                                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable data location                     | Project-owned bind mount under the repository, such as `data/postgres/` | `PIRUT_DATA_DIR` must name a Linux-native path. `scripts/local.sh init` defaults to `${XDG_DATA_HOME:-~/.local/share}/pirut/data`, and both the script library and the documentation reject a `/mnt/` path. | Bind-mounting the repository's `data/postgres` from the Windows drive made `initdb` fail with `could not change permissions of directory ... Operation not permitted`, because the DrvFs mount cannot apply the required ownership. The same stack started and stayed healthy from a WSL-native path. The directory is still a project-owned, visible, operable bind mount. |
| PostgreSQL data path inside the container | `/var/lib/postgresql/data`                                              | `/var/lib/postgresql`                                                                                                                                                                                       | PostgreSQL 18 sets `PGDATA=/var/lib/postgresql/18/docker` and declares `/var/lib/postgresql` as its volume, confirmed with `docker image inspect postgres:18.6-trixie`.                                                                                                                                                                                                     |
| Deleting development data                 | Remove the validated path from the host                                 | Removal runs as root inside a throwaway `alpine` container bound to the validated path                                                                                                                      | The cluster files belong to the container's `postgres` user, so host-side removal would require `sudo`, which is not available without a password on this machine. The path is still resolved and validated before anything is deleted.                                                                                                                                     |
| TypeScript version                        | Latest available                                                        | TypeScript 6.x                                                                                                                                                                                              | typescript-eslint refuses to load under TypeScript 7 and fails with `typescript-eslint does not support TS 7.0`. TypeScript 6 is the newest version the lint toolchain supports. Revisit when typescript-eslint ships TypeScript 7 support.                                                                                                                                 |
| PostgreSQL major version                  | Not specified                                                           | 18.6                                                                                                                                                                                                        | PostgreSQL 19 exists only as `19beta3` on Docker Hub. Beta software is not appropriate for durable financial data.                                                                                                                                                                                                                                                          |

## Required workflow contracts

All four canonical scripts must use `#!/usr/bin/env bash`, LF line endings, executable file modes, `set -Eeuo pipefail`, and repository-root resolution based on the script location. They run inside WSL and use Linux paths internally. No PowerShell or batch wrapper is planned.

### `scripts/local.sh`

Planned operations:

- `init`: create root `.env` and `docker-compose-dev.yml` from tracked safe templates only when absent.
- `build`: install from the lockfile and build explicit development images before runtime changes.
- `up`: build, start in the foreground, and verify readiness.
- `up-detached`: build, start detached, and verify readiness, effective UID, and running image identity.
- `down`: stop services and remove orphans while preserving durable directories.
- `status`: show service health, image identities, bind mounts, and migration compatibility without exposing secrets.
- `nuke`: resolve and verify the exact development data path, require interactive confirmation, stop services, and remove only that validated project-owned path.

The script must fail with an actionable message when `docker-compose-dev.yml` is missing outside `init`. It must never fall back to production Compose.

### `scripts/verify.sh`

The full mode must run formatting checks, lint, type checks, unit tests, importer contract tests when fixtures exist, migration validation, production build, locale completeness, public-ready Hebrew guard, dependency audit policy, Compose parsing, no-`build:` guard, Docker image build, non-root identity check, health checks, and relevant integration tests.

Changed-area mode may skip expensive application work only after a deterministic path detector maps shared root files and tooling to every consumer. CI, local work, and release must call the same underlying verification commands.

### `scripts/try-pr.sh`

The script accepts a pull request number and supports start, status, and restore. It uses a disposable Git worktree under a validated worktree parent, detects affected areas, builds fresh development images, and changes only the relevant application surface. It must not replace the persistent PostgreSQL service unnecessarily.

Before testing a PR containing migrations against shared development data, the workflow must prove backward restore safety or use disposable database state. It never merges, pushes, edits the user's working tree, or destroys durable data.

### `scripts/release.sh`

The workflow keeps merge and release separate. It requires an explicit release target and non-mutating preview. Execution requires a clean synchronized `main`, full verification, a selected version change, an updated changelog, packaging, immutable tag creation, and target-specific OCI publication.

It must not use blanket `git add .`, force-push tags, overwrite a published tag or image version, print secrets, silently select production, deploy the application, or merge a pull request.

## CI contract

- Run on pull requests and `main`.
- Cancel superseded pull request runs but never cancel `main` or release runs.
- Begin with a cheap path-detection job.
- Treat changes to manifests, lockfiles, Docker definitions, workflow scripts, shared configuration, locales, migrations, and CI itself as affecting all relevant jobs.
- Use a final summary job suitable as a required check when area jobs are intentionally skipped.
- Provide manual full verification.
- Provide a scheduled full sweep that ignores path filters.
- Pin third-party actions to immutable commit revisions.
- Start with read-only repository contents permission and add narrowly scoped permissions only to the exact job that requires them.
- Do not expose repository secrets to untrusted pull request code.

## Dependency, version, and release policy

- Use the standard committed lockfile for the approved ecosystem.
- Development, build, verification, CI, and release install from the lockfile without silently updating it.
- Plan weekly dependency update pull requests. Group routine minor and patch updates and review majors separately. Do not auto-merge.
- Record every substantive user-visible or operational change under `Unreleased` in `CHANGELOG.md` once that file is implemented.
- Do not bump a version in every pull request.
- The release workflow selects the version, closes `Unreleased`, verifies, commits, tags, and publishes an immutable OCI image.
- No release, package publication, deployment, or merge is authorized by this preparation task.

## GitHub desired state

Approved initial settings:

- Owner and repository: `ShlomiPorush/pirut`.
- Visibility: public.
- Default branch: `main`.
- Issues: enabled.
- Wiki and Discussions: disabled initially.
- Squash merge: enabled.
- Merge commits and rebase merges: disabled.
- Automatically delete head branches after merge: enabled.
- No branch rule until real required CI checks exist.

Planned after foundation CI exists:

- A `main` ruleset that requires a pull request, the final CI summary check, resolved review conversations, and a current branch without blocking the owner before the workflow is proven.
- Focused labels for bugs, enhancements, security, importers, UI, data, and infrastructure.
- Issue forms for bugs and issuer-format support that explicitly prohibit real personal statements and credentials.
- `SECURITY.md` with private vulnerability reporting instructions.
- Dependabot weekly updates matching the dependency policy.
- Vulnerability alerts, secret scanning where GitHub supports it, and least-privilege Actions permissions.

## Known unknowns and blockers

| Question or blocker           | Why it matters                                                                           | Evidence or decision needed                                                                                                   | Owner  |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| Representative issuer formats | Parser boundaries, canonical fields, encoding, and test cases cannot be invented safely. | One sanitized representative export for each intended issuer and card variant, starting with the owner's actual first issuer. | Shlomi |
| Raw upload retention          | Affects privacy, debugging, reproducibility, and backup size.                            | Confirm deletion after committed import once sample-file replay requirements are understood.                                  | Shlomi |
| Supported initial file types  | XLSX, XLS, CSV, and TXT require different parsers and security controls.                 | Inspect the first real issuer export and select the minimum first format.                                                     | Shlomi |
| Authentication boundary       | Loopback-only operation can start without authentication; any wider exposure cannot.     | Keep loopback-only or approve a later authentication and threat-model task before exposure.                                   | Shlomi |
| Release versioning            | Determines tags, changelog closure, and image naming.                                    | Decide after the artifact and compatibility promise exist.                                                                    | Shlomi |

## Ready-for-implementation criteria

The separate foundation implementation task may start when:

- The owner explicitly starts it in the Pirut repository context. Met: the owner started the foundation implementation task on 2026-08-27.
- The provisional application stack is approved or replaced. Met: approved by the owner on 2026-08-27.
- The initial issuer and minimum supported structured file format are selected from inspected evidence. DEFERRED by owner decision on 2026-08-27: this selection gates only issuer adapters and fixtures, which are outside the foundation scope, and it will be made when the owner provides a real sanitized export.
- Any sample used for automated tests is synthetic or irreversibly sanitized and approved for public tracking. Not applicable to the foundation task, which uses no statement samples.
- Authority for GitHub Actions, Dependabot, labels, templates, settings, or branch rules is confirmed before those external changes. Partly met: the owner authorized continuing through the remaining deliverables, so tracked workflow, Dependabot, security-policy, and issue-form files were added. Repository settings themselves, meaning labels and branch rules, were not changed and still require explicit authorization.
- The implementer confirms that product parsing and dashboard features remain out of scope for the foundation task. Confirmed by the implementer on 2026-08-27.

## Foundation completion

All fourteen deliverables are implemented and verified. Verification comprises 18 checks and 11 tests, and CI runs green on `main` and on every pull request. No verification gaps remain: `scripts/try-pr.sh` was the last one, exercised end to end against pull request #10.

CI has been observed doing real work rather than merely passing. It caught three shellcheck findings a local run had skipped, and it correctly rejected a Dependabot major Node bump that breaks the image build.

Repository labels and the `main` ruleset were configured last, deliberately, so branch protection was adopted only against a CI workflow already proven green.

The next task is product work, which requires a separate approval and, for importers, sanitized issuer evidence.

## Defects found and fixed while verifying

Three checks were found reporting a pass they had not earned. All three shared one shape: a failing command whose exit status was discarded. The pattern is recorded because it is worth recognising again.

| Defect                                                  | How it hid                                                                                                                                                                                                | Fix                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The public-ready Hebrew guard never ran                 | Its literal character range made `git grep` fail with `Invalid collation character` under the C locale, and the call was wrapped so that the error became an empty result, which read as "no violations". | A locale-independent pattern, and an error in the search now fails the check. Fixing it surfaced three real violations that had been in the repository. |
| Verification passed on a Dockerfile that does not build | `set -e` does not apply inside a function invoked as a condition, so a failed `docker build` fell through to inspecting a stale image carrying the same tag.                                              | The build result is checked explicitly, and integration is skipped rather than failing with a misleading registry error.                                |
| The dependency audit missed a real advisory             | It inspected production dependencies only, so a build-time advisory was invisible to it while GitHub reported it.                                                                                         | Production is audited at moderate and above, development dependencies at high and above.                                                                |

Two further gaps were closed: CI treated the workflow scripts as an isolated area, so changing `scripts/verify.sh` skipped the very jobs that run it; and nothing compared the Dockerfile's Node version against `.node-version` and `engines.node`, so a drift surfaced only as an unrelated build error.

Do not add issuer parsers, statement upload behavior, categorization, dashboards, real financial fixtures, public deployment, or release publication without a separate approved task.
