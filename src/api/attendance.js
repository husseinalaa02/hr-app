import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { addNotification } from './notifications';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

// Grace window before a check-in is marked Late (default 15 min, configurable via env)
const GRACE_MINUTES = parseInt(import.meta.env.VITE_LATE_GRACE_MINUTES ?? '15', 10);
const GRACE_MS      = GRACE_MINUTES * 60_000;

// ─── Time helpers ─────────────────────────────────────────────────────────────

// UTC ISO string for "right now" — stored as-is in Supabase timestamptz
function utcNow() {
  return new Date().toISOString();
}

// Local calendar date in YYYY-MM-DD (Baghdad UTC+3 aware)
function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
}

// UTC start of today (local Baghdad midnight expressed in UTC)
function localDayStart() {
  const today = localToday();
  return new Date(`${today}T00:00:00+03:00`).toISOString();
}

// UTC end of today (23:59:59.999 Baghdad)
function localDayEnd() {
  const today = localToday();
  return new Date(`${today}T23:59:59.999+03:00`).toISOString();
}

// Returns true for Friday only — company work week is Sat–Thu
export function isOffDay(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Baghdad', weekday: 'short' })
    .format(date);
  return day === 'Fri';
}

// ─── Shift helpers ────────────────────────────────────────────────────────────

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

// Returns { late, minutes, earlyEntry, earlyMinutes }
async function checkLateness(employeeId, checkinTime) {
  const shift = await getTodayShift(employeeId);
  if (!shift?.start_time) return { late: false, minutes: 0, earlyEntry: false, earlyMinutes: 0 };

  const [h, m]   = shift.start_time.split(':').map(Number);
  const checkin  = new Date(checkinTime);
  const shiftStart = new Date(checkin);
  shiftStart.setHours(h, m, 0, 0);

  if (checkin < shiftStart) {
    return {
      late: false, minutes: 0,
      earlyEntry: true,
      earlyMinutes: Math.round((shiftStart - checkin) / 60_000),
    };
  }

  if (checkin <= new Date(shiftStart.getTime() + GRACE_MS)) {
    return { late: false, minutes: 0, earlyEntry: false, earlyMinutes: 0 };
  }

  const minutes = Math.round((checkin - shiftStart) / 60_000);
  return { late: true, minutes, earlyEntry: false, earlyMinutes: 0 };
}

