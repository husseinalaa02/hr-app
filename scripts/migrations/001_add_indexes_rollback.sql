-- Rollback for Migration 001: Remove performance indexes added in 001_add_indexes.sql
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Note: This does NOT remove the original indexes present before migration 001.

drop index if exists idx_expenses_employee_status;
drop index if exists idx_expenses_employee_date;
drop index if exists idx_audit_logs_user_time;
drop index if exists idx_audit_logs_action;
drop index if exists idx_audit_logs_resource;
drop index if exists idx_recruitment_jobs;
drop index if exists idx_recruitment_candidates;
drop index if exists idx_employees_department;
drop index if exists idx_employees_role;
