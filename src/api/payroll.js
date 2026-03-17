import { db } from '../db/index';
import { MOCK_PAYROLL_RECORDS } from './mock';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// ─── Salary Calculation (Critical Logic) ──────────────────────────────────────
// Daily Salary = (Base Salary + Additional Salary) ÷ 30
// Final Salary = Daily Salary × Working Days
// The additional salary is NEVER added separately — it is always part of the daily rate.
export function calcDailySalary(baseSalary, additionalSalary) {
  return (baseSalary + additionalSalary) / 30;
}

export function calcFinalSalary(baseSalary, additionalSalary, workingDays) {
  return Math.round(calcDailySalary(baseSalary, additionalSalary) * workingDays);
}

export function calcExtraDayValue(baseSalary) {
  return Math.round(baseSalary / 30);
}

export const FRIDAY_DAY_FIXED = 25_000;

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getPayrollRecords({ employeeId = '', month = '', year = '' } = {}) {
  if (SUPABASE_MODE) {
    let query = supabase.from('payroll').select('*');
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (month && year) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      query = query.gte('period_start', `${prefix}-01`).lte('period_start', `${prefix}-31`);
    }
    const { data, error } = await query.order('period_start', { ascending: false });
    if (error) return [];
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
    if (error) return null;
    return data;
  }
  if (DEMO) return db.payroll.get(Number(id));
  return null;
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createPayroll(data, performer = null) {
  const base       = Number(data.base_salary)       || 0;
  const additional = Number(data.additional_salary)  || 0;
  const days       = Number(data.working_days)       || 30;

  const friday_bonus    = Number(data.friday_bonus)    || 0;
  const extra_day_bonus = Number(data.extra_day_bonus) || 0;
  const calculated_salary = calcFinalSalary(base, additional, days) + friday_bonus + extra_day_bonus;

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
    calculated_salary,
    status:             'Draft',
    payroll_date:       data.payroll_date || data.period_end,
    submitted_by: null, submitted_by_name: null, submitted_at: null,
    paid_by: null,      paid_by_name: null,      paid_at: null,
  };

  if (SUPABASE_MODE) {
    const { data: inserted, error } = await supabase.from('payroll').insert(record).select().single();
    if (error) throw error;
    if (performer) {
      await supabase.from('payroll_log').insert({ payroll_id: inserted.id, action: 'Created', performed_by: performer.name, performed_by_name: performer.employee_name, notes: '' });
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
    const base       = data.base_salary       ?? existing.base_salary;
    const additional = data.additional_salary  ?? existing.additional_salary;
    const days       = data.working_days       ?? existing.working_days;
    const friday_bonus    = data.friday_bonus    ?? existing.friday_bonus;
    const extra_day_bonus = data.extra_day_bonus ?? existing.extra_day_bonus;
    const calculated_salary = calcFinalSalary(base, additional, days) + friday_bonus + extra_day_bonus;
    const updates = { ...data, base_salary: base, additional_salary: additional, working_days: days, friday_bonus, extra_day_bonus, calculated_salary };
    const { data: updated, error } = await supabase.from('payroll').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return updated;
  }
  if (DEMO) {
    const existing = await db.payroll.get(Number(id));
    if (!existing) return null;

    const base       = data.base_salary       ?? existing.base_salary;
    const additional = data.additional_salary  ?? existing.additional_salary;
    const days       = data.working_days       ?? existing.working_days;
    const friday_bonus    = data.friday_bonus    ?? existing.friday_bonus;
    const extra_day_bonus = data.extra_day_bonus ?? existing.extra_day_bonus;
    const calculated_salary = calcFinalSalary(base, additional, days) + friday_bonus + extra_day_bonus;

    const updated = { ...existing, ...data, base_salary: base, additional_salary: additional,
      working_days: days, friday_bonus, extra_day_bonus, calculated_salary };
    await db.payroll.put(updated);
    return updated;
  }
  throw new Error('No backend available');
}

