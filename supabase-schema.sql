-- ─── HR App – Supabase Schema ─────────────────────────────────────────────────
-- Run this entire file in: Supabase → SQL Editor → New query → Run

-- ─── Helper functions (defined first — referenced by RLS policies below) ──────
create or replace function auth_role()
returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'employee')
$$;

create or replace function auth_employee_id()
returns text language sql stable security definer as $$
  -- Primary: read from JWT app_metadata (fast, no DB query).
  -- Fallback: look up by auth.uid() in case app_metadata.employee_id was never set
  --           (e.g. accounts created before the metadata migration was applied).
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'employee_id',
    (select name from employees where auth_id = auth.uid())
  )
$$;

-- C2/C3: Single-recipient notification insert that bypasses RLS for non-HR callers.
-- Authorization checks: caller must be authenticated, and must be the recipient,
-- an admin/hr_manager, or a direct manager of the recipient.
-- Input validation: message ≤ 1000 chars, type must be a known enum value.
create or replace function insert_notification(
  p_recipient_id text,
  p_type         text default 'info',
  p_message      text default '',
  p_link         text default null
) returns void language plpgsql security definer as $$
declare
  v_caller      text := auth_employee_id();
  v_valid_types text[] := array['info','leave','payroll','appraisal','expense','recruitment'];
begin
  -- Authorization: caller must be authenticated
  if v_caller is null then
    raise exception 'insert_notification: unauthenticated caller';
  end if;

  -- Authorization: caller must be the recipient OR a manager of the recipient OR admin/hr_manager
  if v_caller <> p_recipient_id
    and auth_role() not in ('admin', 'hr_manager')
    and not exists (
      select 1 from employees
      where name = p_recipient_id and reports_to = v_caller
    )
  then
    raise exception 'insert_notification: caller % is not authorized to notify %', v_caller, p_recipient_id;
  end if;

  -- Validate message length
  if length(p_message) > 1000 then
    raise exception 'insert_notification: message exceeds 1000 characters';
  end if;

  -- Validate type
  if p_type <> all(v_valid_types) then
    raise exception 'insert_notification: invalid type "%"', p_type;
  end if;

  insert into notifications(recipient_id, type, message, link, read, created_at)
  values (p_recipient_id, p_type, p_message, p_link, false, now());
end;
$$;

-- Fan-out notifications to all employees with a given role (or custom role whose
-- notify_as maps to that role). Runs as security definer so it bypasses RLS on
-- the employees table — callers (incl. regular employees) only need INSERT on notifications.
create or replace function notify_roles(
  p_roles    text[],
  p_title    text,
  p_message  text,
  p_type     text default 'info'
) returns void language plpgsql security definer as $$
begin
  insert into notifications(recipient_id, title, message, type)
  select distinct e.name, p_title, p_message, p_type
  from employees e
  where
    e.role = any(p_roles)
    or exists (
      select 1 from custom_roles cr
      where cr.name = e.role and cr.notify_as = any(p_roles)
    );
end;
$$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- Employees
create table if not exists employees (
  name            text primary key,
  employee_name   text not null,
  department      text,
  designation     text,
  role            text default 'employee',
  employment_type text,
  date_of_joining date,
  gender          text,
  date_of_birth   date,
  branch          text,
  cell_number     text,
  personal_email  text,
  company_email   text,
  user_id         text unique,
  password        text,    -- kept for migration only; cleared after auth migration
  auth_id         uuid unique references auth.users(id) on delete set null,
  image           text,
  reports_to      text references employees(name) on delete set null,
  off_days        integer[] default array[5,6],
  company         text default 'AFAQ ALFIKER'
);

-- Leave Applications
create table if not exists leave_apps (
  name            text primary key default ('LAPPL-' || gen_random_uuid()),
  employee        text references employees(name) on delete cascade,
  employee_name   text,
  leave_type      text,
  from_date       date,
  to_date         date,
  total_leave_days numeric default 0,
  from_time       text,
  to_time         text,
  total_hours     numeric default 0,
  status          text default 'Open',
  description     text,
  is_hourly       boolean default false,
  approval_stage  text default 'Pending Manager',
  posting_date    date,
  created_at      timestamptz default now()
);

