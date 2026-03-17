import { db } from '../db/index';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getTimesheets(employeeId) {
  return db.timesheets.where('employee').equals(employeeId)
    .reverse().sortBy('start_date');
}

export async function submitTimesheet(data) {
  const total = (data.time_logs || []).reduce((s, l) => s + (l.hours || 0), 0);
  const record = { ...data, name: `TS-${Date.now()}`, status: 'Submitted', total_hours: total };
  await db.timesheets.put(record);
  return record;
}

export async function getProjects() {
  return db.projects.toArray();
}

export async function getTasks() {
  return [];
}
