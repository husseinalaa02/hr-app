import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

export async function getPayslips(employeeId) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('payroll').select('*')
      .eq('employee_id', employeeId).order('period_start', { ascending: false });
    if (error) return [];
    return data || [];
  }
  return db.payslips.where('employee').equals(employeeId)
    .reverse().sortBy('posting_date');
}

export async function getPayslip(name) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('payroll').select('*').eq('id', name).single();
    if (error) return null;
    return data;
  }
  return db.payslips.get(name);
}
