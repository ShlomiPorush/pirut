# Pirut Project Foundation

Status: Preparation complete, foundation not implemented

This document separates the repository's current state from the approved foundation that a later implementation task must build. A planned item does not exist until its status and verification evidence say otherwise.

Status vocabulary:

- `PREPARED`: created and inspected during project preparation.
- `APPROVED`: explicitly chosen for the desired state but not necessarily implemented.
- `PROVISIONAL`: recommended direction that requires confirmation before implementation.
- `PLANNED`: required future work that is not implemented.
- `BLOCKED`: cannot be implemented safely until the named evidence or decision exists.
- `DEFERRED`: intentionally outside the current stage.

## Current truth

- Pirut is a new public-ready repository owned by `ShlomiPorush` and licensed under MIT.
- The repository contains only preparation documentation and repository metadata.
- There is no product code, dependency manifest, lockfile, application runtime, database schema, migration, Docker definition, workflow script, CI workflow, release artifact, or deployment.
- No Israeli credit card statement sample has been inspected or committed.
- No import behavior, Hebrew UI, data persistence, backup, restore, security boundary, or runtime command has been implemented or verified.
- The preparation environment was inspected on Windows with WSL 2, Docker Engine 29.5.3, Docker Compose 5.1.4, Git, and authenticated GitHub access for `ShlomiPorush`.
- The repository is intended to use `main` as its default branch. Branch protection is intentionally deferred until real CI checks exist.

## Product intent and boundaries

### Purpose

Pirut will help one person understand Israeli credit card spending without granting access to bank accounts or relying on a commercial financial-data provider. The normal workflow will be a manual upload of a statement exported by an Israeli card issuer, followed by import review, categorization, and analysis.

The product should turn issuer-specific files into a trustworthy canonical transaction history while preserving the financial meaning that generic budgeting applications often lose, especially purchase date versus charge date, installments, refunds, foreign-currency purchases, and multiple cards.

### Intended users and stage

- Initial user: the repository owner.
- Product posture: personal-first, public-ready source code.
- Stage: project preparation before foundation implementation.
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

| Decision | Status | Choice | Rationale or blocker |
|---|---|---|---|
| Product name | APPROVED | Pirut | A short transliteration of the Hebrew word for a statement or breakdown and a direct fit for the manual statement workflow. |
| Publication posture | APPROVED | Public-ready | The owner is comfortable publishing the project and wants repository content ready for public collaboration. |
| GitHub visibility | APPROVED | Public | Explicitly authorized by the owner. |
| License | APPROVED | MIT | Explicitly approved and suitable for a small reusable utility. |
| Repository language | APPROVED | English | Required by the public-ready posture. Hebrew is limited to exact localization and sanitized fixture paths. |
| Product languages | APPROVED | Hebrew first, English from the first implementation | The product must fit the owner while avoiding hard-coded RTL assumptions. |
| Runtime shape | APPROVED | Single-user local web application in Docker | Provides a browser UI and reproducible runtime without creating a hosted service. |
| Network exposure | APPROVED | Loopback-only by default | Allows an initial no-auth personal workflow without silently exposing financial data. |
| Application architecture | APPROVED | Modular monolith | The product has one user and one deployment unit; importer and domain boundaries still require explicit modules. |
| Database | APPROVED | PostgreSQL | Chosen for Docker consistency, migrations, analytical queries, and future headroom. Data volume alone was not treated as a reason to reject SQLite. |
| Raw upload retention | PROVISIONAL | Do not retain raw files after a committed import | Minimizes sensitive-data exposure while preserving hashes, parser version, import metadata, and normalized records for audit. Confirm after sample-file analysis. |
| Application stack | PROVISIONAL | TypeScript on Node.js LTS, React UI, Fastify server, Drizzle ORM, pnpm | A single language across UI, import validation, and server logic; mature structured-file parsing; explicit SQL and migrations. Confirm before creating manifests. |
| Docker role | APPROVED | Development and local runtime; production-ready Compose contract | Explicitly requested because the product is a web application. |
| Compose tracking | APPROVED | Track production Compose; ignore machine-local development Compose | Keeps deployment portable while preventing machine-specific development state from entering Git. |
| Durable storage | APPROVED | Bind-mounted project-owned host directories | Keeps PostgreSQL data and backups visible and operable on the Docker host. |
| Workflow scripts | APPROVED | WSL Bash `.sh` files under `scripts/` | Required canonical interface across local work, CI, PR trials, and release. |
| Root layout | APPROVED | Minimal root with every file justified below | Avoids accumulating reports, plans, helpers, and movable configuration at the root. |
| Release artifact | PROVISIONAL | Versioned OCI image in GHCR plus tracked production Compose | Fits the Docker runtime and public repository, but image publication remains a separate release authorization. |
| Versioning | BLOCKED | Not selected | Choose SemVer or another scheme only after the application artifact and compatibility contract are implemented. |