-- Leave Allocations
create table if not exists leave_allocs (
  id                      bigserial primary key,
  employee                text references employees(name) on delete cascade,
  leave_type              text,
  total_leaves_allocated  numeric default 0,
  is_hourly               boolean default false,
  leave_year              int not null default extract(year from now())::int
);

-- Day Requests (Friday / Extra Day)
create table if not exists day_requests (
  id              bigserial primary key,
  employee_id     text references employees(name) on delete cascade,
  employee_name   text,
  request_type    text,
  request_date    date,
  approval_status text default 'Pending Manager',
  notes           text,
  created_at      timestamptz default now()
);

-- Payroll
create table if not exists payroll (
  id                  bigserial primary key,
  employee_id         text references employees(name) on delete set null,
  employee_name       text,
  period_start        date,
  period_end          date,
  base_salary         numeric default 0,
  additional_salary   numeric default 0,
  working_days        numeric default 30,
  friday_bonus        numeric default 0,
  extra_day_bonus     numeric default 0,
  calculated_salary   numeric default 0,
  status              text default 'Draft',
  payroll_date        date,
  submitted_by        text,
  submitted_by_name   text,
  submitted_at        timestamptz,
  paid_by             text,
  paid_by_name        text,
  paid_at             timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Payroll Log
create table if not exists payroll_log (
  id                  bigserial primary key,
  payroll_id          bigint references payroll(id) on delete cascade,
  action              text,
  performed_by        text,
  performed_by_name   text,
  timestamp           timestamptz default now(),
  notes               text
);

-- Expenses
create table if not exists expenses (
  id            bigserial primary key,
  employee_id   text,
  employee_name text,
  expense_type  text,
  amount        numeric default 0,
  expense_date  date,
  description   text,
  status        text default 'Draft',
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz default now()
);

-- Announcements
create table if not exists announcements (
  name        text primary key,
  title       text,
  content     text,
  created_at  timestamptz default now(),
  notice_date date
);

-- Recruitment Jobs
create table if not exists recruitment_jobs (
  id          bigserial primary key,
  job_title   text,
  department  text,
  description text,
  target_date date,
  status      text default 'Open',
  hired_count integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Recruitment Candidates
create table if not exists recruitment_candidates (
  id       bigserial primary key,
  job_id   bigint references recruitment_jobs(id) on delete cascade,
  name     text,
  email    text,
  phone    text,
  cv_note  text,
  stage    text default 'Application',
  status   text default 'Active',
  applied_at date default current_date
);

-- Timesheets (project/task hour logs)
create table if not exists timesheets (
  name          text primary key,
  employee      text references employees(name) on delete cascade,
  employee_name text,
  start_date    date,
  end_date      date,
  time_logs     jsonb default '[]',
  total_hours   numeric default 0,
  status        text default 'Draft',
  created_at    timestamptz default now()
);

-- Work Schedules
create table if not exists work_schedules (
  id               bigserial primary key,
  employee         text references employees(name) on delete cascade,
  employee_name    text,
  shift_type       text,   -- 'morning' | 'evening' | 'custom'
  start_time       text,   -- 'HH:MM'
  end_time         text,   -- 'HH:MM'
  effective_date   date,
  assigned_by      text,
  assigned_by_name text,
  notes            text,
  created_at       timestamptz default now()
);

-- Check-in Events (individual IN/OUT punches)
create table if not exists checkins (
  name        text primary key default ('CHK-' || gen_random_uuid()),
  employee    text references employees(name) on delete cascade,
  log_type    text,
  time        timestamptz default now(),
  created_at  timestamptz default now()
);

-- Daily Attendance Records
create table if not exists attendance (
  name                 text primary key,
  employee             text references employees(name) on delete cascade,
  attendance_date      date,
  in_time              timestamptz,
  out_time             timestamptz,
  working_hours        numeric,
  status               text default 'Present',
  late_minutes         numeric default 0,
  early_leave_minutes  numeric default 0,
  overtime_minutes     numeric default 0
);
-- Add columns to existing tables (safe to re-run)
alter table attendance add column if not exists late_minutes        numeric default 0;
alter table attendance add column if not exists early_leave_minutes numeric default 0;
alter table attendance add column if not exists overtime_minutes    numeric default 0;
-- salary_deduction_iqd: IQD amount deducted from salary when employee is late and has no hourly leave balance
alter table attendance add column if not exists salary_deduction_iqd numeric default 0;
-- late_deductions / absence_deductions: stored per payroll period for audit trail and recalculation
alter table payroll add column if not exists late_deductions    numeric default 0;
alter table payroll add column if not exists absence_deductions numeric default 0;
-- Revert audit_logs.details from jsonb back to text (JS callers pass plain strings, not JSON)
alter table audit_logs alter column details type text using details::text;
-- C1: audit trail columns
alter table audit_logs add column if not exists user_name  text default '';
alter table audit_logs add column if not exists ip_address text default '127.0.0.1';
-- C3/H5: employee_type column (employees_public view uses it)
alter table employees add column if not exists employee_type text;
-- M1: payroll timestamps and FK
alter table payroll add column if not exists created_at timestamptz default now();
alter table payroll add column if not exists updated_at timestamptz default now();
-- M2: ensure leave_year column exists, deduplicate, then add unique constraint
alter table leave_allocs
  add column if not exists leave_year int not null default extract(year from now())::int;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leave_allocs_unique') then
    delete from leave_allocs
    where id not in (
      select max(id) from leave_allocs group by employee, leave_type, leave_year
    );
    alter table leave_allocs add constraint leave_allocs_unique unique (employee, leave_type, leave_year);
  end if;
end $$;
-- M3: unique day request per employee/date/type
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'day_requests_unique') then
    alter table day_requests add constraint day_requests_unique unique (employee_id, request_date, request_type);
  end if;
end $$;
-- M4: unique attendance per employee/date
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_unique') then
    alter table attendance add constraint attendance_unique unique (employee, attendance_date);
  end if;
end $$;
-- M7: updated_at on key tables
alter table leave_apps             add column if not exists updated_at timestamptz default now();
alter table expenses               add column if not exists updated_at timestamptz default now();
alter table announcements          add column if not exists updated_at timestamptz default now();
alter table recruitment_candidates add column if not exists updated_at timestamptz default now();
-- M8/M9: rename creation → created_at on announcements (only needed on pre-existing DBs)
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='announcements' and column_name='creation') then
    alter table announcements rename column creation to created_at;
  end if;
