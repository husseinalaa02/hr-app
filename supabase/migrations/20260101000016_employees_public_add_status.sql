-- Migration 016: Add status and access_expires_at to employees_public view
-- Fixes: "column employees_public.status does not exist" production error
-- Both columns were added to the employees table in migration 015 but were
-- not reflected in the employees_public view.

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
  off_days,
  status,
  access_expires_at
FROM employees;

GRANT SELECT ON employees_public TO authenticated;
