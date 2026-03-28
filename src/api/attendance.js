import { db } from '../db/index';
import { supabase, SUPABASE_MODE } from '../db/supabase';
import { addNotification } from './notifications';
import { applyLateHourlyDeduction, LATE_SALARY_PER_QUARTER } from './leave';

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

// Off-day logic lives in src/utils/workSchedule.js — use isOffDay() from there.

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

// Returns { late, minutes, shiftStartTime }
async function checkLateness(employeeId, checkinTime) {
  const shift = await getTodayShift(employeeId);
  if (!shift?.start_time) return { late: false, minutes: 0, shiftStartTime: null };

  // Build shift start in Baghdad timezone explicitly (avoids setHours() local-tz bug)
  const todayBaghdad = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })
    .format(new Date(checkinTime));
  const shiftStart = new Date(`${todayBaghdad}T${shift.start_time}:00+03:00`);
  const checkin    = new Date(checkinTime);

  if (checkin <= new Date(shiftStart.getTime() + GRACE_MS)) {
    return { late: false, minutes: 0, shiftStartTime: shift.start_time };
  }

  const minutes = Math.round((checkin - shiftStart) / 60_000);
  return { late: true, minutes, shiftStartTime: shift.start_time };
}

// Returns { earlyLeaveMinutes, overtimeMinutes }
function calcCheckout(checkoutTime, shiftEndStr, shiftStartStr) {
  if (!shiftEndStr) return { earlyLeaveMinutes: 0, overtimeMinutes: 0 };

  // Build shift end in Baghdad timezone explicitly (avoids setHours() local-tz bug)
  const todayBaghdad = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' })
    .format(new Date(checkoutTime));
  let shiftEnd = new Date(`${todayBaghdad}T${shiftEndStr}:00+03:00`);

  // Midnight crossover: if end time is lexicographically before start time
  // the shift runs into the next calendar day (e.g. 22:00 → 06:00)
  if (shiftStartStr && shiftEndStr < shiftStartStr) {
    shiftEnd = new Date(shiftEnd.getTime() + 86_400_000);
  }

  const checkout = new Date(checkoutTime);
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
  const localName = `CHK-${crypto.randomUUID()}`;

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

    const attName = `ATT-${employeeId}-${today}`;

    if (logType === 'IN') {
      // ── Count existing INs BEFORE inserting — determines first punch vs break re-entry ─
      const { count: inCount } = await supabase.from('checkins')
        .select('*', { count: 'exact', head: true })
        .eq('employee', employeeId).eq('log_type', 'IN')
        .gte('time', localDayStart()).lte('time', localDayEnd());
      const isFirstCheckin = (inCount === 0);

      const { late, minutes, shiftStartTime } = isFirstCheckin
        ? await checkLateness(employeeId, time)
        : { late: false, minutes: 0, shiftStartTime: null };

      // ── Late deduction: morning shift only (start ≤ 12:00) ─────────────────
      // Deduct 16 min from monthly hourly leave; if no balance, flag salary deduction.
      let salaryDeductionIQD = 0;
      if (late && isFirstCheckin && shiftStartTime && shiftStartTime <= '12:00') {
        const { data: empData } = await supabase
          .from('employees_public').select('employee_name').eq('name', employeeId).maybeSingle();
        const empName = empData?.employee_name || employeeId;
        const hourlyDeducted = await applyLateHourlyDeduction(employeeId, empName, today);
        if (!hourlyDeducted) {
          salaryDeductionIQD = Math.ceil(minutes / 15) * LATE_SALARY_PER_QUARTER;
        }
      }

      if (isFirstCheckin) {
        // ── First punch: atomic RPC inserts checkin + attendance in one transaction ──
        const { error: rpcErr } = await supabase.rpc('record_checkin', {
          p_checkin_name: localName,
          p_employee:     employeeId,
          p_att_name:     attName,
          p_today:        today,
          p_status:       late ? 'Late' : 'Present',
          p_late_minutes: minutes,
          p_time:         time,
        });
        if (rpcErr) throw rpcErr;
        // Store salary deduction on attendance record (silent — column may not exist yet)
        if (salaryDeductionIQD > 0) {
          await supabase.from('attendance')
            .update({ salary_deduction_iqd: salaryDeductionIQD })
            .eq('name', attName)
            .catch(() => {});
        }
      } else {
        // ── Break re-entry: just insert the checkin punch (attendance row already set) ──
        const { error: chkErr } = await supabase.from('checkins').insert({
          name: localName, employee: employeeId, log_type: logType, time,
        });
        if (chkErr) throw chkErr;
      }

      if (late) {
        const hrs   = Math.floor(minutes / 60);
        const mins  = minutes % 60;
        const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
        const deductMsg = salaryDeductionIQD > 0
          ? ` ${salaryDeductionIQD.toLocaleString()} IQD deducted from salary (no hourly leave balance).`
          : shiftStartTime && shiftStartTime <= '12:00'
            ? ' 16 minutes deducted from your hourly leave balance.'
            : '';
        addNotification({
          recipient_id: employeeId,
          title:   'Late Check-In',
          message: `You checked in ${label} after your scheduled start time.${deductMsg}`,
          type:    'info',
        }).catch(() => {});
      }

      return { late, minutes, salaryDeductionIQD };

    } else {
      // ── Check-Out: look up the open attendance row by employee + open in_time ──
      // Do NOT reuse `attName` (computed from today's Baghdad date) — it will be
      // wrong for midnight-crossover shifts where check-in was the prior calendar day.
      const { data: openAtt } = await supabase
        .from('attendance')
        .select('name')
        .eq('employee', employeeId)
        .not('in_time', 'is', null)
        .is('out_time', null)
        .order('attendance_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!openAtt) throw new Error('No open attendance record found. Please contact HR.');
      const checkoutAttName = openAtt.name;

      // ── Query punches first (read-only), then atomic RPC ─────────────────
      // Fetch all punches for today BEFORE inserting the OUT punch so that
      // calcCumulativeHours can pair existing IN/OUT pairs plus the new OUT.
      const { data: existingPunches } = await supabase
        .from('checkins')
        .select('log_type, time')
        .eq('employee', employeeId)
        .gte('time', localDayStart())
        .lte('time', localDayEnd())
        .order('time');

      // Synthesise the new OUT punch into the list so calcCumulativeHours sees it
      const allPunches = [...(existingPunches || []), { log_type: 'OUT', time }];
      const workingHours = calcCumulativeHours(allPunches);

      const shift = await getTodayShift(employeeId);
      const { earlyLeaveMinutes, overtimeMinutes } = calcCheckout(time, shift?.end_time, shift?.start_time);

      let newStatus = 'Present';
      if (earlyLeaveMinutes > 0)    newStatus = 'Early Leave';
      else if (overtimeMinutes > 0) newStatus = 'Overtime';
      // Note: 'Late' downgrade prevention is enforced inside the record_checkout RPC

      // ── Atomic: insert OUT punch + update attendance in one transaction ────
      const { error: rpcErr } = await supabase.rpc('record_checkout', {
        p_checkin_name:        localName,
        p_employee:            employeeId,
        p_att_name:            checkoutAttName,
        p_time:                time,
        p_working_hours:       workingHours,
        p_early_leave_minutes: earlyLeaveMinutes,
        p_overtime_minutes:    overtimeMinutes,
        p_new_status:          newStatus,
      });
      if (rpcErr) throw rpcErr;

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
      .select('name, employee, log_type, time')
      .eq('employee', employeeId)
      .gte('time', localDayStart())
      .lte('time', localDayEnd())
      .order('time');
    return data || [];
  }

  // Use the same UTC window as SUPABASE_MODE so checkins made between
  // Baghdad midnight and 03:00 (which fall on the prior UTC day) are included.
  const dayStart = localDayStart();
  const dayEnd   = localDayEnd();
  const rows = await db.checkins
    .where('employee').equals(employeeId)
    .filter(c => c.time >= dayStart && c.time <= dayEnd)
    .sortBy('time');
  return rows;
}

export async function getWeeklyAttendance(employeeId, weekStart, weekEnd) {
  const end = weekEnd || localToday();

  if (SUPABASE_MODE) {
    const { data, error } = await supabase.from('attendance')
      .select('name, employee, attendance_date, status, in_time, out_time, working_hours, late_minutes, early_leave_minutes, overtime_minutes')
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
    const { data } = await supabase.from('attendance')
      .select('name, employee, attendance_date, status, in_time, out_time, working_hours, late_minutes, early_leave_minutes, overtime_minutes')
      .eq('employee', employeeId).eq('attendance_date', today).maybeSingle();
    return data || null;
  }

  return db.attendance.where('employee').equals(employeeId)
    .filter(a => a.attendance_date === today)
    .first();
}

// Returns the most recent attendance record with an open check-in (no out_time)
// within the last 7 days — catches missed checkouts older than yesterday.
// Suppresses the banner if the affected date falls within an approved leave period
// (e.g. employee forgot to check out on the last day before annual leave).
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

  if (!data) return null;

  // Suppress if the missed date is covered by an approved leave (false positive)
  const { data: leave } = await supabase
    .from('leave_apps')
    .select('name')
    .eq('employee', employeeId)
    .eq('status', 'Approved')
    .lte('from_date', data.attendance_date)
    .gte('to_date',   data.attendance_date)
    .limit(1)
    .maybeSingle();

  if (leave) return null;

  return data;
}
