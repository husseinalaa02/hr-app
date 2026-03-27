import { db } from '../db/index';
import { MOCK_PAYROLL_RECORDS } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { ABSENCE_SALARY_DEDUCTION } from './leave';
import { logAction } from './auditLog';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Salary Calculation ────────────────────────────────────────────────────────
// Daily Salary = (Base Salary + Additional Salary) ÷ 30
// Final Salary = Daily Salary × Working Days
// The additional salary is NEVER added separately — it is always part of the daily rate.
export function calcDailySalary(baseSalary, additionalSalary) {
  return (baseSalary + additionalSalary) / 30;
}

export function calcFinalSalary(baseSalary, additionalSalary, workingDays) {
  return Math.round(calcDailySalary(baseSalary, additionalSalary) * workingDays);
}

// Scan attendance records for a period and compute salary deductions:
//  - Absent days: ABSENCE_SALARY_DEDUCTION (16,000 IQD) each
//  - Late without hourly leave: salary_deduction_iqd stored on attendance row
async function computeAttendanceDeductions(employeeId, periodStart, periodEnd) {
  let late_deductions = 0;
  let absence_deductions = 0;

  if (SUPABASE_MODE) {
    const { data: rows } = await supabase
      .from('attendance').select('status, salary_deduction_iqd')
      .eq('employee', employeeId)
      .gte('attendance_date', periodStart)
      .lte('attendance_date', periodEnd);
    for (const row of (rows || [])) {
      if (row.status === 'Absent') absence_deductions += ABSENCE_SALARY_DEDUCTION;
      late_deductions += (row.salary_deduction_iqd || 0);
    }
  } else if (DEMO) {
    const rows = await db.attendance
      .where('employee').equals(employeeId)
      .filter(r => r.attendance_date >= periodStart && r.attendance_date <= periodEnd)
      .toArray();
    for (const row of rows) {
      if (row.status === 'Absent') absence_deductions += ABSENCE_SALARY_DEDUCTION;
      late_deductions += (row.salary_deduction_iqd || 0);
    }
  }

  return { late_deductions, absence_deductions };
}

export function calcExtraDayValue(baseSalary) {
  return Math.round(baseSalary / 30);
}

export const FRIDAY_DAY_FIXED = 25_000;

// ─── Single source of truth for final salary ──────────────────────────────────
// All three paths (create / update / recalculate) must use this function so the
// formula can never drift between them (Issue 13 / Issue 2 fix).
export function buildCalculatedSalary(base, additional, days, fridayBonus, extraBonus, lateDeductions, absenceDeductions) {
  return Math.max(0,
    calcFinalSalary(base, additional, days)
    + fridayBonus + extraBonus
    - (lateDeductions || 0) - (absenceDeductions || 0)
  );
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getPayrollRecords({ employeeId = '', month = '', year = '', page = 1, pageSize = 200 } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('payroll').select('*');
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (month && year) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      query = query.gte('period_start', `${prefix}-01`).lte('period_start', `${prefix}-31`);
    }
    const from = (page - 1) * pageSize;
    const { data, error } = await query
      .order('period_start', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return data || [];
  }
  if (DEMO) {
    let list = await db.payroll.toArray();
    if (list.length === 0) list = [...MOCK_PAYROLL_RECORDS];
    if (employeeId) list = list.filter(r => r.employee_id === employeeId);
    if (month && year) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      list = list.filter(r => r.period_start.startsWith(prefix));
    }
    return list.sort((a, b) => b.period_start.localeCompare(a.period_start));
  }
  return [];
}

