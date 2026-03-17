import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

function localNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

export async function checkin(employeeId, logType) {
  const time = localNow();
  const localName = `CHK-${Date.now()}`;
  const record = { name: localName, employee: employeeId, log_type: logType, time };
  await db.checkins.put({ ...record, _pending: false });
  return record;
}

export async function getTodayCheckins(employeeId) {
  const today = localToday();
  const rows = await db.checkins
    .where('employee').equals(employeeId)
    .filter(c => c.time && c.time.startsWith(today))
    .sortBy('time');
  return rows;
}

export async function getWeeklyAttendance(employeeId, weekStart) {
  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('attendance').select('*')
      .eq('employee', employeeId).gte('attendance_date', weekStart)
      .order('attendance_date');
    if (error) return [];
    return data || [];
  }
  return db.attendance.where('employee').equals(employeeId)
    .filter(a => a.attendance_date >= weekStart)
    .sortBy('attendance_date');
}

export async function getTodayAttendance(employeeId) {
  const today = localToday();
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('attendance').select('*')
      .eq('employee', employeeId).eq('attendance_date', today).maybeSingle();
    return data || null;
  }
  return db.attendance.where('employee').equals(employeeId)
    .filter(a => a.attendance_date === today)
    .first();
}
