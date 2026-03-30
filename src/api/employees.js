import { db } from '../db/index';
import { MOCK_EMPLOYEES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { cached, invalidate } from '../utils/cache';
import { logAction } from './auditLog';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Reads ────────────────────────────────────────────────────────────────────

// Cache the full unfiltered list, then filter in memory to avoid redundant network calls
// for every search keystroke or department filter change (Issue 17).
export async function getEmployees({ search = '', department = '' } = {}) {
  const all = await cached('employees:all', async () => {
    if (SUPABASE_MODE) {
      const { data, error } = await supabase.from('employees_public').select('name, employee_name, department, designation, employment_type, date_of_joining, branch, gender, cell_number, image, company, reports_to, employee_type, role, off_days, status, access_expires_at').order('employee_name').limit(1000);
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
    const { data, error } = await supabase.from('employees').select('*').eq('name', id).maybeSingle();
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

// C3: scope-enforced getEmployee — verifies viewer has access to the requested employee.
// Returns the employee if viewer is HR/admin (role checked server-side via RLS),
// or if the target is the viewer themselves, or if the target is in the viewer's report tree.
// Throws { code: 'ACCESS_DENIED' } when the viewer has no access.
export async function getEmployeeScoped(employeeId, viewerId, viewerRole) {
  const HR_ROLES = ['admin', 'hr_manager', 'finance_manager', 'ceo', 'audit_manager'];
  // HR-level roles can see anyone — RLS on the employees table already enforces this server-side
  if (viewerId === employeeId || HR_ROLES.includes(viewerRole)) {
    return getEmployee(employeeId);
  }
  // Line manager: verify the target is in the manager's report tree
  const reports = await getDirectAndIndirectReports(viewerId);
  const inScope = reports.some(r => r.name === employeeId);
  if (!inScope) {
    const err = new Error('You do not have permission to view this employee profile');
    err.code = 'ACCESS_DENIED';
    throw err;
  }
  return getEmployee(employeeId);
}

export async function getDirectAndIndirectReports(managerId) {
  if (!managerId) return [];
  if (SUPABASE_MODE) {
    const { data: ids, error } = await supabase.rpc('get_all_reports', { manager_id: managerId });
    if (error) throw error;
    if (!ids?.length) return [];
    const { data: employees, error: empError } = await supabase
      .from('employees_public')
      .select('name, employee_name, department, designation, role, branch, image, employment_type, date_of_joining, reports_to, off_days, status')
      .in('name', ids.map(r => r.employee_name))
      .order('employee_name');
    if (empError) throw empError;
    return employees || [];
  }
  // Demo: fall back to direct reports only
  if (DEMO) {
    const rows = await db.employees.where('reports_to').equals(managerId).toArray();
    return rows.length > 0 ? rows : MOCK_EMPLOYEES.filter(e => e.reports_to === managerId);
  }
  return [];
}

export async function getDirectReports(managerId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('employees_public').select('name, employee_name, department, designation, image, reports_to, role').eq('reports_to', managerId);
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
      // Fetch only from the dedicated departments table (source of truth)
      const { data: deptRows } = await supabase.from('departments').select('name').order('name');
      return (deptRows || []).map(d => d.name);
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
  // Emergency contact
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
  // Personal fields
  'marital_status', 'national_id',
  // Job fields (HR/Admin only)
  'notice_period_days', 'probation_end_date', 'access_expires_at',
];

// HR/admin-only: update the weekly off-days schedule for an employee.
export async function updateEmployeeSchedule(employeeId, offDays) {
  if (SUPABASE_MODE) {
    const { error } = await supabase
      .from('employees')
      .update({ off_days: offDays })
      .eq('name', employeeId);
    if (error) throw error;
  } else if (DEMO) {
    const existing = await db.employees.get(employeeId);
    if (existing) await db.employees.put({ ...existing, off_days: offDays });
  }
  invalidate('employees');
  await logAction({
    action: 'UPDATE',
    resource: 'Employee',
    resourceId: employeeId,
    resourceLabel: 'Weekly schedule updated',
    details: JSON.stringify({ off_days: offDays }),
  });
}

// Direct role assignment — intentionally bypasses EMPLOYEE_ALLOWED_FIELDS because
// roles must never be changeable by the employee themselves, only by admin actions.
// The Admin page calls this after the server-side /api/set-role JWT sync.
export async function setEmployeeRole(id, role) {
  if (!id || !role) throw new Error('Employee id and role are required');
  if (SUPABASE_MODE) {
    const { data: updated, error } = await supabase
      .from('employees').update({ role }).eq('name', id).select().single();
    if (error) throw error;
    invalidate('employees');
    return updated;
  }
  if (DEMO) {
    const existing = await db.employees.get(id);
    if (!existing) return null;
    const updated = { ...existing, role };
    await db.employees.put(updated);
    invalidate('employees');
    return updated;
  }
  throw new Error('No backend available');
}

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
    invalidate('employees');
    return record;
  }
  throw new Error('No backend available');
}
