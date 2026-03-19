import { db } from '../db/index';
import { MOCK_LEAVE_APPLICATIONS, MOCK_HOURLY_APPLICATIONS, MOCK_ALLOCATIONS_V2, MOCK_EMPLOYEES } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { addNotification, notifyRole } from './notifications';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Leave Policy Constants ───────────────────────────────────────────────────
// Annual leave quota by employee type (days/year), accrued at 2 days/month
export const ANNUAL_LEAVE_MAX        = { Office: 21, Field: 12 };
export const MONTHLY_LEAVE_ACCRUAL   = 2;   // days credited at start of each month
export const HOURLY_LEAVE_MONTHLY    = 4;   // hours available each calendar month (resets monthly)
export const LATE_DEDUCTION_MINUTES  = 16;  // minutes deducted from hourly leave on late morning check-in
export const LATE_SALARY_PER_QUARTER = 2_000; // IQD per 15-min quarter when no hourly balance
export const ABSENCE_SALARY_DEDUCTION = 16_000; // IQD deducted per absent day

// Returns how many annual leave days have been accrued so far this year.
// Uses Baghdad timezone so the month is correct regardless of the user's browser locale (Issue 10).
// Policy: 2 days credited at the start of each month (Jan=2, Feb=4, …).
function getAccruedAnnualDays(annualMax) {
  const baghdadDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
  const month = parseInt(baghdadDate.slice(5, 7), 10); // 1=Jan … 12=Dec
  return Math.min(month * MONTHLY_LEAVE_ACCRUAL, annualMax);
}

// Fetch employee type ('Office' | 'Field') for leave-balance calculations
async function getEmployeeType(employeeId) {
  if (SUPABASE_MODE) {
    const { data } = await supabase
      .from('employees_public').select('employee_type').eq('name', employeeId).maybeSingle();
    return data?.employee_type || 'Office';
  }
  if (DEMO) {
    const emp = await db.employees.get(employeeId).catch(() => null);
    if (emp?.employee_type) return emp.employee_type;
    const mock = MOCK_EMPLOYEES.find(e => e.name === employeeId);
    return mock?.employee_type || 'Office';
  }
  return 'Office';
}

// Count working days (excluding Friday) between two YYYY-MM-DD strings.
// Returns 0 if the range is invalid OR covers only Fridays — callers must
// validate and reject a 0-day result (Issue 9: no longer forces minimum 1).
export function calcDays(from, to) {
  if (!from || !to || to < from) return 0;
  let count = 0;
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to   + 'T12:00:00');
  while (cur <= end) {
    if (cur.getDay() !== 5) count++; // 5 = Friday
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const HOURLY_LEAVE_TYPE = 'Hourly Leave';

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
    if (pr.status === 'Paid') continue; // never mutate settled payroll
    const newDays   = Math.max(0, pr.working_days - days);
    const newSalary = Math.max(0,
      Math.round(((pr.base_salary + (pr.additional_salary || 0)) / 30) * newDays)
      + (pr.friday_bonus    || 0)
      + (pr.extra_day_bonus || 0)
      - (pr.late_deductions    || 0)
      - (pr.absence_deductions || 0)
    );
    await db.payroll.put({ ...pr, working_days: newDays, calculated_salary: newSalary });
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getLeaveApplications(employeeId, { status = '' } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('leave_apps')
      .select('name, leave_type, from_date, to_date, total_leave_days, total_hours, is_hourly, status, approval_stage, description, from_time, to_time, posting_date, is_auto_deduction')
      .eq('employee', employeeId);
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
      // Get direct reports via employees_public (no PII needed, and accessible to all managers)
      const { data: reports } = await supabase.from('employees_public').select('name').eq('reports_to', managerId);
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
  const FALLBACK = ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Hourly Leave', 'Emergency Leave', 'Unpaid Leave'];
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('leave_allocs').select('leave_type').limit(500);
    const types = [...new Set((data || []).map(r => r.leave_type).filter(Boolean))].sort();
    return types.length ? types : FALLBACK;
  }
  if (DEMO) return ['Annual Leave', 'Sick Leave', 'Casual Leave', 'Emergency Leave', 'Unpaid Leave'];
  return [];
}