export async function getPayrollRecord(id) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('payroll').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw error;
    }
    return data;
  }
  if (DEMO) return db.payroll.get(Number(id));
  return null;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createPayroll(data, performer = null) {
  const base       = Number(data.base_salary)      || 0;
  const additional = Number(data.additional_salary) || 0;
  const days       = Number(data.working_days)      || 30;

  const friday_bonus    = Number(data.friday_bonus)    || 0;
  const extra_day_bonus = Number(data.extra_day_bonus) || 0;

  // Auto-compute attendance deductions for the period
  const { late_deductions, absence_deductions } = await computeAttendanceDeductions(
    data.employee_id, data.period_start, data.period_end
  ).catch(() => ({ late_deductions: 0, absence_deductions: 0 }));

  const calculated_salary = buildCalculatedSalary(base, additional, days, friday_bonus, extra_day_bonus, late_deductions, absence_deductions);

  const record = {
    employee_id:        data.employee_id,
    employee_name:      data.employee_name,
    period_start:       data.period_start,
    period_end:         data.period_end,
    base_salary:        base,
    additional_salary:  additional,
    working_days:       days,
    friday_bonus,
    extra_day_bonus,
    late_deductions,
    absence_deductions,
    calculated_salary,
    status:             'Draft',
    payroll_date:       data.payroll_date || data.period_end,
    submitted_by: null, submitted_by_name: null, submitted_at: null,
    paid_by: null,      paid_by_name: null,       paid_at: null,
  };

  if (SUPABASE_MODE) {
    const { data: inserted, error } = await supabase.from('payroll').insert(record).select().single();
    if (error) throw error;
    if (performer) {
      await addLog(inserted.id, 'Created', performer.name, performer.employee_name, '');
      logAction({ userId: performer.name, userName: performer.employee_name, role: performer.role, action: 'CREATE', resource: 'payroll', resourceId: String(inserted.id), resourceLabel: `${record.employee_name} – ${record.period_start}` }).catch(() => {});
    }
    return inserted;
  }
  if (DEMO) {
    const id = await db.payroll.add(record);
    if (performer) await addLog(id, 'Created', performer.name, performer.employee_name, '');
    return { ...record, id };
  }
  throw new Error('No backend available');
}

export async function updatePayroll(id, data) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('payroll').select('*').eq('id', id).single();
    if (!existing) return null;
    const base            = data.base_salary       ?? existing.base_salary;
    const additional      = data.additional_salary  ?? existing.additional_salary;
    const days            = data.working_days       ?? existing.working_days;
    const friday_bonus    = data.friday_bonus       ?? existing.friday_bonus;
    const extra_day_bonus = data.extra_day_bonus    ?? existing.extra_day_bonus;
    // Preserve existing deductions — updatePayroll never re-scans attendance.
    // Use recalculatePayroll() when deductions need to be refreshed.
    const late_deductions    = existing.late_deductions    || 0;
    const absence_deductions = existing.absence_deductions || 0;
    const calculated_salary  = buildCalculatedSalary(base, additional, days, friday_bonus, extra_day_bonus, late_deductions, absence_deductions);
    const updates = { ...data, base_salary: base, additional_salary: additional, working_days: days,
      friday_bonus, extra_day_bonus, calculated_salary };
    const { data: updated, error } = await supabase.from('payroll').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  if (DEMO) {
    const existing = await db.payroll.get(Number(id));
    if (!existing) return null;
    const base            = data.base_salary       ?? existing.base_salary;
    const additional      = data.additional_salary  ?? existing.additional_salary;
    const days            = data.working_days       ?? existing.working_days;
    const friday_bonus    = data.friday_bonus       ?? existing.friday_bonus;
    const extra_day_bonus = data.extra_day_bonus    ?? existing.extra_day_bonus;
    const late_deductions    = existing.late_deductions    || 0;
    const absence_deductions = existing.absence_deductions || 0;
    const calculated_salary  = buildCalculatedSalary(base, additional, days, friday_bonus, extra_day_bonus, late_deductions, absence_deductions);
    const updated = { ...existing, ...data, base_salary: base, additional_salary: additional,
      working_days: days, friday_bonus, extra_day_bonus, calculated_salary };
    await db.payroll.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

export async function deletePayroll(id) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('payroll').select('status').eq('id', id).single();
    if (existing?.status === 'Paid') throw new Error('Cannot delete a paid payroll record');
    const { error } = await supabase.from('payroll').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  if (DEMO) {
    const existing = await db.payroll.get(Number(id));
    if (existing?.status === 'Paid') throw new Error('Cannot delete a paid payroll record');
    await db.payroll.delete(Number(id));
    return;
  }
}

