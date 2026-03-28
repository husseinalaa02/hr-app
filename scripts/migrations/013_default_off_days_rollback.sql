-- Rollback for migration 013
-- NOTE: rows that had NULL before the migration cannot be restored to NULL
-- because we do not track which rows were changed. Only removes the column default.
ALTER TABLE employees
  ALTER COLUMN off_days DROP DEFAULT;
