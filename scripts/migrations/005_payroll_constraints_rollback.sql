-- Rollback 005: Remove payroll constraints and unique constraints

alter table payroll drop column if exists created_at;
alter table payroll drop column if exists updated_at;
alter table payroll drop constraint if exists payroll_employee_id_fkey;
alter table leave_allocs drop constraint if exists leave_allocs_unique;
alter table day_requests drop constraint if exists day_requests_unique;