end $$;
-- L6: created_at on checkins
alter table checkins add column if not exists created_at timestamptz default now();

-- Notifications
create table if not exists notifications (
  id           bigserial primary key,
  recipient_id text not null,
  title        text,
  message      text,
  type         text default 'info',
  link         text,
  read         boolean default false,
  created_at   timestamptz default now()
);

-- Custom Roles (admin-defined roles with arbitrary permission sets)
create table if not exists custom_roles (
  id          bigserial primary key,
  name        text not null unique,   -- internal identifier, e.g. 'operations_manager'
  label       text not null,          -- display name, e.g. 'Operations Manager'
  permissions text[] not null default '{}',
  notify_as   text,                   -- built-in role to impersonate for notifications, e.g. 'hr_manager'
  created_at  timestamptz default now()
);

-- Per-user permission overrides (admin-only)
create table if not exists employee_permissions (
  id           bigserial primary key,
  employee_id  text not null references employees(name) on delete cascade,
  permission   text not null,
  granted      boolean not null,
  updated_at   timestamptz default now(),
  unique(employee_id, permission)
);

-- Audit Logs
create table if not exists audit_logs (
  id             bigserial primary key,
  timestamp      timestamptz default now(),
  user_id        text,
  user_name      text default '',
  ip_address     text default '127.0.0.1',
  role           text,
  resource       text,
  action         text,
  resource_id    text,
  resource_label text,
  details        text,     -- free-form description; keep as text since JS callers pass plain strings
  changes        jsonb     -- structured before/after snapshot
);

