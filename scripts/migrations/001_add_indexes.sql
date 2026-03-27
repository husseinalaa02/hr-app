-- Migration 001: Add performance indexes
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Rollback: 001_add_indexes_rollback.sql

-- ─── Existing indexes (already in supabase-schema.sql) ────────────────────────
create index if not exists idx_checkins_employee_time    on checkins(employee, time);
create index if not exists idx_attendance_employee_date  on attendance(employee, attendance_date);
create index if not exists idx_leave_apps_employee       on leave_apps(employee, status, from_date);
create index if not exists idx_payroll_employee_period   on payroll(employee_id, period_start);
create index if not exists idx_day_requests_employee     on day_requests(employee_id, approval_status);
create index if not exists idx_notifications_recipient   on notifications(recipient_id, read, created_at);
create index if not exists idx_timesheets_employee       on timesheets(employee, start_date);

-- ─── New indexes added in this migration ──────────────────────────────────────
create index if not exists idx_expenses_employee_status  on expenses(employee_id, status);
create index if not exists idx_expenses_employee_date    on expenses(employee_id, expense_date);
create index if not exists idx_audit_logs_user_time      on audit_logs(user_id, timestamp desc);
create index if not exists idx_audit_logs_action         on audit_logs(action);
create index if not exists idx_audit_logs_resource       on audit_logs(resource);
create index if not exists idx_recruitment_jobs          on recruitment_jobs(department, status);
create index if not exists idx_recruitment_candidates    on recruitment_candidates(job_id, stage);
create index if not exists idx_employees_department      on employees(department);
create index if not exists idx_employees_role            on employees(role);
