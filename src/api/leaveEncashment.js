import { supabase, SUPABASE_MODE } from '../db/supabase';
import { logAction } from './auditLog';
import { addNotification } from './notifications';

export function calculateEncashment(baseSalary, unusedDays) {
  const dailyRate   = Number((baseSalary / 30).toFixed(2));
  const totalAmount = Number((dailyRate * unusedDays).toFixed(2));
  return { dailyRate, totalAmount };
}

export async function processEncashment({
  employeeId, leaveType, encashmentDate, daysEncashed,
  dailyRate, totalAmount, reason, processedBy,
}) {
  if (!SUPABASE_MODE) return null;
  const year = new Date(encashmentDate).getFullYear();

  const { data: alloc } = await supabase
    .from('leave_allocs')
    .select('total_days, used_days')
    .eq('employee', employeeId)
    .eq('leave_type', leaveType)
    .eq('leave_year', year)
    .maybeSingle();

  if (!alloc || (alloc.total_days - alloc.used_days) < daysEncashed) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  const { data, error } = await supabase
    .from('leave_encashment')
    .insert({
      employee_id:     employeeId,
      leave_type:      leaveType,
      encashment_date: encashmentDate,
      days_encashed:   daysEncashed,
      daily_rate:      dailyRate,
      total_amount:    totalAmount,
      reason,
      processed_by:    processedBy,
    })
    .select('id')
    .single();
  if (error) throw error;

  await supabase
    .from('leave_allocs')
    .update({
      used_days:      alloc.used_days + daysEncashed,
      remaining_days: alloc.total_days - alloc.used_days - daysEncashed,
    })
    .eq('employee', employeeId)
    .eq('leave_type', leaveType)
    .eq('leave_year', year);

  await logAction({
    action:        'CREATE',
    resource:      'LeaveEncashment',
    resourceId:    data.id,
    resourceLabel: `${daysEncashed} days encashed for ${employeeId}`,
    details:       JSON.stringify({ totalAmount, reason }),
  }).catch(() => {});
  // H5: notify the employee of the encashment
  addNotification({
    recipient_id: employeeId,
    title:        'Leave Encashment Processed',
    message:      `${daysEncashed} days of ${leaveType} have been encashed`,
    type:         'success',
  }).catch(() => {});

  return data;
}

export async function getEncashmentHistory(employeeId) {
  if (!SUPABASE_MODE) return [];
  const { data, error } = await supabase
    .from('leave_encashment')
    .select('id, leave_type, encashment_date, days_encashed, daily_rate, total_amount, reason, created_at')
    .eq('employee_id', employeeId)
    .order('encashment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}