-- ─── Employee ID sequence ─────────────────────────────────────────────────────
-- Generates collision-free HR-EMP-XXXX identifiers. Seed starts at 11 to
-- preserve the 10 existing seeded employees (HR-EMP-0001 … HR-EMP-0010).
create sequence if not exists employee_id_seq start 11 increment 1;

-- Called by api/create-employee.js to get the next safe employee ID.
create or replace function next_employee_id()
returns text language plpgsql as $$
declare
  n bigint;
begin
  n := nextval('employee_id_seq');
  return 'HR-EMP-' || lpad(n::text, 4, '0');
end;
$$;

-- ─── Atomic check-in RPC ──────────────────────────────────────────────────────
-- Inserts the checkin punch and the attendance row in a single transaction,
-- preventing orphaned punches if the second write were to fail.
create or replace function record_checkin(
  p_checkin_name   text,
  p_employee       text,
  p_att_name       text,
  p_today          date,
  p_status         text,
  p_late_minutes   integer,
  p_time           timestamptz
) returns void language plpgsql as $$
begin
  insert into checkins(name, employee, log_type, time)
    values(p_checkin_name, p_employee, 'IN', p_time);

  insert into attendance(name, employee, attendance_date, in_time, status, late_minutes)
    values(p_att_name, p_employee, p_today, p_time, p_status, p_late_minutes)
    on conflict(name) do nothing;  -- first punch already set the status; ignore subsequent INs
end;
$$;

-- ─── Atomic checkout RPC ─────────────────────────────────────────────────────
-- Inserts the OUT punch and updates the attendance row in one transaction,
-- preventing the state where the punch is recorded but out_time stays null.
-- Runs as the caller's role (not security definer) — existing att_insert + att_update_admin
-- policies cover the writes since this is called server-side on behalf of the employee.
create or replace function record_checkout(
  p_checkin_name        text,
  p_employee            text,
  p_att_name            text,
  p_time                timestamptz,
  p_working_hours       numeric,
  p_early_leave_minutes numeric,
  p_overtime_minutes    numeric,
  p_new_status          text
) returns void language plpgsql security definer as $$
begin
  insert into checkins(name, employee, log_type, time)
    values(p_checkin_name, p_employee, 'OUT', p_time);

  update attendance
     set out_time             = p_time,
         working_hours        = p_working_hours,
         early_leave_minutes  = p_early_leave_minutes,
         overtime_minutes     = p_overtime_minutes,
         -- Never downgrade Late to another status
         status               = case when status = 'Late' then 'Late' else p_new_status end
   where name = p_att_name;
end;
$$;

-- ─── Drop all existing policies (makes this file safe to re-run) ──────────────
do $$ declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────
alter table employees              enable row level security;
alter table timesheets             enable row level security;
alter table leave_apps             enable row level security;
alter table leave_allocs           enable row level security;
alter table day_requests           enable row level security;
alter table payroll                enable row level security;
alter table payroll_log            enable row level security;
alter table expenses               enable row level security;
alter table announcements          enable row level security;
alter table recruitment_jobs       enable row level security;
alter table recruitment_candidates enable row level security;
alter table audit_logs             enable row level security;
alter table notifications          enable row level security;
alter table work_schedules         enable row level security;
alter table checkins               enable row level security;
alter table attendance             enable row level security;
alter table custom_roles           enable row level security;
alter table employee_permissions   enable row level security;

-- ─── Policies ─────────────────────────────────────────────────────────────────

-- TIMESHEETS
create policy "ts_select" on timesheets for select to authenticated
  using (employee = auth_employee_id() or auth_role() in ('admin', 'hr_manager', 'ceo'));
create policy "ts_insert" on timesheets for insert to authenticated
  with check (employee = auth_employee_id());
create policy "ts_update" on timesheets for update to authenticated
  using (employee = auth_employee_id() or auth_role() in ('admin', 'hr_manager'));

