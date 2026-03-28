-- Migration 012: Formal departments table with manager assignment
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists departments (
  id          uuid default gen_random_uuid() primary key,
  name        text not null unique,
  description text,
  manager_id  text references employees(name) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table departments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'departments' and policyname = 'dept_read'
  ) then
    execute $policy$
      create policy "dept_read" on departments
        for select to authenticated using (true)
    $policy$;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'departments' and policyname = 'dept_write'
  ) then
    execute $policy$
      create policy "dept_write" on departments
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

-- Seed from existing employee department values (idempotent)
insert into departments (name)
select distinct department
from employees
where department is not null and department != ''
on conflict (name) do nothing;

create index if not exists idx_departments_name on departments(name);
