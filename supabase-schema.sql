-- ─── HR App – Supabase Schema ─────────────────────────────────────────────────
-- Run this entire file in: Supabase → SQL Editor → New query → Run

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
  password        text,
  image           text,
  reports_to      text,
  company         text default 'Afaq Al-Fiker'
);

-- Leave Applications
create table if not exists leave_apps (
  name            text primary key,
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
  is_hourly               boolean default false
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
  employee_id         text,
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
  paid_at             timestamptz
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
  creation    timestamptz default now(),
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
  created_at  date default current_date
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

-- Audit Logs
create table if not exists audit_logs (
  id             bigserial primary key,
  timestamp      timestamptz default now(),
  user_id        text,
  role           text,
  resource       text,
  action         text,
  resource_id    text,
  resource_label text,
  details        text,
  changes        jsonb
);

-- ─── Disable RLS for test environment (re-enable + add policies for production) ─
alter table employees           disable row level security;
alter table leave_apps          disable row level security;
alter table leave_allocs        disable row level security;
alter table day_requests        disable row level security;
alter table payroll             disable row level security;
alter table payroll_log         disable row level security;
alter table expenses            disable row level security;
alter table announcements       disable row level security;
alter table recruitment_jobs    disable row level security;
alter table recruitment_candidates disable row level security;
alter table audit_logs          disable row level security;

-- ─── Seed Data ────────────────────────────────────────────────────────────────

-- Employees (password = username for test purposes)
insert into employees (name, employee_name, department, designation, role, employment_type, date_of_joining, gender, date_of_birth, branch, cell_number, personal_email, company_email, user_id, password, reports_to) values
  ('HR-EMP-0010', 'Hussein Alaa',       'Management',           'System Administrator', 'admin',            'Full-time', '2015-01-01', 'Male',   null,         'Baghdad HQ', '',                  '',                   'hussein@afaqalfiker.com', 'hussein', 'hussein', null),
  ('HR-EMP-0009', 'Alaa Alghanimi',     'Management',           'CEO',                  'ceo',              'Full-time', '2015-01-01', 'Male',   '1975-03-10', 'Baghdad HQ', '+964 770 000 0001', 'alaa@gmail.com',     'alaa@afaqalfiker.com',    'alaa',    'alaa',    null),
  ('HR-EMP-0002', 'Sara Al-Otaibi',     'Human Resources',      'HR Manager',           'hr_manager',       'Full-time', '2019-01-15', 'Female', '1988-04-20', 'Baghdad HQ', '+964 771 234 5678', 'sara@gmail.com',     'sara@afaqalfiker.com',    'sara',    'sara',    'HR-EMP-0009'),
  ('HR-EMP-0003', 'Khalid Al-Zahrani',  'Finance',              'Finance Manager',      'finance_manager',  'Full-time', '2018-06-01', 'Male',   '1983-08-15', 'Baghdad HQ', '+964 772 345 6789', 'khalid@gmail.com',   'khalid@afaqalfiker.com',  'khalid',  'khalid',  'HR-EMP-0009'),
  ('HR-EMP-0001', 'Ahmed Al-Rashidi',   'Information Technology','IT Manager',          'it_manager',       'Full-time', '2022-03-01', 'Male',   '1995-06-15', 'Baghdad HQ', '+964 770 123 4567', 'ahmed@gmail.com',    'ahmed@afaqalfiker.com',   'ahmed',   'ahmed',   'HR-EMP-0009'),
  ('HR-EMP-0006', 'Reem Al-Dossari',    'Information Technology','Software Developer',  'employee',         'Full-time', '2023-09-01', 'Female', '2000-04-22', 'Baghdad HQ', '+964 775 678 9012', 'reem@gmail.com',     'reem@afaqalfiker.com',    'reem',    'reem',    'HR-EMP-0001')
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
