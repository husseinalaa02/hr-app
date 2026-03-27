-- Migration 005: Payroll FK, timestamps; leave_allocs and day_requests unique constraints (M1, M2, M3)

-- M1: payroll timestamps
alter table payroll add column if not exists created_at timestamptz default now();
alter table payroll add column if not exists updated_at timestamptz default now();

-- M1: payroll employee FK — nullify orphaned employee_id values first so the FK does not fail
-- on rows that reference employees who no longer exist in the employees table.
do $$ begin
  -- Nullify any orphaned references before adding the constraint
  update payroll
  set employee_id = null
  where employee_id is not null
    and employee_id not in (select name from employees);

  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'payroll' and constraint_name = 'payroll_employee_id_fkey'
  ) then
    alter table payroll add constraint payroll_employee_id_fkey
      foreign key (employee_id) references employees(name) on delete set null;
  end if;
exception when others then
  raise notice 'payroll_employee_id_fkey migration error: %', sqlerrm;
end $$;

-- M2: ensure leave_year column exists, deduplicate, then add unique constraint
-- leave_year may be absent on databases created before it was added to the schema.
alter table leave_allocs
  add column if not exists leave_year int not null default extract(year from now())::int;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_allocs_unique'
  ) then
    -- Remove duplicate rows, keeping the one with the highest id (most recent)
    -- per (employee, leave_type, leave_year) before enforcing uniqueness.
    delete from leave_allocs
    where id not in (
      select max(id)
      from leave_allocs
      group by employee, leave_type, leave_year
    );

    alter table leave_allocs add constraint leave_allocs_unique
      unique (employee, leave_type, leave_year);
  end if;
end $$;

-- M3: unique day request per employee/date/type (prevents duplicate submissions)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'day_requests_unique'
  ) then
    alter table day_requests add constraint day_requests_unique
      unique (employee_id, request_date, request_type);
  end if;
end $$;
