# Pirut

Pirut is a personal-first web application for manually importing and analyzing Israeli credit card
statements. It is Hebrew-first, single-user, and runs locally in Docker.

Today it imports an Isracard statement file through a preview-first flow, stores the transactions
in PostgreSQL without ever duplicating a row, and shows them by month with totals, installments,
and refunds. Categorization, insights, and other issuers are not implemented yet.

See [the living project foundation plan](docs/project-foundation.md) for approved decisions,
implementation status, verification evidence, and remaining blockers.

## Requirements

- WSL 2 with Docker Engine and Docker Compose v2
- Node.js matching `engines.node` in `package.json`, with pnpm enabled through Corepack

All workflow scripts are Bash and run inside WSL.

## Getting started

```bash
scripts/local.sh init          # create config/docker/.env and docker-compose-dev.yml
scripts/local.sh up -bd        # build, start detached, and verify readiness
```

The application is then served on `http://127.0.0.1:4610/`. It binds to loopback only.

```bash
scripts/local.sh status        # health, image identities, mounts, and data directory
scripts/local.sh down          # stop services; durable data is preserved
```

`scripts/local.sh nuke` deletes the local database directory. It requires typing the exact path to
confirm and only ever removes the validated project-owned data location.

## Verification

```bash
scripts/verify.sh --full       # the authoritative check; CI runs the same commands
scripts/verify.sh --changed    # only the areas affected against the base ref
```

The full run covers formatting, linting, types, unit tests, locale completeness, the public-ready
Hebrew guard, the production build, the migration journal, lockfile currency, the dependency audit,
the Dockerfile and Compose contracts, the image's non-root identity, and a live integration check
against PostgreSQL.

## Data location

PostgreSQL data and backups live under the directory named by `PIRUT_DATA_DIR` in `config/docker/.env`. It must be
a Linux-native path: a Windows-drive path under `/mnt/` cannot hold a PostgreSQL cluster, because
that mount rejects the ownership changes `initdb` requires. `scripts/local.sh init` selects a
suitable default.

Backups are created and restored through `scripts/local.sh`; the procedure and its rules are
documented in [docs/backup-and-restore.md](docs/backup-and-restore.md).

## Privacy

Pirut processes files locally. It uses no bank credentials, sends no telemetry, and transfers no
financial data to external services. Never commit a real statement or personal financial data.

## License

[MIT](LICENSE)
