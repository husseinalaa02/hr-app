import { supabase, SUPABASE_MODE } from '../db/supabase';

export async function getTeamLeaveCalendar(year, month, employeeIds) {
  if (!SUPABASE_MODE || !employeeIds?.length) return [];
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('leave_apps')
    .select('employee, employee_name, leave_type, from_date, to_date, status, total_leave_days')
    .in('status', ['Approved', 'Open'])
    .lte('from_date', endDate)
    .gte('to_date', startDate)
    .in('employee', employeeIds)
    .order('from_date');
  if (error) throw error;
  return data || [];
}

/**
 * Expand a list of leave records into a day-keyed map:
 *   { 'YYYY-MM-DD': [ leaveRecord, ... ] }
 * Only days within [startDate, endDate] are included.
 */
export function buildCalendarMap(leaves, year, month) {
  const map = {};
  const daysInMonth = new Date(year, month, 0).getDate();

  for (const leave of leaves) {
    const from = new Date(leave.from_date + 'T12:00:00+03:00');
    const to   = new Date(leave.to_date   + 'T12:00:00+03:00');
    const cur  = new Date(Math.max(from, new Date(year, month - 1, 1)));
    const end  = new Date(Math.min(to,   new Date(year, month - 1, daysInMonth)));

    while (cur <= end) {
      const key = cur.toISOString().split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(leave);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return map;
}
