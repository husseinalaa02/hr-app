-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 015: HR System Standardization
-- Covers: manager scope, field-level access, profile change requests,
--         approval delegation, payroll separation of duties,
--         time-bound access, leave accrual, leave encashment,
--         team calendar support, emergency contact fields.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1.1  Recursive manager reports helper ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_all_reports(manager_id text)
RETURNS TABLE(employee_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE reports AS (
    SELECT name AS employee_name
    FROM   employees
    WHERE  reports_to = manager_id
      AND  name <> manager_id        -- C1: prevent self-reference

    UNION  -- C1: UNION (not UNION ALL) deduplicates, breaking cycles

    SELECT e.name
    FROM   employees e
    INNER JOIN reports r ON e.reports_to = r.employee_name
      AND e.name <> manager_id       -- C1: never pull the manager into own tree
  )
  SELECT employee_name FROM reports;
$$;

GRANT EXECUTE ON FUNCTION get_all_reports TO authenticated;

-- ─── 1.2  Payroll finance-only RLS (defense in depth) ────────────────────────
-- Only runs if a policy with this name doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payroll' AND policyname = 'payroll_finance_only'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY payroll_finance_only ON payroll
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM employees
            WHERE  name = auth_employee_id()
              AND  role IN ('admin','hr_manager','finance_manager','finance')
          )
          OR employee_id = auth_employee_id()
        )
    $pol$;
  END IF;
END;
$$;

-- ─── 1.3  Profile change requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_change_requests (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    text        NOT NULL REFERENCES employees(name) ON DELETE CASCADE,
  requested_by   text        NOT NULL REFERENCES employees(name) ON DELETE CASCADE,
  field_name     text        NOT NULL,
  old_value      text,
  new_value      text        NOT NULL,
  status         text        NOT NULL DEFAULT 'Pending'
                             CHECK (status IN ('Pending','Approved','Rejected')),
  reviewed_by    text        REFERENCES employees(name) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcr_read ON profile_change_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = auth_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

CREATE POLICY pcr_insert ON profile_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id  = auth_employee_id()  -- M9: enforce both fields
    AND requested_by = auth_employee_id()
  );

CREATE POLICY pcr_update ON profile_change_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_pcr_employee
  ON profile_change_requests(employee_id, status);

CREATE INDEX IF NOT EXISTS idx_pcr_status
  ON profile_change_requests(status, created_at DESC);

-- H6: Prevent duplicate pending requests for the same employee+field
CREATE UNIQUE INDEX IF NOT EXISTS pcr_no_duplicate_pending
  ON profile_change_requests(employee_id, field_name)
  WHERE status = 'Pending';

-- ─── 1.4  Approval delegations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_delegations (
  id            uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  delegator_id  text  NOT NULL REFERENCES employees(name) ON DELETE CASCADE,
  delegate_id   text  NOT NULL REFERENCES employees(name) ON DELETE CASCADE,
  start_date    date  NOT NULL,
  end_date      date  NOT NULL,
  reason        text,
  -- is_active is intentionally omitted: CURRENT_DATE is not immutable so it
  -- cannot be used in a STORED generated column. Activeness is evaluated at
  -- query time via: start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT no_self_delegation CHECK (delegator_id <> delegate_id),
  CONSTRAINT valid_date_range   CHECK (end_date >= start_date)
);