// Recalculate a payroll record's bonuses from approved day requests
export async function recalculatePayroll(payrollId) {
  if (SUPABASE_MODE) {
    const { data: record, error: recErr } = await supabase
      .from('payroll').select('*').eq('id', payrollId).single();
    if (recErr || !record) return null;

    const { data: allRequests } = await supabase
      .from('day_requests')
      .select('request_type')
      .eq('employee_id', record.employee_id)
      .eq('approval_status', 'Approved')
      .gte('request_date', record.period_start)
      .lte('request_date', record.period_end);

    const fridayCount     = (allRequests || []).filter(r => r.request_type === 'Friday Day').length;
    const extraCount      = (allRequests || []).filter(r => r.request_type === 'Extra Day').length;
    const friday_bonus    = fridayCount * FRIDAY_DAY_FIXED;
    const extra_day_bonus = extraCount  * calcExtraDayValue(record.base_salary);
    const { late_deductions, absence_deductions } = await computeAttendanceDeductions(
      record.employee_id, record.period_start, record.period_end
    ).catch(() => ({ late_deductions: record.late_deductions || 0, absence_deductions: record.absence_deductions || 0 }));
    const calculated_salary = buildCalculatedSalary(record.base_salary, record.additional_salary, record.working_days, friday_bonus, extra_day_bonus, late_deductions, absence_deductions);

    const { data: updated, error: updErr } = await supabase
      .from('payroll')
      .update({ friday_bonus, extra_day_bonus, late_deductions, absence_deductions, calculated_salary })
      .eq('id', payrollId)
      .select()
      .single();
    if (updErr) throw updErr;
    return updated;
  }

  if (DEMO) {
    const record = await db.payroll.get(Number(payrollId));
    if (!record) return null;

    const allRequests = await db.day_requests
      .where('employee_id').equals(record.employee_id)
      .filter(r =>
        r.approval_status === 'Approved' &&
        r.request_date >= record.period_start &&
        r.request_date <= record.period_end
      )
      .toArray();

    const fridayCount     = allRequests.filter(r => r.request_type === 'Friday Day').length;
    const extraCount      = allRequests.filter(r => r.request_type === 'Extra Day').length;
    const friday_bonus    = fridayCount * FRIDAY_DAY_FIXED;
    const extra_day_bonus = extraCount  * calcExtraDayValue(record.base_salary);
    const { late_deductions, absence_deductions } = await computeAttendanceDeductions(
      record.employee_id, record.period_start, record.period_end
    ).catch(() => ({ late_deductions: record.late_deductions || 0, absence_deductions: record.absence_deductions || 0 }));
    const calculated_salary = buildCalculatedSalary(record.base_salary, record.additional_salary, record.working_days, friday_bonus, extra_day_bonus, late_deductions, absence_deductions);

    const updated = { ...record, friday_bonus, extra_day_bonus, late_deductions, absence_deductions, calculated_salary };
    await db.payroll.put(updated);
    return updated;
  }

  throw new Error('No backend available');
}

// ─── Workflow Actions ──────────────────────────────────────────────────────────

async function addLog(payrollId, action, performedBy, performedByName, notes = '') {
  if (SUPABASE_MODE) {
    await supabase.from('payroll_log').insert({
      payroll_id: payrollId, action,
      performed_by: performedBy, performed_by_name: performedByName, notes,
    }).catch(() => {});
    return;
  }
  if (DEMO) {
    await db.payroll_log.add({
      payroll_id: payrollId, action,
      performed_by: performedBy, performed_by_name: performedByName,
      timestamp: new Date().toISOString(), notes,
    });
  }
}

export async function getPayrollLog(payrollId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('payroll_log').select('*')
      .eq('payroll_id', payrollId).order('timestamp');
    if (error) return [];
    return data || [];
  }
  if (DEMO) {
    const rows = await db.payroll_log.where('payroll_id').equals(Number(payrollId)).toArray();
    return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  return [];
}

