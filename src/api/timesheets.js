import client from './client';
import { db } from '../db/index';

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

export async function getTimesheets(employeeId) {
  if (DEMO) {
    return db.timesheets.where('employee').equals(employeeId)
      .reverse().sortBy('start_date');
  }
  try {
    const res = await client.get('/api/resource/Timesheet', {
      params: {
        fields: JSON.stringify(['name','employee','employee_name','start_date','end_date','status','total_hours']),
        filters: JSON.stringify([['employee','=',employeeId]]),
        order_by: 'start_date desc', limit: 50,
      },
    });
    const data = res.data.data;
    await db.timesheets.bulkPut(data);
    return data;
  } catch {
    return db.timesheets.where('employee').equals(employeeId).toArray();
  }
}

export async function submitTimesheet(data) {
  if (DEMO) {
    const total = (data.time_logs || []).reduce((s, l) => s + (l.hours || 0), 0);
    const record = { ...data, name: `TS-${Date.now()}`, status: 'Submitted', total_hours: total };
    await db.timesheets.put(record);
    return record;
  }
  const res = await client.post('/api/resource/Timesheet', data);
  const record = res.data.data;
  await db.timesheets.put(record);
  return record;
}

export async function getProjects() {
  if (DEMO) return db.projects.toArray();
  try {
    const res = await client.get('/api/resource/Project', {
      params: { fields: JSON.stringify(['name','project_name']), limit: 100 },
    });
    const data = res.data.data;
    await db.projects.bulkPut(data);
    return data;
  } catch {
    return db.projects.toArray();
  }
}

export async function getTasks(project = '') {
  if (DEMO) return [];
  const filters = project ? [['project', '=', project]] : [];
  try {
    const res = await client.get('/api/resource/Task', {
      params: { fields: JSON.stringify(['name','subject','project']), filters: JSON.stringify(filters), limit: 200 },
    });
    return res.data.data;
  } catch {
    return [];
  }
}