## Publication and language policy

The repository is public-ready even if a future development environment or deployment is private.

- Repository documentation, code, identifiers, comments, commits, tests, Issues, pull requests, reviews, release notes, and GitHub discussion are English.
- User-facing strings must live in localization resources from the first implementation.
- Planned Hebrew exception paths are `src/locales/he/` and `tests/fixtures/he/` only.
- The English locale is planned at `src/locales/en/`.
- Sanitized Hebrew issuer fixtures may contain only the minimum synthetic data required for parser verification. They must not be copied from a real statement without irreversible sanitization and review.
- CI must scan tracked text for Hebrew and exclude only `src/locales/he/**` and `tests/fixtures/he/**`. Broad file-type or directory exclusions are prohibited.
- Tests outside the fixture path must load Hebrew samples from approved fixture files instead of embedding duplicate Hebrew literals.

## Planned architecture

The application is one deployable unit with internal module boundaries. A split into services is not justified for the initial single-user product.

| Component | Responsibility | Expected path | Status | Dependencies or blockers |
|---|---|---|---|---|
| Web presentation | Localized RTL/LTR interface, uploads, previews, corrections, dashboards, light and dark themes | `src/web/` | PLANNED | Confirm the provisional web stack and accessibility baseline. |
| Application layer | Coordinate import, preview, commit, categorization, query, and export use cases | `src/application/` | PLANNED | Canonical domain vocabulary and persistence interfaces. |
| Canonical domain | Issuer-independent statements, imports, cards, transactions, installments, refunds, merchants, and categories | `src/domain/` | PLANNED | Inspect sanitized issuer samples before finalizing invariants. |
| Issuer adapters | Detect, parse, validate, and map each supported issuer format without leaking issuer columns into the domain | `src/importers/` | BLOCKED | Sanitized representative files from Isracard, max, and Cal. |
| Persistence | PostgreSQL repositories, transactions, migrations, and database constraints | `src/infrastructure/db/`, `db/migrations/` | PLANNED | Confirm Drizzle or choose another migration contract. |
| Localization | English and Hebrew message catalogs with no hard-coded user-facing text | `src/locales/en/`, `src/locales/he/` | PLANNED | Select localization library with framework choice. |
| Verification fixtures | Synthetic and sanitized issuer samples, malformed cases, and expected canonical results | `tests/fixtures/he/` | BLOCKED | Real format evidence and a documented sanitization review. |
| PostgreSQL service | Durable local state, constraints, reporting queries, migration target | Docker service `db` | PLANNED | Production and development Compose definitions. |

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

| Service | Runtime identity | Health check | Persistent state | Host directory policy | Named volume exception | Backup lifecycle |
|---|---|---|---|---|---|---|
| `web` | Dedicated non-root application user; UID 0 is forbidden | Application readiness endpoint that checks process readiness and required database connectivity without exposing data | None | No durable bind mount | None | Rebuild from immutable image and configuration. |
| `db` | Official PostgreSQL runtime user | `pg_isready` plus application-level migration compatibility verification | PostgreSQL cluster | Development under ignored project-owned `data/postgres/`; production under `${PIRUT_DATA_DIR}/postgres/` | None approved | Consistent `pg_dump` backups under `${PIRUT_DATA_DIR}/backups/`, documented restore into a clean target, and restore verification before old data removal. |

Ordinary `down`, restart, upgrade, and PR trial operations preserve PostgreSQL data. Only an explicit `nuke` flow may delete development data, after resolving and verifying that the absolute target remains within the exact project-owned development data directory and after interactive confirmation.

## Planned repository root

