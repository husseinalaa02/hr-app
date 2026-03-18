import { db } from '../db/index';
import { MOCK_LEAVE_APPLICATIONS, MOCK_HOURLY_APPLICATIONS, MOCK_ALLOCATIONS_V2, MOCK_EMPLOYEES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { addNotification, notifyRole } from './notifications';

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

  return [];
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
  return [];
}

export async function getLeaveTypes() {
  if (SUPABASE_MODE) {
    return ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Hourly Leave', 'Emergency Leave', 'Unpaid Leave'];
  }
  if (DEMO) return ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Emergency Leave', 'Unpaid Leave'];
  return [];
}

export async function getLeaveBalance(employeeId) {
  if (SUPABASE_MODE) {
    const { data: rawAllocs } = await supabase.from('leave_allocs').select('*').eq('employee', employeeId);
    const { data: approved } = await supabase.from('leave_apps').select('*')
      .eq('employee', employeeId).eq('status', 'Approved');
    // Deduplicate: if the same leave_type appears more than once, merge by summing allocated
    const allocMap = {};
    for (const a of rawAllocs || []) {
      const key = `${a.leave_type}::${a.is_hourly ? '1' : '0'}`;
      if (allocMap[key]) allocMap[key].total_leaves_allocated += a.total_leaves_allocated;
      else allocMap[key] = { ...a };
    }
    const allocs = Object.values(allocMap);
    return allocs.map(alloc => {
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

  return [];
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
  return [];
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function submitLeaveApplication(data) {
  if (SUPABASE_MODE) {
    const isHourly = data.is_hourly;
    // Date validation
    if (!isHourly && data.from_date && data.to_date && data.from_date > data.to_date) {
      throw new Error('End date must be on or after start date.');
    }
    // Duplicate check
    const { data: dup } = await supabase.from('leave_apps')
      .select('name').eq('employee', data.employee).eq('leave_type', data.leave_type)
      .eq('from_date', data.from_date).neq('status', 'Rejected').maybeSingle();
    if (dup) throw new Error(`A ${data.leave_type} request for ${data.from_date} already exists.`);

    if (isHourly) {
      const hrs = calcHours(data.from_time, data.to_time);
      if (hrs <= 0) throw new Error('To time must be after from time.');
      const record = { name: `HLAPPL-${Date.now()}`, employee: data.employee, employee_name: data.employee_name, leave_type: 'Hourly Leave', from_date: data.from_date, from_time: data.from_time, to_time: data.to_time, total_hours: hrs, total_leave_days: 0, status: 'Open', description: data.description || '', is_hourly: true, approval_stage: 'Pending Manager', posting_date: data.from_date };
      const { data: inserted, error } = await supabase.from('leave_apps').insert(record).select().single();
      if (error) throw error;
      notifyRole(['hr_manager', 'admin'], {
        title: 'New Hourly Leave Request',
        message: `${data.employee_name} requested ${hrs}h leave on ${data.from_date}.`,
        type: 'leave',
      }).catch(() => {});
      return inserted;
    }
    const days = calcDays(data.from_date, data.to_date);
    const record = { name: `LAPPL-${Date.now()}`, employee: data.employee, employee_name: data.employee_name, leave_type: data.leave_type, from_date: data.from_date, to_date: data.to_date, total_leave_days: days, total_hours: 0, status: 'Open', description: data.description || '', is_hourly: false, approval_stage: 'Pending Manager', posting_date: data.from_date };
    const { data: inserted, error } = await supabase.from('leave_apps').insert(record).select().single();
    if (error) throw error;
    notifyRole(['hr_manager', 'admin'], {
      title: 'New Leave Request',
      message: `${data.employee_name} requested ${data.leave_type} from ${data.from_date} to ${data.to_date} (${days}d).`,
      type: 'leave',
    }).catch(() => {});
    return inserted;
  }
  if (DEMO) {
    // Validate dates
    if (!data.is_hourly && data.from_date && data.to_date && data.from_date > data.to_date) {
      throw new Error('End date must be on or after start date.');
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
      throw new Error(`A ${data.leave_type} request for ${data.from_date} already exists.`);
    }
    const isHourly = data.is_hourly;
    if (isHourly) {
      const hrs = calcHours(data.from_time, data.to_time);
      if (hrs <= 0) throw new Error('To time must be after from time.');
      const bal = (await getLeaveBalance(data.employee)).find(b => b.is_hourly);
      if (bal && hrs > bal.remaining) throw new Error(`Only ${bal.remaining}h remaining.`);
      const record = { ...data, name: `HLAPPL-${Date.now()}`, status: 'Open', total_hours: hrs, leave_type: 'Hourly Leave', is_hourly: true, approval_stage: 'Pending Manager' };
      await db.leave_apps.put(record);
      return record;
    }
    const days = calcDays(data.from_date, data.to_date);
    const bal  = (await getLeaveBalance(data.employee)).find(b => b.leave_type === data.leave_type && !b.is_hourly);
    if (bal && days > bal.remaining) throw new Error(`Only ${bal.remaining} day(s) remaining for ${data.leave_type}.`);
    const record = { ...data, name: `LAPPL-${Date.now()}`, status: 'Open', total_leave_days: days, is_hourly: false, approval_stage: 'Pending Manager' };
    await db.leave_apps.put(record);
    return record;
  }

  throw new Error('No backend available');
}

export async function updateLeaveStatus(name, action, actorRole = 'manager') {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('leave_apps').select('*').eq('name', name).single();
    if (!existing) return null;

    if (action === 'Rejected') {
      const { data: updated } = await supabase.from('leave_apps').update({ status: 'Rejected', approval_stage: 'Rejected' }).eq('name', name).select().single();
      addNotification({
        recipient_id: existing.employee,
        title: 'Leave Request Rejected',
        message: `Your ${existing.leave_type} request (${existing.from_date}) has been rejected.`,
        type: 'leave',
      }).catch(() => {});
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

    if (updates.status === 'Approved') {
      addNotification({
        recipient_id: existing.employee,
        title: 'Leave Request Approved',
        message: `Your ${existing.leave_type} request (${existing.from_date}) has been approved.`,
        type: 'leave',
      }).catch(() => {});
    } else if (updates.approval_stage === 'Pending HR') {
      // Notify HR that this leave needs their final approval
      notifyRole('hr_manager', {
        title: 'Leave Awaiting HR Approval',
        message: `${existing.employee_name}'s unpaid leave (${existing.from_date}) is pending HR approval.`,
        type: 'leave',
      }).catch(() => {});
    }

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

  return null;
}
