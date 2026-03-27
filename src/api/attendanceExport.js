import { supabase, SUPABASE_MODE } from '../db/supabase';
import { isOffDay } from '../utils/workSchedule';

export async function getAttendanceForExport({ dateFrom, dateTo }) {
  if (!SUPABASE_MODE) throw new Error('Export requires Supabase connection');

  const [
    { data: employees, error: empError },
    { data: attendance, error: attError },
    { data: leaves,    error: leaveError },
    { data: holidays,  error: holError },
  ] = await Promise.all([
    supabase.from('employees_public')
      .select('name, employee_name, department, designation, off_days')
      .order('department'),
    supabase.from('attendance')
      .select('employee, attendance_date, in_time, out_time, working_hours, status')
      .gte('attendance_date', dateFrom)
      .lte('attendance_date', dateTo)
      .order('attendance_date'),
    supabase.from('leave_apps')
      .select('employee, from_date, to_date')
      .eq('status', 'Approved')
      .lte('from_date', dateTo)
      .gte('to_date', dateFrom),
    supabase.from('public_holidays')
      .select('date')
      .gte('date', dateFrom)
      .lte('date', dateTo),
  ]);

  if (empError)   throw empError;
  if (attError)   throw attError;
  if (leaveError) throw leaveError;
  if (holError)   throw holError;

  return {
    employees:  employees  || [],
    attendance: attendance || [],
    leaves:     leaves     || [],
    holidays:   (holidays  || []).map(h => h.date),
  };
}

export function buildAttendanceCSV({ employees, attendance, leaves, holidays, dateFrom, dateTo, t }) {
  const BOM = '\uFEFF';
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Generate all dates in range
  const dates = [];
  const cur = new Date(dateFrom + 'T12:00:00+03:00');
  const end = new Date(dateTo   + 'T12:00:00+03:00');
  while (cur <= end) {
    dates.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Attendance lookup: employee_date → record
  const attMap = {};
  (attendance || []).forEach(a => { attMap[`${a.employee}_${a.attendance_date}`] = a; });

  // Leave lookup: build a set of "employee_date" keys for approved leaves
  const leaveSet = new Set();
  (leaves || []).forEach(l => {
    const s = new Date(l.from_date + 'T12:00:00+03:00');
    const e = new Date(l.to_date   + 'T12:00:00+03:00');
    const c = new Date(s);
    while (c <= e) {
      leaveSet.add(`${l.employee}_${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(c)}`);
      c.setDate(c.getDate() + 1);
    }
  });

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' });
  };

  const headers = [
    t('attendance.export.employeeName'),
    t('attendance.export.department'),
    t('attendance.export.designation'),
    t('attendance.export.date'),
    t('attendance.export.dayOfWeek'),
    t('attendance.export.checkIn'),
    t('attendance.export.checkOut'),
    t('attendance.export.hoursWorked'),
    t('attendance.export.status'),
  ];

  const rows = [];
  dates.forEach(date => {
    const d = new Date(date + 'T12:00:00+03:00');
    const dayOfWeek = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Baghdad' });

    employees.forEach(emp => {
      const empOffDays = emp.off_days || [5, 6];
      // Skip weekly off days and public holidays — don't count as absent
      if (isOffDay(d, empOffDays, holidays || [])) return;

      const key    = `${emp.name}_${date}`;
      const att    = attMap[key];
      const onLeave = leaveSet.has(key);

      let status;
      if (onLeave) {
        status = t('attendance.export.onLeave');
      } else if (att) {
        // Determine late: check in_time vs 09:00 Baghdad
        const inHour = att.in_time
          ? parseInt(new Date(att.in_time).toLocaleTimeString('en-GB', { hour: '2-digit', timeZone: 'Asia/Baghdad' }), 10)
          : null;
        status = (inHour !== null && inHour >= 9)
          ? t('attendance.export.late')
          : t('attendance.export.present');
      } else {
        status = t('attendance.export.absent');
      }

      rows.push([
        emp.employee_name,
        emp.department  || '-',
        emp.designation || '-',
        date,
        dayOfWeek,
        att ? formatTime(att.in_time)  : '-',
        att ? formatTime(att.out_time) : '-',
        att?.working_hours ? `${Number(att.working_hours).toFixed(1)}h` : '-',
        status,
      ]);
    });
  });

  const csvContent = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(',')),
  ].join('\n');

  return BOM + csvContent;
}

export function downloadAttendanceCSV(csv, dateFrom, dateTo) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = dateFrom === dateTo
    ? `attendance_${dateFrom}.csv`
    : `attendance_${dateFrom}_to_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
