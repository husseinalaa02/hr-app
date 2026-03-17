import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

function localNow() {
  return new Date().toISOString();
}

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

export async function checkin(employeeId, logType) {
  const time = localNow();
  const today = localToday();
  const localName = `CHK-${Date.now()}`;

  if (SUPABASE_MODE) {
    // Save the individual punch event
    const { error: chkErr } = await supabase.from('checkins').insert({
      name: localName, employee: employeeId, log_type: logType, time,
    });
    if (chkErr) throw chkErr;

    // Upsert the daily attendance record
    const attName = `ATT-${employeeId}-${today}`;
    if (logType === 'IN') {
      await supabase.from('attendance').upsert({
        name: attName, employee: employeeId, attendance_date: today,
        in_time: time, status: 'Present',
      }, { onConflict: 'name' });
    } else {
      const { data: att } = await supabase.from('attendance').select('in_time')
        .eq('name', attName).maybeSingle();
      const hours = att?.in_time
        ? parseFloat(((new Date(time) - new Date(att.in_time)) / 3_600_000).toFixed(2))
        : 0;
      await supabase.from('attendance').upsert({
        name: attName, employee: employeeId, attendance_date: today,
        out_time: time, working_hours: hours, status: 'Present',
      }, { onConflict: 'name' });
    }
    return { name: localName, employee: employeeId, log_type: logType, time };
  }

  // Local fallback (Demo / offline)
  const record = { name: localName, employee: employeeId, log_type: logType, time };
  await db.checkins.put({ ...record, _pending: false });
  return record;
}

export async function getTodayCheckins(employeeId) {
  const today = localToday();

  if (SUPABASE_MODE) {
    const { data } = await supabase.from('checkins')
      .select('*')
      .eq('employee', employeeId)
      .gte('time', `${today}T00:00:00.000Z`)
      .order('time');
    return data || [];
  }

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
