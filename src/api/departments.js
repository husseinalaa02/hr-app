import { supabase, SUPABASE_MODE } from '../db/supabase';
import { logAction } from './auditLog';
import { invalidate } from '../utils/cache';

export async function getDepartments() {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, description, manager_id, created_at')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getDepartmentEmployeeCount(deptName) {
  if (!SUPABASE_MODE) return 0;
  const { count, error } = await supabase
    .from('employees_public')
    .select('name', { count: 'exact', head: true })
    .eq('department', deptName);
  if (error) return 0;
  return count || 0;
}

export async function createDepartment({ name, description, manager_id }) {
  if (!name?.trim()) throw new Error('Department name required');
  const { data, error } = await supabase
    .from('departments')
    .insert({ name: name.trim(), description: description?.trim() || null, manager_id: manager_id || null })
    .select('id, name, description, manager_id, created_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('A department with this name already exists.');
    throw error;
  }
  invalidate('departments');
  await logAction({
    action: 'CREATE',
    resource: 'Department',
    resourceId: data.id,
    resourceLabel: data.name,
  });
  return data;
}

export async function updateDepartment(id, { name, description, manager_id }) {
  const { error } = await supabase
    .from('departments')
    .update({ name: name.trim(), description: description?.trim() || null, manager_id: manager_id || null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('A department with this name already exists.');
    throw error;
  }
  invalidate('departments');
  await logAction({
    action: 'UPDATE',
    resource: 'Department',
    resourceId: id,
    resourceLabel: name,
  });
}

export async function deleteDepartment(id, name) {
  // Check for employees still in this department
  const { count } = await supabase
    .from('employees_public')
    .select('name', { count: 'exact', head: true })
    .eq('department', name);
  if (count > 0) {
    throw new Error(`HAS_EMPLOYEES:${count}`);
  }
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', id);
  if (error) throw error;
  invalidate('departments');
  await logAction({
    action: 'DELETE',
    resource: 'Department',
    resourceId: id,
    resourceLabel: name,
  });
}
