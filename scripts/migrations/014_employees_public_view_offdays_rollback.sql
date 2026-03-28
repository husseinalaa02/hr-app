-- Rollback for migration 014
-- Recreates employees_public without off_days (reverts to pre-014 column set).
-- NOTE: ensure no production code reads off_days from this view before running.

CREATE OR REPLACE VIEW employees_public AS
  SELECT name, employee_name, department, designation, role, branch, company,
         reports_to, image, employment_type, date_of_joining, gender, employee_type,
         cell_number
  FROM employees;
