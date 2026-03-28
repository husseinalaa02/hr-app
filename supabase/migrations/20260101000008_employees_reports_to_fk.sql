-- Migration 008: Add FK constraint on employees.reports_to → employees(name)
-- Nullifies any orphaned references first so the constraint never fails on existing data.

do $$ begin
  -- Nullify any reports_to values that do not match an existing employee
  update employees
  set reports_to = null
  where reports_to is not null
    and reports_to not in (select name from employees);

  -- Add the FK constraint (safe no-op if already present)
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'employees' and constraint_name = 'employees_reports_to_fkey'
  ) then
    alter table employees
      add constraint employees_reports_to_fkey
      foreign key (reports_to) references employees(name) on delete set null;
  end if;
exception when others then
  raise notice 'employees_reports_to_fkey migration error: %', sqlerrm;
end $$;
