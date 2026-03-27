-- Migration 011: Per-employee weekly off days + public holidays table
-- ─────────────────────────────────────────────────────────────────────────────

-- Add off_days column to employees (array of day numbers: 0=Sun … 6=Sat)
-- Default: Friday(5) and Saturday(6) off — matches company-wide baseline
alter table employees
  add column if not exists off_days integer[] default array[5,6];

-- Public company-wide holidays
create table if not exists public_holidays (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  date       date not null unique,
  created_at timestamptz default now()
);

alter table public_holidays enable row level security;

-- All authenticated users can view holidays
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_holidays' and policyname = 'holidays_read'
  ) then
    execute $policy$
      create policy "holidays_read" on public_holidays
        for select to authenticated using (true)
    $policy$;
  end if;
end $$;

-- Only HR and Admin can manage holidays
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_holidays' and policyname = 'holidays_write'
  ) then
    execute $policy$
      create policy "holidays_write" on public_holidays
        for all to authenticated
        using (
          exists (
            select 1 from employees
            where name = auth_employee_id()
              and role in ('admin', 'hr_manager')
          )
        )
    $policy$;
  end if;
end $$;

create index if not exists idx_holidays_date on public_holidays(date);
