-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback for Migration 015
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS leave_encashment CASCADE;
DROP TABLE IF EXISTS leave_accrual_log CASCADE;
DROP TABLE IF EXISTS leave_entitlements CASCADE;
DROP TABLE IF EXISTS approval_delegations CASCADE;
DROP TABLE IF EXISTS profile_change_requests CASCADE;

DROP FUNCTION IF EXISTS get_all_reports(text);

ALTER TABLE payroll
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS approved_by;

ALTER TABLE employees
  DROP COLUMN IF EXISTS access_expires_at,
  DROP COLUMN IF EXISTS emergency_contact_name,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS emergency_contact_relation,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS marital_status,
  DROP COLUMN IF EXISTS nationality,
  DROP COLUMN IF EXISTS national_id,
  DROP COLUMN IF EXISTS notice_period_days,
  DROP COLUMN IF EXISTS probation_end_date;

DROP POLICY IF EXISTS payroll_finance_only ON payroll;
