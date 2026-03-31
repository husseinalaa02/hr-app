-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback 017: Revert security hardening changes
-- WARNING: Rolling back these changes re-opens confirmed security vulnerabilities.
-- Only roll back in a controlled development/testing environment.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove role self-escalation trigger
DROP TRIGGER IF EXISTS enforce_role_protection ON employees;
DROP FUNCTION IF EXISTS prevent_role_self_escalation();

-- Remove pcr field_name constraint
ALTER TABLE profile_change_requests
  DROP CONSTRAINT IF EXISTS pcr_valid_field_name;

-- Remove log_client_error function
DROP FUNCTION IF EXISTS log_client_error(text, text, text);

-- Restore permissive audit_error_insert policy
CREATE POLICY audit_error_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    action = 'ERROR'
    AND (user_id IS NULL OR user_id = auth_employee_id())
  );

-- Remove employee_access_valid function
DROP FUNCTION IF EXISTS employee_access_valid();

-- Restore original emp_select_privileged policy
DROP POLICY IF EXISTS emp_select_privileged ON employees;
CREATE POLICY emp_select_privileged ON employees
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid() OR auth_role() IN ('admin', 'hr_manager', 'ceo', 'audit_manager', 'finance_manager'));

-- Restore original get_all_reports (without caller check)
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
  SELECT employee_name FROM reports;
$$;

-- Restore original notify_roles (without authorization check)
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
BEGIN
  INSERT INTO notifications(recipient_id, title, message, type)
  SELECT DISTINCT e.name, p_title, p_message, p_type
  FROM employees e
  WHERE e.role = ANY(p_roles)
    OR EXISTS (
      SELECT 1 FROM custom_roles cr
      WHERE cr.name = e.role AND cr.notify_as = ANY(p_roles)
    );
END;
$$;

-- Restore original record_checkout (without caller check)
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
BEGIN
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
