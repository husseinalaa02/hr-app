# Database Migrations

Migration scripts for the Supabase database. Each migration has a forward and rollback script.

## Naming convention

```
NNN_description.sql          ← forward migration
NNN_description_rollback.sql ← rollback script
```

## How to run

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Paste the contents of the migration script
3. Click **Run**

All migrations are idempotent (`CREATE ... IF NOT EXISTS`, `DROP ... IF EXISTS`) and safe to re-run.

## Migration log

| #   | Description             | Date       | Status  |
|-----|-------------------------|------------|---------|
| 001 | Add performance indexes | 2026-03-27 | Applied |