export async function submitPayroll(id, performer) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('payroll').select('status').eq('id', id).single();
    if (!existing) throw new Error('Payroll record not found');
    if (existing.status !== 'Draft') throw new Error('Only Draft payroll can be submitted');
    const now = new Date().toISOString();
    const updates = {
      status: 'Submitted',
      submitted_by: performer.name, submitted_by_name: performer.employee_name, submitted_at: now,
    };
    const { data: updated, error } = await supabase.from('payroll').update(updates).eq('id', id).select().single();
    if (error) throw error;
    await addLog(Number(id), 'Submitted to Finance', performer.name, performer.employee_name, 'Submitted for payment processing');
    logAction({ userId: performer.name, userName: performer.employee_name, role: performer.role, action: 'UPDATE', resource: 'payroll', resourceId: String(id), resourceLabel: `Submitted to Finance`, details: 'Status → Submitted' }).catch(() => {});
    return updated;
  }
  if (DEMO) {
    const record = await db.payroll.get(Number(id));
    if (!record) throw new Error('Payroll record not found');
    if (record.status !== 'Draft') throw new Error('Only Draft payroll can be submitted');
    const now = new Date().toISOString();
    const updated = {
      ...record, status: 'Submitted',
      submitted_by: performer.name, submitted_by_name: performer.employee_name, submitted_at: now,
    };
    await db.payroll.put(updated);
    await addLog(Number(id), 'Submitted to Finance', performer.name, performer.employee_name, 'Submitted for payment processing');
    return updated;
  }
  throw new Error('No backend available');
}

export async function markAsPaid(id, performer) {
  if (SUPABASE_MODE) {
    const { data: existing } = await supabase.from('payroll').select('status').eq('id', id).single();
    if (!existing) throw new Error('Payroll record not found');
    if (existing.status !== 'Submitted') throw new Error('Only Submitted payroll can be marked as Paid');
    const now = new Date().toISOString();
    const updates = {
      status: 'Paid',
      paid_by: performer.name, paid_by_name: performer.employee_name, paid_at: now,
    };
    const { data: updated, error } = await supabase.from('payroll').update(updates).eq('id', id).select().single();
    if (error) throw error;
    await addLog(Number(id), 'Marked as Paid', performer.name, performer.employee_name, 'Salary payment processed');
    logAction({ userId: performer.name, userName: performer.employee_name, role: performer.role, action: 'APPROVE', resource: 'payroll', resourceId: String(id), resourceLabel: `Marked as Paid`, details: 'Status → Paid' }).catch(() => {});
    return updated;
  }
  if (DEMO) {
    const record = await db.payroll.get(Number(id));
    if (!record) throw new Error('Payroll record not found');
    if (record.status !== 'Submitted') throw new Error('Only Submitted payroll can be marked as Paid');
    const now = new Date().toISOString();
    const updated = {
      ...record, status: 'Paid',
      paid_by: performer.name, paid_by_name: performer.employee_name, paid_at: now,
    };
    await db.payroll.put(updated);
    await addLog(Number(id), 'Marked as Paid', performer.name, performer.employee_name, 'Salary payment processed');
    return updated;
  }
  throw new Error('No backend available');
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

// Escapes a value for safe CSV output:
//   - Wraps in quotes if it contains a comma, quote, or newline
//   - Prefixes formula-triggering characters with a single quote (CSV injection defence)
function csvEscape(val) {
  const s    = String(val ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return safe.includes(',') || safe.includes('"') || safe.includes('\n')
    ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportPayrollCSV(records, t) {
  const headers = t ? [
    t('payroll.csv.employeeId'),     t('payroll.csv.employeeName'), t('payroll.csv.period'),
    t('payroll.csv.baseSalary'),     t('payroll.csv.additionalSalary'), t('payroll.csv.workingDays'),
    t('payroll.csv.fridayBonus'),    t('payroll.csv.extraDayBonus'), t('payroll.csv.lateDeductions'),
    t('payroll.csv.absenceDeductions'), t('payroll.csv.calculatedSalary'), t('payroll.csv.status'),
  ] : [
    'Employee ID', 'Employee Name', 'Period',
    'Base Salary', 'Additional Salary', 'Working Days',
    'Friday Bonus', 'Extra Day Bonus', 'Late Deductions', 'Absence Deductions', 'Calculated Salary', 'Status',
  ];
  const rows = records.map(r => [
    r.employee_id, r.employee_name,
    `${r.period_start} – ${r.period_end}`,
    r.base_salary, r.additional_salary, r.working_days,
    r.friday_bonus, r.extra_day_bonus, r.late_deductions || 0, r.absence_deductions || 0, r.calculated_salary, r.status,
  ]);

  // UTF-8 BOM so Excel on Windows renders Arabic names correctly
  const BOM = '\uFEFF';
  const csv = BOM + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `payroll_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