export async function deletePayroll(id) {
  if (SUPABASE_MODE) {
    const { error } = await supabase.from('payroll').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  if (DEMO) { await db.payroll.delete(Number(id)); return; }
}

// Recalculate a payroll record's bonuses from approved day requests
export async function recalculatePayroll(payrollId) {
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

  const fridayCount = allRequests.filter(r => r.request_type === 'Friday Day').length;
  const extraCount  = allRequests.filter(r => r.request_type === 'Extra Day').length;

  const friday_bonus    = fridayCount * FRIDAY_DAY_FIXED;
  const extra_day_bonus = extraCount  * calcExtraDayValue(record.base_salary);
  const calculated_salary = calcFinalSalary(record.base_salary, record.additional_salary, record.working_days)
    + friday_bonus + extra_day_bonus;

  const updated = { ...record, friday_bonus, extra_day_bonus, calculated_salary };
  await db.payroll.put(updated);
  return updated;
}

// ─── Workflow Actions ─────────────────────────────────────────────────────────

async function addLog(payrollId, action, performedBy, performedByName, notes = '') {
  const entry = { payroll_id: payrollId, action, performed_by: performedBy, performed_by_name: performedByName, timestamp: new Date().toISOString(), notes };
  if (DEMO) { await db.payroll_log.add(entry); return; }
}

export async function getPayrollLog(payrollId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('payroll_log').select('*').eq('payroll_id', payrollId).order('timestamp');
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
    const now = new Date().toISOString();
    const updates = { status: 'Submitted', submitted_by: performer.name, submitted_by_name: performer.employee_name, submitted_at: now };
    const { data: updated, error } = await supabase.from('payroll').update(updates).eq('id', id).select().single();
    if (error) throw error;
    await supabase.from('payroll_log').insert({ payroll_id: Number(id), action: 'Submitted to Finance', performed_by: performer.name, performed_by_name: performer.employee_name, notes: 'Submitted for payment processing' });
    return updated;
  }
  if (DEMO) {
    const record = await db.payroll.get(Number(id));
    if (!record) throw new Error('Payroll record not found');
    if (record.status !== 'Draft') throw new Error('Only Draft payroll can be submitted');
    const now = new Date().toISOString();
    const updated = { ...record, status: 'Submitted', submitted_by: performer.name, submitted_by_name: performer.employee_name, submitted_at: now };
    await db.payroll.put(updated);
    await addLog(Number(id), 'Submitted to Finance', performer.name, performer.employee_name, 'Submitted for payment processing');
    return updated;
  }
  throw new Error('No backend available');
}

export async function markAsPaid(id, performer) {
  if (SUPABASE_MODE) {
    const now = new Date().toISOString();
    const updates = { status: 'Paid', paid_by: performer.name, paid_by_name: performer.employee_name, paid_at: now };
    const { data: updated, error } = await supabase.from('payroll').update(updates).eq('id', id).select().single();
    if (error) throw error;
    await supabase.from('payroll_log').insert({ payroll_id: Number(id), action: 'Marked as Paid', performed_by: performer.name, performed_by_name: performer.employee_name, notes: 'Salary payment processed' });
    return updated;
  }
  if (DEMO) {
    const record = await db.payroll.get(Number(id));
    if (!record) throw new Error('Payroll record not found');
    if (record.status !== 'Submitted') throw new Error('Only Submitted payroll can be marked as Paid');
    const now = new Date().toISOString();
    const updated = { ...record, status: 'Paid', paid_by: performer.name, paid_by_name: performer.employee_name, paid_at: now };
    await db.payroll.put(updated);
    await addLog(Number(id), 'Marked as Paid', performer.name, performer.employee_name, 'Salary payment processed');
    return updated;
  }
  throw new Error('No backend available');
}

// ─── Export payroll to CSV ────────────────────────────────────────────────────
export function exportPayrollCSV(records) {
  const headers = ['Employee ID','Employee Name','Period','Base Salary','Additional Salary',
    'Working Days','Friday Bonus','Extra Day Bonus','Calculated Salary','Status'];
  const rows = records.map(r => [
    r.employee_id, r.employee_name,
    `${r.period_start} – ${r.period_end}`,
    r.base_salary, r.additional_salary, r.working_days,
    r.friday_bonus, r.extra_day_bonus, r.calculated_salary, r.status,
  ]);
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `payroll_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