Directories are intentionally excluded from this inventory. Scripts, extended documentation, configuration templates, migrations, fixtures, and workflows belong in purpose-specific directories.

| Root file | Git tracking policy | Why this exact root location is required | Status |
|---|---|---|---|
| `README.md` | Tracked | Standard repository entry point and current-truth summary. | PREPARED |
| `AGENTS.md` | Tracked | Repository instruction discovery for contributors and coding agents. | PREPARED |
| `LICENSE` | Tracked | Standard license discovery and GitHub license detection. | PREPARED |
| `.gitignore` | Tracked | Git discovery requires repository-wide ignore policy at the root. | PREPARED |
| `.gitattributes` | Tracked | Enforces LF for planned Bash scripts and stable text handling across Windows and WSL. | PREPARED |
| `CHANGELOG.md` | Tracked | Canonical `Unreleased` record and release history. | PLANNED |
| `package.json` | Tracked | Root Node package and canonical workflow metadata if the provisional stack is approved. | BLOCKED on stack approval |
| `pnpm-lock.yaml` | Tracked | Standard reproducible lockfile for the provisional package manager. | BLOCKED on stack approval |
| `.node-version` | Tracked | Cross-tool discovery of the selected Node.js LTS version. | BLOCKED on stack approval |
| `tsconfig.json` | Tracked | IDE and TypeScript ecosystem discovery for the application root. | BLOCKED on stack approval |
| `.dockerignore` | Tracked | Docker build-context discovery requires this exact location. | PLANNED |
| `Dockerfile` | Tracked | Standard Docker build contract for the single application image. | PLANNED |
| `docker-compose.yml` | Tracked | Approved production Compose discovery path. | PLANNED |
| `docker-compose-dev.yml` | Ignored and machine-local | Approved development Compose discovery path used only by `scripts/local.sh`. | PLANNED |
| `.env.example` | Tracked | Safe runtime and Compose environment contract discoverable beside Compose. | PLANNED |
| `.env` | Ignored and machine-local | Contains real local configuration and secrets consumed by Compose `env_file`. | PLANNED |

No report, scratch file, generated artifact, editor configuration, or one-off helper belongs at the repository root.

## Foundation implementation plan

Every deliverable below is unimplemented. The next task must update status and attach verification evidence as work is completed.

| Order | Deliverable | Status | Acceptance criteria | Required verification |
|---|---|---|---|---|
| 1 | Confirm implementation stack | BLOCKED | Owner approves the runtime, UI framework, server framework, database library, package manager, and supported Node LTS version. | Record decision and rationale before creating manifests. |
| 2 | Repository baseline | PLANNED | Add changelog, exact manifests, lockfile, tool configuration in purpose-specific paths, and safe dependency policy without product features. | Inspect tracked root inventory; install strictly from lockfile; run format and config validation. |
| 3 | Minimal runtime skeleton | PLANNED | Create only the health-capable web process, database connectivity boundary, localization shell, and empty migration baseline needed to prove infrastructure. No statement parsing or product dashboard. | Production build, unit smoke test, Hebrew and English render smoke checks, and no hard-coded user text. |
| 4 | Production Docker image | PLANNED | Multi-stage image, locked dependencies, dedicated non-root runtime user, no embedded secrets, and meaningful health endpoint. | Build image; inspect UID; scan configuration; run health check. |
| 5 | Production Compose definition | PLANNED | Uses published immutable images, no `build:`, internal-only PostgreSQL, loopback-only web port, `env_file`, and visible durable bind mounts. | Parse Compose; guard against `build:`; inspect networks, mounts, port bindings, and health checks. |
| 6 | Development Docker definition | PLANNED | Tracked template creates ignored root `docker-compose-dev.yml`; uses explicit dev image names and preserves data. | Generate on a clean checkout; confirm ignored status; start and stop twice without data loss. |
| 7 | Local workflow | PLANNED | `scripts/local.sh` supports init, build, up, detached up, down, status, and confirmed nuke. It never silently uses production Compose. | Shell syntax and lint; missing-file failure; healthy startup; image identity; non-root process; persistence and guarded nuke tests. |
| 8 | Verify workflow | PLANNED | `scripts/verify.sh` is the authoritative formatter, lint, type-check, test, build, migration, Docker-contract, locale, language-guard, and integration entry point. Supports full and useful changed-area modes. | Clean full run in WSL and repeatable CI invocation using the same commands. |
| 9 | Try PR workflow | PLANNED | `scripts/try-pr.sh` accepts a PR number and start, status, and restore operations; uses a disposable worktree and preserves PostgreSQL state. | Trial a safe test PR; confirm fresh image identity; restore checkout and runtime; remove worktree. |
| 10 | Release workflow | PLANNED | `scripts/release.sh` separates preview from execution, requires explicit target, clean synchronized source, full verification, version and changelog update, immutable tag, image build, and GHCR publication. | Non-mutating preview; local package inspection; no secret output; no publication during foundation work. |
| 11 | Path-filtered CI | PLANNED | Cheap detection gates expensive jobs; docs-only work skips application jobs; shared root files affect all; final summary always succeeds for intentional skips; manual and scheduled full runs exist. | Pull request, main, docs-only, and manual full-run scenarios. |
| 12 | Dependency management | PLANNED | Lockfile required everywhere; weekly grouped minor and patch updates; majors separate; no auto-merge. | CI rejects lockfile drift and unlocked installation. |
| 13 | GitHub collaboration baseline | PLANNED | Focused labels, issue forms, security policy, least-privilege Actions, Dependabot, vulnerability alerts, and branch rules after required checks exist. | Inspect settings and exercise issue templates; verify rules do not deadlock maintainers. |
| 14 | Backup and restore operations | PLANNED | Documented PostgreSQL backup, retention, restore, and restore verification using exact project-owned paths. | Create test data, back up, restore into a clean database, compare expected records, and clean test state. |

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

