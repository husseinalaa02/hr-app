-- Migration 013: Set default off_days for employees with NULL schedule
-- Ensures all existing employees have an explicit off_days value and
-- future inserts always receive a default.

-- Set default schedule for employees that were created before the
-- off_days column was added (migration 011). Idempotent — only touches
-- rows where off_days is still NULL.
UPDATE employees
SET off_days = ARRAY[5, 6]
WHERE off_days IS NULL;

-- Ensure future inserts without an explicit off_days get Fri/Sat off.
-- Idempotent: SET DEFAULT can be run multiple times safely; it simply overwrites the existing default.
ALTER TABLE employees
  ALTER COLUMN off_days SET DEFAULT ARRAY[5, 6];
