import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { addNotification } from './notifications';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

function localNow() {
  return new Date().toISOString();
}

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

// Check if an IN punch is late relative to the employee's assigned shift.
// Returns { late: boolean, minutes: number } — minutes is always from shift start.
async function checkLateness(employeeId, checkinTime) {
  if (!SUPABASE_MODE) return { late: false, minutes: 0 };

  const { data: schedule } = await supabase
    .from('work_schedules')
    .select('start_time')
    .eq('employee', employeeId)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!schedule?.start_time) return { late: false, minutes: 0 };

  const [h, m] = schedule.start_time.split(':').map(Number);
  const checkin = new Date(checkinTime);

  // Build shift-start in local time on the same calendar day as check-in
  const shiftStart = new Date(checkin);
  shiftStart.setHours(h, m, 0, 0);

  const GRACE_MS = 15 * 60 * 1000; // 15-minute grace window
  if (checkin <= new Date(shiftStart.getTime() + GRACE_MS)) {
    return { late: false, minutes: 0 };
  }

  const minutes = Math.round((checkin - shiftStart) / 60_000);
  return { late: true, minutes };
}

// Returns the UTC ISO string for local midnight (start of today)
function localDayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Returns the UTC ISO string for 23:59:59 local time (end of today)
function localDayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
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

    // Update the daily attendance record
    const attName = `ATT-${employeeId}-${today}`;
    if (logType === 'IN') {
      const { late, minutes } = await checkLateness(employeeId, time);

      // INSERT only — never overwrite an existing record's in_time.
      // If the row already exists (employee checked in earlier today) we
      // simply skip so the original first-punch time is preserved.
      const { error: insErr } = await supabase.from('attendance').insert({
        name: attName, employee: employeeId, attendance_date: today,
        in_time: time,
        status: late ? 'Late' : 'Present',
        late_minutes: minutes,
      });

      // 23505 = unique_violation (record already exists — harmless, skip it)
      // If late_minutes column doesn't exist yet the insert will fail with a
      // different code; fall back to inserting without it so check-in still works.
      if (insErr && insErr.code !== '23505') {
        await supabase.from('attendance').insert({
          name: attName, employee: employeeId, attendance_date: today,
          in_time: time, status: late ? 'Late' : 'Present',
        }).then(() => {}, () => {}); // best-effort; ignore all errors
      }

      if (late) {
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
        addNotification({
          recipient_id: employeeId,
          title: 'Late Check-In',
          message: `You checked in ${label} after your scheduled start time.`,
          type: 'info',
        }).catch(() => {});
      }
    } else {
      // OUT: only update an existing record — never create one with no in_time.
      const { data: att } = await supabase.from('attendance').select('in_time')
        .eq('name', attName).maybeSingle();
      if (att) {
        const hours = att.in_time
          ? parseFloat(((new Date(time) - new Date(att.in_time)) / 3_600_000).toFixed(2))
          : 0;
        await supabase.from('attendance').update({
          out_time: time, working_hours: hours,
        }).eq('name', attName);
      }
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
      .gte('time', localDayStart())
      .lte('time', localDayEnd())
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