| Question or blocker | Why it matters | Evidence or decision needed | Owner |
|---|---|---|---|
| Representative issuer formats | Parser boundaries, canonical fields, encoding, and test cases cannot be invented safely. | One sanitized representative export for each intended issuer and card variant, starting with the owner's actual first issuer. | Shlomi |
| Exact application stack | Determines manifests, lockfile, project layout, validation libraries, migrations, and CI. | Approve the provisional TypeScript, Node.js LTS, React, Fastify, Drizzle, and pnpm recommendation or record an alternative with rationale. | Shlomi |
| Raw upload retention | Affects privacy, debugging, reproducibility, and backup size. | Confirm deletion after committed import once sample-file replay requirements are understood. | Shlomi |
| Supported initial file types | XLSX, XLS, CSV, and TXT require different parsers and security controls. | Inspect the first real issuer export and select the minimum first format. | Shlomi |
| Authentication boundary | Loopback-only operation can start without authentication; any wider exposure cannot. | Keep loopback-only or approve a later authentication and threat-model task before exposure. | Shlomi |
| Release versioning | Determines tags, changelog closure, and image naming. | Decide after the artifact and compatibility promise exist. | Shlomi |

## Ready-for-implementation criteria

The separate foundation implementation task may start when:

- The owner explicitly starts it in the Pirut repository context.
- The provisional application stack is approved or replaced.
- The initial issuer and minimum supported structured file format are selected from inspected evidence.
- Any sample used for automated tests is synthetic or irreversibly sanitized and approved for public tracking.
- Authority for GitHub Actions, Dependabot, labels, templates, settings, or branch rules is confirmed before those external changes.
- The implementer confirms that product parsing and dashboard features remain out of scope for the foundation task.

## Handoff to foundation implementation

The next task is: implement Pirut's repository and runtime foundation, not the credit-card analysis product.

Safe order of work:

1. Resolve the blocked stack decision and record it here.
2. Add the exact manifest, committed lockfile, Node version contract, changelog, and tool configuration.
3. Create the smallest health-capable localized application shell and empty migration baseline needed to verify infrastructure.
4. Implement the Docker image, production Compose, development Compose template, environment contract, and bind-mount policy.
5. Implement and verify the four canonical WSL Bash workflows.
6. Add path-filtered CI, dependency automation, and GitHub repository controls only after local verification is green.
7. Prove backup and restore with non-sensitive test data.

Stop when the foundation acceptance criteria pass and this document truthfully records implementation evidence. Do not add issuer parsers, statement upload behavior, categorization, dashboards, real financial fixtures, public deployment, or release publication without a separate approved task.
