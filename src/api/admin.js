import { supabase, SUPABASE_MODE } from '../db/supabase';

// ─── Custom Roles ─────────────────────────────────────────────────────────────

export async function getCustomRoles() {
  if (!SUPABASE_MODE) return [];
  const { data } = await supabase.from('custom_roles').select('id, name, label, permissions, notify_as').order('label');
  return data || [];
}

export async function createCustomRole({ name, label, permissions }) {
  const { data, error } = await supabase
    .from('custom_roles').insert({ name, label, permissions }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomRole(id, { label, permissions }) {
  const { data, error } = await supabase
    .from('custom_roles').update({ label, permissions }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCustomRole(id) {
  const { error } = await supabase.from('custom_roles').delete().eq('id', id);
  if (error) throw error;
}

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
    const { error: upsertErr } = await supabase.from('employee_permissions')
      .upsert(toUpsert, { onConflict: 'employee_id,permission' });
    if (upsertErr) throw new Error(upsertErr.message);
  }
  if (toDelete.length) {
    const { error: deleteErr } = await supabase.from('employee_permissions')
      .delete()
      .eq('employee_id', employeeId)
      .in('permission', toDelete);
    if (deleteErr) throw new Error(deleteErr.message);
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