export async function getLeaveBalance(employeeId) {
  const baghdadToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
  const thisMonth   = baghdadToday.slice(0, 7); // "YYYY-MM" in Baghdad time
  const currentYear = parseInt(baghdadToday.slice(0, 4), 10);

  if (SUPABASE_MODE) {
    const { data: rawAllocs } = await supabase.from('leave_allocs').select('*')
      .eq('employee', employeeId).eq('leave_year', currentYear);
    const { data: approved } = await supabase.from('leave_apps')
      .select('leave_type, total_leave_days, total_hours, from_date, is_hourly')
      .eq('employee', employeeId).in('status', ['Approved', 'Open'])
      .gte('from_date', `${currentYear}-01-01`)
      .lte('from_date', `${currentYear}-12-31`);
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
        // Monthly hourly quota: 4 hours per month, resets at start of each month
        const usedThisMonth = (approved || [])
          .filter(l => l.leave_type === alloc.leave_type && l.is_hourly && l.from_date.startsWith(thisMonth))
          .reduce((s, l) => s + (l.total_hours || 0), 0);
        const remaining = HOURLY_LEAVE_MONTHLY - usedThisMonth;
        return { leave_type: alloc.leave_type, allocated: HOURLY_LEAVE_MONTHLY, used: usedThisMonth, remaining, exceeded: remaining < 0, is_hourly: true, unit: 'hrs', monthly: true };
      }
      if (alloc.leave_type === 'Annual Leave') {
        // Monthly accrual: 2 days/month, capped at annual max (21 Office / 12 Field)
        const accrued = getAccruedAnnualDays(alloc.total_leaves_allocated);
        const used    = (approved || []).filter(l => l.leave_type === 'Annual Leave' && !l.is_hourly)
          .reduce((s, l) => s + (l.total_leave_days || 0), 0);
        const remaining = accrued - used;
        return { leave_type: alloc.leave_type, allocated: accrued, used, remaining, exceeded: remaining < 0, is_hourly: false, unit: 'days', annualMax: alloc.total_leaves_allocated };
      }
      const used      = (approved || []).filter(l => l.leave_type === alloc.leave_type && !l.is_hourly)
        .reduce((s, l) => s + (l.total_leave_days || 0), 0);
      const remaining = alloc.total_leaves_allocated - used;
      return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used, remaining, exceeded: remaining < 0, is_hourly: false, unit: 'days' };
    });
  }
  if (DEMO) {
    const empType  = await getEmployeeType(employeeId);
    const annualMax = ANNUAL_LEAVE_MAX[empType] ?? ANNUAL_LEAVE_MAX.Office;
    let allocs = await db.leave_allocs.where('employee').equals(employeeId).toArray();
    if (allocs.length === 0) allocs = MOCK_ALLOCATIONS_V2.map(a => ({ ...a, employee: employeeId }));
    let approved = await db.leave_apps
      .where('employee').equals(employeeId)
      .filter(l => l.status === 'Approved' || l.status === 'Open')
      .toArray();
    if (approved.length === 0) {
      approved = MOCK_LEAVE_APPLICATIONS.filter(l => l.employee === employeeId && (l.status === 'Approved' || l.status === 'Open'));
    }

    return allocs.map(alloc => {
      if (alloc.is_hourly) {
        // Monthly hourly quota: 4 hours per month
        const usedThisMonth = approved
          .filter(l => l.leave_type === alloc.leave_type && l.is_hourly && l.from_date.startsWith(thisMonth))
          .reduce((s, l) => s + (l.total_hours || 0), 0);
        const remaining = HOURLY_LEAVE_MONTHLY - usedThisMonth;
        return { leave_type: alloc.leave_type, allocated: HOURLY_LEAVE_MONTHLY, used: usedThisMonth, remaining, exceeded: remaining < 0, is_hourly: true, unit: 'hrs', monthly: true };
      }
      if (alloc.leave_type === 'Annual Leave') {
        // Monthly accrual based on employee type
        const accrued = getAccruedAnnualDays(annualMax);
        const usedDays = approved
          .filter(l => l.leave_type === 'Annual Leave' && !l.is_hourly)
          .reduce((s, l) => s + (l.total_leave_days || 0), 0);
        const remaining = accrued - usedDays;
        return { leave_type: alloc.leave_type, allocated: accrued, used: usedDays, remaining, exceeded: remaining < 0, is_hourly: false, unit: 'days', annualMax };
      }
      const usedDays = approved
        .filter(l => l.leave_type === alloc.leave_type && !l.is_hourly)
        .reduce((s, l) => s + (l.total_leave_days || 0), 0);
      return { leave_type: alloc.leave_type, allocated: alloc.total_leaves_allocated, used: usedDays, remaining: alloc.total_leaves_allocated - usedDays, is_hourly: false, unit: 'days' };
    });
  }

  return [];
}

