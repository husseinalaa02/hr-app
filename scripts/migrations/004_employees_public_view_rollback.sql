-- Rollback 004: Restore employees_public to original definition (with cell_number)

create or replace view employees_public as
  select name, employee_name, department, designation, role, branch, company, reports_to, image, cell_number
  from employees;

grant select on employees_public to authenticated;

-- Note: employee_type column is kept (no data loss risk from dropping it is low,
-- but removing a column that may have data is dangerous — leave it in place).