-- EMPLOYEES
-- Full row visible to self, HR managers, admins.
-- Regular employees read their OWN full record only; directory queries go through employees_public view.
create policy "emp_select_privileged" on employees for select to authenticated
  using (auth_id = auth.uid() or auth_role() in ('admin', 'hr_manager', 'ceo', 'audit_manager', 'finance_manager'));
-- NOTE: emp_select_directory (using true) was removed — it exposed all PII columns to all users.
-- Non-privileged roles use the employees_public view for directory/dropdown queries.
create policy "emp_update_self"  on employees for update to authenticated using (auth_id = auth.uid());
create policy "emp_update_admin" on employees for update to authenticated using (auth_role() in ('admin', 'hr_manager'));
create policy "emp_insert_admin" on employees for insert to authenticated with check (auth_role() in ('admin', 'hr_manager'));
create policy "emp_delete_admin" on employees for delete to authenticated using (auth_role() in ('admin', 'hr_manager'));

-- LEAVE APPS
create policy "leave_select" on leave_apps for select to authenticated
  using (
    employee = auth_employee_id()
    or auth_role() in ('admin', 'hr_manager', 'ceo')
    or exists (
      select 1 from employees mgr
      where mgr.name = leave_apps.employee
        and mgr.reports_to = auth_employee_id()
    )
  );
create policy "leave_insert" on leave_apps for insert to authenticated
  with check (employee = auth_employee_id());
-- Employees cannot update (prevents self-approval); only HR/admin drive status transitions.
-- Employees cancel their own Open leaves via delete.
create policy "leave_update" on leave_apps for update to authenticated
  using (auth_role() in ('admin', 'hr_manager'));
create policy "leave_delete" on leave_apps for delete to authenticated
  using (
    auth_role() in ('admin', 'hr_manager')
    or (employee = auth_employee_id() and status = 'Open')
  );

-- LEAVE ALLOCS
create policy "alloc_select" on leave_allocs for select to authenticated
  using (employee = auth_employee_id() or auth_role() in ('admin', 'hr_manager', 'ceo'));
create policy "alloc_write" on leave_allocs for all to authenticated
  using (auth_role() in ('admin', 'hr_manager'))
  with check (auth_role() in ('admin', 'hr_manager'));

-- DAY REQUESTS
create policy "dr_select" on day_requests for select to authenticated
  using (
    employee_id = auth_employee_id()
    or auth_role() in ('admin', 'hr_manager', 'ceo')
    or exists (
      select 1 from employees mgr
      where mgr.name = day_requests.employee_id
        and mgr.reports_to = auth_employee_id()
    )
  );
create policy "dr_insert" on day_requests for insert to authenticated
  with check (employee_id = auth_employee_id());
create policy "dr_update" on day_requests for update to authenticated
  using (employee_id = auth_employee_id() or auth_role() in ('admin', 'hr_manager'));

-- PAYROLL: managers can read/write all; employees can read only their own Paid records
create policy "payroll_mgr_all" on payroll for all to authenticated
  using (auth_role() in ('admin', 'hr_manager', 'finance_manager', 'ceo'))
  with check (auth_role() in ('admin', 'hr_manager', 'finance_manager', 'ceo'));
create policy "payroll_self_read" on payroll for select to authenticated
  using (employee_id = (select name from employees where auth_id = auth.uid())
         and status = 'Paid');

-- PAYROLL LOG
create policy "payroll_log_mgr_all" on payroll_log for all to authenticated
  using (auth_role() in ('admin', 'hr_manager', 'finance_manager', 'ceo'))
  with check (auth_role() in ('admin', 'hr_manager', 'finance_manager', 'ceo'));

-- EXPENSES
create policy "exp_select" on expenses for select to authenticated
  using (employee_id = auth_employee_id() or auth_role() in ('admin', 'hr_manager', 'finance_manager', 'ceo'));
create policy "exp_insert" on expenses for insert to authenticated
  with check (employee_id = auth_employee_id());
-- Employees cannot update (prevents self-approval); they cancel via delete.
create policy "exp_update" on expenses for update to authenticated
  using (auth_role() in ('admin', 'hr_manager', 'finance_manager'));
