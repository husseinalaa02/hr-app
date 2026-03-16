import client from './client';
import { db } from '../db/index';
import { enqueuePendingOp } from '../db/sync';

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

  // Write locally first — UI updates immediately
  await db.checkins.put({ ...record, _pending: !DEMO });

  if (DEMO) return record;

  // Try to sync to ERPNext
  if (!navigator.onLine) {
    await enqueuePendingOp({
      table: 'checkins',
      method: 'POST',
      endpoint: '/api/resource/Employee Checkin',
      payload: { employee: employeeId, log_type: logType, time },
      localName,
    });
    return { ...record, _pending: true };
  }

  try {
    const res = await client.post('/api/resource/Employee Checkin', {
      employee: employeeId, log_type: logType, time,
    });
    const server = res.data.data;
    // Replace temp record with real server record
    await db.checkins.delete(localName);
    await db.checkins.put({ ...server, _pending: false });
    return server;
  } catch (e) {
    // Keep the local record, queue for later
    await enqueuePendingOp({
      table: 'checkins',
      method: 'POST',
      endpoint: '/api/resource/Employee Checkin',
      payload: { employee: employeeId, log_type: logType, time },
      localName,
    });
    return { ...record, _pending: true };
  }
}

export async function getTodayCheckins(employeeId) {
  const today = localToday();

  if (DEMO) {
    const rows = await db.checkins
      .where('employee').equals(employeeId)
      .filter(c => c.time && c.time.startsWith(today))
      .sortBy('time');
    return rows; // checkins are session-specific; empty is valid
  }

  // Production: try network, fall back to DB
  try {
    const res = await client.get('/api/resource/Employee Checkin', {
      params: {
        fields: JSON.stringify(['name','employee','log_type','time']),
        filters: JSON.stringify([
          ['employee','=',employeeId],
          ['time','>=',`${today} 00:00:00`],
          ['time','<=',`${today} 23:59:59`],
        ]),
        order_by: 'time asc', limit: 20,
      },
    });
    const data = res.data.data;
    await db.checkins.bulkPut(data.map(r => ({ ...r, _pending: false })));
    return data;
  } catch {
    return db.checkins
      .where('employee').equals(employeeId)
      .filter(c => c.time && c.time.startsWith(today))
      .sortBy('time');
  }
}

export async function getWeeklyAttendance(employeeId, weekStart) {
  if (DEMO) {
    return db.attendance.where('employee').equals(employeeId).sortBy('attendance_date');
  }
  try {
    const res = await client.get('/api/resource/Attendance', {
      params: {
        fields: JSON.stringify(['name','employee','attendance_date','status','in_time','out_time','working_hours']),
        filters: JSON.stringify([['employee','=',employeeId],['attendance_date','>=',weekStart]]),
        order_by: 'attendance_date asc', limit: 7,
      },
    });
    const data = res.data.data;
    await db.attendance.bulkPut(data);
    return data;
  } catch {
    return db.attendance
      .where('employee').equals(employeeId)
      .filter(a => a.attendance_date >= weekStart)
      .sortBy('attendance_date');
  }
}

export async function getTodayAttendance(employeeId) {
  if (DEMO) return null;
  const today = localToday();
  try {
    const res = await client.get('/api/resource/Attendance', {
      params: {
        fields: JSON.stringify(['name','status','in_time','out_time','working_hours']),
        filters: JSON.stringify([['employee','=',employeeId],['attendance_date','=',today]]),
        limit: 1,
      },
    });
    const record = res.data.data?.[0] || null;
    if (record) await db.attendance.put(record);
    return record;
  } catch {
    return db.attendance
      .where('employee').equals(employeeId)
      .filter(a => a.attendance_date === today)
      .first();
  }
}
