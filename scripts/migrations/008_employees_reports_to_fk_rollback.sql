-- Rollback 008: Remove FK constraint on employees.reports_to

alter table employees drop constraint if exists employees_reports_to_fkey;
