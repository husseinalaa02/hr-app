import client from './client';
import { db } from '../db/index';
import { enqueuePendingOp } from '../db/sync';
import { MOCK_LEAVE_APPLICATIONS, MOCK_HOURLY_APPLICATIONS, MOCK_ALLOCATIONS_V2, MOCK_EMPLOYEES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

function calcDays(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
}

export function calcHours(from_time, to_time) {
  const [fh, fm] = from_time.split(':').map(Number);
  const [th, tm] = to_time.split(':').map(Number);
  return Math.max(0, (th * 60 + tm - (fh * 60 + fm)) / 60);
}

// ─── Workflow Constants ───────────────────────────────────────────────────────
const UNPAID_TYPES = ['Unpaid Leave'];
const isPaidLeave = (leaveType) => !UNPAID_TYPES.includes(leaveType);

async function applyUnpaidLeaveDeduction(leave) {
  const days = leave.total_leave_days || 1;
  const payrollRecords = await db.payroll
    .where('employee_id').equals(leave.employee)
    .filter(r => r.period_start <= leave.from_date && r.period_end >= leave.from_date)
    .toArray();
  for (const pr of payrollRecords) {
    const deduction = Math.round((pr.base_salary + pr.additional_salary) / 30 * days);
    await db.payroll.put({
      ...pr,
      working_days: Math.max(0, pr.working_days - days),
      calculated_salary: Math.max(0, pr.calculated_salary - deduction),
    });
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getLeaveApplications(employeeId, { status = '' } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('leave_apps').select('*').eq('employee', employeeId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('from_date', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  if (DEMO) {
    let rows = await db.leave_apps.where('employee').equals(employeeId).toArray();
    if (rows.length === 0) {
      const all = [...MOCK_LEAVE_APPLICATIONS, ...MOCK_HOURLY_APPLICATIONS];
      rows = all.filter(l => l.employee === employeeId);
    }
    if (status) rows = rows.filter(l => l.status === status);
    return rows.sort((a, b) => (b.from_date > a.from_date ? 1 : -1));
  }

  const filters = [['employee', '=', employeeId]];
  if (status) filters.push(['status', '=', status]);

  try {
    const res = await client.get('/api/resource/Leave Application', {
      params: {
        fields: JSON.stringify(['name','employee','employee_name','leave_type','from_date','to_date','total_leave_days','status','description','posting_date','from_time','to_time','total_hours']),
        filters: JSON.stringify(filters), limit: 100, order_by: 'posting_date desc',
      },
    });
    const data = res.data.data.map(r => ({ ...r, is_hourly: !!(r.total_hours) }));
    await db.leave_apps.bulkPut(data);
    return data;
  } catch {
    let rows = await db.leave_apps.where('employee').equals(employeeId).toArray();
    if (status) rows = rows.filter(l => l.status === status);
    return rows.sort((a, b) => (b.from_date > a.from_date ? 1 : -1));
  }
}

export async function getPendingApprovals({ managerId = null, includeHRQueue = false } = {}) {
  if (SUPABASE_MODE) {
    let rows = [];
    if (managerId) {
      // Get direct reports
      const { data: reports } = await supabase.from('employees').select('name').eq('reports_to', managerId);
      const reportIds = (reports || []).map(e => e.name);
      if (reportIds.length > 0) {
        const { data } = await supabase.from('leave_apps').select('*')
          .in('employee', reportIds)
          .eq('approval_stage', 'Pending Manager');
        rows.push(...(data || []));
      }
    }
    if (includeHRQueue) {
      const { data } = await supabase.from('leave_apps').select('*').eq('approval_stage', 'Pending HR');
      const existing = new Set(rows.map(r => r.name));
      (data || []).forEach(r => { if (!existing.has(r.name)) rows.push(r); });
    }
    return rows.sort((a, b) => (b.from_date > a.from_date ? 1 : -1));
  }
  if (DEMO) {
    let directReports = managerId
      ? await db.employees.where('reports_to').equals(managerId).primaryKeys()
      : await db.employees.toCollection().primaryKeys();

    if (directReports.length === 0 && managerId) {
      directReports = MOCK_EMPLOYEES
        .filter(e => e.reports_to === managerId)
        .map(e => e.name);
    }

    const allEmployeeIds = directReports.length > 0
      ? directReports
      : MOCK_EMPLOYEES.map(e => e.name);

    // Manager queue: 'Pending Manager' for direct reports
    let rows = await db.leave_apps
      .filter(l =>
        (l.approval_stage === 'Pending Manager' || l.status === 'Open') &&
        allEmployeeIds.includes(l.employee)
      )
      .toArray();

    // HR queue: 'Pending HR' for unpaid leaves (all employees)
    if (includeHRQueue) {
      const hrRows = await db.leave_apps
        .filter(l => l.approval_stage === 'Pending HR')
        .toArray();
      // Merge, avoiding duplicates
      const existing = new Set(rows.map(r => r.name));
      hrRows.forEach(r => { if (!existing.has(r.name)) rows.push(r); });
    }

    // Fallback when DB is completely empty
    const totalInDb = await db.leave_apps.count().catch(() => 0);
    if (rows.length === 0 && totalInDb === 0) {
      const fallback = MOCK_LEAVE_APPLICATIONS.filter(
        l => l.status === 'Open' && allEmployeeIds.includes(l.employee)
      );
      rows = fallback;
    }

    return rows.sort((a, b) => (b.from_date > a.from_date ? 1 : -1));
  }
  // ... keep existing production code after this block

  try {
    // Fetch direct reports first, then query their leaves
    let employeeIds = [];
    if (managerId) {
      const empRes = await client.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['name']),
          filters: JSON.stringify([['reports_to', '=', managerId]]),
          limit: 200,
        },
      });
      employeeIds = (empRes.data.data || []).map(e => e.name);
      if (employeeIds.length === 0) return [];
    }

    const filters = [['status', '=', 'Open']];
    if (employeeIds.length > 0) filters.push(['employee', 'in', employeeIds]);

    const res = await client.get('/api/resource/Leave Application', {
      params: {
        fields: JSON.stringify(['name','employee','employee_name','leave_type','from_date','to_date','total_leave_days','status','description','from_time','to_time','total_hours']),
        filters: JSON.stringify(filters), limit: 100,
      },
    });
    const data = res.data.data.map(r => ({ ...r, is_hourly: !!(r.total_hours) }));
    await db.leave_apps.bulkPut(data);
    return data;
  } catch {
    // Fall back to DB
    const allPending = await db.leave_apps.where('status').equals('Open').toArray();
    if (!managerId) return allPending;
    const directReports = await db.employees.where('reports_to').equals(managerId).primaryKeys();
    return allPending.filter(l => directReports.includes(l.employee));
  }
}

export async function getLeaveTypes() {
  if (SUPABASE_MODE) {
    return ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Hourly Leave', 'Emergency Leave', 'Unpaid Leave'];
  }
  if (DEMO) return ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Emergency Leave', 'Unpaid Leave'];
  try {
    const res = await client.get('/api/resource/Leave Type', {
      params: { fields: JSON.stringify(['name']), limit: 50 },
    });
    return res.data.data.map(t => t.name);
  } catch {
    const allocs = await db.leave_allocs.toArray();
    const types = [...new Set(allocs.map(a => a.leave_type))];
    return types.length ? types : ['Annual Leave', 'Sick Leave', 'Casual Leave'];
  }
}

export async function getLeaveBalance(employeeId) {
  if (SUPABASE_MODE) {
    const { data: allocs } = await supabase.from('leave_allocs').select('*').eq('employee', employeeId);
    const { data: approved } = await supabase.from('leave_apps').select('*')
      .eq('employee', employeeId).eq('status', 'Approved');
    return (allocs || []).map(alloc => {
      if (alloc.is_hourly) {
        const used = (approved || []).filter(l => l.leave_type === alloc.leave_type && l.is_hourly)
          .reduce((s, l) => s + (l.total_hours || 0), 0);
        return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used, remaining: alloc.total_leaves_allocated - used, is_hourly: true, unit: 'hrs' };
      }
      const used = (approved || []).filter(l => l.leave_type === alloc.leave_type && !l.is_hourly)
        .reduce((s, l) => s + (l.total_leave_days || 0), 0);
      return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used, remaining: alloc.total_leaves_allocated - used, is_hourly: false, unit: 'days' };
    });
  }
  if (DEMO) {
    let allocs = await db.leave_allocs.where('employee').equals(employeeId).toArray();
    if (allocs.length === 0) allocs = MOCK_ALLOCATIONS_V2.map(a => ({ ...a, employee: employeeId }));
    let approved = await db.leave_apps
      .where('employee').equals(employeeId)
      .filter(l => l.status === 'Approved')
      .toArray();
    if (approved.length === 0) {
      approved = MOCK_LEAVE_APPLICATIONS.filter(l => l.employee === employeeId && l.status === 'Approved');
    }

    return allocs.map(alloc => {
      if (alloc.is_hourly) {
        const usedHours = approved
          .filter(l => l.leave_type === alloc.leave_type && l.is_hourly)
          .reduce((s, l) => s + (l.total_hours || 0), 0);
        return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used: usedHours, remaining: alloc.total_leaves_allocated - usedHours, is_hourly: true, unit: 'hrs' };
      }
      const usedDays = approved
        .filter(l => l.leave_type === alloc.leave_type && !l.is_hourly)
        .reduce((s, l) => s + (l.total_leave_days || 0), 0);
      return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used: usedDays, remaining: alloc.total_leaves_allocated - usedDays, is_hourly: false, unit: 'days' };
    });
  }

  const year = new Date().getFullYear();
  try {
    const [allocRes, appRes] = await Promise.all([
      client.get('/api/resource/Leave Allocation', {
        params: {
          fields: JSON.stringify(['leave_type','total_leaves_allocated']),
          filters: JSON.stringify([['employee','=',employeeId],['from_date','>=',`${year}-01-01`],['docstatus','=',1]]),
          limit: 50,
        },
      }),
      client.get('/api/resource/Leave Application', {
        params: {
          fields: JSON.stringify(['leave_type','total_leave_days','from_time','to_time']),
          filters: JSON.stringify([['employee','=',employeeId],['status','=','Approved'],['from_date','>=',`${year}-01-01`]]),
          limit: 200,
        },
      }),
    ]);
    const allocations = allocRes.data.data;
    const applications = appRes.data.data;

    const balances = allocations.map(alloc => {
      const used = applications.filter(a => a.leave_type === alloc.leave_type).reduce((s, a) => s + (a.total_leave_days || 0), 0);
      return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used, remaining: alloc.total_leaves_allocated - used, is_hourly: false, unit: 'days' };
    });

    // Cache as allocations
    await db.leave_allocs.bulkPut(allocations.map(a => ({
      ...a, employee: employeeId, is_hourly: false,
    })));
    return balances;
  } catch {
    // Fallback: compute from DB
    return getLeaveBalance(employeeId); // recursive — now in DEMO branch which uses DB
  }
}