create policy "exp_delete_self" on expenses for delete to authenticated
  using (
    auth_role() in ('admin', 'hr_manager', 'finance_manager')
    or (employee_id = auth_employee_id() and status in ('Draft', 'Submitted'))
  );

-- ANNOUNCEMENTS
create policy "ann_select" on announcements for select to authenticated using (true);
create policy "ann_write"  on announcements for all to authenticated
  using (auth_role() in ('admin', 'hr_manager'))
  with check (auth_role() in ('admin', 'hr_manager'));

-- RECRUITMENT
create policy "recruit_jobs_access" on recruitment_jobs for all to authenticated
  using (auth_role() in ('admin', 'hr_manager', 'ceo'))
  with check (auth_role() in ('admin', 'hr_manager', 'ceo'));
create policy "recruit_cands_access" on recruitment_candidates for all to authenticated
  using (auth_role() in ('admin', 'hr_manager', 'ceo'))
  with check (auth_role() in ('admin', 'hr_manager', 'ceo'));

-- AUDIT LOGS
create policy "audit_select" on audit_logs for select to authenticated
  using (auth_role() in ('admin', 'audit_manager', 'ceo'));
create policy "audit_insert" on audit_logs for insert to authenticated
  with check (
    user_id = auth_employee_id()
    and role = auth_role()
  );
-- Permissive policy for ERROR-action inserts (e.g. ErrorBoundary in App.jsx).
-- Supabase applies OR logic across multiple INSERT policies, so this allows any
-- authenticated user to log an ERROR even when userId/role are not set by the client.
create policy "audit_error_insert" on audit_logs for insert to authenticated
  with check (
    action = 'ERROR'
    and (user_id is null or user_id = auth_employee_id())
  );

-- NOTIFICATIONS
create policy "notif_select" on notifications for select to authenticated
  using (recipient_id = auth_employee_id());
-- C2: insert_notification() is SECURITY DEFINER and does the actual insert, bypassing RLS.
-- Direct inserts are still allowed for admin/hr_manager and self-sends.
create policy "notif_insert" on notifications for insert to authenticated
  with check (
    auth_role() in ('admin', 'hr_manager')
    or recipient_id = auth_employee_id()
  );
create policy "notif_update" on notifications for update to authenticated
  using (recipient_id = auth_employee_id());
-- L2: allow employees to delete their own read notifications (for "Clear read" feature)
create policy "notif_delete" on notifications for delete to authenticated
  using (recipient_id = auth_employee_id() and read = true);

-- WORK SCHEDULES
create policy "ws_select" on work_schedules for select to authenticated
  using (
    employee = auth_employee_id()
    or auth_role() in ('admin', 'hr_manager', 'ceo')
    or exists (
      select 1 from employees mgr
      where mgr.name = work_schedules.employee
        and mgr.reports_to = auth_employee_id()
    )
  );
create policy "ws_insert" on work_schedules for insert to authenticated
  with check (auth_role() in ('admin', 'hr_manager'));
create policy "ws_delete" on work_schedules for delete to authenticated
  using (auth_role() in ('admin', 'hr_manager'));

-- CHECKINS
create policy "chk_select" on checkins for select to authenticated
  using (employee = auth_employee_id() or auth_role() in ('admin', 'hr_manager'));
create policy "chk_insert" on checkins for insert to authenticated
  with check (employee = auth_employee_id());

-- ATTENDANCE
create policy "att_select" on attendance for select to authenticated
  using (
    employee = auth_employee_id()
    or auth_role() in ('admin', 'hr_manager', 'ceo')
    or exists (
      select 1 from employees mgr
      where mgr.name = attendance.employee
        and mgr.reports_to = auth_employee_id()
    )
  );
-- Employees insert via record_checkin RPC (security definer); checkout via record_checkout RPC.
-- Direct UPDATE/DELETE restricted to HR/admin — prevents employees from self-editing
-- attendance status, working hours, or late minutes via the Supabase client.
create policy "att_insert" on attendance for insert to authenticated
  with check (employee = auth_employee_id() or auth_role() in ('admin', 'hr_manager'));
