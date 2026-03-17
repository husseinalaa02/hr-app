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

// Returns true for Friday (5) or Saturday (6) — Iraq weekend
export function isOffDay(date = new Date()) {
  const day = date.getDay();
  return day === 5 || day === 6;
}

// Fetch the employee's latest assigned shift (start_time + end_time)
async function getTodayShift(employeeId) {
  if (!SUPABASE_MODE) return null;
  const { data } = await supabase
    .from('work_schedules')
    .select('start_time, end_time')
    .eq('employee', employeeId)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Check if an IN punch is late / early relative to the employee's shift.
// Returns { late, minutes, earlyEntry, earlyMinutes }
async function checkLateness(employeeId, checkinTime) {
  const shift = await getTodayShift(employeeId);
  if (!shift?.start_time) return { late: false, minutes: 0, earlyEntry: false, earlyMinutes: 0 };

  const [h, m] = shift.start_time.split(':').map(Number);
  const checkin = new Date(checkinTime);

  // Build shift-start in local time on the same calendar day as check-in
  const shiftStart = new Date(checkin);
  shiftStart.setHours(h, m, 0, 0);

  // Early entry — before shift start
  if (checkin < shiftStart) {
    return {
      late: false, minutes: 0,
      earlyEntry: true, earlyMinutes: Math.round((shiftStart - checkin) / 60_000),
    };
  }

  const GRACE_MS = 15 * 60 * 1000; // 15-minute grace window
  if (checkin <= new Date(shiftStart.getTime() + GRACE_MS)) {
    return { late: false, minutes: 0, earlyEntry: false, earlyMinutes: 0 };
  }

  const minutes = Math.round((checkin - shiftStart) / 60_000);
  return { late: true, minutes, earlyEntry: false, earlyMinutes: 0 };
}

// Calculate early-leave and overtime minutes given checkout time and shift
function calcCheckout(checkoutTime, shiftEndStr, shiftStartStr) {
  if (!shiftEndStr) return { earlyLeaveMinutes: 0, overtimeMinutes: 0 };

  const [eh, em] = shiftEndStr.split(':').map(Number);
  const checkout = new Date(checkoutTime);
  const shiftEnd = new Date(checkout);
  shiftEnd.setHours(eh, em, 0, 0);

  // Midnight crossover: end_time string < start_time string (e.g. "00:30" < "16:30")
  if (shiftStartStr && shiftEndStr < shiftStartStr) {
    shiftEnd.setDate(shiftEnd.getDate() + 1);
  }

  if (checkout < shiftEnd) {
    return { earlyLeaveMinutes: Math.round((shiftEnd - checkout) / 60_000), overtimeMinutes: 0 };
  }
  if (checkout > shiftEnd) {
    return { earlyLeaveMinutes: 0, overtimeMinutes: Math.round((checkout - shiftEnd) / 60_000) };
  }
  return { earlyLeaveMinutes: 0, overtimeMinutes: 0 };
}

// Sum up all completed IN/OUT pairs from a punches array
function calcCumulativeHours(punches) {
  let totalMs = 0;
  let openIn = null;
  for (const p of punches) {
    if (p.log_type === 'IN') { openIn = p; }
    else if (p.log_type === 'OUT' && openIn) {
      totalMs += new Date(p.time) - new Date(openIn.time);
      openIn = null;
    }
  }
  return parseFloat((totalMs / 3_600_000).toFixed(2));
}

// ─── Main check-in / check-out function ──────────────────────────────────────

// Returns on IN:  { late, minutes, earlyEntry, earlyMinutes }
// Returns on OUT: { workingHours, earlyLeaveMinutes, overtimeMinutes }
// Throws with user-visible message for guard violations.
export async function checkin(employeeId, logType) {
  const time = localNow();
  const today = localToday();
  const localName = `CHK-${Date.now()}`;

  if (SUPABASE_MODE) {
    // ── Guard: fetch last punch today ─────────────────────────────────────────
    const { data: lastPunch } = await supabase
      .from('checkins')
      .select('log_type, time')
      .eq('employee', employeeId)
      .gte('time', localDayStart())
      .lte('time', localDayEnd())
      .order('time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logType === 'IN' && lastPunch?.log_type === 'IN') {
      const t = new Date(lastPunch.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      throw new Error(`You are already checked in since ${t}`);
    }
    if (logType === 'OUT' && (!lastPunch || lastPunch.log_type !== 'IN')) {
      throw new Error('You have not checked in yet');
    }

    // ── Save the individual punch event ───────────────────────────────────────
    const { error: chkErr } = await supabase.from('checkins').insert({
      name: localName, employee: employeeId, log_type: logType, time,
    });
    if (chkErr) throw chkErr;

    const attName = `ATT-${employeeId}-${today}`;

    if (logType === 'IN') {
      // ── Check-In logic ────────────────────────────────────────────────────
      const { late, minutes, earlyEntry, earlyMinutes } = await checkLateness(employeeId, time);

      // INSERT only — never overwrite an existing first-punch.
      // 23505 = unique_violation (record exists) → harmless, skip.
      const { error: insErr } = await supabase.from('attendance').insert({
        name: attName, employee: employeeId, attendance_date: today,
        in_time: time,
        status: late ? 'Late' : 'Present',
        late_minutes: minutes,
      });

      if (insErr && insErr.code !== '23505') {
        // Fallback: insert without new columns in case schema is behind
        await supabase.from('attendance').insert({
          name: attName, employee: employeeId, attendance_date: today,
          in_time: time, status: late ? 'Late' : 'Present',
        }).then(() => {}, () => {});
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

      return { late, minutes, earlyEntry, earlyMinutes };

    } else {
      // ── Check-Out logic ───────────────────────────────────────────────────
      // Fetch all today's punches (including the one we just inserted)
      const { data: todayPunches } = await supabase
        .from('checkins')
        .select('log_type, time')
        .eq('employee', employeeId)
        .gte('time', localDayStart())
        .lte('time', localDayEnd())
        .order('time');

      const workingHours = calcCumulativeHours(todayPunches || []);

      const shift = await getTodayShift(employeeId);
      const { earlyLeaveMinutes, overtimeMinutes } = calcCheckout(time, shift?.end_time, shift?.start_time);

      // Determine new status — don't downgrade 'Late'
      const { data: currentAtt } = await supabase
        .from('attendance').select('status, in_time')
        .eq('name', attName).maybeSingle();

      let newStatus = currentAtt?.status || 'Present';
      if (newStatus !== 'Late') {
        if (earlyLeaveMinutes > 0) newStatus = 'Early Leave';
        else if (overtimeMinutes > 0) newStatus = 'Overtime';
        else newStatus = 'Present';
      }

      if (currentAtt) {
        await supabase.from('attendance').update({
          out_time: time,
          working_hours: workingHours,
          early_leave_minutes: earlyLeaveMinutes,
          overtime_minutes: overtimeMinutes,
          status: newStatus,
        }).eq('name', attName);
      }

      return { workingHours, earlyLeaveMinutes, overtimeMinutes };
    }
  }

  // ── Local fallback (Demo / offline) ──────────────────────────────────────
  const record = { name: localName, employee: employeeId, log_type: logType, time };
  await db.checkins.put({ ...record, _pending: false });
  return {};
}

// ─── Queries ─────────────────────────────────────────────────────────────────

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

// Check if the employee forgot to check out yesterday (open punch with no out_time)
export async function getMissedCheckout(employeeId) {
  if (!SUPABASE_MODE) return null;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0');
  const yDate = `${yesterday.getFullYear()}-${p(yesterday.getMonth()+1)}-${p(yesterday.getDate())}`;

  const { data } = await supabase
    .from('attendance')
    .select('attendance_date, in_time, out_time')
    .eq('employee', employeeId)
    .eq('attendance_date', yDate)
    .maybeSingle();

  if (data?.in_time && !data?.out_time) return data;
  return null;
}