export async function getAllApprovedLeaves({ year = new Date().getFullYear() } = {}) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('leave_apps').select('*')
      .eq('status', 'Approved')
      .gte('from_date', `${year}-01-01`)
      .lte('from_date', `${year}-12-31`)
      .order('from_date', { ascending: false });
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
    const currentYear = parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date()).slice(0, 4), 10);
    // Date validation
    if (!isHourly && data.from_date && data.to_date && data.from_date > data.to_date) {
      throw new Error('End date must be on or after start date.');
    }
    // Overlap duplicate check (catches same-date AND overlapping ranges)
    if (!isHourly) {
      const { data: dup } = await supabase.from('leave_apps')
        .select('name').eq('employee', data.employee).eq('leave_type', data.leave_type)
        .neq('status', 'Rejected')
        .lte('from_date', data.to_date)
        .gte('to_date',   data.from_date)
        .maybeSingle();
      if (dup) throw new Error(`An overlapping ${data.leave_type} request already exists for that period.`);
    }

    if (isHourly) {
      const hrs = calcHours(data.from_time, data.to_time);
      if (hrs <= 0) throw new Error('To time must be after from time.');
      // Monthly quota check: 4 hours per month, resets each month
      const reqMonth = (data.from_date || '').slice(0, 7); // "YYYY-MM"
      const { data: hourlyUsed } = await supabase.from('leave_apps')
        .select('total_hours').eq('employee', data.employee).eq('leave_type', HOURLY_LEAVE_TYPE)
        .in('status', ['Approved', 'Open']).eq('is_hourly', true)
        .gte('from_date', `${reqMonth}-01`).lte('from_date', `${reqMonth}-31`);
      const usedThisMonth = (hourlyUsed || []).reduce((s, r) => s + (r.total_hours || 0), 0);
      const monthlyRemaining = HOURLY_LEAVE_MONTHLY - usedThisMonth;
      if (hrs > monthlyRemaining) throw new Error(`Only ${Math.max(0, monthlyRemaining).toFixed(1)}h remaining this month (${HOURLY_LEAVE_MONTHLY}h monthly quota).`);
      const record = { name: `HLAPPL-${crypto.randomUUID()}`, employee: data.employee, employee_name: data.employee_name, leave_type: HOURLY_LEAVE_TYPE, from_date: data.from_date, from_time: data.from_time, to_time: data.to_time, total_hours: hrs, total_leave_days: 0, status: 'Open', description: data.description || '', is_hourly: true, approval_stage: 'Pending Manager', posting_date: data.from_date };
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
    // Server-side balance check — include Open (pending) to prevent double-submission bypass
    const { data: balRows } = await supabase.from('leave_allocs')
      .select('total_leaves_allocated')
      .eq('employee', data.employee).eq('leave_type', data.leave_type).eq('is_hourly', false)
      .eq('leave_year', currentYear);
    const { data: usedRows } = await supabase.from('leave_apps')
      .select('total_leave_days').eq('employee', data.employee).eq('leave_type', data.leave_type)
      .in('status', ['Approved', 'Open']).eq('is_hourly', false);
    const allocated = (balRows  || []).reduce((s, r) => s + r.total_leaves_allocated, 0);
    const used      = (usedRows || []).reduce((s, r) => s + (r.total_leave_days || 0), 0);
    if (allocated > 0 && days > allocated - used) {
      throw new Error(`Only ${Math.max(0, allocated - used)} day(s) remaining for ${data.leave_type}.`);
    }
    const record = { name: `LAPPL-${crypto.randomUUID()}`, employee: data.employee, employee_name: data.employee_name, leave_type: data.leave_type, from_date: data.from_date, to_date: data.to_date, total_leave_days: days, total_hours: 0, status: 'Open', description: data.description || '', is_hourly: false, approval_stage: 'Pending Manager', posting_date: data.from_date };
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
        l.from_date <= data.to_date &&
        l.to_date   >= data.from_date
      )
      .first();
    if (duplicate) {
      throw new Error(`An overlapping ${data.leave_type} request already exists for that period.`);
    }
    const isHourly = data.is_hourly;
    if (isHourly) {
      const hrs = calcHours(data.from_time, data.to_time);
      if (hrs <= 0) throw new Error('To time must be after from time.');
      const bal = (await getLeaveBalance(data.employee)).find(b => b.is_hourly);
      if (bal && hrs > bal.remaining) throw new Error(`Only ${Math.max(0, bal.remaining).toFixed(1)}h remaining this month (${HOURLY_LEAVE_MONTHLY}h monthly quota).`);
      const record = { ...data, name: `HLAPPL-${crypto.randomUUID()}`, status: 'Open', total_hours: hrs, leave_type: HOURLY_LEAVE_TYPE, is_hourly: true, approval_stage: 'Pending Manager' };
      await db.leave_apps.put(record);
      return record;
    }
    const days = calcDays(data.from_date, data.to_date);
    const bal  = (await getLeaveBalance(data.employee)).find(b => b.leave_type === data.leave_type && !b.is_hourly);
    if (bal && days > bal.remaining) throw new Error(`Only ${bal.remaining} day(s) remaining for ${data.leave_type}.`);
    const record = { ...data, name: `LAPPL-${crypto.randomUUID()}`, status: 'Open', total_leave_days: days, is_hourly: false, approval_stage: 'Pending Manager' };
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
      // Apply unpaid deduction to payroll (only Draft/Submitted — never touch Paid records)
      const days = existing.total_leave_days || 1;
      const { data: prs } = await supabase.from('payroll').select('*')
        .eq('employee_id', existing.employee)
        .lte('period_start', existing.from_date)
        .gte('period_end', existing.from_date);
      for (const pr of (prs || [])) {
        if (pr.status === 'Paid') continue; // never mutate a settled payroll record
        const newDays   = Math.max(0, pr.working_days - days);
        const newSalary = Math.max(0,
          Math.round(((pr.base_salary + (pr.additional_salary || 0)) / 30) * newDays)
          + (pr.friday_bonus    || 0)
          + (pr.extra_day_bonus || 0)
          - (pr.late_deductions    || 0)
          - (pr.absence_deductions || 0)
        );
        await supabase.from('payroll').update({
          working_days:      newDays,
          calculated_salary: newSalary,
        }).eq('id', pr.id);
        // Log the deduction for audit trail
        await supabase.from('payroll_log').insert({
          payroll_id: pr.id, action: 'Unpaid Leave Deduction',
          performed_by: existing.employee, performed_by_name: existing.employee_name,
          notes: `Deducted ${newSalary} IQD (${days}d unpaid leave from ${existing.from_date})`,
        }).catch(() => {});
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

// ─── Late Check-In Hourly Deduction ──────────────────────────────────────────
// Called from attendance.js on late morning check-in.
// Deducts LATE_DEDUCTION_MINUTES (16 min) from the employee's monthly hourly balance.
// Returns true if the deduction was applied, false if there was no balance left.
export async function applyLateHourlyDeduction(employeeId, employeeName, date) {
  const DEDUCTION_HRS = LATE_DEDUCTION_MINUTES / 60;
  const monthPrefix   = (date || '').slice(0, 7); // "YYYY-MM"

  // Compute how many hourly-leave hours have been used this month
  let usedThisMonth = 0;
  if (SUPABASE_MODE) {
    const { data: rows } = await supabase.from('leave_apps')
      .select('total_hours')
      .eq('employee', employeeId).eq('leave_type', HOURLY_LEAVE_TYPE).eq('is_hourly', true)
      .in('status', ['Approved', 'Open'])
      .gte('from_date', `${monthPrefix}-01`).lte('from_date', `${monthPrefix}-31`);
    usedThisMonth = (rows || []).reduce((s, r) => s + (r.total_hours || 0), 0);
  } else if (DEMO) {
    const rows = await db.leave_apps
      .where('employee').equals(employeeId)
      .filter(l => l.leave_type === HOURLY_LEAVE_TYPE && l.is_hourly
        && (l.status === 'Approved' || l.status === 'Open')
        && l.from_date.startsWith(monthPrefix))
      .toArray();
    usedThisMonth = rows.reduce((s, r) => s + (r.total_hours || 0), 0);
  }

  const remaining = HOURLY_LEAVE_MONTHLY - usedThisMonth;
  if (remaining < DEDUCTION_HRS) return false; // not enough balance

  const record = {
    name:              `LATE-${crypto.randomUUID()}`,
    employee:          employeeId,
    employee_name:     employeeName,
    leave_type:        HOURLY_LEAVE_TYPE,
    from_date:         date,
    from_time:         '00:00',
    to_time:           `00:${String(LATE_DEDUCTION_MINUTES).padStart(2, '0')}`,
    total_hours:       DEDUCTION_HRS,
    total_leave_days:  0,
    status:            'Approved',
    is_hourly:         true,
    is_auto_deduction: true, // flag so leave-history UI can label/filter this row (Issue 14)
    approval_stage:    'Approved',
    posting_date:      date,
    description:       'Auto-deducted: late check-in',
  };

  if (SUPABASE_MODE) {
    await supabase.from('leave_apps').insert(record).catch(() => {});
  } else if (DEMO) {
    await db.leave_apps.put(record);
  }
  return true;
}
