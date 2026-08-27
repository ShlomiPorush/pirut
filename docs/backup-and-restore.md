# Backup and restore

A Pirut backup contains every imported transaction. It is as sensitive as the live database and
follows the same rules: never commit it, never attach it to an issue, and never copy it somewhere
with weaker access than the database itself.

## Where backups live

Backups are written to `${PIRUT_DATA_DIR}/backups/` on the Docker host, beside the PostgreSQL data
directory. `PIRUT_DATA_DIR` is set in the machine-local `.env` and must be a Linux-native path.
The directory is ignored by Git.

Files are named `<database>-<UTC timestamp>.dump` and use PostgreSQL's custom format, which is
compressed and restorable with `pg_restore`.

## Creating a backup

```bash
scripts/local.sh backup
```

The services must be running and the database healthy. The command prints the resulting host path
and fails if the file is missing or empty.

## Restoring

```bash
scripts/local.sh restore <backup-file>
```

The argument is a file name inside the backups directory, or an absolute path within it. Anything
outside that directory is refused. The command requires typing the database name to confirm,
because a restore replaces current contents.

The restore runs with `--clean --if-exists --single-transaction`, so it drops existing objects
first and either applies completely or not at all. The result reflects the backup rather than a
merge with whatever was there before.

## Verifying a restore

Always confirm the restore before deleting an older backup:

1. Note what you expect to find, such as the number of transactions and the latest import date.
2. Restore into the target database.
3. Query the expected records and compare them against step 1.
4. Only then remove superseded backups.

This procedure was exercised with synthetic data: a table was seeded, backed up, dropped, and
restored, and the exact rows were confirmed to return. The restore path guard was confirmed to
refuse a file outside the backups directory, and the confirmation prompt was confirmed to abort on
a mismatched answer.

## Retention

Keep backups only as long as they are useful. Delete them with the same care as any other file
containing financial data. `scripts/local.sh nuke` removes the backups directory along with the
database, and requires typing the exact data path to confirm.
