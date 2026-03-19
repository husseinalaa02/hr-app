import { db } from '../db/index';
import { recalculatePayroll, FRIDAY_DAY_FIXED, calcExtraDayValue } from './payroll';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export const REQUEST_TYPES = ['Friday Day', 'Extra Day'];

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getDayRequests({ employeeId = '', managerId = '', status = '' } = {}) {
  if (SUPABASE_MODE) {
    let ids = [];
    if (managerId) {
      const { data: reports } = await supabase.from('employees_public').select('name').eq('reports_to', managerId);
      ids = (reports || []).map(e => e.name);
      if (employeeId && !ids.includes(employeeId)) ids.push(employeeId);
    } else if (employeeId) {
      ids = [employeeId];
    }
    let query = supabase.from('day_requests').select('*');
    if (ids.length > 0) query = query.in('employee_id', ids);
    if (status) query = query.eq('approval_status', status);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    let list = await db.day_requests.toArray();
    if (managerId) {
      // Include own requests + direct reports' requests
      let directReportIds = await db.employees.where('reports_to').equals(managerId).primaryKeys();
      if (directReportIds.length === 0) {
        const { MOCK_EMPLOYEES } = await import('./mock');
        directReportIds = MOCK_EMPLOYEES.filter(e => e.reports_to === managerId).map(e => e.name);
      }
      const visibleEmployees = new Set([...(employeeId ? [employeeId] : []), ...directReportIds]);
      list = list.filter(r => visibleEmployees.has(r.employee_id));
    } else if (employeeId) {
      list = list.filter(r => r.employee_id === employeeId);
    }
    if (status) list = list.filter(r => r.approval_status === status);
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return [];
}

export async function getDayRequest(id) {
  if (DEMO) return db.day_requests.get(Number(id));
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('day_requests').select('*').eq('id', id).single();
    return data || null;
  }
  return null;
}

