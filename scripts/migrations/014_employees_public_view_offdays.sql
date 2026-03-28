-- Migration 014: Ensure employees_public view includes off_days
-- Idempotent — CREATE OR REPLACE preserves existing grants.
-- Background: migration 004 used DROP/CREATE which may have lost off_days on some deployments.
-- This migration guarantees the column is present in all environments.

CREATE OR REPLACE VIEW employees_public AS
  SELECT name, employee_name, department, designation, role, branch, company,
         reports_to, image, employment_type, date_of_joining, gender, employee_type,
         cell_number, off_days
  FROM employees;