ALTER TABLE approval_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY delegation_read ON approval_delegations
  FOR SELECT TO authenticated
  USING (
    delegator_id = auth_employee_id()
    OR delegate_id = auth_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

CREATE POLICY delegation_write ON approval_delegations
  FOR ALL TO authenticated
  USING (
    delegator_id = auth_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_delegations_active
  ON approval_delegations(delegator_id, start_date, end_date);

-- ─── 1.5  Payroll separation of duties ────────────────────────────────────────
ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS created_by  text REFERENCES employees(name) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by text REFERENCES employees(name) ON DELETE SET NULL;

-- ─── 1.6  Time-bound contractor access ────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS access_expires_at date DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_access_expiry
  ON employees(access_expires_at)
  WHERE access_expires_at IS NOT NULL;

-- ─── 2.1  Leave entitlements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_entitlements (
  id                 uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  leave_type         text          NOT NULL,
  employment_type    text          NOT NULL DEFAULT 'All',
  days_per_year      numeric(5,2)  NOT NULL,
  accrual_method     text          NOT NULL DEFAULT 'monthly'
                                   CHECK (accrual_method IN ('monthly','annual','on_hire')),
  carry_over_max     numeric(5,2)  DEFAULT 0,
  min_tenure_months  integer       DEFAULT 0,
  created_at         timestamptz   DEFAULT now(),
  UNIQUE(leave_type, employment_type)
);

ALTER TABLE leave_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY entitlement_read ON leave_entitlements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY entitlement_write ON leave_entitlements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

-- Seed default entitlements
INSERT INTO leave_entitlements
  (leave_type, employment_type, days_per_year, accrual_method, carry_over_max, min_tenure_months)
VALUES
  ('Annual Leave', 'Full-time', 21,   'monthly', 5,    0),
  ('Annual Leave', 'Part-time', 14,   'monthly', 3,    0),
  ('Annual Leave', 'Contract',  14,   'monthly', 0,    3),
  ('Sick Leave',   'All',       15,   'annual',  0,    0),
  ('Casual Leave', 'All',        6,   'annual',  0,    0)
ON CONFLICT (leave_type, employment_type) DO NOTHING;

-- ─── 2.1  Leave accrual log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_accrual_log (
  id               uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      text          NOT NULL REFERENCES employees(name) ON DELETE CASCADE,
  leave_type       text          NOT NULL,
  accrual_date     date          NOT NULL,
  days_accrued     numeric(5,2)  NOT NULL,
  balance_before   numeric(6,2)  NOT NULL,
  balance_after    numeric(6,2)  NOT NULL,
  accrual_reason   text          DEFAULT 'Monthly accrual',
  created_at       timestamptz   DEFAULT now()
);

ALTER TABLE leave_accrual_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY accrual_log_read ON leave_accrual_log
  FOR SELECT TO authenticated
  USING (
    employee_id = auth_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

-- Allow inserts from service functions (HR runs the accrual)
CREATE POLICY accrual_log_insert ON leave_accrual_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_accrual_log_employee
  ON leave_accrual_log(employee_id, accrual_date DESC);

-- ─── 2.3  Leave encashment ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_encashment (
  id               uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      text          NOT NULL REFERENCES employees(name) ON DELETE CASCADE,
  leave_type       text          NOT NULL DEFAULT 'Annual Leave',
  encashment_date  date          NOT NULL,
  days_encashed    numeric(5,2)  NOT NULL,
  daily_rate       numeric(10,2) NOT NULL,
  total_amount     numeric(10,2) NOT NULL,
  reason           text          NOT NULL
                                 CHECK (reason IN ('Resignation','Year-End','Policy','Other')),
  processed_by     text          REFERENCES employees(name) ON DELETE SET NULL,
  payroll_id       text,
  created_at       timestamptz   DEFAULT now()
);

ALTER TABLE leave_encashment ENABLE ROW LEVEL SECURITY;

CREATE POLICY encashment_read ON leave_encashment
  FOR SELECT TO authenticated
  USING (
    employee_id = auth_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager','finance_manager','finance')
    )
  );

CREATE POLICY encashment_write ON leave_encashment
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin','hr_manager','finance_manager')
    )
  );

-- ─── M7  Employee status column (used by leave accrual filter) ───────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active'
    CHECK (status IN ('Active','Inactive','Terminated') OR status IS NULL);

-- ─── 3.1  Emergency contact & personal fields ─────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS emergency_contact_name     text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone    text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation text,
  ADD COLUMN IF NOT EXISTS address                    text,
  ADD COLUMN IF NOT EXISTS marital_status             text
                            CHECK (marital_status IN ('Single','Married','Divorced','Widowed') OR marital_status IS NULL),
  ADD COLUMN IF NOT EXISTS nationality                text,
  ADD COLUMN IF NOT EXISTS national_id                text,
  ADD COLUMN IF NOT EXISTS notice_period_days         integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS probation_end_date         date;