// ─── Duplicate Check ──────────────────────────────────────────────────────────
async function checkDuplicate(employeeId, requestType, requestDate, excludeId = null) {
  const existing = await db.day_requests
    .where('employee_id').equals(employeeId)
    .filter(r =>
      r.request_type === requestType &&
      r.request_date === requestDate &&
      (excludeId === null || r.id !== excludeId)
    )
    .first();
  return !!existing;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createDayRequest(data) {
  const { employee_id, employee_name, request_type, request_date, notes = '' } = data;

  if (!employee_id || !request_type || !request_date) {
    throw new Error('Employee, request type, and date are required');
  }
  if (!REQUEST_TYPES.includes(request_type)) {
    throw new Error(`Invalid request type. Allowed: ${REQUEST_TYPES.join(', ')}`);
  }

  if (SUPABASE_MODE) {
    // Duplicate check
    const { data: dup } = await supabase.from('day_requests').select('id')
      .eq('employee_id', employee_id).eq('request_type', request_type).eq('request_date', request_date).maybeSingle();
    if (dup) throw new Error(`Duplicate request: a ${request_type} request for ${request_date} already exists`);
    const { data: inserted, error } = await supabase.from('day_requests').insert({
      employee_id, employee_name, request_type, request_date, approval_status: 'Pending Manager', notes,
    }).select().single();
    if (error) throw error;
    return inserted;
  }
  if (DEMO) {
    const isDuplicate = await checkDuplicate(employee_id, request_type, request_date);
    if (isDuplicate) {
      throw new Error(`Duplicate request: a ${request_type} request for ${request_date} already exists for this employee`);
    }
    const record = {
      employee_id, employee_name, request_type, request_date,
      approval_status: 'Pending Manager',
      created_at: new Date().toISOString(),
      notes,
    };
    const id = await db.day_requests.add(record);
    return { ...record, id };
  }

  throw new Error('No backend available');
}

// Manager approves: Pending Manager → Pending HR
export async function managerApproveDayRequest(id) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('day_requests').select('approval_status').eq('id', id).single();
    if (!existing) throw new Error('Request not found');
    if (existing.approval_status !== 'Pending Manager')
      throw new Error('Only manager-pending requests can be approved here');
    const { data: updated, error } = await supabase.from('day_requests')
      .update({ approval_status: 'Pending HR' }).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  if (DEMO) {
    const request = await db.day_requests.get(Number(id));
    if (!request) throw new Error('Request not found');
    const stage = request.approval_status;
    if (stage !== 'Pending Manager' && stage !== 'Pending')
      throw new Error('Only manager-pending requests can be approved here');
    const updated = { ...request, approval_status: 'Pending HR' };
    await db.day_requests.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

// HR approves: Pending HR → Approved + payroll update
export async function hrApproveDayRequest(id) {
  if (SUPABASE_MODE) {
    const { data: request } = await supabase.from('day_requests').select('*').eq('id', id).single();
    if (!request) throw new Error('Request not found');
    if (request.approval_status !== 'Pending HR')
      throw new Error('Only HR-pending requests can be approved here');

    const { data: updated, error } = await supabase.from('day_requests')
      .update({ approval_status: 'Approved' }).eq('id', id).select().single();
    if (error) throw error;

    // Apply payroll bonus — skip Paid records (Issue 3) and re-check status after update (Issue 8)
    const { data: prs } = await supabase.from('payroll').select('*')
      .eq('employee_id', request.employee_id)
      .lte('period_start', request.request_date)
      .gte('period_end', request.request_date);
    for (const pr of (prs || [])) {
      if (pr.status === 'Paid') continue; // never mutate settled payroll
      let { friday_bonus, extra_day_bonus, calculated_salary, base_salary } = pr;
      if (request.request_type === 'Friday Day') {
        friday_bonus      += FRIDAY_DAY_FIXED;
        calculated_salary += FRIDAY_DAY_FIXED;
      } else {
        const dayVal       = calcExtraDayValue(base_salary);
        extra_day_bonus   += dayVal;
        calculated_salary += dayVal;
      }
      await supabase.from('payroll').update({ friday_bonus, extra_day_bonus, calculated_salary }).eq('id', pr.id);
    }
    return updated;
  }
  if (DEMO) {
    const request = await db.day_requests.get(Number(id));
    if (!request) throw new Error('Request not found');
    if (request.approval_status !== 'Pending HR')
      throw new Error('Only HR-pending requests can be approved here');

    const updated = { ...request, approval_status: 'Approved' };
    await db.day_requests.put(updated);

    // Apply payroll bonus
    const payrollRecords = await db.payroll
      .where('employee_id').equals(request.employee_id)
      .filter(r => r.period_start <= request.request_date && r.period_end >= request.request_date)
      .toArray();

    for (const pr of payrollRecords) {
      if (pr.status === 'Paid') continue; // never mutate settled payroll
      let { friday_bonus, extra_day_bonus, calculated_salary, base_salary } = pr;
      if (request.request_type === 'Friday Day') {
        friday_bonus      += FRIDAY_DAY_FIXED;
        calculated_salary += FRIDAY_DAY_FIXED;
      } else {
        const dayVal       = calcExtraDayValue(base_salary);
        extra_day_bonus   += dayVal;
        calculated_salary += dayVal;
      }
      await db.payroll.put({ ...pr, friday_bonus, extra_day_bonus, calculated_salary });
    }
    return updated;
  }
  throw new Error('No backend available');
}

export async function rejectDayRequest(id) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('day_requests')
      .select('approval_status').eq('id', id).single();
    if (!existing) throw new Error('Request not found');
    if (existing.approval_status === 'Approved')
      throw new Error('Cannot reject an already approved request');
    const { data: updated, error } = await supabase.from('day_requests')
      .update({ approval_status: 'Rejected' }).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  if (DEMO) {
    const request = await db.day_requests.get(Number(id));
    if (!request) throw new Error('Request not found');
    if (request.approval_status === 'Approved')
      throw new Error('Cannot reject an already approved request');
    const updated = { ...request, approval_status: 'Rejected' };
    await db.day_requests.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

export async function deleteDayRequest(id) {
  if (DEMO) { await db.day_requests.delete(Number(id)); return; }
  if (SUPABASE_MODE) {
    await supabase.from('day_requests').delete().eq('id', id);
  }
}