create policy "att_update_admin" on attendance for update to authenticated
  using (auth_role() in ('admin', 'hr_manager'));
create policy "att_delete_admin" on attendance for delete to authenticated
  using (auth_role() in ('admin', 'hr_manager'));

-- CUSTOM ROLES
-- Admins can do everything; all authenticated users can read (needed for client-side permission checks)
create policy "cr_admin_all" on custom_roles for all to authenticated
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');
create policy "cr_select_all" on custom_roles for select to authenticated
  using (true);

-- EMPLOYEE PERMISSIONS
-- Admins can do everything; employees can read their own overrides
create policy "ep_admin_all" on employee_permissions for all to authenticated
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');
create policy "ep_self_read" on employee_permissions for select to authenticated
  using (employee_id = (select name from employees where auth_id = auth.uid()));

-- ─── Public directory view — safe columns only, no PII ────────────────────────
-- C3: added employment_type, date_of_joining, gender, employee_type for Employees page
-- cell_number included: needed by Employees directory card display (employees.js getEmployees)
-- off_days included: needed by attendance export and schedule display
-- 016: added status and access_expires_at (both added to employees table in migration 015)
create or replace view employees_public as
  select name, employee_name, department, designation, role, branch, company,
         reports_to, image, employment_type, date_of_joining, gender, employee_type,
         cell_number, off_days, status, access_expires_at
  from employees;
grant select on employees_public to authenticated;

-- ─── Performance Indexes ──────────────────────────────────────────────────────
create index if not exists idx_checkins_employee_time    on checkins(employee, time);
create index if not exists idx_attendance_employee_date  on attendance(employee, attendance_date);
create index if not exists idx_leave_apps_employee       on leave_apps(employee, status, from_date);
create index if not exists idx_payroll_employee_period   on payroll(employee_id, period_start);
create index if not exists idx_day_requests_employee     on day_requests(employee_id, approval_status);
create index if not exists idx_notifications_recipient   on notifications(recipient_id, read, created_at);
create index if not exists idx_timesheets_employee       on timesheets(employee, start_date);
create index if not exists idx_expenses_employee_status  on expenses(employee_id, status);
create index if not exists idx_expenses_employee_date    on expenses(employee_id, expense_date);
create index if not exists idx_audit_logs_user_time      on audit_logs(user_id, timestamp desc);
create index if not exists idx_audit_logs_action         on audit_logs(action);
create index if not exists idx_audit_logs_resource       on audit_logs(resource);
create index if not exists idx_recruitment_jobs          on recruitment_jobs(department, status);
create index if not exists idx_recruitment_candidates    on recruitment_candidates(job_id, stage);
create index if not exists idx_employees_department      on employees(department);
create index if not exists idx_employees_role            on employees(role);

-- ─── Salary Integrity Trigger ─────────────────────────────────────────────────
-- Enforces that calculated_salary always equals the formula result on every INSERT
-- and UPDATE, regardless of what the client sends. Prevents tampered values from
-- being stored. Formula mirrors calcFinalSalary() in src/api/payroll.js.
create or replace function enforce_salary_calculation()
returns trigger language plpgsql as $$
begin
  new.calculated_salary :=
    round(((new.base_salary + new.additional_salary)::numeric / 30) * new.working_days)
    + coalesce(new.friday_bonus,    0)
    + coalesce(new.extra_day_bonus, 0);
  return new;
end;
$$;

drop trigger if exists payroll_salary_check on payroll;
create trigger payroll_salary_check
  before insert or update on payroll
  for each row execute function enforce_salary_calculation();

-- ─── Seed Data ────────────────────────────────────────────────────────────────