// Returns { earlyLeaveMinutes, overtimeMinutes }
function calcCheckout(checkoutTime, shiftEndStr, shiftStartStr) {
  if (!shiftEndStr) return { earlyLeaveMinutes: 0, overtimeMinutes: 0 };

  const [eh, em]  = shiftEndStr.split(':').map(Number);
  const checkout  = new Date(checkoutTime);
  const shiftEnd  = new Date(checkout);
  shiftEnd.setHours(eh, em, 0, 0);

  // Midnight crossover: if end time is lexicographically less than start time
  // the shift runs into the next calendar day (e.g. 22:00 → 06:00)
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

// Sum all completed IN/OUT pairs from a sorted punches array
function calcCumulativeHours(punches) {
  let totalMs = 0;
  let openIn  = null;
  for (const p of punches) {
    if (p.log_type === 'IN') {
      openIn = p;
    } else if (p.log_type === 'OUT' && openIn) {
      totalMs += new Date(p.time) - new Date(openIn.time);
      openIn   = null;
    }
  }
  return parseFloat((totalMs / 3_600_000).toFixed(2));
}

// ─── Main check-in / check-out ────────────────────────────────────────────────
// Returns on IN:  { late, minutes, earlyEntry, earlyMinutes }
// Returns on OUT: { workingHours, earlyLeaveMinutes, overtimeMinutes }
// Throws with user-visible message for guard violations.
export async function checkin(employeeId, logType) {
  const time      = utcNow();
  const today     = localToday();
  const localName = `CHK-${Date.now()}`;

  if (SUPABASE_MODE) {
    // ── Guard: fetch last punch today ────────────────────────────────────────
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

    // ── Save the individual punch event ──────────────────────────────────────
    const { error: chkErr } = await supabase.from('checkins').insert({
      name: localName, employee: employeeId, log_type: logType, time,
    });
    if (chkErr) throw chkErr;

    const attName = `ATT-${employeeId}-${today}`;

    if (logType === 'IN') {
      // ── Check-In: insert attendance row for the first punch ───────────────
      const { late, minutes, earlyEntry, earlyMinutes } = await checkLateness(employeeId, time);

      const { error: insErr } = await supabase.from('attendance').insert({
        name:          attName,
        employee:      employeeId,
        attendance_date: today,
        in_time:       time,
        status:        late ? 'Late' : 'Present',
        late_minutes:  minutes,
      });

      // 23505 = unique_violation: attendance row already exists for today (multi-punch day).
      // This is expected — the first punch already set the status. Skip silently.
      if (insErr && insErr.code !== '23505') {
        throw insErr;
      }

      if (late) {
        const hrs   = Math.floor(minutes / 60);
        const mins  = minutes % 60;
        const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
        addNotification({
          recipient_id: employeeId,
          title:   'Late Check-In',
          message: `You checked in ${label} after your scheduled start time.`,
          type:    'info',
        }).catch(() => {});
      }

      return { late, minutes, earlyEntry, earlyMinutes };

    } else {
      // ── Check-Out: recalculate cumulative hours from all punches today ─────
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

      // Read current status — don't downgrade 'Late' to 'Present'
      const { data: currentAtt } = await supabase
        .from('attendance')
        .select('status')
        .eq('name', attName)
        .maybeSingle();

      let newStatus = currentAtt?.status || 'Present';
      if (newStatus !== 'Late') {
        if (earlyLeaveMinutes > 0)     newStatus = 'Early Leave';
        else if (overtimeMinutes > 0)  newStatus = 'Overtime';
        else                           newStatus = 'Present';
      }

      if (currentAtt) {
        await supabase.from('attendance').update({
          out_time:            time,
          working_hours:       workingHours,
          early_leave_minutes: earlyLeaveMinutes,
          overtime_minutes:    overtimeMinutes,
          status:              newStatus,
        }).eq('name', attName);
      }

      return { workingHours, earlyLeaveMinutes, overtimeMinutes };
    }
  }

  // ── Local fallback (Demo / offline) ────────────────────────────────────────
  const record = { name: localName, employee: employeeId, log_type: logType, time };
  await db.checkins.put({ ...record, _pending: false });
  return {};
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getTodayCheckins(employeeId) {
  if (SUPABASE_MODE) {
    const { data } = await supabase.from('checkins')
      .select('*')
      .eq('employee', employeeId)
      .gte('time', localDayStart())
      .lte('time', localDayEnd())
      .order('time');
    return data || [];
  }

  const today = localToday();
  const rows  = await db.checkins
    .where('employee').equals(employeeId)
    .filter(c => c.time && c.time.startsWith(today))
    .sortBy('time');
  return rows;
}

export async function getWeeklyAttendance(employeeId, weekStart, weekEnd) {
  const end = weekEnd || localToday();

  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('attendance').select('*')
      .eq('employee', employeeId)
      .gte('attendance_date', weekStart)
      .lte('attendance_date', end)
      .order('attendance_date');
    if (error) return [];
    return data || [];
  }

  return db.attendance.where('employee').equals(employeeId)
    .filter(a => a.attendance_date >= weekStart && a.attendance_date <= end)
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

// Returns the most recent attendance record with an open check-in (no out_time)
// within the last 7 days — catches missed checkouts older than yesterday.
export async function getMissedCheckout(employeeId) {
  if (!SUPABASE_MODE) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(cutoff);

  const { data } = await supabase
    .from('attendance')
    .select('attendance_date, in_time, out_time')
    .eq('employee', employeeId)
    .not('in_time', 'is', null)
    .is('out_time',  null)
    .gte('attendance_date', cutoffDate)
    .lt('attendance_date',  localToday()) // exclude today — still an open shift
    .order('attendance_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}
