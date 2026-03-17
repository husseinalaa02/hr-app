import { db } from '../db/index';
import { MOCK_EMPLOYEES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { cached, invalidate } from '../utils/cache';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getEmployees({ search = '', department = '' } = {}) {
  const cacheKey = `employees:${search}:${department}`;
  return cached(cacheKey, async () => {
    if (SUPABASE_MODE) {
      let query = supabase.from('employees').select('*');
      if (search) query = query.ilike('employee_name', `%${search}%`);
      if (department) query = query.eq('department', department);
      const { data, error } = await query.order('employee_name');
      if (error) throw error;
      return data || [];
    }
    if (DEMO) {
      let list = await db.employees.toArray();
      if (list.length === 0) list = [...MOCK_EMPLOYEES];
      if (search) list = list.filter(e => e.employee_name.toLowerCase().includes(search.toLowerCase()));
      if (department) list = list.filter(e => e.department === department);
      return list.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    }
    return [];
  }, 120_000); // 2 min TTL — employee list rarely changes
}

export async function getEmployee(id) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('employees').select('*').eq('name', id).single();
    if (error) return null;
    return data;
  }
  if (DEMO) {
    const rec = await db.employees.get(id);
    if (rec) return rec;
    return MOCK_EMPLOYEES.find(e => e.name === id) || null;
  }
  return null;
}

export async function getDirectReports(managerId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('employees').select('*').eq('reports_to', managerId);
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    const rows = await db.employees.where('reports_to').equals(managerId).toArray();
    if (rows.length > 0) return rows;
    return MOCK_EMPLOYEES.filter(e => e.reports_to === managerId);
  }
  return [];
}

export async function getDepartments() {
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('employees').select('department');
    return [...new Set((data || []).map(e => e.department).filter(Boolean))].sort();
  }
  if (DEMO) {
    const emps = await db.employees.toArray();
    return [...new Set(emps.map(e => e.department).filter(Boolean))].sort();
  }
  return [];
}

// Used synchronously-ish during login — kept async, callers must await
export async function findEmployeeByUserId(userId) {
  if (!userId) return null;
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('employees').select('*').eq('user_id', userId).single();
    return data || null;
  }
  const lower = userId.toLowerCase();
  const all = await db.employees.toArray();
  return all.find(e => e.user_id && e.user_id.toLowerCase() === lower) || null;
}

export async function deriveRole(emp) {
  if (!emp?.reports_to) return 'admin';
  const count = await db.employees.where('reports_to').equals(emp.name).count();
  return count > 0 ? 'manager' : 'employee';
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function updateEmployee(id, data) {
  if (SUPABASE_MODE) {
    const { data: updated, error } = await supabase.from('employees').update(data).eq('name', id).select().single();
    if (error) throw error;
    invalidate('employees');
    return updated;
  }
  if (DEMO) {
    const existing = await db.employees.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    await db.employees.put(updated);
    invalidate('employees');
    return updated;
  }
  throw new Error('No backend available');
}

export async function deleteEmployee(id) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('employees').delete().eq('name', id);
    if (error) throw error;
    invalidate('employees');
    return;
  }
  if (DEMO) {
    await db.employees.delete(id);
    invalidate('employees');
    return;
  }
}

export async function createEmployee(data, accessToken) {
  if (SUPABASE_MODE) {
    // Use the secure API endpoint so the service role key stays server-side
    const res = await fetch(`${API_BASE}/api/create-employee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        employee_data: { ...data, company: data.company || import.meta.env.VITE_DEFAULT_COMPANY || 'Afaq Al-Fiker' },
        password: data.password || data.user_id || '',
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || 'Failed to create employee');
    return result;
  }
  if (DEMO) {
    const all = await db.employees.toArray();
    const maxId = Math.max(0, ...all.map(e => parseInt(e.name.replace('HR-EMP-', '')) || 0));
    const id = `HR-EMP-${String(maxId + 1).padStart(4, '0')}`;
    const record = {
      name: id,
      employee_name:    data.employee_name || '',
      department:       data.department || '',
      designation:      data.designation || '',
      cell_number:      data.cell_number || '',
      image:            '',
      user_id:          data.user_id || '',
      company:          data.company || import.meta.env.VITE_DEFAULT_COMPANY || 'Afaq Al-Fiker',
      date_of_joining:  data.date_of_joining || '',
      gender:           data.gender || '',
      date_of_birth:    data.date_of_birth || '',
      employment_type:  data.employment_type || 'Full-time',
      branch:           data.branch || '',
      personal_email:   data.personal_email || '',
      company_email:    data.company_email || '',
      reports_to:       data.reports_to || '',
    };
    await db.employees.put(record);
    return record;
  }
  throw new Error('No backend available');
}
