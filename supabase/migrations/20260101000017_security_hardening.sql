-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017: Security Hardening (Shannon Pentest Fixes)
-- Addresses: AUTH-VULN-01, AUTHZ-VULN-01/03/05/06/07/08/09,
--            INJ-VULN-01/02/04/05, MEDIUM notify_roles auth
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. record_checkout — add caller authorization check (AUTHZ-VULN-01) ─────
-- The function was SECURITY DEFINER with no caller check, allowing any
-- authenticated employee to modify any other employee's attendance record.

CREATE OR REPLACE FUNCTION record_checkout(
  p_checkin_name        text,
  p_employee            text,
  p_att_name            text,
  p_time                timestamptz,
  p_working_hours       numeric,
  p_early_leave_minutes numeric,
  p_overtime_minutes    numeric,
  p_new_status          text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   text;
  v_caller_role text;
BEGIN
  SELECT name, role INTO v_caller_id, v_caller_role
  FROM employees WHERE name = auth_employee_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: not authenticated';
  END IF;

  IF v_caller_id != p_employee
     AND v_caller_role NOT IN ('admin', 'hr_manager') THEN
    RAISE EXCEPTION 'Unauthorized: cannot modify another employee record';
  END IF;

  INSERT INTO checkins(name, employee, log_type, time)
    VALUES(p_checkin_name, p_employee, 'OUT', p_time);

  UPDATE attendance
     SET out_time             = p_time,
         working_hours        = p_working_hours,
         early_leave_minutes  = p_early_leave_minutes,
         overtime_minutes     = p_overtime_minutes,
         status               = CASE WHEN status = 'Late' THEN 'Late' ELSE p_new_status END
   WHERE name = p_att_name;
END;
$$;

-- ─── 2. Role self-escalation trigger (AUTHZ-VULN-09) ─────────────────────────
-- The emp_update_self RLS policy allowed employees to PATCH their own row via
-- REST API, including the role column. This trigger blocks unauthorized changes
-- to role, status, and access_expires_at on the employees table.

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role
  FROM employees
  WHERE name = auth_employee_id();

  -- Prevent self-promotion of role
  IF NEW.role IS DISTINCT FROM OLD.role
     AND v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized: only admins can change employee roles';
  END IF;

  -- Prevent unauthorized changes to access_expires_at
  IF NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at
     AND v_caller_role NOT IN ('admin', 'hr_manager') THEN
    RAISE EXCEPTION 'Unauthorized: only HR/admin can change access expiry';
  END IF;

  -- Prevent unauthorized changes to employee status
  IF NEW.status IS DISTINCT FROM OLD.status
     AND v_caller_role NOT IN ('admin', 'hr_manager') THEN
    RAISE EXCEPTION 'Unauthorized: only HR/admin can change employee status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_protection ON employees;

CREATE TRIGGER enforce_role_protection
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_escalation();

-- ─── 3. PCR field_name constraint (AUTHZ-VULN-03 / INJ-VULN-05) ──────────────
-- Defense-in-depth DB constraint preventing storage of unauthorized field names
-- in profile_change_requests. Mirrors SELF_SERVICE_FIELDS in profileChangeRequests.js.

ALTER TABLE profile_change_requests
  ADD CONSTRAINT pcr_valid_field_name
  CHECK (field_name IN (
    'cell_number', 'personal_email', 'bank_account',
    'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relation', 'address',
    'marital_status', 'date_of_birth', 'image'
  ));

-- ─── 4. log_client_error — replace open audit INSERT (AUTHZ-VULN-05 / INJ-VULN-04) ──
-- Replaces the permissive audit_error_insert policy with a SECURITY DEFINER
-- function that forces user_id, user_name, and role to match the actual caller,
-- preventing forged audit entries attributed to other employees.

CREATE OR REPLACE FUNCTION log_client_error(
  p_resource       text,
  p_resource_label text DEFAULT NULL,
  p_details        text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee employees%ROWTYPE;
BEGIN
  SELECT * INTO v_employee
  FROM employees WHERE name = auth_employee_id();

  INSERT INTO audit_logs (
    user_id, user_name, role, action,
    resource, resource_label, details,
    ip_address, created_at
  ) VALUES (
    v_employee.name,
    v_employee.employee_name,
    v_employee.role,
    'ERROR',
    p_resource,
    p_resource_label,
    p_details,
    '0.0.0.0',
    now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION log_client_error TO authenticated;

-- ─── 5. Remove permissive audit_error_insert policy ──────────────────────────
-- Direct client INSERT to audit_logs for ERROR action is no longer allowed.
-- All audit writes go through the Edge Function (authenticated, server-side)
-- or via log_client_error() which enforces caller identity.

DROP POLICY IF EXISTS audit_error_insert ON audit_logs;

-- ─── 6. employee_access_valid() helper (AUTHZ-VULN-07 + AUTHZ-VULN-08) ───────
-- Returns false for Terminated/Inactive employees or expired contractor access.
-- Used in RLS policies to block API access for deactivated accounts.

CREATE OR REPLACE FUNCTION employee_access_valid()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN status = 'Terminated'                                          THEN false
    WHEN status = 'Inactive'                                            THEN false
    WHEN access_expires_at IS NOT NULL
         AND access_expires_at < CURRENT_DATE                          THEN false
    ELSE true
  END
  FROM employees
  WHERE name = auth_employee_id();
$$;

-- ─── 7. Update emp_select_privileged to enforce access validity ───────────────
-- Terminated or expired employees are blocked from reading other records.
-- Exception: employees can always read their own record (to see their status).

DROP POLICY IF EXISTS emp_select_privileged ON employees;

CREATE POLICY emp_select_privileged ON employees
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid()                         -- always: read own record
    OR (
      employee_access_valid() = true
      AND auth_role() IN ('admin', 'hr_manager', 'ceo', 'audit_manager', 'finance_manager')
    )
  );

-- ─── 8. Updated get_all_reports with caller check (AUTHZ-VULN-06) ────────────
-- Previously any employee could call get_all_reports('HR-EMP-0010') and retrieve
-- the full org chart tree of any manager. Results are now restricted to the
-- caller's own tree (or HR/admin/CEO who have full access).

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
      AND  name <> manager_id

    UNION

    SELECT e.name
    FROM   employees e
    INNER JOIN reports r ON e.reports_to = r.employee_name
      AND e.name <> manager_id
  )
  SELECT employee_name FROM reports
  WHERE (
    manager_id = auth_employee_id()
    OR EXISTS (
      SELECT 1 FROM employees
      WHERE name = auth_employee_id()
        AND role IN ('admin', 'hr_manager', 'ceo')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_all_reports TO authenticated;

-- ─── 9. Updated notify_roles with authorization check (MEDIUM-notify_roles) ───

CREATE OR REPLACE FUNCTION notify_roles(
  p_roles    text[],
  p_title    text,
  p_message  text,
  p_type     text DEFAULT 'info'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_caller_id   text;
BEGIN
  SELECT role, name INTO v_caller_role, v_caller_id
  FROM employees WHERE name = auth_employee_id();

  IF v_caller_role NOT IN ('admin', 'hr_manager') THEN
    RAISE EXCEPTION 'Unauthorized: only HR/admin can send role notifications';
  END IF;

  IF LENGTH(p_message) > 500 THEN
    RAISE EXCEPTION 'Message too long (max 500 chars)';
  END IF;

  INSERT INTO notifications(recipient_id, title, message, type)
  SELECT DISTINCT e.name, p_title, p_message, p_type
  FROM employees e
  WHERE e.status = 'Active'
    AND (
      e.role = ANY(p_roles)
      OR EXISTS (
        SELECT 1 FROM custom_roles cr
        WHERE cr.name = e.role AND cr.notify_as = ANY(p_roles)
      )
    );
END;
$$;

-- ─── 10. Clear legacy plaintext passwords from seed data (AUTH-VULN-01) ───────
-- The seed data had password = username for all accounts. Clear all legacy
-- plaintext passwords from the employees table.

UPDATE employees SET password = '' WHERE password != '' AND password IS NOT NULL;

-- ─── 11. Remove pentest accounts created by Shannon ──────────────────────────
-- These test accounts were used during the penetration test to demonstrate
-- privilege escalation. Remove from the employees table.
-- NOTE: The corresponding Supabase Auth accounts must be deleted manually via
--       Supabase Dashboard → Authentication → Users.

DELETE FROM employees WHERE name IN (
  'HR-EMP-0017', 'HR-EMP-0018', 'HR-EMP-0019'
);
