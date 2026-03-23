import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

// Normalize a raw payroll row into the shape the Payslips UI expects
function normalize(row) {
  if (!row) return null;
  const earnings = [
    { salary_component: 'Base Salary',        amount: row.base_salary        || 0 },
    row.additional_salary > 0 && { salary_component: 'Additional Salary', amount: row.additional_salary },
    row.friday_bonus      > 0 && { salary_component: 'Friday Bonus',      amount: row.friday_bonus },
    row.extra_day_bonus   > 0 && { salary_component: 'Extra Day Bonus',   amount: row.extra_day_bonus },
  ].filter(Boolean);

  const gross_pay = earnings.reduce((s, e) => s + e.amount, 0);
  const net_pay   = row.calculated_salary || 0;
  const deductionAmount = Math.max(0, gross_pay - net_pay);
  const deductions = deductionAmount > 0
    ? [{ salary_component: 'Deductions', amount: deductionAmount }]
    : [];

  return {
    ...row,
    name:            String(row.id),
    start_date:      row.period_start,
    end_date:        row.period_end,
    posting_date:    row.payroll_date || row.period_end,
    earnings,
    deductions,
    gross_pay,
    total_deduction: deductionAmount,
    net_pay,
  };
}

export async function getPayslips(employeeId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase
      .from('payroll')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'Paid')
      .order('period_start', { ascending: false });
    if (error) return [];
    return (data || []).map(normalize);
  }
  const rows = await db.payroll
    .where('employee_id').equals(employeeId)
    .filter(r => r.status === 'Paid')
    .reverse()
    .sortBy('period_start');
  return rows.map(normalize);
}

export async function getPayslip(id) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('payroll').select('*').eq('id', id).single();
    if (error) return null;
    return normalize(data);
  }
  const row = await db.payroll.get(Number(id));
  return normalize(row);
}
