-- Migration 004: Fix employees_public view (C3, H5)
-- Adds employment_type, date_of_joining, gender, employee_type.
-- Removes cell_number (PII).
-- Also adds employee_type column to employees table if missing.

alter table employees add column if not exists employee_type text;

create or replace view employees_public as
  select name, employee_name, department, designation, role, branch, company,
         reports_to, image, employment_type, date_of_joining, gender, employee_type
  from employees;

grant select on employees_public to authenticated;
