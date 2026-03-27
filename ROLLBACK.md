# Rollback Plan

This document describes how to roll back the application and database to a known-good state after a failed deployment.

---

## Frontend (Vite / React)

All releases are tagged in git. To roll back the frontend:

```bash
# 1. Identify the last known-good tag or commit
git log --oneline --tags

# 2. Check out the previous release
git checkout <previous-tag-or-commit>

# 3. Install deps and rebuild
npm ci
npm run build

# 4. Deploy the new build (same process as normal deploy)
```

If deployed via a CI/CD pipeline, re-trigger the pipeline on the previous commit.

---

## Database (Supabase)

Database changes are tracked as numbered migration scripts in `scripts/migrations/`.

### Rolling back a migration

Each migration has a paired rollback script:

| Forward migration                          | Rollback script                                     |
|--------------------------------------------|-----------------------------------------------------|
| `001_add_indexes.sql`                      | `001_add_indexes_rollback.sql`                      |

To roll back in the Supabase SQL Editor:

1. Open **Supabase Dashboard → SQL Editor → New query**
2. Paste the contents of the rollback script
3. Click **Run**

### Rollback scripts

All rollback scripts are idempotent (`DROP INDEX IF EXISTS`) and safe to run multiple times.

---

## Environment Variables

If a bad env var caused the issue:

1. Update the value in your hosting platform (Vercel / Netlify / etc.)
2. Redeploy without any code changes

Keep `.env.example` up to date so the correct variables are documented.

---

## Emergency Contacts

- Supabase status page: https://status.supabase.com
- Repository issues: create an issue in the project repository