export async function getAllApprovedLeaves() {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('leave_apps').select('*').eq('status', 'Approved').order('from_date', { ascending: false });
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    const rows = await db.leave_apps.where('status').equals('Approved').toArray();
    return rows.sort((a, b) => (b.from_date > a.from_date ? 1 : -1));
  }
  try {
    const res = await client.get('/api/resource/Leave Application', {
      params: {
        fields: JSON.stringify(['name','employee','employee_name','leave_type','from_date','to_date','total_leave_days','status','description','from_time','to_time','total_hours']),
        filters: JSON.stringify([['status','=','Approved']]),
        limit: 500, order_by: 'from_date desc',
      },
    });
    return res.data.data;
  } catch {
    return db.leave_apps.where('status').equals('Approved').toArray();
  }
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function submitLeaveApplication(data) {
  if (SUPABASE_MODE) {
    const isHourly = data.is_hourly;
    // Date validation
    if (!isHourly && data.from_date && data.to_date && data.from_date > data.to_date) {
      throw { response: { data: { message: 'End date must be on or after start date.' } } };
    }
    // Duplicate check
    const { data: dup } = await supabase.from('leave_apps')
      .select('name').eq('employee', data.employee).eq('leave_type', data.leave_type)
      .eq('from_date', data.from_date).neq('status', 'Rejected').maybeSingle();
    if (dup) throw { response: { data: { message: `A ${data.leave_type} request for ${data.from_date} already exists.` } } };

    if (isHourly) {
      const hrs = calcHours(data.from_time, data.to_time);
      if (hrs <= 0) throw { response: { data: { message: 'To time must be after from time.' } } };
      const record = { name: `HLAPPL-${Date.now()}`, employee: data.employee, employee_name: data.employee_name, leave_type: 'Hourly Leave', from_date: data.from_date, from_time: data.from_time, to_time: data.to_time, total_hours: hrs, total_leave_days: 0, status: 'Open', description: data.description || '', is_hourly: true, approval_stage: 'Pending Manager', posting_date: data.from_date };
      const { data: inserted, error } = await supabase.from('leave_apps').insert(record).select().single();
      if (error) throw error;
      return inserted;
    }
    const days = calcDays(data.from_date, data.to_date);
    const record = { name: `LAPPL-${Date.now()}`, employee: data.employee, employee_name: data.employee_name, leave_type: data.leave_type, from_date: data.from_date, to_date: data.to_date, total_leave_days: days, total_hours: 0, status: 'Open', description: data.description || '', is_hourly: false, approval_stage: 'Pending Manager', posting_date: data.from_date };
    const { data: inserted, error } = await supabase.from('leave_apps').insert(record).select().single();
    if (error) throw error;
    return inserted;
  }
  if (DEMO) {
    // Validate dates
    if (!data.is_hourly && data.from_date && data.to_date && data.from_date > data.to_date) {
      throw { response: { data: { message: 'End date must be on or after start date.' } } };
    }
    // Duplicate check
    const duplicate = await db.leave_apps
      .where('employee').equals(data.employee)
      .filter(l =>
        l.status !== 'Rejected' &&
        l.leave_type === data.leave_type &&
        l.from_date === data.from_date
      )
      .first();
    if (duplicate) {
      throw { response: { data: { message: `A ${data.leave_type} request for ${data.from_date} already exists.` } } };
    }
    const isHourly = data.is_hourly;
    if (isHourly) {
      const hrs = calcHours(data.from_time, data.to_time);
      if (hrs <= 0) throw { response: { data: { message: 'To time must be after from time.' } } };
      const bal = (await getLeaveBalance(data.employee)).find(b => b.is_hourly);
      if (bal && hrs > bal.remaining) throw { response: { data: { message: `Only ${bal.remaining}h remaining.` } } };
      const record = { ...data, name: `HLAPPL-${Date.now()}`, status: 'Open', total_hours: hrs, leave_type: 'Hourly Leave', is_hourly: true, approval_stage: 'Pending Manager' };
      await db.leave_apps.put(record);
      return record;
    }
    const days = calcDays(data.from_date, data.to_date);
    const bal  = (await getLeaveBalance(data.employee)).find(b => b.leave_type === data.leave_type && !b.is_hourly);
    if (bal && days > bal.remaining) throw { response: { data: { message: `Only ${bal.remaining} day(s) remaining for ${data.leave_type}.` } } };
    const record = { ...data, name: `LAPPL-${Date.now()}`, status: 'Open', total_leave_days: days, is_hourly: false, approval_stage: 'Pending Manager' };
    await db.leave_apps.put(record);
    return record;
  }

  const payload = { ...data };
  delete payload.is_hourly;

  const localName = `PENDING-${Date.now()}`;
  const optimistic = { ...payload, name: localName, status: 'Open', is_hourly: !!data.is_hourly, _pending: true };
  await db.leave_apps.put(optimistic);

  if (!navigator.onLine) {
    await enqueuePendingOp({ table: 'leave_apps', method: 'POST', endpoint: '/api/resource/Leave Application', payload, localName });
    return optimistic;
  }

  try {
    const res = await client.post('/api/resource/Leave Application', payload);
    const record = { ...res.data.data, is_hourly: !!data.is_hourly, _pending: false };
    await db.leave_apps.delete(localName);
    await db.leave_apps.put(record);
    return record;
  } catch (e) {
    await enqueuePendingOp({ table: 'leave_apps', method: 'POST', endpoint: '/api/resource/Leave Application', payload, localName });
    throw e;
  }
}

