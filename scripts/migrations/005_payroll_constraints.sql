-- Migration 005: Payroll FK, timestamps; leave_allocs and day_requests unique constraints (M1, M2, M3)

-- M1: payroll timestamps
alter table payroll add column if not exists created_at timestamptz default now();
alter table payroll add column if not exists updated_at timestamptz default now();

-- M1: payroll employee FK (safe — existing rows may have employee_ids that no longer exist;
-- ON DELETE SET NULL means deleting an employee just nullifies the payroll reference)
do $$ begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'payroll' and constraint_name = 'payroll_employee_id_fkey'
  ) then
    alter table payroll add constraint payroll_employee_id_fkey
      foreign key (employee_id) references employees(name) on delete set null;
  end if;
end $$;

-- M2: unique leave allocation per employee/type/year
alter table leave_allocs add constraint if not exists leave_allocs_unique
  unique (employee, leave_type, leave_year);

-- M3: unique day request per employee/date/type (prevents duplicate submissions)
alter table day_requests add constraint if not exists day_requests_unique
  unique (employee_id, request_date, request_type);
