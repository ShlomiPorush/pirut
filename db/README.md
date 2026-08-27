# Database

`migrations/` holds generated Drizzle migrations applied by `pnpm run db:migrate`.

The baseline is intentionally empty. Canonical domain tables for statements, imports, cards,
transactions, installments, refunds, merchants, and categories are added by a later task, after
issuer evidence is available.

Generate a migration with `pnpm run db:generate` after changing
`src/infrastructure/db/schema.ts`. Never edit a generated migration that has already been applied.