export async function updateLeaveStatus(name, action, actorRole = 'manager') {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('leave_apps').select('*').eq('name', name).single();
    if (!existing) return null;

    if (action === 'Rejected') {
      const { data: updated } = await supabase.from('leave_apps').update({ status: 'Rejected', approval_stage: 'Rejected' }).eq('name', name).select().single();
      return updated;
    }

    const stage = existing.approval_stage || 'Pending Manager';
    let updates;
    if (stage === 'Pending Manager' || stage === 'Open') {
      updates = isPaidLeave(existing.leave_type)
        ? { status: 'Approved', approval_stage: 'Approved' }
        : { approval_stage: 'Pending HR' };
    } else if (stage === 'Pending HR') {
      updates = { status: 'Approved', approval_stage: 'Approved' };
      // Apply unpaid deduction to payroll
      const days = existing.total_leave_days || 1;
      const { data: prs } = await supabase.from('payroll').select('*')
        .eq('employee_id', existing.employee)
        .lte('period_start', existing.from_date)
        .gte('period_end', existing.from_date);
      for (const pr of (prs || [])) {
        const deduction = Math.round((pr.base_salary + pr.additional_salary) / 30 * days);
        await supabase.from('payroll').update({
          working_days: Math.max(0, pr.working_days - days),
          calculated_salary: Math.max(0, pr.calculated_salary - deduction),
        }).eq('id', pr.id);
      }
    } else {
      return existing;
    }

    const { data: updated } = await supabase.from('leave_apps').update(updates).eq('name', name).select().single();
    return updated;
  }
  if (DEMO) {
    const existing = await db.leave_apps.get(name);
    if (!existing) return null;

    // Reject at any stage
    if (action === 'Rejected') {
      const updated = { ...existing, status: 'Rejected', approval_stage: 'Rejected' };
      await db.leave_apps.put(updated);
      return updated;
    }

    // Approve — stage-aware
    const stage = existing.approval_stage || 'Pending Manager';
    let updated;

    if (stage === 'Pending Manager' || stage === 'Open') {
      if (isPaidLeave(existing.leave_type)) {
        // Paid leave: manager approval is final
        updated = { ...existing, status: 'Approved', approval_stage: 'Approved' };
      } else {
        // Unpaid leave: move to HR queue
        updated = { ...existing, approval_stage: 'Pending HR' };
      }
    } else if (stage === 'Pending HR') {
      // HR final approval
      updated = { ...existing, status: 'Approved', approval_stage: 'Approved' };
      await applyUnpaidLeaveDeduction(existing);
    } else {
      return existing;
    }

    await db.leave_apps.put(updated);
    return updated;
  }

  const apiAction = action === 'Approved' ? 'Approve' : 'Reject';
  try {
    const docRes = await client.get(`/api/resource/Leave Application/${name}`);
    const doc = docRes.data.data;
    await client.post('/api/method/frappe.model.workflow.apply_workflow', {
      doc: JSON.stringify({ ...doc, doctype: 'Leave Application' }),
      action: apiAction,
    });
  } catch {
    await client.put(`/api/resource/Leave Application/${name}`, { status: action });
  }

  const existing = await db.leave_apps.get(name);
  if (existing) await db.leave_apps.put({ ...existing, status: action });
  return { name, status: action };
}
