import { db } from '../db/index';
import { MOCK_EMPLOYEES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { cached, invalidate } from '../utils/cache';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Reads ────────────────────────────────────────────────────────────────────

// Cache the full unfiltered list, then filter in memory to avoid redundant network calls
// for every search keystroke or department filter change (Issue 17).
export async function getEmployees({ search = '', department = '' } = {}) {
  const all = await cached('employees:all', async () => {
    if (SUPABASE_MODE) {
      const { data, error } = await supabase.from('employees_public').select('*').order('employee_name');
      if (error) throw error;
      return data || [];
    }
    if (DEMO) {
      let list = await db.employees.toArray();
      if (list.length === 0) list = [...MOCK_EMPLOYEES];
      return list.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    }
    return [];
  }, 120_000); // 2 min TTL — employee list rarely changes

  let result = all;
  if (search)     result = result.filter(e => e.employee_name.toLowerCase().includes(search.toLowerCase()));
  if (department) result = result.filter(e => e.department === department);
  return result;
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
    const { data, error } = await supabase.from('employees_public').select('*').eq('reports_to', managerId);
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
  return cached('departments', async () => {
    if (SUPABASE_MODE) {
      // Fetch from dedicated departments table; fall back to distinct employee departments
      const [{ data: deptRows }, { data: empRows }] = await Promise.all([
        supabase.from('departments').select('name').order('name'),
        supabase.from('employees_public').select('department'),
      ]);
      const fromTable = (deptRows || []).map(d => d.name);
      const fromEmps  = (empRows  || []).map(e => e.department).filter(Boolean);
      return [...new Set([...fromTable, ...fromEmps])].sort();
    }
    if (DEMO) {
      const emps = await db.employees.toArray();
      return [...new Set(emps.map(e => e.department).filter(Boolean))].sort();
    }
    return [];
  }, 600_000);
}

export async function addDepartment(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Department name cannot be empty');
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('departments').insert({ name: trimmed });
    if (error) throw new Error(error.message);
  }
  invalidate('departments');
}

export async function deleteDepartment(name) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('departments').delete().eq('name', name);
    if (error) throw new Error(error.message);
  }
  invalidate('departments');
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

// ─── Writes ───────────────────────────────────────────────────────────────────

// Fields that employees or admins may update via the UI.
// role, auth_id, and user_id are intentionally excluded — changes to those
// must go through dedicated admin-only server endpoints (Issue 5).
const EMPLOYEE_ALLOWED_FIELDS = [
  'employee_name', 'cell_number', 'department', 'designation', 'branch',
  'personal_email', 'date_of_birth', 'image', 'reports_to', 'employment_type',
  'employee_type', 'gender', 'nationality', 'address', 'company_email',
];

export async function updateEmployee(id, data) {
  const safe = Object.fromEntries(
    Object.entries(data).filter(([k]) => EMPLOYEE_ALLOWED_FIELDS.includes(k))
  );
  if (SUPABASE_MODE) {
    const { data: updated, error } = await supabase.from('employees').update(safe).eq('name', id).select().single();
    if (error) throw error;
    invalidate('employees');
    return updated;
  }
  if (DEMO) {
    const existing = await db.employees.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...safe };
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let res;
    try {
      res = await fetch(`${API_BASE}/api/create-employee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          employee_data: { ...data, company: data.company || import.meta.env.VITE_DEFAULT_COMPANY || 'AFAQ ALFIKER' },
          password: data.password || data.user_id || '',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || 'Failed to create employee');
    invalidate('employees');
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
      company:          data.company || import.meta.env.VITE_DEFAULT_COMPANY || 'AFAQ ALFIKER',
      date_of_joining:  data.date_of_joining || '',
      gender:           data.gender || '',
      date_of_birth:    data.date_of_birth || '',
      employment_type:  data.employment_type || 'Full-time',
      employee_type:    data.employee_type || 'Office',
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
