import { supabase, SUPABASE_MODE } from '../db/supabase';

// Load per-user permission overrides for one employee → { [permission]: boolean }
export async function getPermissionOverrides(employeeId) {
  if (!SUPABASE_MODE) return {};
  const { data } = await supabase
    .from('employee_permissions')
    .select('permission, granted')
    .eq('employee_id', employeeId);
  const map = {};
  for (const r of data || []) map[r.permission] = r.granted;
  return map;
}

// Save permission overrides for an employee.
// overrides = { [permission]: boolean | null }
//   boolean  → upsert the override
//   null     → delete the override (revert to role default)
export async function savePermissionOverrides(employeeId, overrides) {
  if (!SUPABASE_MODE) return;
  const toUpsert = [];
  const toDelete = [];
  for (const [permission, value] of Object.entries(overrides)) {
    if (value === null) toDelete.push(permission);
    else toUpsert.push({ employee_id: employeeId, permission, granted: value, updated_at: new Date().toISOString() });
  }
  if (toUpsert.length) {
    await supabase.from('employee_permissions')
      .upsert(toUpsert, { onConflict: 'employee_id,permission' });
  }
  if (toDelete.length) {
    await supabase.from('employee_permissions')
      .delete()
      .eq('employee_id', employeeId)
      .in('permission', toDelete);
  }
}

// Load all employees with their overrides for the admin panel
export async function getAllEmployeesWithOverrides() {
  if (!SUPABASE_MODE) return [];
  const [{ data: emps }, { data: perms }] = await Promise.all([
    supabase.from('employees').select('name, employee_name, department, role').order('employee_name'),
    supabase.from('employee_permissions').select('employee_id, permission, granted'),
  ]);
  const overrideMap = {};
  for (const p of perms || []) {
    if (!overrideMap[p.employee_id]) overrideMap[p.employee_id] = {};
    overrideMap[p.employee_id][p.permission] = p.granted;
  }
  return (emps || []).map(e => ({ ...e, overrides: overrideMap[e.name] || {} }));
}
