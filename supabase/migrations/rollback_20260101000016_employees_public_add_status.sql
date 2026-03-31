-- Rollback 016: Remove status and access_expires_at from employees_public view
-- Restores the view to its migration 014 state.

CREATE OR REPLACE VIEW employees_public AS
SELECT
  name,
  employee_name,
  department,
  designation,
  role,
  branch,
  company,
  reports_to,
  image,
  employment_type,
  date_of_joining,
  gender,
  employee_type,
  cell_number,
  off_days
FROM employees;

GRANT SELECT ON employees_public TO authenticated;