-- Employees (password = username for test purposes)
insert into employees (name, employee_name, department, designation, role, employment_type, date_of_joining, gender, date_of_birth, branch, cell_number, personal_email, company_email, user_id, password, reports_to) values
  ('HR-EMP-0010', 'Hussein Alaa',       'Management',            'System Administrator', 'admin',           'Full-time', '2015-01-01', 'Male',   null,         'Baghdad HQ', '',                  '',                   'hussein@afaqalfiker.com', 'hussein', 'hussein', null),
  ('HR-EMP-0009', 'Alaa Alghanimi',     'Management',            'CEO',                  'ceo',             'Full-time', '2015-01-01', 'Male',   '1975-03-10', 'Baghdad HQ', '+964 770 000 0001', 'alaa@gmail.com',     'alaa@afaqalfiker.com',    'alaa',    'alaa',    null),
  ('HR-EMP-0002', 'Sara Al-Otaibi',     'Human Resources',       'HR Manager',           'hr_manager',      'Full-time', '2019-01-15', 'Female', '1988-04-20', 'Baghdad HQ', '+964 771 234 5678', 'sara@gmail.com',     'sara@afaqalfiker.com',    'sara',    'sara',    'HR-EMP-0009'),
  ('HR-EMP-0003', 'Khalid Al-Zahrani',  'Finance',               'Finance Manager',      'finance_manager', 'Full-time', '2018-06-01', 'Male',   '1983-08-15', 'Baghdad HQ', '+964 772 345 6789', 'khalid@gmail.com',   'khalid@afaqalfiker.com',  'khalid',  'khalid',  'HR-EMP-0009'),
  ('HR-EMP-0001', 'Ahmed Al-Rashidi',   'Information Technology', 'IT Manager',           'it_manager',      'Full-time', '2022-03-01', 'Male',   '1995-06-15', 'Baghdad HQ', '+964 770 123 4567', 'ahmed@gmail.com',    'ahmed@afaqalfiker.com',   'ahmed',   'ahmed',   'HR-EMP-0009'),
  ('HR-EMP-0006', 'Reem Al-Dossari',    'Information Technology', 'Software Developer',   'employee',        'Full-time', '2023-09-01', 'Female', '2000-04-22', 'Baghdad HQ', '+964 775 678 9012', 'reem@gmail.com',     'reem@afaqalfiker.com',    'reem',    'reem',    'HR-EMP-0001')
on conflict (name) do nothing;

-- Leave Allocations (for all employees)
insert into leave_allocs (employee, leave_type, total_leaves_allocated, is_hourly)
select e.name, a.leave_type, a.allocated, a.is_hourly
from employees e
cross join (values
  ('Annual Leave',  21, false),
  ('Sick Leave',    10, false),
  ('Casual Leave',   6, false),
  ('Unpaid Leave', 365, false),
  ('Hourly Leave',  24, true)
) as a(leave_type, allocated, is_hourly)
on conflict do nothing;

-- Announcements
insert into announcements (name, title, content, notice_date) values
  ('ANN-001', 'Welcome to the HR Portal', 'The new HR portal is now live. Please update your profile information and review your leave balances.', current_date),
  ('ANN-002', 'Ramadan Working Hours', 'During Ramadan, working hours will be reduced to 6 hours per day. Please submit any schedule adjustments through the system.', current_date)
on conflict (name) do nothing;

-- ─── Public Holidays (011) ────────────────────────────────────────────────────
create table if not exists public_holidays (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  date       date not null unique,
  created_at timestamptz default now()
);
alter table public_holidays enable row level security;
create policy "holidays_read" on public_holidays for select to authenticated using (true);
create policy "holidays_write" on public_holidays for all to authenticated
  using (exists (select 1 from employees where name = auth_employee_id() and role in ('admin', 'hr_manager')));
create index if not exists idx_holidays_date on public_holidays(date);

-- ─── Departments (012) ────────────────────────────────────────────────────────
create table if not exists departments (
  id          uuid default gen_random_uuid() primary key,
  name        text not null unique,
  description text,
  manager_id  text references employees(name) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table departments enable row level security;
create policy "dept_read"  on departments for select to authenticated using (true);
create policy "dept_write" on departments for all to authenticated
  using (exists (select 1 from employees where name = auth_employee_id() and role in ('admin', 'hr_manager')));
create index if not exists idx_departments_name on departments(name);

insert into departments (name)
select distinct department from employees
where department is not null and department != ''
on conflict (name) do nothing;
