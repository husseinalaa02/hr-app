/**
 * Reports data layer — keeps all Supabase/IndexedDB queries out of the
 * Reports page component so the UI stays free of data-fetching logic.
 */
import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

export async function getReportData() {
  if (SUPABASE_MODE) {
    const [empRes, leaveRes, payrollRes, appraisalRes, expenseRes] = await Promise.all([
      supabase.from('employees_public').select('name,department'),
      supabase.from('leave_apps').select('*'),
      supabase.from('payroll').select('*'),
      supabase.from('appraisals').select('*'),
      supabase.from('expenses').select('*'),
    ]);
    return {
      employees:  empRes.data      || [],
      leaves:     leaveRes.data    || [],
      payroll:    payrollRes.data  || [],
      appraisals: appraisalRes.data || [],
      expenses:   expenseRes.data  || [],
    };
  }

  const [employees, leaves, payroll, appraisals, expenses] = await Promise.all([
    db.employees.toArray(),
    db.leave_apps.toArray(),
    db.payroll.toArray(),
    db.appraisals.toArray(),
    db.expenses.toArray(),
  ]);
  return { employees, leaves, payroll, appraisals, expenses };
}
