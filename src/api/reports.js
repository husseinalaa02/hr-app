/**
 * Reports data layer — keeps all Supabase/IndexedDB queries out of the
 * Reports page component so the UI stays free of data-fetching logic.
 */
import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

export async function getReportData({ year = new Date().getFullYear() } = {}) {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  if (SUPABASE_MODE) {
    const [empRes, leaveRes, payrollRes, appraisalRes, expenseRes] = await Promise.all([
      supabase.from('employees_public').select('name, department'),
      supabase.from('leave_apps')
        .select('leave_type, status, total_leave_days')
        .gte('from_date', yearStart).lte('from_date', yearEnd)
        .limit(2000),
      supabase.from('payroll')
        .select('id, employee_name, period_start, calculated_salary, status')
        .gte('period_start', yearStart).lte('period_start', yearEnd)
        .limit(2000),
      supabase.from('appraisals')
        .select('id, employee_name, period, status, final_score')
        .limit(2000),
      supabase.from('expenses')
        .select('status, amount')
        .gte('expense_date', yearStart).lte('expense_date', yearEnd)
        .limit(2000),
    ]);
    return {
      employees:  empRes.data      || [],
      leaves:     leaveRes.data    || [],
      payroll:    payrollRes.data  || [],
      appraisals: appraisalRes.data || [],
      expenses:   expenseRes.data  || [],
    };
  }

  const [employees, allLeaves, allPayroll, allAppraisals, allExpenses] = await Promise.all([
    db.employees.toArray(),
    db.leave_apps.toArray(),
    db.payroll.toArray(),
    db.appraisals.toArray(),
    db.expenses.toArray(),
  ]);
  return {
    employees,
    leaves:     allLeaves.filter(l => (l.from_date || '').startsWith(year)),
    payroll:    allPayroll.filter(r => (r.period_start || '').startsWith(year)),
    appraisals: allAppraisals,
    expenses:   allExpenses.filter(e => (e.expense_date || '').startsWith(year)),
  };
}
